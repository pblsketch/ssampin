import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import { SyncFromCloud } from '@usecases/sync/SyncFromCloud';
import { ResolveSyncConflict, StaleSyncConflictError } from '@usecases/sync/ResolveSyncConflict';
import { getDriveSyncAdapter, driveSyncRepository, storage } from '@mobile/di/container';
import type { SyncResult } from '@adapters/stores/useDriveSyncStore';
import { isGoogleAuthBlockedError } from '@domain/rules/calendarSyncRules';
import { parseTerm } from '@domain/rules/academicCalendar';
import { awaitPendingWrites } from '@mobile/stores/pendingWrites';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';

/**
 * F8c(RT1) — 다른 기기의 학년도 마무리 감지: 동기화 다운로드로 settings.currentTerm이
 * "새로 생기거나 전진"했는가(단일 신호 — 과도한 감지 로직 금지 지침).
 * before 부재+after 존재 = 다른 기기의 첫 전환도 전진으로 본다.
 */
export function isYearTransitionAdvance(
  before: string | undefined,
  after: string | undefined,
): boolean {
  if (after === undefined) return false;
  const a = parseTerm(after);
  if (a === null) return false;
  if (before === undefined) return true;
  const b = parseTerm(before);
  if (b === null) return true;
  return a.year * 10 + a.semester > b.year * 10 + b.semester;
}

/** F8c — 학년도 전환 안내 1회 노출 dedup(localStorage: 마지막으로 안내한 학기). */
const YEAR_TRANSITION_NOTICE_SEEN_KEY = 'ssampin-mobile-year-transition-notice-v1';

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

export function firstMobileConflict(
  conflicts: readonly DriveSyncConflict[],
): DriveSyncConflict | null {
  return conflicts[0] ?? null;
}

export function canStartMobileConflictResolution(
  state: SyncState,
  conflict: DriveSyncConflict | null,
): conflict is DriveSyncConflict {
  return state !== 'syncing' && conflict !== null;
}

export function canStartMobileUpload(
  state: SyncState,
  conflict: DriveSyncConflict | null,
): boolean {
  return state !== 'syncing' && conflict === null;
}

/** 오류 종류 — SyncStatusBanner가 '다시 시도' 대신 '다시 로그인'을 보여줄지 판단하는 데 사용. */
type SyncErrorKind = 'auth' | 'blocked' | 'generic' | null;

interface MobileDriveSyncState {
  state: SyncState;
  progress: number;
  error: string | null;
  errorKind: SyncErrorKind;
  conflict: DriveSyncConflict | null;
  lastSyncedAt: string | null;
  isAuthenticated: boolean;
  lastSyncResult: SyncResult | null;
  /**
   * F8c(RT1) — 다른 기기에서 학년도 마무리가 실행됐음을 감지한 1회 안내(새 학기 라벨).
   * null이면 안내 없음. 닫으면 dismissYearTransitionNotice가 dedup 기록 후 소거.
   */
  yearTransitionNoticeTerm: string | null;

  setTokenGetter: (getter: () => Promise<string>) => void;
  dismissYearTransitionNotice: () => void;
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  resolveAllConflictsFromCloud: (onProgress?: (current: number) => void) => Promise<void>;
  deleteCloudData: () => Promise<void>;
  triggerSaveSync: () => void;
  /** debounce 무시하고 즉시 업로드 (앱 백그라운드 전환 시 사용) */
  flushSync: () => Promise<void>;
}

