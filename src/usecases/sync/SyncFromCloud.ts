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
import type { ObservationData, ObservationRecord } from '@domain/entities/Observation';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { attendanceRecordKey } from '@domain/entities/Attendance';
import {
  SYNC_FILES,
  type SyncProgress,
  type GetDynamicSyncFiles,
  type GetBinaryDynamicSyncFiles,
} from './SyncToCloud';
import { SYNC_FILE_KEYS } from './syncRegistry';
import { withFileLock } from '@usecases/shared/fileWriteLock';
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
  // 리모트 레코드로 업데이트.
  //  1순위: updatedAt(최근 수정) — 나이스 반영/서류 제출 같은 플래그 편집이 동기화로
  //         되살아나는 것을 막는다. 한쪽만 updatedAt 이 있으면 있는 쪽을 최신으로 본다.
  //  2순위(updatedAt 동률 또는 둘 다 없음): 기존 createdAt·tags 로직(Q2 좀비 부활 방지).
  for (const r of remoteRecords) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
      continue;
    }
    const rU = r.updatedAt ?? '';
    const eU = existing.updatedAt ?? '';
    if (rU !== eU) {
      if (rU > eU) map.set(r.id, r); // 리모트가 더 최근 수정 → 채택 (아니면 로컬 유지)
      continue;
    }
    // updatedAt 동률(또는 둘 다 없는 구 데이터) → createdAt·tags 폴백
    if (r.createdAt > existing.createdAt) {
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

  // 카테고리: 항목(id) 합집합 병합.
  // 과거 "리모트 우선 통째 교체"(remote.categories ?? local)는 기본값·빈 배열만 든
  // 리모트가 로컬 커스텀 카테고리를 전부 소거했다(2026-07-13 데이터 유실 신고의 원인 ①).
  const categories = mergeCategories(local?.categories, remote.categories);
  return {
    records: [...map.values()],
    ...(categories ? { categories } : {}),
  };
}

/**
 * 카테고리 목록을 항목(id) 단위 합집합으로 병합.
 * - 한쪽에만 있는 카테고리는 무조건 보존 (커스텀 카테고리 소거 방지)
 * - 같은 id 는 리모트 내용(name/color) 채택 — 이름·색 변경 전파는 기존 리모트 우선 방향 유지.
 *   단 subcategories 는 합집합(리모트 순서 우선): 항목에 타임스탬프가 없어 최신 판정이 불가하다.
 * - 트레이드오프: 한쪽에서 삭제한 카테고리/서브카테고리가 병합으로 되살아날 수 있음 —
 *   student-records 레코드 병합과 동일한 기존 정책(통째 유실보다 낫다).
 */
export function mergeCategories(
  local: readonly RecordCategoryItem[] | undefined,
  remote: readonly RecordCategoryItem[] | undefined,
): readonly RecordCategoryItem[] | undefined {
  if (!local || local.length === 0) return remote;
  if (!remote || remote.length === 0) return local;

  const localById = new Map(local.map((c) => [c.id, c]));
  const merged: RecordCategoryItem[] = [];
  const seen = new Set<string>();

  for (const r of remote) {
    seen.add(r.id);
    const l = localById.get(r.id);
    if (!l) {
      merged.push(r);
      continue;
    }
    const subcategories = [...r.subcategories];
    for (const s of l.subcategories) {
      if (!subcategories.includes(s)) subcategories.push(s);
    }
    merged.push({ ...r, subcategories });
  }
  for (const l of local) {
    if (!seen.has(l.id)) merged.push(l);
  }
  return merged;
}

