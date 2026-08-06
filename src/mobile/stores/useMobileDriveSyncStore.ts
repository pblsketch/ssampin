import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import { SyncFromCloud } from '@usecases/sync/SyncFromCloud';
import { getDriveSyncAdapter, driveSyncRepository, storage } from '@mobile/di/container';
import type { SyncResult } from '@adapters/stores/useDriveSyncStore';
import { isGoogleAuthBlockedError } from '@domain/rules/calendarSyncRules';
import { awaitPendingWrites } from '@mobile/stores/pendingWrites';

/**
 * 학교 Google Workspace 계정 차단 안내 (모바일 문구).
 * 데스크톱(GOOGLE_AUTH_BLOCKED_MESSAGE)은 "설정 → Google 통합"을 안내하지만
 * 모바일은 그 화면이 없으므로 "다시 로그인" 동작에 맞춘 문구를 별도로 둔다.
 */
const MOBILE_AUTH_BLOCKED_MESSAGE =
  '학교 계정(@*.go.kr 등)은 외부 앱 차단 정책일 수 있어요. 개인 Gmail로 다시 로그인해주세요.';

/** 모바일 전용 고유 device ID (synced settings와 독립적으로 관리) */
function getMobileDeviceId(): string {
  const KEY = 'ssampin-mobile-device-id';
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // localStorage unavailable
  }
  if (!id) {
    id = `mobile-${generateUUID()}`;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // fallback - still use the generated id for this session
    }
  }
  return id;
}

// 순환 의존 방지: 런타임에 동적으로 import
async function reloadAllStores(): Promise<void> {
  try {
    const [
      { useMobileSettingsStore },
      { useMobileScheduleStore },
      { useMobileStudentStore },
      { useMobileSeatingStore },
      { useMobileEventsStore },
      { useMobileMemoStore },
      { useMobileTodoStore },
      { useMobileAttendanceStore },
      { useMobileTeachingClassStore },
      { useMobileStudentRecordsStore },
      { useMobileProgressStore },
      { useMobileAssignmentStore },
      { useMobileSurveyToolStore },
      { useMobileObservationStore },
      { useMobileRubricStore },
      { useMobileBookmarkStore },
    ] = await Promise.all([
      import('@mobile/stores/useMobileSettingsStore'),
      import('@mobile/stores/useMobileScheduleStore'),
      import('@mobile/stores/useMobileStudentStore'),
      import('@mobile/stores/useMobileSeatingStore'),
      import('@mobile/stores/useMobileEventsStore'),
      import('@mobile/stores/useMobileMemoStore'),
      import('@mobile/stores/useMobileTodoStore'),
      import('@mobile/stores/useMobileAttendanceStore'),
      import('@mobile/stores/useMobileTeachingClassStore'),
      import('@mobile/stores/useMobileStudentRecordsStore'),
      import('@mobile/stores/useMobileProgressStore'),
      import('@mobile/stores/useMobileAssignmentStore'),
      import('@mobile/stores/useMobileSurveyToolStore'),
      import('@mobile/stores/useMobileObservationStore'),
      import('@mobile/stores/useMobileRubricStore'),
      import('@mobile/stores/useMobileBookmarkStore'),
    ]);

    await Promise.all([
      useMobileSettingsStore.getState().reload(),
      useMobileScheduleStore.getState().reload(),
      useMobileStudentStore.getState().reload(),
      useMobileSeatingStore.getState().reload(),
      useMobileEventsStore.getState().reload(),
      useMobileMemoStore.getState().reload(),
      useMobileTodoStore.getState().reload(),
      useMobileAttendanceStore.getState().reload(),
      useMobileTeachingClassStore.getState().reload(),
      useMobileStudentRecordsStore.getState().reload(),
      useMobileProgressStore.getState().reload(),
      useMobileAssignmentStore.getState().reload(),
      useMobileSurveyToolStore.getState().reload(),
      useMobileObservationStore.getState().reload(),
      useMobileRubricStore.getState().reload(),
      useMobileBookmarkStore.getState().reload(),
    ]);
  } catch (e) {
    // 배포 후 이전 SW 캐시가 stale 청크를 참조하는 경우 새로고침으로 복구
    if (e instanceof Error && e.message.includes('Failed to fetch dynamically imported module')) {
      window.location.reload();
      return;
    }
    throw e;
  }
}

type SyncState = 'idle' | 'syncing' | 'error' | 'conflict';

/** 오류 종류 — SyncStatusBanner가 '다시 시도' 대신 '다시 로그인'을 보여줄지 판단하는 데 사용. */
type SyncErrorKind = 'auth' | 'blocked' | 'generic' | null;

interface ConflictInfo {
  filename: string;
  localTime: string;
  remoteTime: string;
}

interface MobileDriveSyncState {
  state: SyncState;
  progress: number;
  error: string | null;
  errorKind: SyncErrorKind;
  conflict: ConflictInfo | null;
  lastSyncedAt: string | null;
  isAuthenticated: boolean;
  lastSyncResult: SyncResult | null;

  setTokenGetter: (getter: () => Promise<string>) => void;
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  deleteCloudData: () => Promise<void>;
  triggerSaveSync: () => void;
  /** debounce 무시하고 즉시 업로드 (앱 백그라운드 전환 시 사용) */
  flushSync: () => Promise<void>;
}

let tokenGetter: (() => Promise<string>) | null = null;
let adapter: IDriveSyncPort | null = null;
let saveDebounce: ReturnType<typeof setTimeout> | null = null;
/** 업로드 유예(deferred) 재시도 1회 가드 — pull-merge-push 무한루프 방지 */
let deferredRetrying = false;

