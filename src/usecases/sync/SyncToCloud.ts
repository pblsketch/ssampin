import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';

/** SHA-256 체크섬 계산 (Web Crypto API) */
async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const SYNC_FILES = [
  'settings', 'class-schedule', 'teacher-schedule', 'students',
  'seating', 'events', 'memos', 'todos', 'student-records',
  'bookmarks', 'surveys', 'seat-constraints', 'teaching-classes', 'dday',
  'curriculum-progress', 'attendance', 'consultations',
] as const;

export type SyncFileName = typeof SYNC_FILES[number];

export interface SyncToCloudResult {
  readonly uploaded: string[];
  readonly skipped: string[];
}

export interface SyncProgress {
  current: number;
  total: number;
  filename: string;
}

/**
 * 로컬 데이터를 Google Drive에 업로드하는 UseCase
 */
export class SyncToCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly deviceId: string,
    private readonly deviceName: string,
  ) {}

  async execute(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncToCloudResult> {
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const localManifest = await this.syncRepo.getLocalManifest();
    const uploaded: string[] = [];
    const skipped: string[] = [];
    const total = SYNC_FILES.length;
    const updatedFiles: Record<string, DriveSyncFileInfo> = { ...(localManifest?.files ?? {}) };

    let index = 0;
    for (const filename of SYNC_FILES) {
      index++;
      onProgress?.({ current: index, total, filename });

      const data = await this.storage.read<unknown>(filename);
      if (data === null) {
        skipped.push(filename);
        continue;
      }

      const content = JSON.stringify(data);
      const checksum = await computeChecksum(content);

      // 체크섬이 같으면 스킵
      if (localManifest?.files[filename]?.checksum === checksum) {
        skipped.push(filename);
        continue;
      }

      const result = await this.drivePort.uploadSyncFile(folder.id, `${filename}.json`, content);
      updatedFiles[filename] = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
      };
      uploaded.push(filename);
    }

    // 매니페스트 업데이트
    const newManifest: DriveSyncManifest = {
      version: 1,
      lastSyncedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      files: updatedFiles,
    };

    await this.drivePort.updateSyncManifest(folder.id, newManifest);
    await this.syncRepo.saveLocalManifest(newManifest);

    return { uploaded, skipped };
  }
}
