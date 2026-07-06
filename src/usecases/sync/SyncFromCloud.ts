import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type {
  DriveSyncManifest,
  DriveSyncConflict,
  DriveSyncFileInfo,
} from '@domain/entities/DriveSyncState';
import type { StudentRecordsData, StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceData, AttendanceRecord } from '@domain/entities/Attendance';
import { attendanceRecordKey } from '@domain/entities/Attendance';
import {
  SYNC_FILES,
  type SyncProgress,
  type GetDynamicSyncFiles,
  type GetBinaryDynamicSyncFiles,
} from './SyncToCloud';
import { base64ToUint8 } from './binaryBase64';

/** Q2: 마이그레이션 여부 판별 보조 — tags 가 많을수록 정규화된 쪽으로 본다. */
function recordTagCount(r: StudentRecord): number {
  return r.tags?.length ?? 0;
}

/** student-records를 record ID 기준으로 병합 (최신 createdAt 우선) */
export function mergeStudentRecords(
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
    if (!existing || r.createdAt > existing.createdAt) {
      map.set(r.id, r);
    } else if (
      r.createdAt === existing.createdAt &&
      recordTagCount(r) >= recordTagCount(existing)
    ) {
      // Q2: createdAt 동률(정규화는 createdAt 불변)일 때 tags 가 더(또는 같이) 많은 쪽 우선.
      //   미변환(tags 적은) 레코드가 변환본을 덮어 "좀비 부활"하는 것을 막는다(remote 우선 기본은 보존).
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

/**
 * attendance를 (classId|groupId|date|period) 레코드 단위로 병합.
 * - 한쪽에만 있는 레코드는 무조건 보존 (다른 반/날짜/교시를 서로 지우지 않음)
 * - 같은 키는 updatedAt(ISO 문자열 사전순 비교)이 최신인 쪽 채택
 * - 양쪽 모두 updatedAt이 없거나 동률이면 preferRemote로 판정
 *   (과거 데이터 호환: updatedAt 부재 = 가장 오래된 것으로 취급)
 * 주의: 툼스톤이 없어 한쪽에서 삭제한 레코드가 상대쪽에서 되살아날 수 있다.
 *       student-records 병합과 동일한 기존 트레이드오프로, 통째 덮어쓰기 유실보다 낫다.
 */
export function mergeAttendance(
  local: AttendanceData | null,
  remote: AttendanceData,
  preferRemote: boolean,
): AttendanceData {
  const map = new Map<string, AttendanceRecord>();
  for (const r of local?.records ?? []) {
    map.set(attendanceRecordKey(r), r);
  }
  for (const r of remote.records ?? []) {
    const key = attendanceRecordKey(r);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, r);
      continue;
    }
    const localStamp = existing.updatedAt ?? '';
    const remoteStamp = r.updatedAt ?? '';
    if (remoteStamp > localStamp || (remoteStamp === localStamp && preferRemote)) {
      map.set(key, r);
    }
  }
  return { records: [...map.values()] };
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
    private readonly getDynamicSyncFiles?: GetDynamicSyncFiles,
    private readonly getBinaryDynamicSyncFiles?: GetBinaryDynamicSyncFiles,
  ) {}

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncFromCloudResult> {
    console.log(
      `[SyncFromCloud] ▶ 시작 | myDeviceId=${this.deviceId} | policy=${this.conflictPolicy}`,
    );
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    if (!remoteManifest) {
      console.log('[SyncFromCloud] ❌ 리모트 매니페스트 없음 → 전체 스킵');
      return { downloaded: [], conflicts: [], skipped: [...SYNC_FILES] };
    }

    console.log(
      `[SyncFromCloud] 리모트 매니페스트: deviceId=${remoteManifest.deviceId} | deviceName=${remoteManifest.deviceName} | files=${Object.keys(remoteManifest.files).length}개`,
    );
    console.log(
      `[SyncFromCloud] deviceId 비교: remote(${remoteManifest.deviceId}) === my(${this.deviceId}) → ${remoteManifest.deviceId === this.deviceId ? '⚠️ 동일(스킵 가능)' : '✅ 다름(다운로드 가능)'}`,
    );

    const localManifest = await this.syncRepo.getLocalManifest();
    console.log(
      `[SyncFromCloud] 로컬 매니페스트: ${localManifest ? `deviceId=${localManifest.deviceId} | files=${Object.keys(localManifest.files).length}개` : 'NONE'}`,
    );
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    console.log(`[SyncFromCloud] Drive 파일 목록: ${remoteFiles.map((f) => f.name).join(', ')}`);
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

        console.log(
          `[SyncFromCloud]   ${filename}: 충돌 감지 | local=${localInfo.checksum.slice(0, 8)}@${localInfo.lastModified} | remote=${remoteInfo.checksum.slice(0, 8)}@${remoteInfo.lastModified} | ${remoteIsNewer ? 'remote가 최신' : 'local이 최신'}`,
        );

        // 동일 기기가 마지막으로 수정했으면 충돌 아님 (로컬이 최신이면 스킵)
        if (remoteManifest.deviceId === this.deviceId) {
          console.log(`[SyncFromCloud]   ${filename}: ⚠️ SKIP (동일 deviceId — 내가 올린 데이터)`);
          skipped.push(filename);
          continue;
        }

        // conflictPolicy에 따라 처리
        // student-records는 항상 record-level merge (데이터 손실 방지)
        if (filename === 'student-records') {
          const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
          if (driveFile) {
            const content = await this.drivePort.downloadSyncFile(driveFile.id);
            const remoteData = JSON.parse(content) as StudentRecordsData;
            const localData = await this.storage.read<StudentRecordsData>(filename);
            const merged = mergeStudentRecords(localData, remoteData);
            await this.storage.write(filename, merged);
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
            console.log(
              `[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
            );
          }
          continue;
        }

        // attendance도 항상 record-level merge — 폰·PC가 서로 다른 반/날짜를
        // 같은 파일에 쓰는 도메인이라 통째 덮어쓰기가 곧 출결 유실이다.
        if (filename === 'attendance') {
          const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
          if (driveFile) {
            const content = await this.drivePort.downloadSyncFile(driveFile.id);
            const remoteData = JSON.parse(content) as AttendanceData;
            const localData = await this.storage.read<AttendanceData>(filename);
            const merged = mergeAttendance(localData, remoteData, remoteIsNewer);
            await this.storage.write(filename, merged);
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
            console.log(
              `[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
            );
          }
          continue;
        }

        if (this.conflictPolicy === 'latest') {
          if (remoteIsNewer) {
            // 리모트가 최신 → 다운로드
            const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
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

      // 매니페스트엔 없지만 로컬 storage에는 실제로 파일이 있을 수 있음.
      // (예: 본 도메인이 신규로 SYNC_FILES에 편입된 직후의 기존 사용자)
      // 이 경우 무조건 다운로드하면 사용자가 작성한 로컬 데이터가 silent하게 덮어쓰기됨.
      // student-records/attendance는 record-level merge가 자체 구현되어 있으므로 그대로 두고,
      // 그 외 도메인은 로컬 파일이 실제로 존재하면 충돌 다이얼로그로 회수한다.
      const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
      if (driveFile) {
        if (filename !== 'student-records' && filename !== 'attendance') {
          const localData = await this.storage.read<unknown>(filename);
          if (localData !== null) {
            // 실제 로컬 파일 존재 → manifest 미등록 상태에서의 silent 덮어쓰기 방지
            if (this.conflictPolicy === 'latest') {
              // 'latest' 정책: lastModified 비교가 불가능(로컬 manifest 부재)하므로
              // 보수적으로 리모트 다운로드를 채택하되 사용자 안내용 conflict 항목으로도 기록.
              // 실제 다운로드는 진행하지만 conflicts 배열에 추가해 toast/요약에 노출되게 함.
              conflicts.push({
                filename,
                localModified: 'unknown',
                remoteModified: remoteInfo.lastModified,
                localDeviceName: this.deviceName,
                remoteDeviceName: remoteManifest.deviceName,
              });
              const content = await this.drivePort.downloadSyncFile(driveFile.id);
              const parsed = JSON.parse(content) as unknown;
              await this.storage.write(filename, parsed);
              updatedFiles[filename] = remoteInfo;
              downloaded.push(filename);
              console.log(
                `[SyncFromCloud]   ${filename}: ⚠️ DOWNLOAD with CONFLICT REPORT (manifest 미등록 + 로컬 데이터 존재)`,
              );
              continue;
            }

            // 'ask' 정책: 충돌 다이얼로그로 위임 (다운로드 보류)
            conflicts.push({
              filename,
              localModified: 'unknown',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
            });
            console.log(
              `[SyncFromCloud]   ${filename}: 🔶 CONFLICT (manifest 미등록 + 로컬 데이터 존재, ask 정책)`,
            );
            continue;
          }
        }

        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        if (filename === 'student-records') {
          const remoteData = JSON.parse(content) as StudentRecordsData;
          const localData = await this.storage.read<StudentRecordsData>(filename);
          const merged = mergeStudentRecords(localData, remoteData);
          await this.storage.write(filename, merged);
          console.log(
            `[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
          );
        } else if (filename === 'attendance') {
          const remoteData = JSON.parse(content) as AttendanceData;
          const localData = await this.storage.read<AttendanceData>(filename);
          // 로컬 manifest 정보가 없어 최신 판정 불가 → 기존 동작(리모트 우선)과 일치하게 preferRemote
          const merged = mergeAttendance(localData, remoteData, true);
          await this.storage.write(filename, merged);
          console.log(
            `[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
          );
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

    // 동적 파일(예: note-body--{pageId}) 다운로드 — 정적 루프와 동일 로직
    if (this.getDynamicSyncFiles) {
      // 동적 파일은 로컬 enumeration이 없을 수 있으므로 리모트 매니페스트의 키도 합집합 처리.
      const localDynamic = await this.getDynamicSyncFiles();
      const remoteDynamic = Object.keys(remoteManifest.files).filter(
        (f) => f.startsWith('note-body--') || f.startsWith('obs-attachments/'),
      );
      const allDynamic = Array.from(new Set([...localDynamic, ...remoteDynamic]));

      for (const filename of allDynamic) {
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

        // 양쪽 다 변경됨 → 충돌 처리
        if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
          if (remoteManifest.deviceId === this.deviceId) {
            skipped.push(filename);
            continue;
          }

          if (this.conflictPolicy === 'latest') {
            const remoteIsNewer =
              new Date(localInfo.lastModified) <= new Date(remoteInfo.lastModified);
            if (remoteIsNewer) {
              const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
              if (driveFile) {
                const content = await this.drivePort.downloadSyncFile(driveFile.id);
                await this.storage.write(filename, JSON.parse(content) as unknown);
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

        // 매니페스트 미등록 + 로컬 storage 실제 존재 → silent 덮어쓰기 방지
        // (note-cloud-sync 첫 활성화 시 기존 사용자의 로컬 노트 본문 보호)
        const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
        if (driveFile) {
          const localData = await this.storage.read<unknown>(filename);
          if (localData !== null) {
            if (this.conflictPolicy === 'latest') {
              conflicts.push({
                filename,
                localModified: 'unknown',
                remoteModified: remoteInfo.lastModified,
                localDeviceName: this.deviceName,
                remoteDeviceName: remoteManifest.deviceName,
              });
              const content = await this.drivePort.downloadSyncFile(driveFile.id);
              await this.storage.write(filename, JSON.parse(content) as unknown);
              updatedFiles[filename] = remoteInfo;
              downloaded.push(filename);
              console.log(
                `[SyncFromCloud]   ${filename}: ⚠️ DOWNLOAD with CONFLICT REPORT (동적, manifest 미등록 + 로컬 존재)`,
              );
              continue;
            }
            conflicts.push({
              filename,
              localModified: 'unknown',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
            });
            console.log(
              `[SyncFromCloud]   ${filename}: 🔶 CONFLICT (동적, manifest 미등록 + 로컬 존재, ask 정책)`,
            );
            continue;
          }

          const content = await this.drivePort.downloadSyncFile(driveFile.id);
          await this.storage.write(filename, JSON.parse(content) as unknown);
          updatedFiles[filename] = remoteInfo;
          downloaded.push(filename);
          console.log(`[SyncFromCloud]   ${filename}: ✅ DOWNLOAD (동적 파일)`);
        } else {
          skipped.push(filename);
        }
      }
    }

    // 바이너리 동적 파일(예: obs-attachments/{id}.{ext}) 다운로드 — base64 JSON 래퍼 디코드
    if (this.getBinaryDynamicSyncFiles) {
      // 로컬 열거 + 리모트 매니페스트의 obs-attachments/ 키를 합집합 처리
      const localBinaryKeys = await this.getBinaryDynamicSyncFiles();
      const remoteBinaryKeys = Object.keys(remoteManifest.files).filter((f) =>
        f.startsWith('obs-attachments/'),
      );
      const allBinaryKeys = Array.from(new Set([...localBinaryKeys, ...remoteBinaryKeys]));

      for (const relPath of allBinaryKeys) {
        const remoteInfo = remoteManifest.files[relPath];
        const localInfo = localManifest?.files[relPath];

        if (!remoteInfo) {
          skipped.push(relPath);
          continue;
        }

        if (localInfo && localInfo.checksum === remoteInfo.checksum) {
          skipped.push(relPath);
          continue;
        }

        // 동일 기기가 마지막으로 수정했으면 스킵
        if (remoteManifest.deviceId === this.deviceId) {
          skipped.push(relPath);
          continue;
        }

        // 충돌(양쪽 다 변경) — 바이너리는 append-only id 기반이라 덮어쓰기 충돌 없음.
        // latest 정책: 무조건 다운로드(리모트 우선). ask 정책: 마찬가지로 다운로드(바이너리 병합 불가).
        // Drive 파일명: obs-attachments/x.png → obs-attachments__x.png.json
        const driveFilename = `${relPath.replace(/\//g, '__')}.json`;
        const driveFile = remoteFiles.find((f) => f.name === driveFilename);
        if (!driveFile) {
          skipped.push(relPath);
          console.log(`[SyncFromCloud]   ${relPath}: SKIP (Drive 바이너리 래퍼 없음)`);
          continue;
        }

        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        let wrapper: { __binaryBase64?: string; __relPath?: string };
        try {
          wrapper = JSON.parse(content) as { __binaryBase64?: string; __relPath?: string };
        } catch {
          console.warn(`[SyncFromCloud]   ${relPath}: SKIP (JSON 파싱 실패)`);
          skipped.push(relPath);
          continue;
        }

        if (typeof wrapper.__binaryBase64 !== 'string') {
          console.warn(`[SyncFromCloud]   ${relPath}: SKIP (__binaryBase64 필드 없음)`);
          skipped.push(relPath);
          continue;
        }

        // base64 디코드 → writeBinary (대용량 안전 청크 디코드)
        const bytes = base64ToUint8(wrapper.__binaryBase64);
        await this.storage.writeBinary(relPath, bytes);
        updatedFiles[relPath] = remoteInfo;
        downloaded.push(relPath);
        console.log(`[SyncFromCloud]   ${relPath}: ✅ DOWNLOAD binary`);
      }
    }

    // 삭제 cascade 교차기기: 메타에 없는 고아 바이너리 정리
    // (메타 동기화 후 useObservationAttachmentStore.load()가 갱신되면
    //  다음 listBinaryKeys()에서 자연히 제외되므로 별도 정리 불필요.
    //  append-only id 기반이라 덮어쓰기 충돌 없음 — P2 예방 유지.)

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

    console.log(
      `[SyncFromCloud] ✅ 완료 | downloaded=${downloaded.length} conflicts=${conflicts.length} skipped=${skipped.length} | downloaded=[${downloaded.join(', ')}]`,
    );
    return { downloaded, conflicts, skipped };
  }
}
