import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncConflict, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { SYNC_FILES, type SyncProgress } from './SyncToCloud';

export interface SyncFromCloudResult {
  readonly downloaded: string[];
  readonly conflicts: DriveSyncConflict[];
  readonly skipped: string[];
}

/**
 * Google Drive에서 로컬로 데이터를 다운로드하는 UseCase
 */
export class SyncFromCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly deviceId: string,
    private readonly deviceName: string,
    private readonly conflictPolicy: 'latest' | 'ask' = 'ask',
  ) {}

  async execute(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncFromCloudResult> {
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    if (!remoteManifest) {
      return { downloaded: [], conflicts: [], skipped: [...SYNC_FILES] };
    }

    const localManifest = await this.syncRepo.getLocalManifest();
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    const downloaded: string[] = [];
    const conflicts: DriveSyncConflict[] = [];
    const skipped: string[] = [];
    const updatedFiles: Record<string, DriveSyncFileInfo> = { ...(localManifest?.files ?? {}) };
    const total = SYNC_FILES.length;

    let index = 0;
    for (const filename of SYNC_FILES) {
      index++;
      onProgress?.({ current: index, total, filename });

      const remoteInfo = remoteManifest.files[filename];
      const localInfo = localManifest?.files[filename];

      if (!remoteInfo) {
        skipped.push(filename);
        continue;
      }

      // 체크섬 동일 → 스킵
      if (localInfo && localInfo.checksum === remoteInfo.checksum) {
        skipped.push(filename);
        continue;
      }

      // 양쪽 다 변경됨 → 충돌
      if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
        const localIsNewer = new Date(localInfo.lastModified) > new Date(remoteInfo.lastModified);
        const remoteIsNewer = !localIsNewer;

        // 동일 기기가 마지막으로 수정했으면 충돌 아님 (로컬이 최신이면 스킵)
        if (remoteManifest.deviceId === this.deviceId) {
          skipped.push(filename);
          continue;
        }

        // conflictPolicy에 따라 처리
        if (this.conflictPolicy === 'latest') {
          if (remoteIsNewer) {
            // 리모트가 최신 → 다운로드
            const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
            if (driveFile) {
              const content = await this.drivePort.downloadSyncFile(driveFile.id);
              const parsed = JSON.parse(content) as unknown;
              await this.storage.write(filename, parsed);
              updatedFiles[filename] = remoteInfo;
              downloaded.push(filename);
            }
          } else {
            skipped.push(filename);
          }
          continue;
        }

        // 'ask' 정책 → 충돌 목록에 추가
        conflicts.push({
          filename,
          localModified: localInfo.lastModified,
          remoteModified: remoteInfo.lastModified,
          localDeviceName: this.deviceName,
          remoteDeviceName: remoteManifest.deviceName,
        });
        continue;
      }

      // 로컬에 없는 파일 → 무조건 다운로드
      const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
      if (driveFile) {
        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        const parsed = JSON.parse(content) as unknown;
        await this.storage.write(filename, parsed);
        updatedFiles[filename] = remoteInfo;
        downloaded.push(filename);
      } else {
        skipped.push(filename);
      }
    }

    // 로컬 매니페스트 업데이트
    if (downloaded.length > 0) {
      const newLocalManifest: DriveSyncManifest = {
        version: 1,
        lastSyncedAt: new Date().toISOString(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        files: updatedFiles,
      };
      await this.syncRepo.saveLocalManifest(newLocalManifest);
    }

    return { downloaded, conflicts, skipped };
  }
}
