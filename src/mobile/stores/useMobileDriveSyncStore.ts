import { create } from 'zustand';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import { SyncFromCloud } from '@usecases/sync/SyncFromCloud';
import { getDriveSyncAdapter, driveSyncRepository, storage } from '@mobile/di/container';
import type { SyncResult } from '@adapters/stores/useDriveSyncStore';

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
    id = `mobile-${crypto.randomUUID()}`;
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

interface ConflictInfo {
  filename: string;
  localTime: string;
  remoteTime: string;
}

interface MobileDriveSyncState {
  state: SyncState;
  progress: number;
  error: string | null;
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

function getAdapter(): IDriveSyncPort {
  if (!adapter && tokenGetter) {
    adapter = getDriveSyncAdapter(tokenGetter);
  }
  if (!adapter) throw new Error('Drive sync not initialized');
  return adapter;
}

export const useMobileDriveSyncStore = create<MobileDriveSyncState>((set, get) => ({
  state: 'idle',
  progress: 0,
  error: null,
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
      set({ state: 'error', error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.' });
      return;
    }
    if (get().state === 'syncing') return;
    set({ state: 'syncing', progress: 0, error: null });
    try {
      // Load settings to get real deviceId
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncTo = new SyncToCloud(storage, getAdapter(), driveSyncRepository, deviceId, deviceName);
      const result = await syncTo.execute(({ current, total }) => {
        set({ progress: Math.round((current / total) * 100) });
      });
      const now = new Date().toISOString();
      set({
        state: 'idle',
        progress: 100,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'upload',
          timestamp: now,
          uploaded: result.uploaded,
          skipped: result.skipped,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '동기화 실패';
      if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
        tokenGetter = null;
        adapter = null;
        set({
          state: 'error',
          isAuthenticated: false,
          error: msg.includes('SCOPE_INSUFFICIENT')
            ? 'Google Drive 접근 권한이 변경되었습니다. 다시 로그인해주세요.'
            : 'Google 인증이 만료되었습니다. 다시 로그인해주세요.',
        });
      } else {
        set({ state: 'error', error: msg });
      }
    }
  },

  syncFromCloud: async () => {
    if (!tokenGetter) {
      set({ state: 'error', error: '로그인이 필요합니다. Google 계정으로 로그인해 주세요.' });
      return;
    }
    if (get().state === 'syncing') return;
    set({ state: 'syncing', progress: 0, error: null });
    try {
      const { useMobileSettingsStore } = await import('@mobile/stores/useMobileSettingsStore');
      const settingsState = useMobileSettingsStore.getState();
      if (!settingsState.loaded) await settingsState.load();
      const deviceId = getMobileDeviceId();
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncFrom = new SyncFromCloud(storage, getAdapter(), driveSyncRepository, deviceId, deviceName, 'latest');
      const result = await syncFrom.execute(({ current, total }) => {
        set({ progress: Math.round((current / total) * 100) });
      });
      const now = new Date().toISOString();
      set({
        state: 'idle',
        progress: 100,
        lastSyncedAt: now,
        lastSyncResult: {
          direction: 'download',
          timestamp: now,
          downloaded: result.downloaded,
          skipped: result.skipped,
          conflicts: result.conflicts.map(c => c.filename),
        },
      });
      await reloadAllStores();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '동기화 실패';
      if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
        tokenGetter = null;
        adapter = null;
        set({
          state: 'error',
          isAuthenticated: false,
          error: msg.includes('SCOPE_INSUFFICIENT')
            ? 'Google Drive 접근 권한이 변경되었습니다. 다시 로그인해주세요.'
            : 'Google 인증이 만료되었습니다. 다시 로그인해주세요.',
        });
      } else {
        set({ state: 'error', error: msg });
      }
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
    await get().syncToCloud();
  },
}));
