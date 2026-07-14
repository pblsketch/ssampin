/**
 * Q2 마이그레이션 usecase — 담임 비출결 subcategory 를 tags 로 흡수(멱등 정규화 on load).
 *
 * 설계: docs/02-design/features/record-system-unification-q2-subcategory-to-tags.design.md §4-나
 *
 * 핵심:
 *  - **영속 플래그 없음.** load() 마다 정규화하되 변경이 있을 때만 저장(이미 변환된 건 스킵).
 *    settings 플래그는 Drive 동기화로 전파되어 미변환 기기가 건너뛰는 위험이 있어 채택하지 않음.
 *  - **자가 치유.** 동기화로 받은 미변환 레코드도 post-sync reload 의 정규화에서 흡수된다.
 *  - **비파괴.** subcategory 보존 + tags 에 복사만(additive). 첫 변경 직전 1회 안전 백업.
 *  - **best-effort 영속.** 영속이 실패해도 메모리엔 정규화본을 노출(다음 load 가 멱등 재시도) — 비파괴라 안전.
 */
import type { StudentRecordsData, StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import { normalizeStudentRecordsSubcatToTags } from '@domain/rules/studentRecordRules';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

export interface MigrationOutcome {
  /** 정규화된 레코드(메모리에 반영할 값 — 영속 성패와 무관하게 항상 정규화본). */
  readonly records: readonly StudentRecord[];
  /** 보존된 카테고리(없으면 undefined → 호출자가 기본값 적용). */
  readonly categories?: readonly RecordCategoryItem[];
  /** tags 가 갱신된 레코드 수(0이면 저장·백업 없음). */
  readonly changedCount: number;
  /** 영속 성공 여부(변경 없으면 true). false면 다음 load 가 재시도. */
  readonly persisted: boolean;
}

/**
 * 저장소에서 student-records 를 읽어 정규화하고, 변경이 있으면 1회 백업 후 영속한다.
 * 변경이 없으면 순수 read no-op(저장·백업 없음).
 */
export async function migrateStudentRecordsOnLoad(
  repo: IStudentRecordsRepository,
): Promise<MigrationOutcome> {
  // 읽기→정규화→쓰기 전체를 student-records 파일 락 안에서 — 동기화 병합 쓰기와 겹치면
  // 낡은 스냅샷 기반 저장이 병합본을 통째로 덮는다(2026-07 QA N1). 본문은 이미 fresh-read
  // 구조라 전체 감싸기로 충분하다(락 안에서 같은 파일 락 재획득 없음).
  return withFileLock(SYNC_FILE_KEYS.studentRecords, () => migrateUnsafe(repo));
}

async function migrateUnsafe(repo: IStudentRecordsRepository): Promise<MigrationOutcome> {
  const data = await repo.getRecords();
  const rawRecords = data?.records ?? [];
  const categories = data?.categories;
  const { records, changedCount } = normalizeStudentRecordsSubcatToTags(rawRecords);

  if (changedCount === 0) {
    return { records, ...(categories ? { categories } : {}), changedCount: 0, persisted: true };
  }

  const baseEnvelope: StudentRecordsData = data ?? { records: [] };
  let persisted = false;
  try {
    // 첫 변경 직전 원본 1회 백업(이미 있으면 보존). 비파괴 마이그레이션의 방어망.
    await repo.saveBackupOnce?.({ ...baseEnvelope, records: rawRecords });
    await repo.saveRecords({ ...baseEnvelope, records });
    persisted = true;
  } catch (err) {
    // 영속 실패 → 메모리엔 정규화본을 노출하고 다음 load 가 멱등 재시도(비파괴라 안전).
    console.warn('[Q2 migration] 정규화 영속 실패 — 메모리만 반영, 다음 load 재시도', err);
  }
  return { records, ...(categories ? { categories } : {}), changedCount, persisted };
}
