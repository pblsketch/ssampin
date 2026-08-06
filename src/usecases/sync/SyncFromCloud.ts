import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type {
  DriveSyncManifest,
  DriveSyncConflict,
  DriveSyncFileInfo,
} from '@domain/entities/DriveSyncState';
import type {
  StudentRecordsData,
  StudentRecord,
  TrackedGroup,
} from '@domain/entities/StudentRecord';
import { TRACKED_GROUP_FIELDS, TRACKED_GROUPS } from '@domain/entities/StudentRecord';
import type { AttendanceData, AttendanceRecord } from '@domain/entities/Attendance';
import type { ObservationData, ObservationRecord } from '@domain/entities/Observation';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { attendanceRecordKey } from '@domain/entities/Attendance';
import { deriveDocumentSubmitted } from '@domain/rules/attendanceDocumentPolicy';
import { parseTerm, schoolYearOf } from '@domain/rules/academicCalendar';
import {
  YEAR_TRANSITION_REMOVED_KEY,
  type YearTransitionRemovedMarker,
} from '@usecases/schoolYear/ExecuteYearTransition';
import { ARCHIVE_MANIFEST_FILENAME, parseArchiveSyncKey } from '@domain/rules/archiveRules';
import {
  SYNC_FILES,
  type SyncProgress,
  type GetDynamicSyncFiles,
  type GetBinaryDynamicSyncFiles,
} from './SyncToCloud';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { base64ToUint8 } from './binaryBase64';

/** Q2: 마이그레이션 여부 판별 보조 — tags 가 많을수록 정규화된 쪽으로 본다. */
function recordTagCount(r: StudentRecord): number {
  return r.tags?.length ?? 0;
}

/* ── 항목(추적 그룹) 단위 병합 (sync-hardening-2 B트랙 — 계획 §5.1) ─────────────
 * 두 기기가 같은 기록의 서로 다른 체크 항목을 고쳤을 때(예: PC=서류, 노트북=나이스)
 * record-LWW가 기록을 통째로 골라 한쪽 체크를 지우던 HIGH 버그의 해소.
 * record-LWW 승자를 BASE로 두고, 추적 그룹만 항목별 유효시각으로 오버레이한다.
 * 비추적 필드(content/subcategory/tags/attendancePeriods 등)는 record-LWW 유지(P4).
 */

/**
 * 항목별 유효 시각(C1) — **양쪽 모두 맵을 보유할 때만 호출된다**:
 * (a) 키 있음 → 그 값(record.updatedAt 미개입 — 무관 편집이 항목 병합을 못 무너뜨림)
 * (c) 키 없음 → createdAt(쓰기 측이 맵 신설 시 미변경 그룹을 직전 updatedAt으로
 *     백필하므로, 키 부재는 "신버전 편집 이력 없음"을 뜻한다)
 *
 * 한쪽이라도 맵이 없으면(구버전 드롭·신버전 미편집) 항목 오버레이를 하지 않고
 * record-LWW로 폴백한다 — mapless 쪽의 updatedAt을 항목 백스톱으로 쓰면 무관
 * 편집이 LWW 승자의 진짜 항목 스탬프를 이겨 낡은 체크를 부활시킨다(record-LWW보다
 * 나쁜 결과 = P4 위반, 코드리뷰 스윕 S2). LWW 폴백은 구버전 최신 편집 보호(P5)를
 * record-LWW와 정확히 동일하게 달성한다.
 */
function effectiveStamp(r: StudentRecord, group: TrackedGroup): string {
  return r.fieldUpdatedAt?.[group] ?? r.createdAt;
}

/**
 * 그룹 값 채택 — TRACKED_GROUP_FIELDS 정본에서 멤버 필드를 파생해 함께 이동시킨다.
 * source에 없는(undefined) 필드는 제거(명시 삭제)로 취급.
 * documentGroup은 채택 후 파생값을 정본 deriveDocumentSubmitted로 재계산(H4 —
 * 빈 배열=미존재 fallback, 원시 every 금지).
 */
