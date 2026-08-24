import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type {
  DriveSyncDeletionInfo,
  DriveSyncManifest,
  DriveSyncConflict,
  DriveSyncFileInfo,
} from '@domain/entities/DriveSyncState';
import { driveSyncDeletionIdentity } from '@domain/entities/DriveSyncState';
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
  computeSyncChecksum,
  type SyncProgress,
  type GetDynamicSyncFiles,
  type GetBinaryDynamicSyncFiles,
} from './SyncToCloud';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { withDataOperationLock } from '@usecases/shared/dataOperationMutex';
import { SYNC_FILE_KEYS } from './syncRegistry';
import { base64ToUint8, uint8ToBase64 } from './binaryBase64';
import { classifySyncThreeWay } from './syncThreeWay';

async function computeBinarySyncChecksum(
  relPath: string,
  bytes: Uint8Array | null,
): Promise<string | null> {
  if (bytes === null) return null;
  return computeSyncChecksum(
    JSON.stringify({ __binaryBase64: uint8ToBase64(bytes), __relPath: relPath }),
  );
}

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

/*
 * ── 리모트 레코드 스킵 필터 (S2.2b → F9a로 기준 교체) ─────────────────────
 * 로컬 레코드는 판정하지 않는다 — 잔존 옛 레코드 보존(레코드 스탬프 설계의 핵심:
 * 반쯤 전환 상태는 오류가 아니다). 툼스톤 로직과 완전 분리(0줄 수정) — 스킵된 레코드는
 * map에 들어가지 않으므로 툼스톤 판정 대상도 아니다(옛 레코드의 삭제 전파는 그대로 동작).
 */

/** 학기 라벨의 시간 순서값('2026-1' → 20261). 형식이 아니면 null. */
function termOrder(term: string | undefined): number | null {
  if (term === undefined) return null;
  const parsed = parseTerm(term);
  return parsed === null ? null : parsed.year * 10 + parsed.semester;
}

/**
 * F11a — 레코드 "기록 시각"을 밀리초로 정규화. 숫자(ms)·ISO 문자열 둘 다 받는다.
 * ⚠️ 도메인마다 축이 다르다(함정 ②): observations는 number(ms), 나머지는 ISO 문자열.
 * 축을 통일하지 않고 도메인별 추출자가 올바른 필드를 읽어 여기서 숫자로만 맞춘다.
 * 파싱 불가·부재는 null(= 시각 미상 → 보수적으로 스킵 쪽).
 */
function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** 도메인별 "언제 기록했나" 추출자 — 마감 시각과 비교할 축을 도메인이 직접 고른다. */
type RecordTimeExtractor<T> = (record: T) => number | null;

/**
 * F9a·F11a — **마감한 학기 + 마감 시각** 기준 리모트 레코드 스킵.
 *
 * 원칙은 "담임 축은 학년도를 관통한다"이지만, 사용자가 그 학기를 **명시적으로 마감**했다면
 * 마감 시점까지의 기록은 라이브에 없어야 한다(QA-A B2). 다만 term은 `date`(사건 발생일)
 * 파생이라, 5월에 2026-1을 마감해도 6~8월에 새로 만든 기록의 term은 여전히 '2026-1'이다 —
 * term만으로 자르면 **마감 이후의 정상 활동까지 기기 간 전파가 멈춘다**(QA G1).
 * 그래서 마감 시각(lastClosedAt)을 함께 본다:
 *  - `term <= lastClosedTerm` **AND** 기록시각이 없거나 `<= lastClosedAt` → 스킵(마감 전 기록)
 *  - `term <= lastClosedTerm` **AND** 기록시각 `> lastClosedAt` → **병합**(마감 후 새 기록 — G1 해소)
 *  - `lastClosedAt` 부재(구버전 전환 이력) → term만으로 판정(하위 호환)
 *  - `lastClosedTerm` 부재 → 학년도 비교 폴백 / 둘 다 없으면 필터 비활성
 *
 * 경계 원칙: **애매하면 스킵**(부활 0 우선). 시각이 명확히 마감 이후일 때만 병합한다.
 * F11d: `lastClosedTerm > currentTerm`(파일 손상·수기 편집)이면 필터 전체 비활성(fail-open).
 */
function filterClosedTermRemoteRecords<T extends { readonly term?: string }>(
  filename: string,
  records: readonly T[],
  currentTerm: string | undefined,
  lastClosedTerm: string | undefined,
  lastClosedAt: string | undefined,
  getRecordTimeMs: RecordTimeExtractor<T>,
): readonly T[] {
  let closedOrder = termOrder(lastClosedTerm);
  const currentOrder = termOrder(currentTerm);
  const currentYear = currentTerm === undefined ? null : schoolYearOf(currentTerm);

  // F11d — 마감 학기가 현재 학기보다 미래면 설정이 깨진 것이다. 그 상태로 필터를 돌리면
  // 정상 기록까지 잘라내므로 판정을 포기한다(부활보다 나쁜 결과를 만들지 않는다).
  if (closedOrder !== null && currentOrder !== null && closedOrder > currentOrder) {
    console.warn(
      `[SyncFromCloud] ${filename}: 학기 설정 불일치(lastClosedTerm=${lastClosedTerm} > currentTerm=${currentTerm}) — 스킵 필터 비활성`,
    );
    closedOrder = null;
  }

  const closedAtMs = toEpochMs(lastClosedAt);
  if (closedOrder === null && currentYear === null) return records;

  const kept: T[] = [];
  const skippedTerms = new Set<string>();
  let skipped = 0;
  for (const r of records) {
    let shouldSkip: boolean;
    if (closedOrder !== null) {
      const inClosedRange = (termOrder(r.term) ?? Number.POSITIVE_INFINITY) <= closedOrder;
      if (!inClosedRange) {
        shouldSkip = false;
      } else if (closedAtMs === null) {
        shouldSkip = true; // 구버전 이력(마감 시각 없음) — term만으로 판정
      } else {
        const recordedMs = getRecordTimeMs(r);
        // 시각 미상 = 마감 전으로 보수 판정(스킵). 마감 이후가 명확할 때만 병합.
        shouldSkip = recordedMs === null || recordedMs <= closedAtMs;
      }
    } else {
      shouldSkip =
        r.term !== undefined &&
        schoolYearOf(r.term) !== null &&
        (schoolYearOf(r.term) as number) < (currentYear as number);
    }
    if (shouldSkip) {
      skipped++;
      if (r.term !== undefined) skippedTerms.add(r.term);
      continue;
    }
    kept.push(r);
  }
  if (skipped > 0) {
    const basis =
      closedOrder !== null
        ? `마감 <= ${lastClosedTerm}${closedAtMs !== null ? `@${lastClosedAt}` : ''}`
        : `옛 학년도 < ${currentTerm}`;
    console.log(
      `[SyncFromCloud] ${filename}: ${skipped}건 skip (${basis}, term=${[...skippedTerms].sort().join(',')})`,
    );
  }
  return kept;
}

