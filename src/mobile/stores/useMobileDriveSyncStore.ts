import { create } from 'zustand';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import { SyncFromCloud } from '@usecases/sync/SyncFromCloud';
import { getDriveSyncAdapter, driveSyncRepository, storage } from '@mobile/di/container';

// 순환 의존 방지: 런타임에 동적으로 import
async function reloadAllStores(): Promise<void> {
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
  ]);
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

  setTokenGetter: (getter: () => Promise<string>) => void;
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<void>;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  deleteCloudData: () => Promise<void>;
  triggerSaveSync: () => void;
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
      const deviceId = settingsState.settings.sync.deviceId || 'mobile-unknown';
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncTo = new SyncToCloud(storage, getAdapter(), driveSyncRepository, deviceId, deviceName);
      await syncTo.execute();
      set({ state: 'idle', progress: 100, lastSyncedAt: new Date().toISOString() });
    } catch (e) {
      set({ state: 'error', error: e instanceof Error ? e.message : '동기화 실패' });
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
      const deviceId = settingsState.settings.sync.deviceId || 'mobile-unknown';
      const deviceName = settingsState.settings.teacherName || 'Mobile PWA';
      const syncFrom = new SyncFromCloud(storage, getAdapter(), driveSyncRepository, deviceId, deviceName, 'latest');
      await syncFrom.execute();
      set({ state: 'idle', progress: 100, lastSyncedAt: new Date().toISOString() });
      await reloadAllStores();
    } catch (e) {
      set({ state: 'error', error: e instanceof Error ? e.message : '동기화 실패' });
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
}));