function adoptGroup(
  target: StudentRecord,
  source: StudentRecord,
  group: TrackedGroup,
): StudentRecord {
  const result: { -readonly [K in keyof StudentRecord]?: StudentRecord[K] } = { ...target };
  for (const field of TRACKED_GROUP_FIELDS[group]) {
    const value = source[field];
    if (value === undefined) delete result[field];
    else (result as Record<string, unknown>)[field] = value;
  }
  if (group === 'documentGroup') {
    result.documentSubmitted = deriveDocumentSubmitted(result.documents, result.documentSubmitted);
  }
  return result as StudentRecord;
}

/**
 * record-LWW 승자(base)에 패자(other)의 추적 그룹을 항목별 유효시각으로 오버레이한다.
 * 결과 fieldUpdatedAt 합성(H3): base 맵 승계 + 채택된 그룹은 "패자 쪽 키 있으면 그 값,
 * 없으면 유효시각"을 materialize — 안 남기면 다음 병합에서 (c)createdAt로 퇴화해
 * 방금 채택한 값이 더 낡은 상대에게 뒤집힌다(2단계 병합 수렴의 핵심).
 * 스탬프는 원 값 그대로 남긴다 — base.createdAt으로 끌어올리는 클램프는 createdAt
 * 복제본이 어긋난 구 데이터에서 시각을 미래로 위조해 이후 병합을 뒤집는다.
 * 아무 그룹도 채택되지 않으면 base를 그대로 반환(무변경 — 구 데이터 대량 재업로드 방지).
 */
function mergeTrackedGroups(base: StudentRecord, other: StudentRecord): StudentRecord {
  // 양쪽 맵 필수 — 한쪽이라도 없으면 record-LWW 폴백(base 그대로). effectiveStamp 주석 참조.
  if (!base.fieldUpdatedAt || !other.fieldUpdatedAt) return base;

  let result = base;
  const map: { -readonly [K in TrackedGroup]?: string } = { ...base.fieldUpdatedAt };
  let adopted = false;

  for (const group of TRACKED_GROUPS) {
    const baseStamp = effectiveStamp(base, group);
    const otherStamp = effectiveStamp(other, group);
    // 동률 = base(record-LWW/preferRemote 정책 승계) 유지
    if (otherStamp <= baseStamp) continue;
    result = adoptGroup(result, other, group);
    map[group] = other.fieldUpdatedAt?.[group] ?? otherStamp;
    adopted = true;
  }

  if (!adopted) return base;
  return Object.keys(map).length > 0 ? { ...result, fieldUpdatedAt: map } : result;
}

/**
 * S2.2b — 옛 "학년도" 리모트 레코드 스킵 (계획 §4 S2.2 AC-2 계열, ADR-034 epoch 가드).
 *
 * 판정은 학기(term)가 아니라 **학년도(schoolYearOf)** 비교다 — 담임 축은 학년도를 관통하므로
 * 같은 학년도의 1·2학기는 정상 병합된다(2026-1 레코드는 currentTerm=2026-2에서도 병합).
 *
 * fail-open 규칙(자기 격리 금지 — 계획 §4 S2.2 미정의 케이스 ③):
 *  - record.term 부재(구버전 레코드) → 현행 병합
 *  - currentTerm 부재·파싱 불가(전환 미사용·구버전 설정) → 필터 전체 비활성
 *
 * 로컬 레코드는 판정하지 않는다 — 잔존 옛 레코드 보존(레코드 스탬프 설계의 핵심:
 * 반쯤 전환 상태는 오류가 아니다). 툼스톤 로직과 완전 분리(0줄 수정) — 스킵된 레코드는
 * map에 들어가지 않으므로 툼스톤 판정 대상도 아니다(옛 레코드의 삭제 전파는 그대로 동작).
 */
