import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncConflict, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import type { StudentRecordsData, StudentRecord } from '@domain/entities/StudentRecord';
import { SYNC_FILES, type SyncProgress } from './SyncToCloud';

/** student-records를 record ID 기준으로 병합 (최신 createdAt 우선) */
function mergeStudentRecords(
  local: StudentRecordsData | null,
  remote: StudentRecordsData,
): StudentRecordsData {
  const localRecords = local?.records ?? [];
  const remoteRecords = remote.records ?? [];
  const map = new Map<string, StudentRecord>();

  // 로컬 레코드 먼저 추가
  for (const r of localRecords) {
    map.set(r.id, r);
  }
  // 리모트 레코드로 업데이트 (같은 ID면 createdAt이 더 최신인 것 사용)
  for (const r of remoteRecords) {
    const existing = map.get(r.id);
    if (!existing || r.createdAt >= existing.createdAt) {
      map.set(r.id, r);
    }
  }

  // 카테고리: 리모트 우선, 없으면 로컬
  const categories = remote.categories ?? local?.categories;
  return {
    records: [...map.values()],
    ...(categories ? { categories } : {}),
  };
}

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
    console.log(`[SyncFromCloud] ▶ 시작 | myDeviceId=${this.deviceId} | policy=${this.conflictPolicy}`);
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    if (!remoteManifest) {
      console.log('[SyncFromCloud] ❌ 리모트 매니페스트 없음 → 전체 스킵');
      return { downloaded: [], conflicts: [], skipped: [...SYNC_FILES] };
    }

    console.log(`[SyncFromCloud] 리모트 매니페스트: deviceId=${remoteManifest.deviceId} | deviceName=${remoteManifest.deviceName} | files=${Object.keys(remoteManifest.files).length}개`);
    console.log(`[SyncFromCloud] deviceId 비교: remote(${remoteManifest.deviceId}) === my(${this.deviceId}) → ${remoteManifest.deviceId === this.deviceId ? '⚠️ 동일(스킵 가능)' : '✅ 다름(다운로드 가능)'}`);

    const localManifest = await this.syncRepo.getLocalManifest();
    console.log(`[SyncFromCloud] 로컬 매니페스트: ${localManifest ? `deviceId=${localManifest.deviceId} | files=${Object.keys(localManifest.files).length}개` : 'NONE'}`);
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    console.log(`[SyncFromCloud] Drive 파일 목록: ${remoteFiles.map(f => f.name).join(', ')}`);
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
        console.log(`[SyncFromCloud]   ${filename}: SKIP (리모트에 없음)`);
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

        console.log(`[SyncFromCloud]   ${filename}: 충돌 감지 | local=${localInfo.checksum.slice(0, 8)}@${localInfo.lastModified} | remote=${remoteInfo.checksum.slice(0, 8)}@${remoteInfo.lastModified} | ${remoteIsNewer ? 'remote가 최신' : 'local이 최신'}`);

        // 동일 기기가 마지막으로 수정했으면 충돌 아님 (로컬이 최신이면 스킵)
        if (remoteManifest.deviceId === this.deviceId) {
          console.log(`[SyncFromCloud]   ${filename}: ⚠️ SKIP (동일 deviceId — 내가 올린 데이터)`);
          skipped.push(filename);
          continue;
        }

        // conflictPolicy에 따라 처리
        // student-records는 항상 record-level merge (데이터 손실 방지)
        if (filename === 'student-records') {
          const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
          if (driveFile) {
            const content = await this.drivePort.downloadSyncFile(driveFile.id);
            const remoteData = JSON.parse(content) as StudentRecordsData;
            const localData = await this.storage.read<StudentRecordsData>(filename);
            const merged = mergeStudentRecords(localData, remoteData);
            await this.storage.write(filename, merged);
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
            console.log(`[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`);
          }
          continue;
        }

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
              console.log(`[SyncFromCloud]   ${filename}: ✅ DOWNLOAD (remote가 최신)`);
            }
          } else {
            skipped.push(filename);
            console.log(`[SyncFromCloud]   ${filename}: SKIP (local이 최신)`);
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
        console.log(`[SyncFromCloud]   ${filename}: 🔶 CONFLICT (ask 정책)`);
        continue;
      }

      // 로컬에 없는 파일 → 무조건 다운로드 (student-records는 merge)
      const driveFile = remoteFiles.find(f => f.name === `${filename}.json`);
      if (driveFile) {
        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        if (filename === 'student-records') {
          const remoteData = JSON.parse(content) as StudentRecordsData;
          const localData = await this.storage.read<StudentRecordsData>(filename);
          const merged = mergeStudentRecords(localData, remoteData);
          await this.storage.write(filename, merged);
          console.log(`[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`);
        } else {
          const parsed = JSON.parse(content) as unknown;
          await this.storage.write(filename, parsed);
        }
        updatedFiles[filename] = remoteInfo;
        downloaded.push(filename);
        console.log(`[SyncFromCloud]   ${filename}: ✅ DOWNLOAD (로컬에 없음 → 무조건 다운로드)`);
      } else {
        skipped.push(filename);
        console.log(`[SyncFromCloud]   ${filename}: SKIP (Drive에 파일 없음)`);
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

    console.log(`[SyncFromCloud] ✅ 완료 | downloaded=${downloaded.length} conflicts=${conflicts.length} skipped=${skipped.length} | downloaded=[${downloaded.join(', ')}]`);
    return { downloaded, conflicts, skipped };
  }
}