/**
 * observations(수업 기록)를 record ID 단위로 병합.
 * - 한쪽에만 있는 기록은 무조건 보존 — 구/빈 파일이 "최신" 판정을 받아도 통째 유실이 없다.
 *   (파일 단위 latest 교체가 학생별 수업 메모 전체를 지운 2026-07-13 유실 신고의 원인 ②)
 * - 같은 id 는 updatedAt(ms 숫자) 최신 우선, 동률이면 preferRemote 로 판정
 * - 삭제 전파: 양쪽 툼스톤(deleted)을 id별 최신 deletedAt으로 합치고,
 *   기록이 툼스톤보다 나중에 수정된 경우에만 살아남는다(재작성이 삭제를 이김).
 *   동률이면 삭제가 이긴다 — mergeAttendance 와 동일 정책.
 * - customTags/customCategories 는 순서 보존 합집합 (빈 배열이 커스텀을 덮지 않게)
 */
export function mergeObservations(
  local: ObservationData | null,
  remote: ObservationData,
  preferRemote: boolean,
): ObservationData {
  const map = new Map<string, ObservationRecord>();
  for (const r of local?.records ?? []) {
    map.set(r.id, r);
  }
  for (const r of remote.records ?? []) {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
      continue;
    }
    const remoteStamp = r.updatedAt ?? 0;
    const localStamp = existing.updatedAt ?? 0;
    if (remoteStamp > localStamp || (remoteStamp === localStamp && preferRemote)) {
      map.set(r.id, r);
    }
  }

  // 툼스톤 병합: id별 최신 deletedAt 유지
  const tombstones = new Map<string, number>();
  for (const t of [...(local?.deleted ?? []), ...(remote.deleted ?? [])]) {
    const prev = tombstones.get(t.id);
    if (!prev || t.deletedAt > prev) tombstones.set(t.id, t.deletedAt);
  }

  // 기록 vs 툼스톤: 기록의 updatedAt이 삭제 시각보다 나중이면 부활(툼스톤 제거),
  // 아니면 기록 제거(삭제 유지)
  for (const [id, deletedAt] of tombstones) {
    const rec = map.get(id);
    if (!rec) continue;
    if ((rec.updatedAt ?? 0) > deletedAt) {
      tombstones.delete(id);
    } else {
      map.delete(id);
    }
  }
  const deleted = [...tombstones].map(([id, deletedAt]) => ({ id, deletedAt }));

  const customTags = mergeStringUnion(local?.customTags, remote.customTags);
  const customCategories = mergeStringUnion(local?.customCategories, remote.customCategories);
  return {
    records: [...map.values()],
    ...(customTags ? { customTags } : {}),
    ...(customCategories ? { customCategories } : {}),
    ...(deleted.length > 0 ? { deleted } : {}),
  };
}

/** 문자열 배열 합집합(로컬 순서 우선, 중복 제거). 양쪽 모두 없으면 undefined. */
function mergeStringUnion(
  local: readonly string[] | undefined,
  remote: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!local || local.length === 0) return remote;
  if (!remote || remote.length === 0) return local;
  const union = [...local];
  for (const s of remote) {
    if (!union.includes(s)) union.push(s);
  }
  return union;
}