/**
 * F7c — 마커 해제 판정: 파일에 "실질 내용"이 있는가(사용자가 새로 입력했는가).
 *  - null/빈 배열/최상위 배열이 전부 빈 봉투 → 실질 내용 없음(마커 유지)
 *  - 배열에 항목·봉투의 어느 배열에든 항목 → 실질 내용(마커 해제 → 정상 동기화 재개)
 *  - 배열 없는 객체는 내용으로 취급(보수: 해제 방향 — 게이트 대상 3키는 전부 배열 보유 형태)
 */
function hasSubstantiveContent(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') {
    const values = Object.values(data as Record<string, unknown>);
    const arrays = values.filter((v): v is unknown[] => Array.isArray(v));
    if (arrays.length > 0) return arrays.some((a) => a.length > 0);
    return values.length > 0;
  }
  return true;
}

/** F11b — 학기 가드 3필드 + 결정 시각. settings 통파일 교체 시 함께 다뤄야 한다. */
export interface TermGuardSnapshot {
  readonly currentTerm?: string;
  readonly lastClosedTerm?: string;
  readonly lastClosedAt?: string;
  /** 이 결정을 내린 시각(ISO). 있으면 학기 비교보다 우선한다. */
  readonly termGuardUpdatedAt?: string;
}

const TERM_GUARD_FIELDS = [
  'currentTerm',
  'lastClosedTerm',
  'lastClosedAt',
  'termGuardUpdatedAt',
] as const;

/** 학기 라벨 하나의 순서값(비교 폴백용). */
function guardTermOrder(value: unknown): number {
  const parsed = typeof value === 'string' ? parseTerm(value) : null;
  return parsed === null ? -1 : parsed.year * 10 + parsed.semester;
}

/**
 * F3·F9a·F11b — settings 통파일 교체 시 **학기 가드 필드를 보존**한다.
 *
 * settings는 병합 없는 통파일 LWW라, 아직 전환하지 않은(또는 옛 결정을 가진) 기기가 올린
 * settings가 내려오면 가드 기준이 통째로 벗겨진다(qa3-C).
 *
 * 판정(F11b): **더 최신 "결정 시각"(termGuardUpdatedAt)이 이긴다.**
 * 학기 비교로만 판정하던 구 규칙은 "해제(후퇴)"가 항상 밀려서 **복원이 다른 기기로
 * 전파되지 않았다**(QA G2). 결정 시각을 쓰면 해제도 최신 결정이라 정상 전파된다.
 *  - 양쪽 시각 존재 → 늦은 쪽 채택(동률이면 수신 채택 — LWW 기본 방향)
 *  - 로컬만 시각 존재 → 로컬 채택(수신은 결정 이력이 없는 구버전)
 *  - 수신만 존재·둘 다 없음 → 수신 채택 후 **학기 비교 폴백**(구 규칙 — 하위 호환)
 * 채택은 4필드를 **통째로** 적용한다(부분 혼합이면 term과 시각이 어긋난다).
 */
