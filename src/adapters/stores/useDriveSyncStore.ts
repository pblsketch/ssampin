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

/**
 * 신규 기기 최초 동기화 모달용 클라우드 사전 조회 결과.
 * - undefined: 조회 중 (모달은 노출되었으나 결과 미도착)
 * - null: 조회 실패 (네트워크/권한 등)
 * - { hasData, ... }: 조회 성공
 */
export interface CloudSyncInfo {
  hasData: boolean;
  lastSyncedAt?: string;
  deviceName?: string;
}

interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncedAt: string | null;
  conflicts: DriveSyncConflict[];
  error: string | null;
  progress: SyncProgress | null;
  lastSyncResult: SyncResult | null;

  // first-sync-confirmation
  firstSyncRequired: boolean;
  firstSyncCloudInfo: CloudSyncInfo | null | undefined;

  // Actions
  syncToCloud: () => Promise<void>;
  syncFromCloud: () => Promise<{ downloaded: string[]; conflicts: DriveSyncConflict[] }>;
  importSettingsFromCloud: () => Promise<ImportSettingsResult>;
  resolveConflict: (conflict: DriveSyncConflict, resolution: 'local' | 'remote') => Promise<void>;
  deleteCloudData: () => Promise<void>;
  resetStatus: () => void;
  triggerSaveSync: () => void;

  // first-sync-confirmation actions
  checkFirstSyncRequired: () => Promise<void>;
  chooseFirstSync: (action: 'download' | 'upload' | 'defer') => Promise<void>;
}

let _saveSyncTimer: ReturnType<typeof setTimeout> | null = null;
/** 업로드 유예(deferred) 재시도 1회 가드 — pull-merge-push 무한루프 방지 */
let _deferredRetrying = false;

