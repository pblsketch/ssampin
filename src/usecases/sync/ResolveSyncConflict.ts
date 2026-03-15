import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncConflict, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';

async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 동기화 충돌 해결 UseCase
 */
export class ResolveSyncConflict {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
  ) {}

  async execute(conflict: DriveSyncConflict, resolution: 'local' | 'remote'): Promise<void> {
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    const driveFile = remoteFiles.find(f => f.name === `${conflict.filename}.json`);
    const manifest = await this.syncRepo.getLocalManifest();

    if (resolution === 'local') {
      // 로컬 데이터를 Drive에 업로드
      const data = await this.storage.read<unknown>(conflict.filename);
      if (data !== null) {
        const content = JSON.stringify(data);
        const checksum = await computeChecksum(content);
        const result = await this.drivePort.uploadSyncFile(folder.id, `${conflict.filename}.json`, content);

        // 매니페스트 업데이트
        if (manifest) {
          const fileInfo: DriveSyncFileInfo = {
            lastModified: result.modifiedTime,
            checksum,
            size: new TextEncoder().encode(content).length,
          };
          const updated = {
            ...manifest,
            lastSyncedAt: new Date().toISOString(),
            files: { ...manifest.files, [conflict.filename]: fileInfo },
          };
          await this.syncRepo.saveLocalManifest(updated);
          await this.drivePort.updateSyncManifest(folder.id, updated);
        }
      }
    } else {
      // Drive 데이터를 로컬에 다운로드
      if (driveFile) {
        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        const parsed = JSON.parse(content) as unknown;
        await this.storage.write(conflict.filename, parsed);

        // 매니페스트 업데이트
        const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
        const remoteFileInfo = remoteManifest?.files[conflict.filename];
        if (manifest && remoteFileInfo) {
          const updated = {
            ...manifest,
            lastSyncedAt: new Date().toISOString(),
            files: { ...manifest.files, [conflict.filename]: remoteFileInfo },
          };
          await this.syncRepo.saveLocalManifest(updated);
        }
      }
    }
  }
}
