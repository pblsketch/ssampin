import type {
  StudentRecord,
  StudentRecordsData,
  FieldUpdatedAt,
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

function fieldEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
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
 * - 추적 그룹(reportedToNeis / documents+documentSubmitted / followUp 3필드)이 바뀌면
 *   해당 그룹만 fieldUpdatedAt에 now 스탬프 — 기존 맵은 지우지 않고 승계한다.
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

  const map: { -readonly [K in keyof FieldUpdatedAt]?: string } = {
    ...(fresh.fieldUpdatedAt ?? {}),
  };
  if (changed.has('reportedToNeis')) map.reportedToNeis = now;
  if (changed.has('documents') || changed.has('documentSubmitted')) {
    map.documentGroup = now;
    // H4 불변식 — 빈 배열은 "미존재"로 취급해 fallback 보존(원시 every 금지).
    result.documentSubmitted = deriveDocumentSubmitted(result.documents, result.documentSubmitted);
  }
  if (changed.has('followUpDone') || changed.has('followUp') || changed.has('followUpDate')) {
    map.followUpDone = now;
  }

  result.updatedAt = now;
  if (Object.keys(map).length > 0) result.fieldUpdatedAt = map;
  return result as StudentRecord;
}

export class ManageStudentRecords {
  /**
   * lockKey — 파일 쓰기 락 도메인 키. 기본값 = SYNC_FILE_KEYS.studentRecords 정본.
   * per-instance 체인이 아니라 전역 파일 락(withFileLock)이어야 SyncFromCloud 병합
   * 쓰기·cascade·마이그레이션과 같은 락 도메인에 들어온다 — 인스턴스별 체인은
   * sync vs 사용자 저장 경합(2026-07 QA 재현)을 못 막는다.
   */
  constructor(
    private readonly studentRecordsRepository: IStudentRecordsRepository,
    private readonly lockKey: string = SYNC_FILE_KEYS.studentRecords,
  ) {}

  /**
   * 쓰기 직렬화 — 모든 변이가 "읽기→가공→쓰기"를 통째로 파일 락 안에서 수행한다.
   *
   * 이 usecase의 변이는 전부 파일 전체를 읽어 일부를 바꾸고 전체를 다시 쓰는 구조라,
   * 병렬 실행되면 서로의 스냅샷을 덮어써 마지막 쓰기만 남는다(2026-07 codex QA critical —
   * 일괄 처리·빠른 연속 토글에서 재현). 공개 변이 메서드는 반드시 runExclusive를 경유할 것.
   * 락 안에서 공개 변이 메서드를 중첩 호출하면 교착한다 — 내부 로직은 -Unsafe 변형으로.
   * 이전 작업의 실패는 체인에서 격리되어 다음 작업을 막지 않는다(호출자에게는 그대로 전파).
   */
  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return withFileLock(this.lockKey, fn);
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
      await this.studentRecordsRepository.saveRecords({
        records: [...current, stamped],
        categories: data?.categories,
      });
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
      await this.studentRecordsRepository.saveRecords({
        records,
        categories: data?.categories,
      });
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
      await this.studentRecordsRepository.saveRecords({
        records,
        categories: data?.categories,
      });
      return records;
    });
  }

  delete(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const data = await this.studentRecordsRepository.getRecords();
      const current = data?.records ?? [];
      const records = current.filter((r) => r.id !== id);
      await this.studentRecordsRepository.saveRecords({
        records,
        categories: data?.categories,
      });
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
    await this.studentRecordsRepository.saveRecords(updatedData);
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
        // 태그 편집도 수정 시각을 갱신해 동기화 병합이 최신본으로 인식하게 한다.
        return {
          ...r,
          tags: deduped.length > 0 ? deduped : undefined,
          updatedAt: now,
        };
      });
      if (affected === 0) return { records: current, affected: 0 };
      // 단일 영속(envelope 보존) — categories 등 기존 봉투 유지.
      await this.studentRecordsRepository.saveRecords({ ...(data ?? { records: [] }), records });
      return { records, affected };
    });
  }
}