/**
 * attendance를 (classId|groupId|date|period) 레코드 단위로 병합.
 * - 한쪽에만 있는 레코드는 보존 (다른 반/날짜/교시를 서로 지우지 않음)
 * - 같은 키는 updatedAt(ISO 문자열 사전순 비교)이 최신인 쪽 채택
 * - 양쪽 모두 updatedAt이 없거나 동률이면 preferRemote로 판정
 *   (과거 데이터 호환: updatedAt 부재 = 가장 오래된 것으로 취급)
 * - 삭제 전파: 양쪽 툼스톤(deleted)을 키별 최신 deletedAt으로 합치고,
 *   레코드가 툼스톤보다 나중에 수정된 경우에만 살아남는다(재작성이 삭제를 이김).
 *   동률이거나 레코드에 스탬프가 없으면 삭제가 이긴다.
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

  // 툼스톤 병합: 키별 최신 deletedAt 유지
  const tombstones = new Map<string, string>();
  for (const t of [...(local?.deleted ?? []), ...(remote.deleted ?? [])]) {
    const prev = tombstones.get(t.key);
    if (!prev || t.deletedAt > prev) tombstones.set(t.key, t.deletedAt);
  }

  // 레코드 vs 툼스톤: 레코드의 updatedAt이 삭제 시각보다 나중이면 부활(툼스톤 제거),
  // 아니면 레코드 제거(삭제 유지)
  for (const [key, deletedAt] of tombstones) {
    const rec = map.get(key);
    if (!rec) continue;
    if ((rec.updatedAt ?? '') > deletedAt) {
      tombstones.delete(key);
    } else {
      map.delete(key);
    }
  }

  const deleted = [...tombstones].map(([key, deletedAt]) => ({ key, deletedAt }));
  return deleted.length > 0
    ? { records: [...map.values()], deleted }
    : { records: [...map.values()] };
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
            // 읽기→병합→쓰기를 파일 락 안에서 — 사용자 저장(유스케이스)과 겹치면
            // 병합본이 사용자 변경을 삼키거나 그 반대가 된다(2026-07 QA 재현 경합).
            await withFileLock(SYNC_FILE_KEYS.studentRecords, async () => {
              const localData = await this.storage.read<StudentRecordsData>(filename);
              const merged = mergeStudentRecords(localData, remoteData);
              await this.storage.write(filename, merged);
              console.log(
                `[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
              );
            });
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
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
            await withFileLock(SYNC_FILE_KEYS.attendance, async () => {
              const localData = await this.storage.read<AttendanceData>(filename);
              const merged = mergeAttendance(localData, remoteData, remoteIsNewer);
              await this.storage.write(filename, merged);
              console.log(
                `[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
              );
            });
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
          }
          continue;
        }

        // observations(수업 기록)도 항상 record-level merge — 파일 단위 latest 교체가
        // 구/빈 파일 승리 시 학생별 수업 메모 전체를 지웠다(2026-07-13 유실 신고).
        if (filename === 'observations') {
          const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
          if (driveFile) {
            const content = await this.drivePort.downloadSyncFile(driveFile.id);
            const remoteData = JSON.parse(content) as ObservationData;
            await withFileLock(SYNC_FILE_KEYS.observations, async () => {
              const localData = await this.storage.read<ObservationData>(filename);
              const merged = mergeObservations(localData, remoteData, remoteIsNewer);
              await this.storage.write(filename, merged);
              console.log(
                `[SyncFromCloud]   ${filename}: ✅ MERGE (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
              );
            });
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
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
      // student-records/attendance/observations는 record-level merge가 자체 구현되어 있으므로 그대로 두고,
      // 그 외 도메인은 로컬 파일이 실제로 존재하면 충돌 다이얼로그로 회수한다.
      const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
      if (driveFile) {
        if (
          filename !== 'student-records' &&
          filename !== 'attendance' &&
          filename !== 'observations'
        ) {
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
          await withFileLock(SYNC_FILE_KEYS.studentRecords, async () => {
            const localData = await this.storage.read<StudentRecordsData>(filename);
            const merged = mergeStudentRecords(localData, remoteData);
            await this.storage.write(filename, merged);
            console.log(
              `[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
            );
          });
        } else if (filename === 'attendance') {
          const remoteData = JSON.parse(content) as AttendanceData;
          await withFileLock(SYNC_FILE_KEYS.attendance, async () => {
            const localData = await this.storage.read<AttendanceData>(filename);
            // 로컬 manifest 정보가 없어 최신 판정 불가 → 기존 동작(리모트 우선)과 일치하게 preferRemote
            const merged = mergeAttendance(localData, remoteData, true);
            await this.storage.write(filename, merged);
            console.log(
              `[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
            );
          });
        } else if (filename === 'observations') {
          const remoteData = JSON.parse(content) as ObservationData;
          await withFileLock(SYNC_FILE_KEYS.observations, async () => {
            const localData = await this.storage.read<ObservationData>(filename);
            // 로컬 manifest 정보가 없어 최신 판정 불가 → attendance와 동일하게 preferRemote
            const merged = mergeObservations(localData, remoteData, true);
            await this.storage.write(filename, merged);
            console.log(
              `[SyncFromCloud]   ${filename}: ✅ MERGE (first download, local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
            );
          });
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
