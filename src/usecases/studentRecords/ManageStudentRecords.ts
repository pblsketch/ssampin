import type {
  StudentRecord,
  StudentRecordsData,
  StudentRecordTombstone,
  FieldUpdatedAt,
} from '@domain/entities/StudentRecord';
import {
  TRACKED_GROUP_FIELDS,
  TRACKED_GROUPS,
  STUDENT_RECORD_TOMBSTONE_TTL_MS,
} from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import { deriveDocumentSubmitted } from '@domain/rules/attendanceDocumentPolicy';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

/**
 * update/updateMany에 넘기는 변경 의도 — before/after 모두 "호출 시점 화면 기준".
 *
 * 화면-화면 diff라 디스크 상태와 무관하게 "사용자가 실제로 바꾼 필드"만 추출된다 —
 * 동기화 직후 화면이 낡아도, 안 건드린 필드는 before==after라 patch에서 빠져
 * 디스크(fresh) 값이 보존된다(2026-07 QA B2: 디스크-input diff는 낡은 화면값을
 * 사용자 변경으로 오인해 체크 부활을 강화했다 — 그 설계의 대체).
 */
export interface StudentRecordChange {
  readonly before: StudentRecord;
  readonly after: StudentRecord;
}

/** 시스템 관리 필드 — 사용자 의도(patch)에서 항상 제외(usecase가 관리). */
const SYSTEM_FIELDS: ReadonlySet<string> = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'fieldUpdatedAt',
]);

/** 키 정렬 직렬화 — 외부 작성 경로(AI 브릿지 등)의 객체 키 순서 차이가 위양성 diff가 되지 않게. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as Record<string, unknown>;
      return Object.keys(obj)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = obj[k];
          return acc;
        }, {});
    }
    return v;
  });
}

function fieldEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return stableStringify(a) === stableStringify(b);
}

type MutableStudentRecord = { -readonly [K in keyof StudentRecord]?: StudentRecord[K] };

function setField<K extends keyof StudentRecord>(
  target: MutableStudentRecord,
  key: K,
  value: StudentRecord[K] | undefined,
): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

/**
 * 변경 의도를 락 안의 fresh 레코드에 적용한다(F2 — 절대 SET, CAS 아님).
 * - 바뀐 필드(before≠after)만 after 값으로 SET(after가 undefined면 필드 제거).
 * - 안 바뀐 필드는 patch에서 빠져 fresh 값 보존(낡은 화면 통째 덮어쓰기 차단).
 * - **완전 no-op(바뀐 필드 0)이면 fresh를 그대로 반환** — updatedAt도 안 올린다.
 *   무변경 재저장(그리드 자동저장의 미러 재기록 등)이 record-LWW·(b)백스톱 판정을
 *   오염시켜 상대 기기의 진짜 편집을 이기는 채널을 차단한다.
 * - 추적 그룹(TRACKED_GROUP_FIELDS 정본)이 바뀌면 해당 그룹만 fieldUpdatedAt에 now 스탬프.
 *   **맵 최초 신설 시 미변경 그룹 키를 "이번 편집 직전 updatedAt"으로 백필**한다 —
 *   스키마 도입 전(구버전 시절) 편집이 (c)createdAt으로 강등돼 record-LWW 바닥(P4)이
 *   깨지는 업그레이드 경계와, 무관 편집만 한 레코드의 (b)백스톱이 상대의 항목 편집을
 *   이기는 경로를 함께 봉합한다(백필값 ≤ updatedAt이라 P4 유지).
 * - documentGroup 변경 시 documentSubmitted는 정본 deriveDocumentSubmitted로 재계산(H4).
 */