export function preserveNewerTermGuard(incoming: unknown, local: TermGuardSnapshot): unknown {
  if (incoming === null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return incoming; // settings 형태가 아니면 건드리지 않는다(방어)
  }
  const obj = incoming as Record<string, unknown>;
  const localAt = toEpochMs(local.termGuardUpdatedAt);
  const incomingAt = toEpochMs(obj['termGuardUpdatedAt']);

  const adoptLocal = (): unknown => {
    const next: Record<string, unknown> = { ...obj };
    for (const key of TERM_GUARD_FIELDS) {
      const value = local[key];
      if (value === undefined) delete next[key];
      else next[key] = value;
    }
    console.log(
      `[SyncFromCloud]   settings: 학기 가드 보존 (로컬 결정 ${local.termGuardUpdatedAt ?? '시각없음'} 우선, lastClosedTerm=${local.lastClosedTerm ?? '없음'})`,
    );
    return next;
  };

  if (localAt !== null && (incomingAt === null || localAt > incomingAt)) return adoptLocal();
  if (localAt !== null && incomingAt !== null) return incoming; // 수신이 최신·동률 → 수신 채택

  // 결정 시각이 없는 구버전 이력 — 기존 "더 최신 학기 승" 폴백.
  let result = obj;
  let changed = false;
  for (const key of ['currentTerm', 'lastClosedTerm'] as const) {
    const localValue = local[key];
    if (localValue === undefined) continue;
    const localOrder = guardTermOrder(localValue);
    if (localOrder < 0) continue;
    if (guardTermOrder(result[key]) >= localOrder) continue;
    console.log(
      `[SyncFromCloud]   settings: ${key} 보존 (수신=${String(result[key] ?? '없음')} < 로컬=${localValue})`,
    );
    result = { ...result, [key]: localValue };
    changed = true;
  }
  return changed ? result : incoming;
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
): Promise<T> {
  return await withFileLock(filename, async () => {
    const localData = await storage.read<T>(filename);
    const merged = merge(localData);
    await storage.write(filename, merged);
    console.log(
      `[SyncFromCloud]   ${filename}: ✅ MERGE${logSuffix} (local=${localData?.records?.length ?? 0}건 + remote=${remoteData?.records?.length ?? 0}건 → ${merged.records.length}건)`,
    );
    return merged;
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
  lastClosedTerm?: string,
  lastClosedAt?: string,
): StudentRecordsData {
  const localRecords = local?.records ?? [];
  const remoteRecords = filterClosedTermRemoteRecords(
    'student-records',
    remote.records ?? [],
    currentTerm,
    lastClosedTerm,
    lastClosedAt,
    // 기록 시각 축: createdAt(ISO). 없으면 updatedAt(ISO)로 폴백.
    (r) => toEpochMs(r.createdAt) ?? toEpochMs(r.updatedAt),
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
  lastClosedTerm?: string,
  lastClosedAt?: string,
): ObservationData {
  const map = new Map<string, ObservationRecord>();
  for (const r of local?.records ?? []) {
    map.set(r.id, r);
  }
  for (const r of filterClosedTermRemoteRecords(
    'observations',
    remote.records ?? [],
    currentTerm,
    lastClosedTerm,
    lastClosedAt,
    // 기록 시각 축: createdAt(**number ms** — 이 도메인만 숫자축, 함정 ②).
    (r) => toEpochMs(r.createdAt),
  )) {
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
  lastClosedTerm?: string,
  lastClosedAt?: string,
): AttendanceData {
  const map = new Map<string, AttendanceRecord>();
  for (const r of local?.records ?? []) {
    map.set(attendanceRecordKey(r), r);
  }
  for (const r of filterClosedTermRemoteRecords(
    'attendance',
    remote.records ?? [],
    currentTerm,
    lastClosedTerm,
    lastClosedAt,
    // 기록 시각 축: updatedAt(ISO) — 출결 레코드에는 createdAt이 없다.
    (r) => toEpochMs(r.updatedAt),
  )) {
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
     * S2.2b·F9a — 스킵 필터 기준 지연 조회(전역 import 금지, 호출부 주입).
     * `lastClosedTerm`(마감 학기)이 정본, `currentTerm`은 구버전 이력용 폴백 기준.
     * 미주입·부재·읽기 실패 = 필터 비활성(현행 병합 그대로, fail-open).
     */
    private readonly getTermGuard?: () => Promise<{
      currentTerm?: string;
      lastClosedTerm?: string;
      /** F11a — 마감 실행 시각(ISO). 마감 이후 새로 만든 기록은 병합한다. */
      lastClosedAt?: string;
    }>,
    /** (S4.1) 아카이브 훅 2종 — 둘 다 주입될 때만 아카이브 다운로드가 켜진다(데스크톱 전용). */
    private readonly listLocalArchiveTerms?: ListLocalArchiveTerms,
    private readonly importArchiveTerm?: ImportArchiveTermFiles,
    /** 활성 충돌을 갱신하는 호출에서는 장부 부재/손상을 성공(no-op)으로 처리하지 않는다. */
    private readonly requireRemoteManifest = false,
  ) {}

  /**
   * 통파일 교체 쓰기(비병합 도메인) — settings는 currentTerm "더 최신 학기 승" 보존(F3) 경유.
   * 로컬 읽기 실패(손상 등)는 보존 불가로 보고 수신 그대로 쓴다(fail-open).
   */
  private prepareReplacedFile(filename: string, parsed: unknown, current: unknown | null): unknown {
    if (filename !== 'settings') return parsed;
    return preserveNewerTermGuard(parsed, (current as TermGuardSnapshot | null) ?? {});
  }

  private async writeReplacedFile(filename: string, parsed: unknown): Promise<void> {
    let current: unknown | null = null;
    try {
      current = await this.storage.read<unknown>(filename);
    } catch {
      current = null;
    }
    await this.storage.write(filename, this.prepareReplacedFile(filename, parsed, current));
  }

  private async readStoredChecksum(filename: string): Promise<string | null> {
    const data = await this.storage.read<unknown>(filename);
    return data === null ? null : await computeSyncChecksum(JSON.stringify(data));
  }

  private async downloadVerifiedJson(
    filename: string,
    remoteInfo: DriveSyncFileInfo,
    remoteFiles: readonly { readonly id: string; readonly name: string }[],
    allowLocalRecovery = false,
  ): Promise<unknown> {
    const driveFile = remoteFiles.find((file) => file.name === `${filename}.json`);
    if (!driveFile) {
      throw new Error(`드라이브에서 ${filename}.json 파일을 찾지 못했습니다.`);
    }
    const content = await this.drivePort.downloadSyncFile(driveFile.id);
    const downloadedChecksum = await computeSyncChecksum(content);
    if (downloadedChecksum !== remoteInfo.checksum) {
      const localChecksum = allowLocalRecovery ? await this.readStoredChecksum(filename) : null;
      if (localChecksum !== downloadedChecksum) {
        throw new Error(`드라이브 ${filename} 파일이 동기화 중 다시 변경되었습니다.`);
      }
    }
    return JSON.parse(content) as unknown;
  }

  private async replaceRemoteJsonIfLocalUnchanged(
    filename: string,
    expectedLocalChecksum: string | null,
    remoteInfo: DriveSyncFileInfo,
    remoteFiles: readonly { readonly id: string; readonly name: string }[],
  ): Promise<boolean> {
    const parsed = await this.downloadVerifiedJson(filename, remoteInfo, remoteFiles);
    return this.replaceParsedRemoteJsonIfLocalUnchanged(
      filename,
      expectedLocalChecksum,
      remoteInfo.checksum,
      parsed,
    );
  }

  private async replaceParsedRemoteJsonIfLocalUnchanged(
    filename: string,
    expectedLocalChecksum: string | null,
    remoteChecksum: string,
    parsed: unknown,
  ): Promise<boolean> {
    return withFileLock(filename, async () => {
      const current = await this.storage.read<unknown>(filename);
      const currentChecksum =
        current === null ? null : await computeSyncChecksum(JSON.stringify(current));
      if (currentChecksum !== expectedLocalChecksum && currentChecksum !== remoteChecksum) {
        return false;
      }
      if (currentChecksum === remoteChecksum) return true;

      const next = this.prepareReplacedFile(filename, parsed, current);
      if (this.storage.replaceIfUnchanged) {
        return this.storage.replaceIfUnchanged(filename, current, next);
      }
      if ((await this.readStoredChecksum(filename)) !== currentChecksum) return false;
      await this.storage.write(filename, next);
      return true;
    });
  }

  /**
   * 로컬 기록을 보존해 병합한 결과는 리모트 원본과 바이트가 다를 수 있다.
   * 그 결과에 리모트 원본 체크섬을 붙이면 다음 pull이 곧바로 content-mismatch가 된다.
   * 병합본을 파일 CAS → 매니페스트 CAS로 수렴시킨 뒤 그 정본 정보를 로컬 장부에도 쓴다.
   */
  private async convergeMergedFile(
    folderId: string,
    filename: string,
    mergedData: unknown,
    expectedRemoteInfo: DriveSyncFileInfo,
  ): Promise<DriveSyncFileInfo> {
    const content = JSON.stringify(mergedData);
    const checksum = await computeSyncChecksum(content);
    if (checksum === expectedRemoteInfo.checksum) return expectedRemoteInfo;

    const currentFile = (await this.drivePort.listSyncFiles(folderId)).find(
      (file) => file.name === `${filename}.json`,
    );
    let nextInfo: DriveSyncFileInfo;
    if (currentFile && currentFile.modifiedTime !== expectedRemoteInfo.lastModified) {
      // 이전 실행에서 파일 CAS만 성공하고 매니페스트 CAS가 실패한 부분 성공 상태를 복구한다.
      // 실제 파일이 이번 병합본과 같을 때만 재업로드 없이 장부 갱신을 재시도한다.
      const currentContent = await this.drivePort.downloadSyncFile(currentFile.id);
      const currentChecksum = await computeSyncChecksum(currentContent);
      if (currentChecksum !== checksum) {
        throw new Error(`클라우드 ${filename} 파일이 병합 중 다시 변경되었습니다.`);
      }
      nextInfo = {
        lastModified: currentFile.modifiedTime,
        checksum,
        size: new TextEncoder().encode(currentContent).length,
        uploadedBy: this.deviceId,
      };
    } else {
      const uploaded = await this.drivePort.uploadSyncFileIfUnchanged(
        folderId,
        `${filename}.json`,
        content,
        expectedRemoteInfo.lastModified,
      );
      if (!uploaded) {
        throw new Error(`클라우드 ${filename} 파일이 병합 중 다시 변경되었습니다.`);
      }
      nextInfo = {
        lastModified: uploaded.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: this.deviceId,
      };
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await this.drivePort.getSyncManifest(folderId);
      if (!latest) throw new Error('클라우드 동기화 장부를 다시 확인하지 못했습니다.');
      const latestInfo = latest.files[filename];
      if (
        !latestInfo ||
        latestInfo.lastModified !== expectedRemoteInfo.lastModified ||
        latestInfo.checksum !== expectedRemoteInfo.checksum
      ) {
        throw new Error(`클라우드 ${filename} 장부가 병합 중 다시 변경되었습니다.`);
      }
      const nextManifest: DriveSyncManifest = {
        ...latest,
        version: Math.max(2, latest.version),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        lastSyncedAt: new Date().toISOString(),
        files: { ...latest.files, [filename]: nextInfo },
      };
      if (await this.drivePort.updateSyncManifestIfUnchanged(folderId, latest, nextManifest)) {
        return nextInfo;
      }
    }

    throw new Error(`클라우드 ${filename} 장부를 안전하게 갱신하지 못했습니다.`);
  }

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncFromCloudResult> {
    return withDataOperationLock(() => this.executeUnlocked(onProgress));
  }

  private async executeUnlocked(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncFromCloudResult> {
    console.log(
      `[SyncFromCloud] ▶ 시작 | myDeviceId=${this.deviceId} | policy=${this.conflictPolicy}`,
    );
    // S2.2b·F9a — 스킵 기준. 실행 시점에 1회 읽어 다운로드·병합 전체에 같은 값 적용.
    let currentTerm: string | undefined;
    let lastClosedTerm: string | undefined;
    let lastClosedAt: string | undefined;
    if (this.getTermGuard) {
      try {
        const guard = await this.getTermGuard();
        currentTerm = guard.currentTerm;
        lastClosedTerm = guard.lastClosedTerm;
        lastClosedAt = guard.lastClosedAt;
      } catch {
        // 읽기 실패 = 필터 비활성(fail-open — 자기 격리 금지)
        currentTerm = undefined;
        lastClosedTerm = undefined;
        lastClosedAt = undefined;
      }
    }

    // F7c — 학년도 전환이 비운 파일 마커(로컬 전용, SYNC_FILES 미등재). 마커 활성 동안
    // 해당 키의 모든 다운로드 분기를 스킵해 리모트 옛 사본 부활을 막는다(qa3-D·RB1).
    // lazy 1회 로드 — 읽기 실패=마커 없음(fail-open: 다운로드는 원래 데이터 보호 장치다).
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
      if (this.requireRemoteManifest) {
        throw new Error('활성 충돌을 갱신하는 동안 클라우드 동기화 장부를 읽지 못했습니다.');
      }
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
    const updatedDeletions: Record<string, DriveSyncDeletionInfo> = {
      ...(localManifest?.deletions ?? {}),
    };
    for (const [key, remoteDeletion] of Object.entries(remoteManifest.deletions ?? {})) {
      const localDeletion = updatedDeletions[key];
      if (
        !localDeletion ||
        remoteDeletion.deletedAt > localDeletion.deletedAt ||
        (remoteDeletion.deletedAt === localDeletion.deletedAt &&
          driveSyncDeletionIdentity(remoteDeletion) > driveSyncDeletionIdentity(localDeletion))
      ) {
        updatedDeletions[key] = remoteDeletion;
      }
    }
    const updatedRestorations = {
      ...(localManifest?.restorations ?? {}),
      ...(remoteManifest.restorations ?? {}),
    };
    let staleRestorationRemoved = false;
    /** 더 새로운 삭제 세대에 밀려 폐기된 복원 — 아래 삭제 보호에서 다시 살리지 않는다. */
    const restorationsLostToNewerDeletion = new Set<string>();
    for (const [key, restoration] of Object.entries(updatedRestorations)) {
      const remoteDeletion = remoteManifest.deletions?.[key];
      if (restoration.completedAt) {
        const deletion = updatedDeletions[key];
        if (deletion && driveSyncDeletionIdentity(deletion) === restoration.replacesDeletionId) {
          delete updatedDeletions[key];
          staleRestorationRemoved = true;
        }
        continue;
      }
      if (
        remoteDeletion &&
        driveSyncDeletionIdentity(remoteDeletion) !== restoration.replacesDeletionId
      ) {
        delete updatedRestorations[key];
        restorationsLostToNewerDeletion.add(key);
        staleRestorationRemoved = true;
      } else {
        delete updatedDeletions[key];
      }
    }
    const isPendingRestoration = (key: string): boolean =>
      updatedRestorations[key] !== undefined && !updatedRestorations[key]?.completedAt;
    let localManifestChanged = staleRestorationRemoved;
    const total = SYNC_FILES.length;

    for (const [key, deletion] of Object.entries(updatedDeletions)) {
      const isBinary = key.startsWith('obs-attachments/') || key.startsWith('student-photos/');
      const isDynamicJson = key.startsWith('note-body--');
      if (!isBinary && !isDynamicJson) continue;

      // ★ 삭제도 3방향으로 판정한다.
      //
      // 다른 기기의 삭제 표식을 그대로 적용하면, **삭제 표식을 아직 받지 못한 사이에 이 기기가
      // 새로 넣은 파일**(사진 다시 넣기, 첨부 다시 올리기)이 조용히 사라진다. 로컬 파일이
      // 마지막 동기화 기준점(B)과 다르면 그것은 삭제 대상이던 그 파일이 아니라 **이 기기의 새
      // 내용**이므로, 지우지 않고 복원(restoration)으로 돌려 다음 업로드에서 살려 올린다.
      // 기준점과 같으면(= 지워진 그 파일 그대로) 예정대로 지운다 — 파기는 계속 전파돼야 한다.
      const localBaselineChecksum = localManifest?.files[key]?.checksum ?? null;
      const localCurrentChecksum = isBinary
        ? await computeBinarySyncChecksum(key, await this.storage.readBinary(key))
        : await this.readStoredChecksum(key);
      if (
        localCurrentChecksum !== null &&
        localCurrentChecksum !== localBaselineChecksum &&
        !isPendingRestoration(key) &&
        // 이미 복원을 시도했는데 다른 기기가 **그 뒤 새 삭제 세대**를 올린 경우는 예외다.
        // 파기 의도를 복원이 무한히 되살리면 지운 얼굴 사진이 계속 돌아온다(ADR-073 결정 3).
        !restorationsLostToNewerDeletion.has(key)
      ) {
        updatedRestorations[key] = {
          restoredAt: new Date().toISOString(),
          restoredBy: this.deviceId,
          replacesDeletionId: driveSyncDeletionIdentity(deletion),
        };
        delete updatedDeletions[key];
        localManifestChanged = true;
        skipped.push(key);
        console.log(`[SyncFromCloud]   ${key}: DELETE skipped (로컬 새 내용 → 복원 대기)`);
        continue;
      }

      if (isBinary) await this.storage.removeBinary(key);
      else await this.storage.remove(key);
      if (updatedFiles[key]) {
        delete updatedFiles[key];
        localManifestChanged = true;
      }
      const localDeletion = localManifest?.deletions?.[key];
      if (
        !localDeletion ||
        localDeletion.deletedAt !== deletion.deletedAt ||
        localDeletion.deletedBy !== deletion.deletedBy ||
        driveSyncDeletionIdentity(localDeletion) !== driveSyncDeletionIdentity(deletion)
      ) {
        localManifestChanged = true;
      }
      skipped.push(key);
      console.log(`[SyncFromCloud]   ${key}: DELETE intent applied`);
    }

    let index = 0;
    for (const filename of SYNC_FILES) {
      index++;
      onProgress?.({ current: index, total, filename });

      const remoteInfo = remoteManifest.files[filename];
      const localInfo = localManifest?.files[filename];

      if (updatedDeletions[filename]) {
        skipped.push(filename);
        continue;
      }

      if (!remoteInfo) {
        skipped.push(filename);
        console.log(`[SyncFromCloud]   ${filename}: SKIP (리모트에 없음)`);
        continue;
      }

      // 체크섬 동일 → 원칙적으로 스킵. 단, 로컬에 실제 파일이 없으면 장부만 "받았음"인
      // 오염 상태(과거 no-op 업로드가 받은 적 없는 리모트 항목을 로컬 장부에 승계)이므로
      // 스킵하지 않고 아래 첫-다운로드 경로로 진행해 자가 치유한다.
      // 로컬 파일이 없으니 다운로드로 잃을 데이터도 없다(데이터 보존 안전).
      // F7c(B1 구조 수정) — 전환 마커 게이트: 마커 활성 동안 이 키의 **모든** 다운로드 분기
      // (치유·충돌·첫 다운로드)를 스킵한다. 시각 비교(removedAt vs modifiedTime)는 시계
      // 스큐로 반증(RH2)되어 제거 — 판정은 "마커 활성 여부"뿐이다. 해제 조건은
      // (a) 로컬 실질 내용 **AND** 리모트 정화 확인(F8a) (b) revert(마커 파일 삭제).
      // 남는 창(전환~첫 업로드)은 F7b의 빈 값 업로드가 리모트를 정화해 닫는다.
      {
        const removedMarker = await loadRemovedMarker();
        if (removedMarker !== null && removedMarker.keys.includes(filename)) {
          let localData: unknown = null;
          try {
            localData = await this.storage.read<unknown>(filename);
          } catch {
            localData = null; // 읽기 실패 = 실질 내용 미확인 — 보수적으로 스킵 유지
          }
          // F8a(RT2): "로컬 실질 내용"만으로 해제하면, 미전환 기기가 리모트를 되오염시킨
          // 상태에서 해제 직후 충돌 분기가 이 기기의 새 명렬을 옛 명렬로 덮는 체인이
          // 성립한다(QA 3차 재현). 해제는 **리모트가 정화 상태**(리모트 체크섬 == 내 로컬
          // 장부 체크섬 = 내가 마지막으로 올린 것)일 때만. 되오염이면 마커 유지+스킵 —
          // 재정화는 업로드 경로가 담당(SyncToCloud가 마커 키를 DEFER하지 않는다).
          const remotePurified =
            localInfo !== undefined && localInfo.checksum === remoteInfo.checksum;
          if (hasSubstantiveContent(localData) && remotePurified) {
            await releaseRemovedKey(filename);
            console.log(
              `[SyncFromCloud]   ${filename}: 전환 마커 해제(로컬 새 내용+리모트 정화 확인) — 정상 동기화 재개`,
            );
          } else {
            skipped.push(filename);
            console.log(
              `[SyncFromCloud]   ${filename}: 다운로드 스킵(학년도 전환으로 비운 파일 — 마커 활성${
                hasSubstantiveContent(localData) && !remotePurified
                  ? ', 리모트 미정화 — 업로드가 정화 예정'
                  : ''
              })`,
            );
            continue;
          }
        }
      }

      if (localInfo && localInfo.checksum === remoteInfo.checksum) {
        const localData = await this.storage.read<unknown>(filename);
        if (localData !== null) {
          // 장부끼리 같아도 실제 로컬 파일은 다를 수 있다. 과거 no-op 장부 오염 뒤
          // PWA 재설치/부분 초기화로 빈 봉투만 남은 제보 상태가 그 예다. 실제 내용을
          // 확인하지 않고 "변경 없음" 처리하면 클라우드 일정이 영구히 내려오지 않는다.
          const localContent = JSON.stringify(localData);
          const actualChecksum = await computeSyncChecksum(localContent);
          if (actualChecksum !== localInfo.checksum) {
            // "장부와 다름"에는 성격이 정반대인 두 상태가 겹쳐 있다 — 반드시 갈라야 한다.
            //
            //  (a) 아직 안 올린 로컬 변경 = **정상 상태**. 리모트 체크섬 == 내 장부 체크섬이므로
            //      Drive에는 내가 이미 주고받은 것 말고 새로 받을 내용이 없고, 이 변경은 곧바로
            //      이어지는 업로드 경로가 그대로 올린다 → 스킵이 데이터 보존 관점에서 안전하다.
            //      이걸 충돌로 올리면 **동기화가 스스로 남긴 흔적까지 매 주기 가짜 충돌**이 된다:
            //      v2.3.4까지 동기화 완료 후 settings.sync.lastSyncedAt을 다시 쓰던 경로가
            //      장부 확정 *이후* 파일을 건드려, 다음 다운로드가 매번 settings 충돌을 띄웠다
            //      (2026-08-10 신고 — 해결해도 다음 동기화에서 그대로 부활하는 무한 반복).
            //      그 재기록 자체는 ADR-040으로 제거했지만, 판정이 틀린 채로 남으면 사용자가
            //      설정을 바꾼 직후 동기화만으로도 같은 가짜 충돌이 다시 난다.
            //
            //  (b) 빈 봉투 = 장부는 "받았음"인데 내용이 날아간 **유실 의심**. 리모트에 원본이
            //      더 남아 있으므로(리모트 size가 더 큼) 자동 판단하지 않고 충돌로 올려 회수한다.
            //      이 분기가 v2.3.1 핫픽스(모바일 Drive 복구 유실)가 지키려던 바로 그 지점이다.
            //
            // 판정 기준을 "로컬이 비었나"만이 아니라 "리모트가 더 크냐"까지 함께 보는 이유:
            // settings처럼 배열이 부수적인 설정 객체는 배열이 모두 비어도 정상이라, 크기 비교
            // 없이 hasSubstantiveContent만 쓰면 멀쩡한 설정이 다시 가짜 충돌로 잡힌다.
            const localSize = new TextEncoder().encode(localContent).length;
            const looksLost = !hasSubstantiveContent(localData) && remoteInfo.size > localSize;
            if (!looksLost) {
              skipped.push(filename);
              console.log(
                `[SyncFromCloud]   ${filename}: SKIP (아직 업로드 안 된 로컬 변경 — 리모트는 내 장부와 동일해 받을 것이 없음)`,
              );
              continue;
            }
            conflicts.push({
              filename,
              localModified: 'content-mismatch',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
              kind: 'json',
              baselineChecksum: localInfo.checksum,
              localChecksum: actualChecksum,
              remoteChecksum: remoteInfo.checksum,
            });
            console.log(
              `[SyncFromCloud]   ${filename}: 🔶 CONFLICT (장부엔 "받았음"인데 로컬이 빈 봉투 ${localSize}B < 리모트 ${remoteInfo.size}B)`,
            );
            continue;
          }
          skipped.push(filename);
          continue;
        }
        console.log(
          `[SyncFromCloud]   ${filename}: 🩹 장부엔 "받았음"인데 로컬 파일 없음 → 다운로드로 치유`,
        );
      }

      const isRecordMergeFile =
        filename === SYNC_FILE_KEYS.studentRecords ||
        filename === SYNC_FILE_KEYS.attendance ||
        filename === SYNC_FILE_KEYS.observations;

      // 스냅샷 파일은 장부 시각이 아니라 실제 B/L/R 내용으로 원격 단독 변경과 동시 변경을 가른다.
      if (localInfo && localInfo.checksum !== remoteInfo.checksum && !isRecordMergeFile) {
        const localChecksumBeforeDownload = await this.readStoredChecksum(filename);
        const decision = classifySyncThreeWay({
          baselineChecksum: localInfo.checksum,
          localChecksum: localChecksumBeforeDownload,
          remoteChecksum: remoteInfo.checksum,
        });

        if (decision === 'converged') {
          updatedFiles[filename] = remoteInfo;
          localManifestChanged = true;
          skipped.push(filename);
          continue;
        }

        if (decision === 'remote-only') {
          const replaced = await this.replaceRemoteJsonIfLocalUnchanged(
            filename,
            localChecksumBeforeDownload,
            remoteInfo,
            remoteFiles,
          );
          if (replaced) {
            updatedFiles[filename] = remoteInfo;
            downloaded.push(filename);
            continue;
          }
        }

        // 실제 동시 변경은 로컬 수정 시각을 알 수 없으므로 latest 정책에서도 자동 덮어쓰지 않는다.
        conflicts.push({
          filename,
          localModified: 'content-mismatch',
          remoteModified: remoteInfo.lastModified,
          localDeviceName: this.deviceName,
          remoteDeviceName: remoteManifest.deviceName,
          kind: 'json',
          baselineChecksum: localInfo.checksum,
          localChecksum: localChecksumBeforeDownload,
          remoteChecksum: remoteInfo.checksum,
        });
        continue;
      }

      // 항목 병합 파일은 기존 도메인 병합 규칙으로 처리한다.
      if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
        if (filename === SYNC_FILE_KEYS.curriculumProgress) {
          const localChecksumBeforeDownload = await this.readStoredChecksum(filename);

          if (localChecksumBeforeDownload === remoteInfo.checksum) {
            updatedFiles[filename] = remoteInfo;
            localManifestChanged = true;
            skipped.push(filename);
            console.log(
              `[SyncFromCloud]   ${filename}: SKIP (로컬 내용은 이미 리모트와 동일 — 장부만 갱신)`,
            );
            continue;
          }

          const localHasNotChanged =
            localChecksumBeforeDownload === null ||
            localChecksumBeforeDownload === localInfo.checksum;
          if (localHasNotChanged) {
            const driveFile = remoteFiles.find((file) => file.name === `${filename}.json`);
            if (driveFile) {
              const content = await this.drivePort.downloadSyncFile(driveFile.id);
              const downloadedChecksum = await computeSyncChecksum(content);
              if (downloadedChecksum !== remoteInfo.checksum) {
                throw new Error(`드라이브 ${filename} 파일이 동기화 중 다시 변경되었습니다.`);
              }

              const replaced = await withFileLock(
                SYNC_FILE_KEYS.curriculumProgress,
                async (): Promise<boolean> => {
                  const localChecksumAfterDownload = await this.readStoredChecksum(filename);
                  const localChangedDuringDownload =
                    localChecksumAfterDownload !== localChecksumBeforeDownload &&
                    localChecksumAfterDownload !== remoteInfo.checksum;
                  if (localChangedDuringDownload) return false;

                  if (localChecksumAfterDownload !== remoteInfo.checksum) {
                    await this.writeReplacedFile(filename, JSON.parse(content) as unknown);
                  }
                  return true;
                },
              );

              if (!replaced) {
                conflicts.push({
                  filename,
                  localModified: 'content-mismatch',
                  remoteModified: remoteInfo.lastModified,
                  localDeviceName: this.deviceName,
                  remoteDeviceName: remoteManifest.deviceName,
                  kind: 'json',
                  baselineChecksum: localInfo.checksum,
                  localChecksum: await this.readStoredChecksum(filename),
                  remoteChecksum: remoteInfo.checksum,
                });
                console.log(
                  `[SyncFromCloud]   ${filename}: ⛔ CONFLICT (다운로드 중 로컬 내용 변경)`,
                );
                continue;
              }

              updatedFiles[filename] = remoteInfo;
              downloaded.push(filename);
              console.log(
                `[SyncFromCloud]   ${filename}: ⬇ DOWNLOAD (로컬 변경 없음, 리모트만 변경)`,
              );
              continue;
            }
          }
        }

        const localIsNewer = new Date(localInfo.lastModified) > new Date(remoteInfo.lastModified);
        const remoteIsNewer = !localIsNewer;

        console.log(
          `[SyncFromCloud]   ${filename}: 충돌 감지 | local=${localInfo.checksum.slice(0, 8)}@${localInfo.lastModified} | remote=${remoteInfo.checksum.slice(0, 8)}@${remoteInfo.lastModified} | ${remoteIsNewer ? 'remote가 최신' : 'local이 최신'}`,
        );

        // 내가 올린 파일이면 충돌 아님 (로컬이 최신이면 스킵).
        // 판정은 파일별 uploadedBy 우선 — 매니페스트 최상위 deviceId는 "마지막으로
        // 매니페스트를 쓴 기기"라 다른 파일을 올린 기기로 찍혀 있을 수 있다.
        // uploadedBy 부재(구버전 항목)면 기존 deviceId 폴백 — 스킵은 데이터 무변경이라 안전 방향.
        if (
          !isRecordMergeFile &&
          (remoteInfo.uploadedBy ?? remoteManifest.deviceId) === this.deviceId
        ) {
          console.log(`[SyncFromCloud]   ${filename}: ⚠️ SKIP (내가 올린 데이터)`);
          skipped.push(filename);
          continue;
        }

        // conflictPolicy에 따라 처리
        // student-records는 항상 record-level merge (데이터 손실 방지)
        if (filename === 'student-records') {
          const remoteData = (await this.downloadVerifiedJson(
            filename,
            remoteInfo,
            remoteFiles,
            true,
          )) as StudentRecordsData;
          const merged = await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
            mergeStudentRecords(local, remoteData, currentTerm, lastClosedTerm, lastClosedAt),
          );
          updatedFiles[filename] = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
          downloaded.push(filename);
          continue;
        }

        // attendance도 항상 record-level merge — 폰·PC가 서로 다른 반/날짜를
        // 같은 파일에 쓰는 도메인이라 통째 덮어쓰기가 곧 출결 유실이다.
        if (filename === 'attendance') {
          const remoteData = (await this.downloadVerifiedJson(
            filename,
            remoteInfo,
            remoteFiles,
            true,
          )) as AttendanceData;
          const merged = await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
            mergeAttendance(
              local,
              remoteData,
              remoteIsNewer,
              currentTerm,
              lastClosedTerm,
              lastClosedAt,
            ),
          );
          updatedFiles[filename] = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
          downloaded.push(filename);
          continue;
        }

        // observations(수업 기록)도 항상 record-level merge — 파일 단위 latest 교체가
        // 구/빈 파일 승리 시 학생별 수업 메모 전체를 지웠다(2026-07-13 유실 신고).
        if (filename === 'observations') {
          const remoteData = (await this.downloadVerifiedJson(
            filename,
            remoteInfo,
            remoteFiles,
            true,
          )) as ObservationData;
          const merged = await mergeAndWriteLocked(this.storage, filename, remoteData, (local) =>
            mergeObservations(
              local,
              remoteData,
              remoteIsNewer,
              currentTerm,
              lastClosedTerm,
              lastClosedAt,
            ),
          );
          updatedFiles[filename] = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
          downloaded.push(filename);
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
          kind: 'json',
          baselineChecksum: localInfo.checksum,
          localChecksum: await this.readStoredChecksum(filename),
          remoteChecksum: remoteInfo.checksum,
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
            // 실제 로컬 파일 존재 → 정책과 관계없이 사용자가 선택하기 전에는 덮어쓰지 않는다.
            conflicts.push({
              filename,
              localModified: 'unknown',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
              kind: 'json',
              baselineChecksum: null,
              localChecksum: await computeSyncChecksum(JSON.stringify(localData)),
              remoteChecksum: remoteInfo.checksum,
            });
            console.log(
              `[SyncFromCloud]   ${filename}: 🔶 CONFLICT (manifest 미등록 + 로컬 데이터 존재)`,
            );
            continue;
          }
        }

        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        const downloadedChecksum = await computeSyncChecksum(content);
        if (downloadedChecksum !== remoteInfo.checksum) {
          throw new Error(`드라이브 ${filename} 파일이 동기화 중 다시 변경되었습니다.`);
        }
        let downloadedFileInfo = remoteInfo;
        if (filename === 'student-records') {
          const remoteData = JSON.parse(content) as StudentRecordsData;
          const merged = await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) =>
              mergeStudentRecords(local, remoteData, currentTerm, lastClosedTerm, lastClosedAt),
            ' (first download)',
          );
          downloadedFileInfo = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
        } else if (filename === 'attendance') {
          const remoteData = JSON.parse(content) as AttendanceData;
          // 로컬 manifest 정보가 없어 최신 판정 불가 → 기존 동작(리모트 우선)과 일치하게 preferRemote
          const merged = await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) =>
              mergeAttendance(local, remoteData, true, currentTerm, lastClosedTerm, lastClosedAt),
            ' (first download)',
          );
          downloadedFileInfo = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
        } else if (filename === 'observations') {
          const remoteData = JSON.parse(content) as ObservationData;
          // 로컬 manifest 정보가 없어 최신 판정 불가 → attendance와 동일하게 preferRemote
          const merged = await mergeAndWriteLocked(
            this.storage,
            filename,
            remoteData,
            (local) =>
              mergeObservations(local, remoteData, true, currentTerm, lastClosedTerm, lastClosedAt),
            ' (first download)',
          );
          downloadedFileInfo = await this.convergeMergedFile(
            folder.id,
            filename,
            merged,
            remoteInfo,
          );
        } else {
          const parsed = JSON.parse(content) as unknown;
          const replaced = await this.replaceParsedRemoteJsonIfLocalUnchanged(
            filename,
            null,
            remoteInfo.checksum,
            parsed,
          );
          if (!replaced) {
            conflicts.push({
              filename,
              localModified: 'content-mismatch',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
              kind: 'json',
              baselineChecksum: null,
              localChecksum: await this.readStoredChecksum(filename),
              remoteChecksum: remoteInfo.checksum,
            });
            continue;
          }
        }
        updatedFiles[filename] = downloadedFileInfo;
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
      const remoteDynamic = Object.keys(remoteManifest.files).filter((f) =>
        f.startsWith('note-body--'),
      );
      const allDynamic = Array.from(new Set([...localDynamic, ...remoteDynamic]));

      for (const filename of allDynamic) {
        if (updatedDeletions[filename]) continue;
        const remoteInfo = remoteManifest.files[filename];
        const localInfo = localManifest?.files[filename];

        if (!remoteInfo) {
          skipped.push(filename);
          continue;
        }

        // 동적 파일은 장부에 기준이 있는데 실제 파일이 없으면 사용자가 삭제한 상태다.
        // 여기서 되살리지 않고 다음 push가 원격 파일과 양쪽 장부를 함께 정리한다.
        if (localInfo) {
          const localData = await this.storage.read<unknown>(filename);
          if (localData === null) {
            skipped.push(filename);
            console.log(`[SyncFromCloud]   ${filename}: SKIP (로컬 삭제 전파 대기)`);
            continue;
          }
          if (localInfo.checksum === remoteInfo.checksum) {
            skipped.push(filename);
            continue;
          }
        }

        if (localInfo && localInfo.checksum !== remoteInfo.checksum) {
          const localChecksumBeforeDownload = await this.readStoredChecksum(filename);
          const decision = classifySyncThreeWay({
            baselineChecksum: localInfo.checksum,
            localChecksum: localChecksumBeforeDownload,
            remoteChecksum: remoteInfo.checksum,
          });

          if (decision === 'converged') {
            updatedFiles[filename] = remoteInfo;
            localManifestChanged = true;
            skipped.push(filename);
            continue;
          }

          if (decision === 'remote-only') {
            const replaced = await this.replaceRemoteJsonIfLocalUnchanged(
              filename,
              localChecksumBeforeDownload,
              remoteInfo,
              remoteFiles,
            );
            if (replaced) {
              updatedFiles[filename] = remoteInfo;
              downloaded.push(filename);
              continue;
            }
          }

          conflicts.push({
            filename,
            localModified: 'content-mismatch',
            remoteModified: remoteInfo.lastModified,
            localDeviceName: this.deviceName,
            remoteDeviceName: remoteManifest.deviceName,
            kind: 'json',
            baselineChecksum: localInfo.checksum,
            localChecksum: localChecksumBeforeDownload,
            remoteChecksum: remoteInfo.checksum,
          });
          continue;
        }

        // 위 공통 3-way에서 처리되지 않은 레거시 분기.
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
            kind: 'json',
            baselineChecksum: localInfo.checksum,
            localChecksum: await this.readStoredChecksum(filename),
            remoteChecksum: remoteInfo.checksum,
          });
          continue;
        }

        // 매니페스트 미등록 + 로컬 storage 실제 존재 → silent 덮어쓰기 방지
        // (note-cloud-sync 첫 활성화 시 기존 사용자의 로컬 노트 본문 보호)
        const driveFile = remoteFiles.find((f) => f.name === `${filename}.json`);
        if (driveFile) {
          const localData = await this.storage.read<unknown>(filename);
          if (localData !== null) {
            conflicts.push({
              filename,
              localModified: 'unknown',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
              kind: 'json',
              baselineChecksum: null,
              localChecksum: await computeSyncChecksum(JSON.stringify(localData)),
              remoteChecksum: remoteInfo.checksum,
            });
            console.log(
              `[SyncFromCloud]   ${filename}: 🔶 CONFLICT (동적, manifest 미등록 + 로컬 존재)`,
            );
            continue;
          }

          const parsed = await this.downloadVerifiedJson(filename, remoteInfo, remoteFiles);
          const replaced = await this.replaceParsedRemoteJsonIfLocalUnchanged(
            filename,
            null,
            remoteInfo.checksum,
            parsed,
          );
          if (!replaced) {
            conflicts.push({
              filename,
              localModified: 'content-mismatch',
              remoteModified: remoteInfo.lastModified,
              localDeviceName: this.deviceName,
              remoteDeviceName: remoteManifest.deviceName,
              kind: 'json',
              baselineChecksum: null,
              localChecksum: await this.readStoredChecksum(filename),
              remoteChecksum: remoteInfo.checksum,
            });
            continue;
          }
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
      const remoteBinaryKeys = Object.keys(remoteManifest.files).filter(
        (f) => f.startsWith('obs-attachments/') || f.startsWith('student-photos/'),
      );
      const allBinaryKeys = Array.from(new Set([...localBinaryKeys, ...remoteBinaryKeys]));

      for (const relPath of allBinaryKeys) {
        if (isPendingRestoration(relPath)) {
          skipped.push(relPath);
          continue;
        }
        if (updatedDeletions[relPath]) continue;
        const remoteInfo = remoteManifest.files[relPath];
        const localInfo = localManifest?.files[relPath];

        if (!remoteInfo) {
          skipped.push(relPath);
          continue;
        }

        const localBytesBeforeDownload = await this.storage.readBinary(relPath);
        const localChecksumBeforeDownload = await computeBinarySyncChecksum(
          relPath,
          localBytesBeforeDownload,
        );
        const decision =
          localInfo && localBytesBeforeDownload === null
            ? 'local-only'
            : classifySyncThreeWay({
                baselineChecksum: localInfo?.checksum ?? null,
                localChecksum: localChecksumBeforeDownload,
                remoteChecksum: remoteInfo.checksum,
              });

        if (decision === 'unchanged' || decision === 'converged' || decision === 'recovered') {
          if (decision !== 'unchanged') updatedFiles[relPath] = remoteInfo;
          skipped.push(relPath);
          continue;
        }

        if (decision === 'local-only') {
          skipped.push(relPath);
          continue;
        }

        if (decision === 'concurrent' || decision === 'unknown-concurrent') {
          conflicts.push({
            filename: relPath,
            localModified: 'content-mismatch',
            remoteModified: remoteInfo.lastModified,
            localDeviceName: this.deviceName,
            remoteDeviceName: remoteManifest.deviceName,
            kind: 'binary',
            baselineChecksum: localInfo?.checksum ?? null,
            localChecksum: localChecksumBeforeDownload,
            remoteChecksum: remoteInfo.checksum,
          });
          continue;
        }

        // 충돌(양쪽 다 변경) — 바이너리는 append-only id 기반이라 덮어쓰기 충돌 없음.
        // latest 정책: 무조건 다운로드(리모트 우선). ask 정책: 마찬가지로 다운로드(바이너리 병합 불가).
        // Drive 파일명: obs-attachments/x.png → obs-attachments__x.png.json
        const driveFilename = remoteInfo.driveFilename ?? `${relPath.replace(/\//g, '__')}.json`;
        const driveFile = remoteFiles.find((f) => f.name === driveFilename);
        if (!driveFile) {
          skipped.push(relPath);
          console.log(`[SyncFromCloud]   ${relPath}: SKIP (Drive 바이너리 래퍼 없음)`);
          continue;
        }

        const content = await this.drivePort.downloadSyncFile(driveFile.id);
        const downloadedChecksum = await computeSyncChecksum(content);
        if (downloadedChecksum !== remoteInfo.checksum) {
          throw new Error(`드라이브 ${relPath} 파일이 동기화 중 다시 변경되었습니다.`);
        }
        let wrapper: { __binaryBase64?: string; __relPath?: string };
        try {
          wrapper = JSON.parse(content) as { __binaryBase64?: string; __relPath?: string };
        } catch {
          console.warn(`[SyncFromCloud]   ${relPath}: SKIP (JSON 파싱 실패)`);
          skipped.push(relPath);
          continue;
        }

        if (wrapper.__relPath !== relPath) {
          throw new Error(`드라이브 ${relPath} 파일의 내부 경로가 일치하지 않습니다.`);
        }

        if (typeof wrapper.__binaryBase64 !== 'string') {
          console.warn(`[SyncFromCloud]   ${relPath}: SKIP (__binaryBase64 필드 없음)`);
          skipped.push(relPath);
          continue;
        }

        // base64 디코드 → writeBinary (대용량 안전 청크 디코드)
        const bytes = base64ToUint8(wrapper.__binaryBase64);
        let written = false;
        await withFileLock(relPath, async () => {
          const currentBytes = await this.storage.readBinary(relPath);
          const currentChecksum = await computeBinarySyncChecksum(relPath, currentBytes);
          if (currentChecksum !== localChecksumBeforeDownload) return;
          if (this.storage.replaceBinaryIfUnchanged) {
            written = await this.storage.replaceBinaryIfUnchanged(relPath, currentBytes, bytes);
          } else {
            await this.storage.writeBinary(relPath, bytes);
            written = true;
          }
        });
        if (!written) {
          conflicts.push({
            filename: relPath,
            localModified: 'content-mismatch',
            remoteModified: remoteInfo.lastModified,
            localDeviceName: this.deviceName,
            remoteDeviceName: remoteManifest.deviceName,
            kind: 'binary',
            baselineChecksum: localInfo?.checksum ?? null,
            localChecksum: localChecksumBeforeDownload,
            remoteChecksum: remoteInfo.checksum,
          });
          continue;
        }
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
    if (downloaded.length > 0 || localManifestChanged) {
      const newLocalManifest: DriveSyncManifest = {
        version: Math.max(2, localManifest?.version ?? remoteManifest.version),
        lastSyncedAt: new Date().toISOString(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        files: updatedFiles,
        deletions: updatedDeletions,
        restorations: updatedRestorations,
      };
      await this.syncRepo.saveLocalManifest(newLocalManifest);
    }

    console.log(
      `[SyncFromCloud] ✅ 완료 | downloaded=${downloaded.length} conflicts=${conflicts.length} skipped=${skipped.length} | downloaded=[${downloaded.join(', ')}]`,
    );
    return { downloaded, conflicts, skipped };
  }
}
