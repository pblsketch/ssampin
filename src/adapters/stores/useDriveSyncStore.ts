import { create } from 'zustand';
import type { DriveSyncStatus, DriveSyncConflict } from '@domain/entities/DriveSyncState';
import type { SyncProgress } from '@usecases/sync/SyncToCloud';

interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncedAt: string | null;
  conflicts: DriveSyncConflict[];
  error: string | null;
  progress: SyncProgress | null;

  // Actions
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<{ downloaded: string[]; conflicts: DriveSyncConflict[] }>;
  resolveConflict: (conflict: DriveSyncConflict, resolution: 'local' | 'remote') => Promise<void>;
  deleteCloudData: () => Promise<void>;
  resetStatus: () => void;
  triggerSaveSync: () => void;
}

let _saveSyncTimer: ReturnType<typeof setTimeout> | null = null;

export const useDriveSyncStore = create<DriveSyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  conflicts: [],
  error: null,
  progress: null,

  syncToCloud: async () => {
    if (get().status === 'syncing') return;
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } = await import('@adapters/di/container');
      const { useSettingsStore } = await import('./useSettingsStore');
      const { SyncToCloud } = await import('@usecases/sync/SyncToCloud');

      const settings = useSettingsStore.getState().settings;
      const sync = settings.sync;
      if (!sync?.enabled) {
        set({ status: 'idle' });
        return;
      }

      const getToken = () => authenticateGoogle.getValidAccessToken();
      const drivePort = getDriveSyncAdapter(getToken);

      const useCase = new SyncToCloud(
        storage,
        drivePort,
        driveSyncRepository,
        sync.deviceId,
        settings.teacherName || '내 기기',
      );

      await useCase.execute((p) => set({ progress: p }));
      const now = new Date().toISOString();
      set({ status: 'success', lastSyncedAt: now, progress: null });

      // settings에 lastSyncedAt 업데이트
      await useSettingsStore.getState().update({
        sync: { ...sync, lastSyncedAt: now },
      });

      // 3초 후 idle로 복귀
      setTimeout(() => {
        if (get().status === 'success') set({ status: 'idle' });
      }, 3000);
    } catch (err) {
      console.error('[DriveSync] syncToCloud error:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.',
        progress: null,
      });
    }
  },

  syncFromCloud: async () => {
    if (get().status === 'syncing') return { downloaded: [], conflicts: [] };
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } = await import('@adapters/di/container');
      const { useSettingsStore } = await import('./useSettingsStore');
      const { SyncFromCloud } = await import('@usecases/sync/SyncFromCloud');

      const settings = useSettingsStore.getState().settings;
      const sync = settings.sync;
      if (!sync?.enabled) {
        set({ status: 'idle' });
        return { downloaded: [], conflicts: [] };
      }

      const getToken = () => authenticateGoogle.getValidAccessToken();
      const drivePort = getDriveSyncAdapter(getToken);

      const useCase = new SyncFromCloud(
        storage,
        drivePort,
        driveSyncRepository,
        sync.deviceId,
        settings.teacherName || '내 기기',
        sync.conflictPolicy,
      );

      const result = await useCase.execute((p) => set({ progress: p }));
      const now = new Date().toISOString();

      if (result.conflicts.length > 0) {
        set({ status: 'conflict', conflicts: result.conflicts, lastSyncedAt: now, progress: null });
      } else {
        set({ status: 'success', lastSyncedAt: now, progress: null });
        setTimeout(() => {
          if (get().status === 'success') set({ status: 'idle' });
        }, 3000);
      }

      // settings에 lastSyncedAt 업데이트
      await useSettingsStore.getState().update({
        sync: { ...sync, lastSyncedAt: now },
      });

      return { downloaded: result.downloaded, conflicts: result.conflicts };
    } catch (err) {
      console.error('[DriveSync] syncFromCloud error:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.',
        progress: null,
      });
      return { downloaded: [], conflicts: [] };
    }
  },

  resolveConflict: async (conflict, resolution) => {
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } = await import('@adapters/di/container');
      const { useSettingsStore } = await import('./useSettingsStore');

      const settings = useSettingsStore.getState().settings;
      const sync = settings.sync;
      if (!sync) return;

      const getToken = () => authenticateGoogle.getValidAccessToken();
      const drivePort = getDriveSyncAdapter(getToken);
      const folder = await drivePort.getOrCreateSyncFolder();

      if (resolution === 'remote') {
        // 리모트 데이터를 로컬에 적용
        const remoteFiles = await drivePort.listSyncFiles(folder.id);
        const driveFile = remoteFiles.find(f => f.name === `${conflict.filename}.json`);
        if (driveFile) {
          const content = await drivePort.downloadSyncFile(driveFile.id);
          const parsed = JSON.parse(content) as unknown;
          await storage.write(conflict.filename, parsed);
        }
      } else {
        // 로컬 데이터를 클라우드에 업로드
        const data = await storage.read<unknown>(conflict.filename);
        if (data !== null) {
          await drivePort.uploadSyncFile(folder.id, `${conflict.filename}.json`, JSON.stringify(data));
        }
      }

      // 로컬 매니페스트 갱신
      const localManifest = await driveSyncRepository.getLocalManifest();
      if (localManifest) {
        const now = new Date().toISOString();
        const updatedManifest = {
          ...localManifest,
          lastSyncedAt: now,
        };
        await driveSyncRepository.saveLocalManifest(updatedManifest);
      }

      // 충돌 목록에서 제거
      set((s) => ({
        conflicts: s.conflicts.filter(c => c.filename !== conflict.filename),
      }));

      // 모든 충돌 해결됐으면 success
      const remaining = get().conflicts;
      if (remaining.length === 0) {
        set({ status: 'success' });
        setTimeout(() => {
          if (get().status === 'success') set({ status: 'idle' });
        }, 3000);
      }
    } catch (err) {
      console.error('[DriveSync] resolveConflict error:', err);
      set({
        error: err instanceof Error ? err.message : '충돌 해결 중 오류가 발생했습니다.',
      });
    }
  },

  deleteCloudData: async () => {
    set({ status: 'syncing', error: null });
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle } = await import('@adapters/di/container');
      const { useSettingsStore } = await import('./useSettingsStore');

      const settings = useSettingsStore.getState().settings;
      const sync = settings.sync;
      if (!sync?.enabled) {
        set({ status: 'idle' });
        return;
      }

      const getToken = () => authenticateGoogle.getValidAccessToken();
      const drivePort = getDriveSyncAdapter(getToken);
      const folder = await drivePort.getOrCreateSyncFolder();
      await drivePort.deleteSyncFolder(folder.id);

      // 로컬 매니페스트도 초기화
      await driveSyncRepository.saveLocalManifest({
        version: 1,
        lastSyncedAt: '',
        deviceId: sync.deviceId,
        deviceName: settings.teacherName || '내 기기',
        files: {},
      });

      set({ status: 'idle', lastSyncedAt: null });
    } catch (err) {
      console.error('[DriveSync] deleteCloudData error:', err);
      set({
        status: 'error',
        error: err instanceof Error ? err.message : '클라우드 데이터 삭제 중 오류가 발생했습니다.',
      });
    }
  },

  resetStatus: () => set({ status: 'idle', error: null, progress: null }),

  triggerSaveSync: () => {
    // 디바운스: 5초 내 추가 변경이 없으면 업로드
    if (_saveSyncTimer) clearTimeout(_saveSyncTimer);
    _saveSyncTimer = setTimeout(() => {
      _saveSyncTimer = null;
      void get().syncToCloud();
    }, 5000);
  },
}));