function filterOldYearRemoteRecords<T extends { readonly term?: string }>(
  filename: string,
  records: readonly T[],
  currentTerm: string | undefined,
): readonly T[] {
  if (currentTerm === undefined) return records;
  const currentYear = schoolYearOf(currentTerm);
  if (currentYear === null) return records;

  const kept: T[] = [];
  const skippedTerms = new Set<string>();
  let skipped = 0;
  for (const r of records) {
    const year = r.term === undefined ? null : schoolYearOf(r.term);
    if (year !== null && year < currentYear) {
      skipped++;
      if (r.term !== undefined) skippedTerms.add(r.term);
      continue;
    }
    kept.push(r);
  }
  if (skipped > 0) {
    console.log(
      `[SyncFromCloud] ${filename}: ${skipped}건 skip (옛 학년도 term=${[...skippedTerms].sort().join(',')} < current=${currentTerm})`,
    );
  }
  return kept;
}

/**
 * F3(H1) — settings 통파일 교체 시 currentTerm은 "더 최신 학기 승" 보존 규칙.
 *
 * settings는 병합 없는 통파일 LWW라, 아직 전환하지 않은 기기가 올린 settings가
 * 내려오면 currentTerm이 벗겨져 옛 학년도 스킵 필터(S2.2b)가 영구 비활성된다(qa3-C).
 * 규칙(parseTerm 튜플 비교):
 *  - 로컬 currentTerm이 수신보다 최신(또는 수신에 부재·파싱 불가) → 로컬 값을 재부착해 저장.
 *    체크섬이 리모트와 달라지므로 다음 업로드가 교정본을 밀어올린다(1회 쓰기 — 루프 없음).
 *  - 수신이 더 최신이거나 동일 → 수신 그대로(정상 LWW).
 *  - 양쪽 부재·수신이 객체가 아님 → 무동작(수신 그대로).
 */
export function preserveNewerCurrentTerm(
  incoming: unknown,
  localCurrentTerm: string | undefined,
): unknown {
  if (localCurrentTerm === undefined) return incoming;
  const localParsed = parseTerm(localCurrentTerm);
  if (localParsed === null) return incoming;
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return incoming; // settings 형태가 아니면 건드리지 않는다(방어)
  }
  const obj = incoming as Record<string, unknown>;
  const incomingTerm = typeof obj['currentTerm'] === 'string' ? obj['currentTerm'] : undefined;
  const incomingParsed = incomingTerm === undefined ? null : parseTerm(incomingTerm);
  const localOrder = localParsed.year * 10 + localParsed.semester;
  const incomingOrder =
    incomingParsed === null ? -1 : incomingParsed.year * 10 + incomingParsed.semester;
  if (incomingOrder >= localOrder) return incoming; // 수신이 더 최신·동일 → 수신 채택
  console.log(
    `[SyncFromCloud]   settings: currentTerm 보존 (수신=${incomingTerm ?? '없음'} < 로컬=${localCurrentTerm})`,
  );
  return { ...obj, currentTerm: localCurrentTerm };
}

/**
 * 병합 도메인 공용 임계구역: 락 안에서 로컬 읽기→병합→쓰기(+카운트 로그).
 * 락은 반드시 읽기부터 감싼다(쓰기만 감싸면 낡은 스냅샷 위라 무의미 — 계획 §4).
 * 사용자 저장(유스케이스)과 겹치면 병합본이 사용자 변경을 삼키거나 그 반대가 되는
 * 2026-07 QA 재현 경합의 방어가 이 헬퍼 하나에 있다 — 새 병합 도메인은 반드시 이걸 쓸 것.
 */