export function applyRecordChange(
  fresh: StudentRecord,
  change: StudentRecordChange,
  now: string,
): StudentRecord {
  const { before, after } = change;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof StudentRecord>;
  const result: MutableStudentRecord = { ...fresh };
  const changed = new Set<keyof StudentRecord>();

  for (const key of keys) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (fieldEquals(before[key], after[key])) continue;
    changed.add(key);
    setField(result, key, after[key]);
  }

  if (changed.size === 0) return fresh;

  const creatingMap = fresh.fieldUpdatedAt === undefined;
  const map: { -readonly [K in keyof FieldUpdatedAt]?: string } = {
    ...(fresh.fieldUpdatedAt ?? {}),
  };
  const backfill = fresh.updatedAt ?? fresh.createdAt;

  for (const group of TRACKED_GROUPS) {
    const groupChanged = TRACKED_GROUP_FIELDS[group].some((field) => changed.has(field));
    if (groupChanged) {
      map[group] = now;
    } else if (creatingMap) {
      map[group] = backfill;
    }
  }
  if (changed.has('documents') || changed.has('documentSubmitted')) {
    // H4 불변식 — 빈 배열은 "미존재"로 취급해 fallback 보존(원시 every 금지).
    result.documentSubmitted = deriveDocumentSubmitted(result.documents, result.documentSubmitted);
  }

  result.updatedAt = now;
  if (Object.keys(map).length > 0) result.fieldUpdatedAt = map;
  return result as StudentRecord;
}

/**
 * 저장 데이터 조립: 삭제 전파 툼스톤 관리 (buildObservationSaveData 패턴).
 * - 이번 저장에서 사라진 id → 툼스톤 추가(삭제 시각 기록)
 * - 다시 등장한 id → 툼스톤 제거(재작성이 삭제를 이김)
 * - TTL(90일) 지난 툼스톤 → 정리(GC)
 * 모든 학생 기록 저장 경로(add/update/updateMany/delete/카테고리 저장/cascadeTagChange)가
 * 이 함수를 거친다. 봉투는 명시 재조립 — 호출자가 스프레드로 실어온 낡은 deleted 가
 * 새지 않게 하고, 한 경로라도 우회하면 그 저장이 기존 툼스톤을 통째로 떨어뜨린다.
 *
 * 시각 축 주의: 이 도메인의 툼스톤은 ISO **문자열**이다(StudentRecord.updatedAt 과 동일 축).
 * TTL·부활 비교 모두 ISO 문자열 사전순 비교로 수행한다(toISOString은 고정 폭 UTC 포맷이라
 * 사전순 = 시간순).
 *
 * 불변식: 모든 학생 기록 write 경로는 저장 전에 updatedAt(ISO)을 세팅해야 한다
 * (add는 createdAt 백필, update 계열은 applyRecordChange가 스탬프). updatedAt 없는
 * 레코드는 부활 비교에서 ''(최고참)으로 취급돼 어떤 툼스톤에도 진다 — 새 write 경로에서
 * 이 스탬프를 빠뜨리면 그 기록은 삭제 후 재작성해도 영원히 부활하지 못한다.
 */
export function buildStudentRecordsSaveData(
  existing: StudentRecordsData | null,
  next: StudentRecordsData,
  now: string = new Date().toISOString(),
): StudentRecordsData {
  const existingRecords = existing?.records ?? [];
  const nextIds = new Set(next.records.map((r) => r.id));
  const cutoff = new Date(Date.parse(now) - STUDENT_RECORD_TOMBSTONE_TTL_MS).toISOString();

  // 기존 툼스톤 승계 — 재등장(부활) id 와 TTL 경과분은 제거
  const carried = (existing?.deleted ?? []).filter(
    (t) => !nextIds.has(t.id) && t.deletedAt > cutoff,
  );
  const carriedIds = new Set(carried.map((t) => t.id));

  // 이번 저장에서 사라진 id → 새 툼스톤
  const newTombstones: StudentRecordTombstone[] = existingRecords
    .filter((r) => !nextIds.has(r.id) && !carriedIds.has(r.id))
    .map((r) => ({ id: r.id, deletedAt: now }));

  const deleted = [...carried, ...newTombstones];
  const envelope: StudentRecordsData = {
    records: next.records,
    ...(next.categories ? { categories: next.categories } : {}),
  };
  return deleted.length > 0 ? { ...envelope, deleted } : envelope;
}

