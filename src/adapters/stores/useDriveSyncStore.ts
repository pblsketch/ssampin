import { create } from 'zustand';
import type { DriveSyncStatus, DriveSyncConflict } from '@domain/entities/DriveSyncState';
import type { SyncProgress } from '@usecases/sync/SyncToCloud';
import type { ImportSettingsFromCloudErrorCode } from '@usecases/sync/ImportSettingsFromCloud';

export interface SyncResult {
  direction: 'upload' | 'download';
  timestamp: string;
  uploaded?: string[];
  downloaded?: string[];
  skipped: string[];
  conflicts?: string[];
}

export type ImportSettingsResult =
  | { ok: true; remoteUpdatedAt?: string; remoteDeviceName?: string }
  | { ok: false; code: ImportSettingsFromCloudErrorCode; message: string };

interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncedAt: string | null;
  conflicts: DriveSyncConflict[];
  error: string | null;
  progress: SyncProgress | null;
  lastSyncResult: SyncResult | null;

  // Actions
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<{ downloaded: string[]; conflicts: DriveSyncConflict[] }>;
  importSettingsFromCloud: () => Promise<ImportSettingsResult>;
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
  lastSyncResult: null,

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

      const result = await useCase.execute((p) => set({ progress: p }));
      const now = new Date().toISOString();
      set({
        status: 'success',
        lastSyncedAt: now,
        progress: null,
        lastSyncResult: {
          direction: 'upload',
          timestamp: now,
          uploaded: result.uploaded,
          skipped: result.skipped,
        },
      });

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
      const msg = err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.';
      if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
        // 토큰이 무효화됨 → 동기화 비활성화, 재연결 안내
        const { useSettingsStore } = await import('./useSettingsStore');
        const sync = useSettingsStore.getState().settings.sync;
        if (sync) {
          await useSettingsStore.getState().update({
            sync: { ...sync, enabled: false },
          });
        }
        set({
          status: 'error',
          error: msg.includes('SCOPE_INSUFFICIENT')
            ? 'Google Drive 접근 권한이 변경되었습니다. 설정에서 Google 계정을 다시 연결해주세요.'
            : 'Google 인증이 만료되었습니다. 설정에서 Google 계정을 다시 연결해주세요.',
          progress: null,
        });
      } else {
        set({
          status: 'error',
          error: msg,
          progress: null,
        });
      }
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

      // 다운로드된 파일에 해당하는 스토어들을 리로드
      if (result.downloaded.length > 0) {
        const { reloadStores } = await import('@adapters/hooks/useDriveSync');
        await reloadStores(result.downloaded);
      }

      const syncResult: SyncResult = {
        direction: 'download',
        timestamp: now,
        downloaded: result.downloaded,
        skipped: result.skipped,
        conflicts: result.conflicts.map(c => c.filename),
      };

      if (result.conflicts.length > 0) {
        set({ status: 'conflict', conflicts: result.conflicts, lastSyncedAt: now, progress: null, lastSyncResult: syncResult });
      } else {
        set({ status: 'success', lastSyncedAt: now, progress: null, lastSyncResult: syncResult });
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
      const msg = err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.';
      if (msg.includes('INVALID_GRANT') || msg.includes('SCOPE_INSUFFICIENT')) {
        const { useSettingsStore } = await import('./useSettingsStore');
        const sync = useSettingsStore.getState().settings.sync;
        if (sync) {
          await useSettingsStore.getState().update({
            sync: { ...sync, enabled: false },
          });
        }
        set({
          status: 'error',
          error: msg.includes('SCOPE_INSUFFICIENT')
            ? 'Google Drive 접근 권한이 변경되었습니다. 설정에서 Google 계정을 다시 연결해주세요.'
            : 'Google 인증이 만료되었습니다. 설정에서 Google 계정을 다시 연결해주세요.',
          progress: null,
        });
      } else {
        set({
          status: 'error',
          error: msg,
          progress: null,
        });
      }
      return { downloaded: [], conflicts: [] };
    }
  },

  importSettingsFromCloud: async () => {
    if (get().status === 'syncing') {
      return { ok: false, code: 'UNKNOWN', message: '다른 동기화 작업이 진행 중입니다.' };
    }
    // ImportSettingsFromCloudError 클래스는 catch에서 instanceof로 쓰므로 try 바깥에서 import
    const { ImportSettingsFromCloudError } = await import(
      '@usecases/sync/ImportSettingsFromCloud'
    );
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { createImportSettingsFromCloud, authenticateGoogle } = await import(
        '@adapters/di/container'
      );

      const getToken = () => authenticateGoogle.getValidAccessToken();
      const useCase = createImportSettingsFromCloud(getToken);
      const result = await useCase.execute();

      // settings 리로드 → UI 즉시 반영
      const { reloadStores } = await import('@adapters/hooks/useDriveSync');
      await reloadStores(['settings']);

      const now = new Date().toISOString();
      set({
        status: 'success',
        error: null,
        progress: null,
        lastSyncResult: {
          direction: 'download',
          timestamp: now,
          downloaded: ['settings'],
          skipped: [],
          conflicts: [],
        },
      });
      setTimeout(() => {
        if (get().status === 'success') set({ status: 'idle' });
      }, 3000);

      return {
        ok: true,
        remoteUpdatedAt: result.remoteUpdatedAt,
        remoteDeviceName: result.remoteDeviceName,
      };
    } catch (err) {
      console.error('[DriveSync] importSettingsFromCloud error:', err);
      const imported = err instanceof ImportSettingsFromCloudError ? err : null;
      const code: ImportSettingsFromCloudErrorCode = imported?.code ?? 'UNKNOWN';
      const message =
        imported?.message ??
        (err instanceof Error ? err.message : '설정 가져오기에 실패했습니다.');
      set({ status: 'error', error: message, progress: null });
      setTimeout(() => {
        const s = get();
        if (s.status === 'error') set({ status: 'idle', error: null });
      }, 5000);
      return { ok: false, code, message };
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