export const useDriveSyncStore = create<DriveSyncState>((set, get) => ({
  status: 'idle',
  lastSyncedAt: null,
  conflicts: [],
  error: null,
  progress: null,
  lastSyncResult: null,
  firstSyncRequired: false,
  firstSyncCloudInfo: undefined,

  syncToCloud: async () => {
    if (get().status === 'syncing') return;
    // 신규 기기 첫 동기화 모달 열려있는 동안 무단 업로드 차단 (경쟁 조건 방지)
    if (get().firstSyncRequired) return;
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } =
        await import('@adapters/di/container');
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

      const { noteRepository, observationAttachmentRepository } =
        await import('@adapters/di/container');
      const getDynamicSyncFiles = () => noteRepository.listPageBodyKeys();
      const getBinaryDynamicSyncFiles = () => observationAttachmentRepository.listBinaryKeys();
      // (S4.1) 아카이브 훅 — 데스크톱(archive IPC 존재)에서만 주입. 미주입=기존 동작 그대로.
      const archiveSync = await import('@adapters/repositories/archiveSyncGateway');
      const archiveEnabled = archiveSync.hasArchiveSync();

      const useCase = new SyncToCloud(
        storage,
        drivePort,
        driveSyncRepository,
        sync.deviceId,
        settings.teacherName || '내 기기',
        getDynamicSyncFiles,
        getBinaryDynamicSyncFiles,
        archiveEnabled ? archiveSync.listArchiveSyncFiles : undefined,
        archiveEnabled ? archiveSync.readArchiveSyncFileBytes : undefined,
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

      // 리모트 변경으로 업로드가 유예된 파일이 있으면: 다운로드(병합) 후 1회만 재업로드.
      // 이 기기의 변경분이 Drive에 오르지 못한 채 다음 다운로드에 덮이는 것을 막는다.
      if (result.deferred.length > 0 && !_deferredRetrying) {
        _deferredRetrying = true;
        try {
          await get().syncFromCloud();
          await get().syncToCloud();
        } finally {
          _deferredRetrying = false;
        }
      }
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
    // 신규 기기 첫 동기화 모달 열려있는 동안 무단 다운로드 차단 (경쟁 조건 방지)
    if (get().firstSyncRequired) return { downloaded: [], conflicts: [] };
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } =
        await import('@adapters/di/container');
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

      const { noteRepository, observationAttachmentRepository } =
        await import('@adapters/di/container');
      const getDynamicSyncFiles = () => noteRepository.listPageBodyKeys();
      const getBinaryDynamicSyncFiles = () => observationAttachmentRepository.listBinaryKeys();
      // (S4.1) 아카이브 훅 — 데스크톱(archive IPC 존재)에서만 주입. 미주입=기존 동작 그대로.
      const archiveSync = await import('@adapters/repositories/archiveSyncGateway');
      const archiveEnabled = archiveSync.hasArchiveSync();

      const useCase = new SyncFromCloud(
        storage,
        drivePort,
        driveSyncRepository,
        sync.deviceId,
        settings.teacherName || '내 기기',
        sync.conflictPolicy,
        getDynamicSyncFiles,
        getBinaryDynamicSyncFiles,
        // S2.2b·F9a — 스킵 기준(lastClosedTerm 정본 + currentTerm 폴백). 실행 시점 fresh 조회.
        // 지연 재시도(pull-merge-push)도 이 액션을 재호출하므로 업/다운 병합이 같은 기준을 쓴다.
        async () => {
          const s = useSettingsStore.getState().settings;
          return {
            currentTerm: s.currentTerm,
            lastClosedTerm: s.lastClosedTerm,
            lastClosedAt: s.lastClosedAt,
          };
        },
        archiveEnabled ? archiveSync.listLocalArchiveTerms : undefined,
        archiveEnabled ? archiveSync.importArchiveTermFiles : undefined,
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
        conflicts: result.conflicts.map((c) => c.filename),
      };

      if (result.conflicts.length > 0) {
        set({
          status: 'conflict',
          conflicts: result.conflicts,
          lastSyncedAt: now,
          progress: null,
          lastSyncResult: syncResult,
        });
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
    const { ImportSettingsFromCloudError } = await import('@usecases/sync/ImportSettingsFromCloud');
    set({ status: 'syncing', error: null, progress: null });
    try {
      const { createImportSettingsFromCloud, authenticateGoogle } =
        await import('@adapters/di/container');

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
        imported?.message ?? (err instanceof Error ? err.message : '설정 가져오기에 실패했습니다.');
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
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle, storage } =
        await import('@adapters/di/container');
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
        const driveFile = remoteFiles.find((f) => f.name === `${conflict.filename}.json`);
        if (driveFile) {
          const content = await drivePort.downloadSyncFile(driveFile.id);
          let parsed = JSON.parse(content) as unknown;
          if (conflict.filename === 'settings') {
            // F3(H1): settings 통파일 교체는 충돌 해소 경로에서도 currentTerm "더 최신 학기 승" —
            // 미전환 기기의 settings 채택이 옛 학년도 스킵 필터를 영구 비활성시키지 않게(qa3-C).
            const { preserveNewerTermGuard } = await import('@usecases/sync/SyncFromCloud');
            const { storage: st } = await import('@adapters/di/container');
            let local: import('@usecases/sync/SyncFromCloud').TermGuardSnapshot | null = null;
            try {
              local =
                await st.read<import('@usecases/sync/SyncFromCloud').TermGuardSnapshot>('settings');
            } catch {
              local = null;
            }
            parsed = preserveNewerTermGuard(parsed, local ?? {});
          }
          await storage.write(conflict.filename, parsed);
        }
      } else {
        // 로컬 데이터를 클라우드에 업로드
        const data = await storage.read<unknown>(conflict.filename);
        if (data !== null) {
          await drivePort.uploadSyncFile(
            folder.id,
            `${conflict.filename}.json`,
            JSON.stringify(data),
          );
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
        conflicts: s.conflicts.filter((c) => c.filename !== conflict.filename),
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
      const { driveSyncRepository, getDriveSyncAdapter, authenticateGoogle } =
        await import('@adapters/di/container');
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
    // 신규 기기 첫 동기화 모달 열려있는 동안 자동 업로드 트리거 차단
    if (get().firstSyncRequired) return;
    // 디바운스: 5초 내 추가 변경이 없으면 업로드
    if (_saveSyncTimer) clearTimeout(_saveSyncTimer);
    _saveSyncTimer = setTimeout(() => {
      _saveSyncTimer = null;
      void get().syncToCloud();
    }, 5000);
  },

  checkFirstSyncRequired: async () => {
    const { useSettingsStore } = await import('./useSettingsStore');
    const sync = useSettingsStore.getState().settings.sync;
    if (!sync?.enabled) return;

    const { driveSyncRepository } = await import('@adapters/di/container');
    const manifest = await driveSyncRepository.getLocalManifest();

    // manifest 존재 + deviceId 있으면 기존 사용자 → 모달 미노출
    if (manifest && manifest.deviceId !== '') return;

    // 신규 기기 → 모달 노출 + 클라우드 사전 조회 시작
    set({ firstSyncRequired: true, firstSyncCloudInfo: undefined });

    try {
      const { getDriveSyncAdapter, authenticateGoogle } = await import('@adapters/di/container');
      const getToken = () => authenticateGoogle.getValidAccessToken();
      const drivePort = getDriveSyncAdapter(getToken);
      const folder = await drivePort.getOrCreateSyncFolder();
      const cloudManifest = await drivePort.getSyncManifest(folder.id);

      if (!cloudManifest) {
        set({ firstSyncCloudInfo: { hasData: false } });
        return;
      }
      set({
        firstSyncCloudInfo: {
          hasData: Object.keys(cloudManifest.files).length > 0,
          lastSyncedAt: cloudManifest.lastSyncedAt,
          deviceName: cloudManifest.deviceName,
        },
      });
    } catch (err) {
      console.warn('[DriveSync] checkFirstSyncRequired: 클라우드 조회 실패', err);
      set({ firstSyncCloudInfo: null });
    }
  },

  chooseFirstSync: async (action) => {
    const { useSettingsStore } = await import('./useSettingsStore');
    const sync = useSettingsStore.getState().settings.sync;
    if (!sync) {
      set({ firstSyncRequired: false, firstSyncCloudInfo: undefined });
      return;
    }

    if (action === 'download') {
      await useSettingsStore.getState().update({
        sync: { ...sync, enabled: true, firstSyncDeferred: false },
      });
      set({ firstSyncRequired: false, firstSyncCloudInfo: undefined });
      const result = await get().syncFromCloud();
      // 다운로드된 파일 reload는 호출자(App.tsx 또는 BackupCard) 책임
      void result;
    } else if (action === 'upload') {
      await useSettingsStore.getState().update({
        sync: { ...sync, enabled: true, firstSyncDeferred: false },
      });
      set({ firstSyncRequired: false, firstSyncCloudInfo: undefined });
      await get().syncToCloud();
    } else {
      // defer
      await useSettingsStore.getState().update({
        sync: { ...sync, enabled: false, firstSyncDeferred: true },
      });
      set({ firstSyncRequired: false, firstSyncCloudInfo: undefined });
    }
  },
}));