export class ManageStudentRecords {
  constructor(private readonly studentRecordsRepository: IStudentRecordsRepository) {}

  /**
   * 쓰기 직렬화 — 모든 변이가 "읽기→가공→쓰기"를 통째로 파일 락 안에서 수행한다.
   *
   * 락 키는 SYNC_FILE_KEYS 정본을 직접 사용한다(주입 없음) — 전역 파일 락이어야
   * SyncFromCloud 병합 쓰기·cascade·마이그레이션과 같은 락 도메인에 들어오고,
   * 임의 문자열 주입 지점을 남기면 오타 키가 별개 락 도메인을 만들어 직렬화가
   * 조용히 깨진다(fileWriteLock 규율).
   *
   * 이 usecase의 변이는 전부 파일 전체를 읽어 일부를 바꾸고 전체를 다시 쓰는 구조라,
   * 병렬 실행되면 서로의 스냅샷을 덮어써 마지막 쓰기만 남는다(2026-07 codex QA critical —
   * 일괄 처리·빠른 연속 토글에서 재현). 공개 변이 메서드는 반드시 runExclusive를 경유할 것.
   * 락 안에서 공개 변이 메서드를 중첩 호출하면 교착한다 — 내부 로직은 -Unsafe 변형으로.
   * 이전 작업의 실패는 체인에서 격리되어 다음 작업을 막지 않는다(호출자에게는 그대로 전파).
   */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return withFileLock(SYNC_FILE_KEYS.studentRecords, fn);
  }

  /* ─── 기록 CRUD ────────────────────────────────────── */

  async getAll(): Promise<readonly StudentRecord[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.records ?? [];
  }

  add(record: StudentRecord): Promise<void> {
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      // 신규 레코드는 updatedAt = createdAt 로 시작(동기화 병합 근거).
      const stamped: StudentRecord = {
        ...record,
        updatedAt: record.updatedAt ?? record.createdAt,
      };
      await this.studentRecordsRepository.saveRecords(
        buildStudentRecordsSaveData(data, {
          records: [...current, stamped],
          categories: data?.categories,
        }),
      );
    });
  }

  /**
   * 변경 의도(before→after)를 락 안의 fresh 레코드에 적용해 저장한다.
   * 반환 = 저장된 전체 레코드(authoritative) — 호출자는 이것으로 화면 상태를 갱신한다(P6).
   */
  update(change: StudentRecordChange): Promise<readonly StudentRecord[]> {
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      const now = new Date().toISOString();
      const records = current.map((r) =>
        r.id === change.after.id ? applyRecordChange(r, change, now) : r,
      );
      await this.studentRecordsRepository.saveRecords(
        buildStudentRecordsSaveData(data, { records, categories: data?.categories }),
      );
      return records;
    });
  }

  /**
   * 여러 변경 의도를 한 번의 읽기→적용→쓰기로 원자 갱신 (일괄 처리 전용).
   *
   * 기록별 update()를 병렬로 돌리면 전부 같은 스냅샷에서 출발해 마지막 쓰기만 파일에
   * 남는다 — 일괄 나이스/서류/후속조치 처리는 반드시 이 메서드를 쓸 것.
   */
  updateMany(changes: readonly StudentRecordChange[]): Promise<readonly StudentRecord[]> {
    if (changes.length === 0) return Promise.resolve([]);
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      const now = new Date().toISOString();
      const changeById = new Map(changes.map((c) => [c.after.id, c]));
      const records = current.map((r) => {
        const change = changeById.get(r.id);
        return change ? applyRecordChange(r, change, now) : r;
      });
      await this.studentRecordsRepository.saveRecords(
        buildStudentRecordsSaveData(data, { records, categories: data?.categories }),
      );
      return records;
    });
  }

  delete(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      const records = current.filter((r) => r.id !== id);
      // 사라진 id 는 buildStudentRecordsSaveData 가 툼스톤으로 기록 — 기기 간 삭제 전파(ADR-028).
      await this.studentRecordsRepository.saveRecords(
        buildStudentRecordsSaveData(data, { records, categories: data?.categories }),
      );
    });
  }

  /* ─── 카테고리 관리 ────────────────────────────────── */

  async getCategories(): Promise<readonly RecordCategoryItem[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.categories ?? [...DEFAULT_RECORD_CATEGORIES];
  }

  saveCategories(categories: readonly RecordCategoryItem[]): Promise<void> {
    return this.runExclusive(() => this.saveCategoriesUnsafe(categories));
  }

  /** 락 내부 전용 — 공개 saveCategories를 중첩 호출하면 체인이 자기 자신을 기다려 교착한다. */
  private async saveCategoriesUnsafe(categories: readonly RecordCategoryItem[]): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const updatedData: StudentRecordsData = {
      records: data?.records ?? [],
      categories,
    };
    await this.studentRecordsRepository.saveRecords(buildStudentRecordsSaveData(data, updatedData));
  }

  private async getCategoriesUnsafe(): Promise<readonly RecordCategoryItem[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.categories ?? [...DEFAULT_RECORD_CATEGORIES];
  }

  addCategory(category: RecordCategoryItem): Promise<void> {
    return this.runExclusive(async () => {
      const categories = await this.getCategoriesUnsafe();
      await this.saveCategoriesUnsafe([...categories, category]);
    });
  }

  updateCategory(updated: RecordCategoryItem): Promise<void> {
    return this.runExclusive(async () => {
      const categories = await this.getCategoriesUnsafe();
      const next = categories.map((c) => (c.id === updated.id ? updated : c));
      await this.saveCategoriesUnsafe(next);
    });
  }

  deleteCategory(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const categories = await this.getCategoriesUnsafe();
      const next = categories.filter((c) => c.id !== id);
      await this.saveCategoriesUnsafe(next);
    });
  }

  /* ─── 태그 전파 (변경 의도 기반 일괄) ──────────────── */

  /**
   * 태그 개명(newTag)·삭제(null)를 전 기록에 전파한다 — 변경 의도만 받아
   * 락 안의 fresh 스냅샷에서 재계산한다(P6). 스토어 in-memory 목록으로 계산해
   * 넘기면 동기화가 방금 병합한 레코드를 낡은 스냅샷이 통째로 덮는다(2026-07 QA).
   *
   * @returns 저장된 최신 전체 레코드와 영향 건수 — 호출자는 반환값으로 화면 상태를 갱신한다.
   */
  cascadeTagChange(
    oldTag: string,
    newTag: string | null,
  ): Promise<{ records: readonly StudentRecord[]; affected: number }> {
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      const now = new Date().toISOString();
      let affected = 0;
      const records = current.map((r) => {
        if (!r.tags || !r.tags.includes(oldTag)) return r;
        affected += 1;
        const replaced =
          newTag === null
            ? r.tags.filter((t) => t !== oldTag)
            : r.tags.map((t) => (t === oldTag ? newTag : t));
        // 중복 제거(치환 시 newTag 가 이미 있던 경우) + 빈 배열이면 undefined
        const deduped = replaced.filter((t, i, a) => a.indexOf(t) === i);
        // 스탬프 규율 단일화: 직접 updatedAt만 찍지 않고 applyRecordChange를 경유 —
        // mapless 레코드는 맵 백필까지 함께 이뤄져, 태그 개명의 updatedAt 상승이
        // 상대 기기의 항목 편집을 이기는 창이 열리지 않는다(코드리뷰 스윕 S3).
        const { tags: _oldTags, ...withoutTags } = r;
        const after: StudentRecord = {
          ...withoutTags,
          ...(deduped.length > 0 ? { tags: deduped } : {}),
        };
        return applyRecordChange(r, { before: r, after }, now);
      });
      if (affected === 0) return { records: current, affected: 0 };
      // 단일 영속(envelope 보존) — categories·툼스톤 등 기존 봉투는 조립 함수가 승계.
      await this.studentRecordsRepository.saveRecords(
        buildStudentRecordsSaveData(data, { records, categories: data?.categories }),
      );
      return { records, affected };
    });
  }
}