async function mergeAndWriteLocked<T extends { readonly records: readonly unknown[] }>(
  storage: IStoragePort,
  // 파일명 = 락 키(SYNC_FILE_KEYS 값과 동일 — fileWriteLock.test가 정합을 잠근다).
  // 별도 lockKey 파라미터를 두면 불일치 주입 시 병합 쓰기가 유스케이스 쓰기와 다른
  // 락 도메인으로 빠져 직렬화가 조용히 깨진다(코드리뷰 스윕 S6) — 하나로 겸용한다.
  filename: string,
  remoteData: T,
  merge: (local: T | null) => T,
  logSuffix = '',
): Promise<void> {
  await withFileLock(filename, async () => {
    const localData = await storage.read<T>(filename);
    const merged = merge(localData);
    await storage.write(filename, merged);
    console.log(
      `[SyncFromCloud]   ${filename}: ✅ MERGE${logSuffix} (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
    );
  });
}

/**
 * student-records를 record ID 기준으로 병합 (record-LWW BASE + 추적 그룹 오버레이).
 * 삭제 전파: 양쪽 툼스톤(deleted)을 id별 최신 deletedAt으로 합치고,
 * 기록이 툼스톤보다 나중에 수정된 경우에만 살아남는다(재작성이 삭제를 이김).
 * 동률이면 삭제가 이긴다 — mergeObservations 와 동일 정책.
 * 시각 축: 이 도메인은 ISO 문자열(observations 의 ms 숫자와 다름) — 문자열 사전순 비교.
 * currentTerm(S2.2b): 있으면 옛 학년도 리모트 레코드를 스킵한다(filterOldYearRemoteRecords).
 */
export function mergeStudentRecords(
  local: StudentRecordsData | null,
  remote: StudentRecordsData,
  currentTerm?: string,
): StudentRecordsData {
  const localRecords = local?.records ?? [];
  const remoteRecords = filterOldYearRemoteRecords(
    'student-records',
    remote.records ?? [],
    currentTerm,
  );
  const map = new Map<string, StudentRecord>();

  // 로컬 레코드 먼저 추가
  for (const r of localRecords) {
    map.set(r.id, r);
  }
  // 리모트 레코드로 업데이트 — record-LWW로 BASE 승자를 정한 뒤 추적 그룹만 오버레이.
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
    let base = existing; // record-LWW 승자(비추적 필드의 기준)
    if (rU !== eU) {
      if (rU > eU) base = r;
    } else if (r.createdAt > existing.createdAt) {
      base = r;
    } else if (
      r.createdAt === existing.createdAt &&
      recordTagCount(r) >= recordTagCount(existing)
    ) {
      // Q2: createdAt 동률(정규화는 createdAt 불변)일 때 tags 가 더(또는 같이) 많은 쪽 우선.
      //   미변환(tags 적은) 레코드가 변환본을 덮어 "좀비 부활"하는 것을 막는다(remote 우선 기본은 보존).
      base = r;
    }
    const other = base === r ? existing : r;
    map.set(r.id, mergeTrackedGroups(base, other));
  }

  // 툼스톤 병합: id별 최신 deletedAt(ISO 문자열) 유지
  const tombstones = new Map<string, string>();
  for (const t of [...(local?.deleted ?? []), ...(remote.deleted ?? [])]) {
    const prev = tombstones.get(t.id);
    if (!prev || t.deletedAt > prev) tombstones.set(t.id, t.deletedAt);
  }

  // 기록 vs 툼스톤: 기록의 updatedAt(ISO)이 삭제 시각보다 나중이면 부활(툼스톤 제거),
  // 아니면 기록 제거(삭제 유지). updatedAt 없는 구 기록은 ''(최고참)으로 취급돼
  // 항상 삭제가 이긴다 — 지운 걸 되살리는 것보다 안전한 의도된 기본값.
  for (const [id, deletedAt] of tombstones) {
    const rec = map.get(id);
    if (!rec) continue;
    if ((rec.updatedAt ?? '') > deletedAt) {
      tombstones.delete(id);
    } else {
      map.delete(id);
    }
  }
  const deleted = [...tombstones].map(([id, deletedAt]) => ({ id, deletedAt }));

  // 카테고리: 항목(id) 합집합 병합.
  // 과거 "리모트 우선 통째 교체"(remote.categories ?? local)는 기본값·빈 배열만 든
  // 리모트가 로컬 커스텀 카테고리를 전부 소거했다(2026-07-13 데이터 유실 신고의 원인 ①).
  const categories = mergeCategories(local?.categories, remote.categories);
  return {
    records: [...map.values()],
    ...(categories ? { categories } : {}),
    ...(deleted.length > 0 ? { deleted } : {}),
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
 * - currentTerm(S2.2b): 있으면 옛 학년도 리모트 레코드를 스킵한다(filterOldYearRemoteRecords)
 */
export function mergeObservations(
  local: ObservationData | null,
  remote: ObservationData,
  preferRemote: boolean,
  currentTerm?: string,
): ObservationData {
  const map = new Map<string, ObservationRecord>();
  for (const r of local?.records ?? []) {
    map.set(r.id, r);
  }
  for (const r of filterOldYearRemoteRecords('observations', remote.records ?? [], currentTerm)) {
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
 * - currentTerm(S2.2b): 있으면 옛 학년도 리모트 레코드를 스킵한다(filterOldYearRemoteRecords)
 */
export function mergeAttendance(
  local: AttendanceData | null,
  remote: AttendanceData,
  preferRemote: boolean,
  currentTerm?: string,
): AttendanceData {
  const map = new Map<string, AttendanceRecord>();
  for (const r of local?.records ?? []) {
    map.set(attendanceRecordKey(r), r);
  }
  for (const r of filterOldYearRemoteRecords('attendance', remote.records ?? [], currentTerm)) {
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
 * (S4.1) 로컬에 이미 있는 아카이브 학기 목록 훅(archive:list 경유).
 * 목록에 있는 학기는 다운로드를 통째로 건너뛴다(존재=완결 — 아카이브 불변).
 */
export type ListLocalArchiveTerms = () => Promise<string[]>;

/**
 * (S4.1) 학기 1개 분량의 아카이브 파일 묶음을 로컬에 배치하는 훅(archive:import IPC 경유 —
 * 스테이징 + 매니페스트 체크섬 전건 검증 + rename). 이미 있는 학기는 main이 무변경 스킵한다.
 */
export type ImportArchiveTermFiles = (
  term: string,
  files: Record<string, { format: 'utf8' | 'base64'; content: string }>,
) => Promise<{ ok: boolean; error?: string }>;

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
    /**
     * S2.2b — settings.currentTerm 지연 조회(전역 import 금지, 호출부 주입).
     * 미주입·부재·읽기 실패 = 옛 학년도 스킵 필터 비활성(현행 병합 그대로, fail-open).
     */
    private readonly getCurrentTerm?: () => Promise<string | undefined>,
    /** (S4.1) 아카이브 훅 2종 — 둘 다 주입될 때만 아카이브 다운로드가 켜진다(데스크톱 전용). */
    private readonly listLocalArchiveTerms?: ListLocalArchiveTerms,
    private readonly importArchiveTerm?: ImportArchiveTermFiles,
  ) {}

  /**
   * 통파일 교체 쓰기(비병합 도메인) — settings는 currentTerm "더 최신 학기 승" 보존(F3) 경유.
   * 로컬 읽기 실패(손상 등)는 보존 불가로 보고 수신 그대로 쓴다(fail-open).
   */
  private async writeReplacedFile(filename: string, parsed: unknown): Promise<void> {
    let data = parsed;
    if (filename === 'settings') {
      let localCurrentTerm: string | undefined;
      try {
        localCurrentTerm = (await this.storage.read<{ currentTerm?: string }>('settings'))
          ?.currentTerm;
      } catch {
        localCurrentTerm = undefined;
      }
      data = preserveNewerCurrentTerm(parsed, localCurrentTerm);
    }
    await this.storage.write(filename, data);
  }

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncFromCloudResult> {
    console.log(
      `[SyncFromCloud] ▶ 시작 | myDeviceId=${this.deviceId} | policy=${this.conflictPolicy}`,
    );
    // S2.2b — 옛 학년도 스킵 기준. 실행 시점에 1회 읽어 다운로드·병합 전체에 같은 값 적용.
    let currentTerm: string | undefined;
    if (this.getCurrentTerm) {
      try {
        currentTerm = await this.getCurrentTerm();
      } catch {
        currentTerm = undefined; // 읽기 실패 = 필터 비활성(fail-open — 자기 격리 금지)
      }
    }

    // F1(B1) — 학년도 전환이 remove로 비운 파일 마커(로컬 전용, SYNC_FILES 미등재).
    // 치유 다운로드가 이 파일들에 대해 자기 리모트 옛 사본을 부활시키는 것을 막는다(qa3-D).
    // lazy 1회 로드 — 읽기 실패=마커 없음(fail-open: 치유는 원래 데이터 보호 장치다).
    let removedMarkerCache: YearTransitionRemovedMarker | null | undefined;
    const loadRemovedMarker = async (): Promise<YearTransitionRemovedMarker | null> => {
      if (removedMarkerCache !== undefined) return removedMarkerCache;
      try {
        const raw = await this.storage.read<YearTransitionRemovedMarker>(
          YEAR_TRANSITION_REMOVED_KEY,
        );
        removedMarkerCache =
          raw && raw.version === 1 && typeof raw.removedAt === 'string' && Array.isArray(raw.keys)
            ? raw
            : null;
      } catch {
        removedMarkerCache = null;
      }
      return removedMarkerCache;
    };
    /** 해당 키의 마커를 해제(리모트가 전환 이후 새 데이터를 올린 정당한 케이스). */
    const releaseRemovedKey = async (filename: string): Promise<void> => {
      const marker = await loadRemovedMarker();
      if (marker === null) return;
      const nextKeys = marker.keys.filter((k) => k !== filename);
      removedMarkerCache = nextKeys.length > 0 ? { ...marker, keys: nextKeys } : null;
      try {
        if (removedMarkerCache !== null) {
          await this.storage.write(YEAR_TRANSITION_REMOVED_KEY, removedMarkerCache);
        } else {
          await this.storage.remove(YEAR_TRANSITION_REMOVED_KEY);
        }
      } catch {
        /* 해제 실패는 비치명 — 다음 동기화에서 같은 판정으로 재시도된다 */
      }
    };
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

      // 체크섬 동일 → 원칙적으로 스킵. 단, 로컬에 실제 파일이 없으면 장부만 "받았음"인
      // 오염 상태(과거 no-op 업로드가 받은 적 없는 리모트 항목을 로컬 장부에 승계)이므로
      // 스킵하지 않고 아래 첫-다운로드 경로로 진행해 자가 치유한다.
      // 로컬 파일이 없으니 다운로드로 잃을 데이터도 없다(데이터 보존 안전).
      if (localInfo && localInfo.checksum === remoteInfo.checksum) {
        const localData = await this.storage.read<unknown>(filename);
        if (localData !== null) {
          skipped.push(filename);
          continue;
        }
        // F1(B1): 학년도 전환이 의도적으로 비운 파일이면 "치유"가 곧 자기 리모트 옛 사본의
        // 부활이다(qa3-D). 단 리모트 modifiedTime이 removedAt보다 새로우면 다른 기기가
        // 전환 이후 실제 새 데이터를 올린 것 — 정당한 다운로드로 보고 해당 키 마커를 해제한다.
        const removedMarker = await loadRemovedMarker();
        if (removedMarker !== null && removedMarker.keys.includes(filename)) {
          const remoteIsNewerThanRemoval =
            new Date(remoteInfo.lastModified).getTime() >
            new Date(removedMarker.removedAt).getTime();
          if (!remoteIsNewerThanRemoval) {
            skipped.push(filename);
            console.log(`[SyncFromCloud]   ${filename}: 치유 스킵(학년도 전환으로 비운 파일)`);
            continue;
          }
          await releaseRemovedKey(filename);
          console.log(
            `[SyncFromCloud]   ${filename}: 치유 허용(전환 이후 새 리모트 데이터 — 마커 해제)`,
          );
        }
        console.log(
          `[SyncFromCloud]   ${filename}: 🩹 장부엔 "받았음"인데 로컬 파일 없음 → 다운로드로 치유`,
        );
      }

      // 양쪽 다 변경됨 → 충돌
      if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
        const localIsNewer = new Date(localInfo.lastModified) > new Date(remoteInfo.lastModified);
        const remoteIsNewer = !localIsNewer;

        console.log(
          `[SyncFromCloud]   ${filename}: 충돌 감지 | local=${localInfo.checksum.slice(0, 8)}@${localInfo.lastModified} | remote=${remoteInfo.checksum.slice(0, 8)}@${remoteInfo.lastModified} | ${remoteIsNewer ? 'remote가 최신' : 'local이 최신'}`,
        );

        // 내가 올린 파일이면 충돌 아님 (로컬이 최신이면 스킵).
        // 판정은 파일별 uploadedBy 우선 — 매니페스트 최상위 deviceId는 "마지막으로
        // 매니페스트를 쓴 기기"라 다른 파일을 올린 기기로 찍혀 있을 수 있다.
        // uploadedBy 부재(구버전 항목)면 기존 deviceId 폴백 — 스킵은 데이터 무변경이라 안전 방향.
        if ((remoteInfo.uploadedBy ?? remoteManifest.deviceId) === this.deviceId) {
          console.log(`[SyncFromCloud]   ${filename}: ⚠️ SKIP (내가 올린 데이터)`);
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
            await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
              mergeStudentRecords(local, remoteData, currentTerm),
            );
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
            await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
              mergeAttendance(local, remoteData, remoteIsNewer, currentTerm),
            );
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
            await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
              mergeObservations(local, remoteData, remoteIsNewer, currentTerm),
            );
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
              await this.writeReplacedFile(filename, parsed);
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
              await this.writeReplacedFile(filename, parsed);
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
          await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) => mergeStudentRecords(local, remoteData, currentTerm),
            ' (first download)',
          );
        } else if (filename === 'attendance') {
          const remoteData = JSON.parse(content) as AttendanceData;
          // 로컬 manifest 정보가 없어 최신 판정 불가 → 기존 동작(리모트 우선)과 일치하게 preferRemote
          await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) => mergeAttendance(local, remoteData, true, currentTerm),
            ' (first download)',
          );
        } else if (filename === 'observations') {
          const remoteData = JSON.parse(content) as ObservationData;
          // 로컬 manifest 정보가 없어 최신 판정 불가 → attendance와 동일하게 preferRemote
          await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) => mergeObservations(local, remoteData, true, currentTerm),
            ' (first download)',
          );
        } else {
          const parsed = JSON.parse(content) as unknown;
          await this.writeReplacedFile(filename, parsed);
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

        // 체크섬 동일 → 스킵. 단 로컬 파일 부재 시 장부 오염 치유(정적 루프와 동일).
        if (localInfo && localInfo.checksum === remoteInfo.checksum) {
          const localData = await this.storage.read<unknown>(filename);
          if (localData !== null) {
            skipped.push(filename);
            continue;
          }
          console.log(
            `[SyncFromCloud]   ${filename}: 🩹 장부엔 "받았음"인데 로컬 파일 없음 → 다운로드로 치유 (동적)`,
          );
        }

        // 양쪽 다 변경됨 → 충돌 처리
        if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
          // 파일별 uploadedBy 우선, 부재 시 매니페스트 deviceId 폴백 (정적 루프와 동일)
          if ((remoteInfo.uploadedBy ?? remoteManifest.deviceId) === this.deviceId) {
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

        // 체크섬 동일 → 스킵. 단 로컬 바이너리 부재 시 장부 오염 치유(정적 루프와 동일).
        let healDownload = false;
        if (localInfo && localInfo.checksum === remoteInfo.checksum) {
          const existing = await this.storage.readBinary(relPath);
          if (existing !== null) {
            skipped.push(relPath);
            continue;
          }
          healDownload = true;
          console.log(
            `[SyncFromCloud]   ${relPath}: 🩹 장부엔 "받았음"인데 로컬 바이너리 없음 → 다운로드로 치유`,
          );
        }

        // 내가 올린 파일이면 스킵 — 파일별 uploadedBy 우선, 부재 시 매니페스트 deviceId 폴백.
        // 치유 다운로드는 예외: 내가 올렸던 파일이라도 로컬에 없으면 받아와야 한다.
        if (!healDownload && (remoteInfo.uploadedBy ?? remoteManifest.deviceId) === this.deviceId) {
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

    // (S4.1) 아카이브 다운로드 — 리모트 매니페스트의 archives/{term}/... 키를 학기 단위로
    // 묶어, **로컬에 없는 학기만** 전부 내려받아 archive:import(스테이징 + 매니페스트 체크섬
    // 전건 검증 + rename)로 원자적으로 배치한다.
    //  - 로컬에 이미 있는 학기 = 통째 스킵(존재=완결 — 아카이브 불변, 절대 덮어쓰기 금지).
    //  - 리모트에 manifest.json이 아직 없는 학기 = 업로드 미완결 — 다음 동기화까지 대기.
    //  - 학기 단위 try/catch: 아카이브 실패가 라이브 동기화 결과를 오염시키지 않는다.
    if (this.listLocalArchiveTerms && this.importArchiveTerm) {
      const importArchiveTerm = this.importArchiveTerm;
      try {
        // 리모트 아카이브 키를 학기별로 그룹핑(형식 불량 키는 무시)
        const remoteByTerm = new Map<
          string,
          { key: string; relPath: string; info: DriveSyncFileInfo }[]
        >();
        for (const [key, info] of Object.entries(remoteManifest.files)) {
          const parsed = parseArchiveSyncKey(key);
          if (!parsed) continue;
          const bucket = remoteByTerm.get(parsed.term) ?? [];
          bucket.push({ key, relPath: parsed.relPath, info });
          remoteByTerm.set(parsed.term, bucket);
        }

        if (remoteByTerm.size > 0) {
          const localTerms = new Set(await this.listLocalArchiveTerms());
          for (const [term, entries] of remoteByTerm) {
            if (localTerms.has(term)) {
              skipped.push(...entries.map((e) => e.key));
              continue; // 존재=완결 — 이미 있는 학기는 절대 덮어쓰지 않는다
            }
            if (!entries.some((e) => e.relPath === ARCHIVE_MANIFEST_FILENAME)) {
              console.log(
                `[SyncFromCloud]   archives/${term}: SKIP (manifest.json 미도착 — 업로드 완결 대기)`,
              );
              skipped.push(...entries.map((e) => e.key));
              continue;
            }
            try {
              const files: Record<string, { format: 'base64'; content: string }> = {};
              let missing: string | null = null;
              for (const e of entries) {
                const driveFilename = `${e.key.replace(/\//g, '__')}.json`;
                const driveFile = remoteFiles.find((f) => f.name === driveFilename);
                if (!driveFile) {
                  missing = e.key;
                  break;
                }
                const content = await this.drivePort.downloadSyncFile(driveFile.id);
                const wrapper = JSON.parse(content) as { __binaryBase64?: string };
                if (typeof wrapper.__binaryBase64 !== 'string') {
                  missing = e.key;
                  break;
                }
                files[e.relPath] = { format: 'base64', content: wrapper.__binaryBase64 };
              }
              if (missing !== null) {
                console.warn(
                  `[SyncFromCloud]   archives/${term}: SKIP (파일 누락·형식 불량: ${missing} — 다음 동기화에서 재시도)`,
                );
                skipped.push(...entries.map((e) => e.key));
                continue;
              }
              const imported = await importArchiveTerm(term, files);
              if (imported.ok) {
                for (const e of entries) {
                  updatedFiles[e.key] = e.info;
                  downloaded.push(e.key);
                }
                console.log(
                  `[SyncFromCloud]   archives/${term}: ✅ IMPORT (${entries.length}개 파일)`,
                );
              } else {
                skipped.push(...entries.map((e) => e.key));
                console.warn(
                  `[SyncFromCloud]   archives/${term}: 배치 실패(다음 동기화에서 재시도): ${imported.error ?? '알 수 없음'}`,
                );
              }
            } catch (err) {
              skipped.push(...entries.map((e) => e.key));
              console.warn(
                `[SyncFromCloud]   archives/${term}: 다운로드 실패(다음 동기화에서 재시도):`,
                err,
              );
            }
          }
        }
      } catch (err) {
        console.warn('[SyncFromCloud] 아카이브 동기화 실패 — 라이브 동기화는 계속:', err);
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