let tokenGetter: (() => Promise<string>) | null = null;
let adapter: IDriveSyncPort | null = null;
let saveDebounce: ReturnType<typeof setTimeout> | null = null;
let resolveAllInFlight: Promise<void> | null = null;
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
  yearTransitionNoticeTerm: null,

  setTokenGetter: (getter) => {
    tokenGetter = getter;
    adapter = null;
    set({ isAuthenticated: true });
  },

  dismissYearTransitionNotice: () => {
    const term = get().yearTransitionNoticeTerm;
    if (term !== null) {
      try {
        localStorage.setItem(YEAR_TRANSITION_NOTICE_SEEN_KEY, term);
      } catch {
        /* localStorage 불가 시 이 세션만 소거(다음 세션 재노출 — 무해) */
      }
    }
    set({ yearTransitionNoticeTerm: null });
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
    if (!canStartMobileUpload(get().state, get().conflict)) return;
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
      // F8c(RT1) — 전환 감지 기준점: 다운로드 전 settings.currentTerm(읽기 실패=감지 스킵).
      let termBeforeSync: string | undefined;
      try {
        termBeforeSync = (await storage.read<{ currentTerm?: string }>('settings'))?.currentTerm;
      } catch {
        termBeforeSync = undefined;
      }
      const syncFrom = new SyncFromCloud(
        storage,
        getAdapter(),
        driveSyncRepository,
        deviceId,
        deviceName,
        'ask',
        undefined,
        undefined,
        // S2.2b·F9a — 스킵 기준. 모바일은 자체 전환이 없으므로 동기화된 settings 파일의
        // currentTerm·lastClosedTerm(데스크톱 전환이 기록)을 raw로 읽는다(MobileSettings 투영 밖).
        async () => {
          const s = await storage.read<{
            currentTerm?: string;
            lastClosedTerm?: string;
            lastClosedAt?: string;
          }>('settings');
          return {
            currentTerm: s?.currentTerm,
            lastClosedTerm: s?.lastClosedTerm,
            lastClosedAt: s?.lastClosedAt,
          };
        },
        undefined,
        undefined,
        get().conflict !== null,
      );
      const result = await syncFrom.execute(({ current, total }) => {
        set({ progress: Math.round((current / total) * 100) });
      });
      // F8c(RT1) — 다운로드로 currentTerm이 전진했으면 1회 안내(localStorage dedup).
      try {
        const termAfterSync = (await storage.read<{ currentTerm?: string }>('settings'))
          ?.currentTerm;
        if (
          isYearTransitionAdvance(termBeforeSync, termAfterSync) &&
          termAfterSync !== undefined &&
          localStorage.getItem(YEAR_TRANSITION_NOTICE_SEEN_KEY) !== termAfterSync
        ) {
          set({ yearTransitionNoticeTerm: termAfterSync });
        }
      } catch {
        /* 감지 실패는 안내 생략일 뿐 — 동기화 자체에 영향 없음 */
      }
      const now = new Date().toISOString();
      const conflict = firstMobileConflict(result.conflicts);
      set({
        state: conflict ? 'conflict' : 'idle',
        progress: 100,
        errorKind: null,
        conflict,
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
    const { state, conflict } = get();
    if (!canStartMobileConflictResolution(state, conflict)) return;

    set({ state: 'syncing', progress: 0, error: null, errorKind: null });
    try {
      const resolver = new ResolveSyncConflict(
        storage,
        getAdapter(),
        driveSyncRepository,
        getMobileDeviceId(),
        conflict.localDeviceName,
      );
      await resolver.execute(conflict, choice);
      // 재비교가 끝날 때까지 기존 충돌 객체를 유지한다. 그래야 장부 부재/손상을 성공으로 오인하지 않는다.
      set({ state: 'idle' });
      await get().syncFromCloud();
    } catch (e) {
      if (e instanceof StaleSyncConflictError) {
        // 기존 충돌 객체를 유지한 채 ask 정책으로 다시 비교해 최신 선택지를 갱신한다.
        set({ state: 'idle', error: e.message, errorKind: null });
        await get().syncFromCloud();
        return;
      }
      applySyncError(e, set);
    }
  },

  resolveAllConflictsFromCloud: (onProgress) => {
    if (resolveAllInFlight) return resolveAllInFlight;

    const run = (async () => {
      const seenFiles = new Set<string>();
      let currentIndex = 0;

      while (true) {
        const current = get();
        if (current.state === 'syncing' || current.conflict === null) return;

        const filename = current.conflict.filename;
        if (seenFiles.has(filename)) {
          set({
            state: 'error',
            errorKind: null,
            error: '같은 항목을 다시 확인해야 합니다. 이 항목은 개별적으로 선택해 주세요.',
          });
          return;
        }
        seenFiles.add(filename);
        currentIndex += 1;
        onProgress?.(currentIndex);

        await current.resolveConflict('remote');

        const next = get();
        if (next.state === 'error' || next.conflict === null) return;
      }
    })();

    resolveAllInFlight = run;
    return run.finally(() => {
      if (resolveAllInFlight === run) resolveAllInFlight = null;
    });
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