function getAdapter(): IDriveSyncPort {
  if (!adapter && tokenGetter) {
    adapter = getDriveSyncAdapter(tokenGetter);
  }
  if (!adapter) throw new Error('Drive sync not initialized');
  return adapter;
}

/** 동기화 실패 분류 → 스토어 상태 반영 (syncToCloud/syncFromCloud 공용) */
function applySyncError(e: unknown, set: (partial: Partial<MobileDriveSyncState>) => void): void {
  const msg = e instanceof Error ? e.message : '동기화 실패';
  if (isGoogleAuthBlockedError(msg)) {
    tokenGetter = null;
    adapter = null;
    set({
      state: 'error',
      isAuthenticated: false,
      errorKind: 'blocked',
      error: MOBILE_AUTH_BLOCKED_MESSAGE,
    });
  } else if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
    tokenGetter = null;
    adapter = null;
    set({
      state: 'error',
      isAuthenticated: false,
      errorKind: 'auth',
      error: msg.includes('SCOPE_INSUFFICIENT')
        ? 'Google Drive 접근 권한이 변경되었습니다. 다시 로그인해주세요.'
        : 'Google 인증이 만료되었습니다. 다시 로그인해주세요.',
    });
  } else {
    set({ state: 'error', errorKind: 'generic', error: msg });
  }
}

export const useMobileDriveSyncStore = create<MobileDriveSyncState>((set, get) => ({
  state: 'idle',
  progress: 0,
  error: null,
  errorKind: null,
  conflict: null,
  lastSyncedAt: null,
  isAuthenticated: false,
  lastSyncResult: null,

  setTokenGetter: (getter) => {
    tokenGetter = getter;
    adapter = null;
    set({ isAuthenticated: true });
  },

  syncToCloud: async () => {
    if (!tokenGetter) {
      set({
        state: 'error',
        errorKind: 'auth',
        error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.',
      });
      return;
    }
    if (get().state === 'syncing') return;
    set({ state: 'syncing', progress: 0, error: null, errorKind: null });
    try {
      // Load settings to get real deviceId
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncTo = new SyncToCloud(
        storage,
        getAdapter(),
        driveSyncRepository,
        deviceId,
        deviceName,
      );
      const result = await syncTo.execute(({ current, total }) => {
        set({ progress: Math.round((current / total) * 100) });
      });
      const now = new Date().toISOString();
      set({
        state: 'idle',
        progress: 100,
        errorKind: null,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'upload',
          timestamp: now,
          uploaded: result.uploaded,
          skipped: result.skipped,
        },
      });
      // 리모트 변경으로 업로드가 유예된 파일이 있으면: 다운로드(병합) 후 1회만 재업로드.
      // 이게 없으면 폰에서 입력한 변경분이 Drive에 오르지 못한 채 다음 다운로드에 덮여 사라질 수 있다.
      if (result.deferred.length > 0 && !deferredRetrying) {
        deferredRetrying = true;
        try {
          await get().syncFromCloud();
          await get().syncToCloud();
        } finally {
          deferredRetrying = false;
        }
      }
    } catch (e) {
      applySyncError(e, set);
    }
  },

  syncFromCloud: async () => {
    if (!tokenGetter) {
      set({
        state: 'error',
        errorKind: 'auth',
        error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.',
      });
      return;
    }
    if (get().state === 'syncing') return;
    set({ state: 'syncing', progress: 0, error: null, errorKind: null });
    try {
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncFrom = new SyncFromCloud(
        storage,
        getAdapter(),
        driveSyncRepository,
        deviceId,
        deviceName,
        'latest',
        undefined,
        undefined,
        // S2.2b — 옛 학년도 스킵 기준. 모바일은 자체 전환이 없으므로 동기화된 settings 파일의
        // currentTerm(데스크톱 전환이 기록)을 raw로 읽는다(MobileSettings 투영에 미포함 필드).
        async () =>
          (await storage.read<{ currentTerm?: string }>('settings'))?.currentTerm ?? undefined,
      );
      const result = await syncFrom.execute(({ current, total }) => {
        set({ progress: Math.round((current / total) * 100) });
      });
      const now = new Date().toISOString();
      set({
        state: 'idle',
        progress: 100,
        errorKind: null,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'download',
          timestamp: now,
          downloaded: result.downloaded,
          skipped: result.skipped,
          conflicts: result.conflicts.map((c) => c.filename),
        },
      });
      await reloadAllStores();
    } catch (e) {
      applySyncError(e, set);
    }
  },

  resolveConflict: async (choice) => {
    set({ conflict: null });
    if (choice === 'local') {
      await get().syncToCloud();
    } else {
      await get().syncFromCloud();
    }
  },

  deleteCloudData: async () => {
    if (!tokenGetter) return;
    try {
      const a = getAdapter();
      const folder = await a.getOrCreateSyncFolder();
      await a.deleteSyncFolder(folder.id);
      set({ state: 'idle', lastSyncedAt: null });
    } catch (e) {
      set({ state: 'error', error: e instanceof Error ? e.message : '삭제 실패' });
    }
  },

  triggerSaveSync: () => {
    if (saveDebounce) clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      void get().syncToCloud();
    }, 5000);
  },

  flushSync: async () => {
    if (saveDebounce) {
      clearTimeout(saveDebounce);
      saveDebounce = null;
    }
    if (!tokenGetter || get().state === 'syncing') return;
    // 화면의 미저장 편집이 로컬에 먼저 내려앉기를 기다린다. 이걸 건너뛰면 백그라운드 전환 시
    // 편집 직전 상태가 클라우드 정본이 되어 PC 까지 덮는다(같은 이벤트에 두 리스너가 붙어 있고
    // 실행 순서는 등록 순서에 달려 있다).
    await awaitPendingWrites();
    await get().syncToCloud();
  },
}));
