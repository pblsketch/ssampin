/**
 * rosterImportPlan.ts
 *
 * 명렬 일괄 가져오기 시 기존 학생 id를 최대한 보존하기 위한 매칭 알고리즘.
 *
 * 가져오는 학생을 기존 학생과 (이름 trim + 학번) 기준으로 매칭하여:
 *   - matched: 완전 일치 → 기존 id 재사용 (외부 참조 보존)
 *   - conflicts: 부분 일치 → 사용자 결정 필요 (이름·학번 중 하나만 같음)
 *   - newOnly: 어떤 기존 학생과도 매칭 안 됨 → 새 학생
 *
 * 자세한 배경: `docs/03-analysis/roster-data-consistency.analysis.md` H-2,
 * 설계: `docs/02-design/features/roster-data-consistency.design.md` §5.
 */

import type { Student } from '@domain/entities/Student';
import type { ImportReadyStudent } from './rosterImportRules';
import { isStudentInactive } from './studentActivity';

/**
 * 충돌 종류 — 사용자가 모달에서 결정해야 하는 케이스.
 *
 * - `name_changed`  : 같은 학번에 다른 이름 ("3번 박민수 → 3번 박지수")
 * - `number_changed`: 같은 이름에 다른 학번 ("김철수 5번 → 김철수 7번")
 * - `returning_inactive`: 기존에 비활성(전출/휴학 등)인 학생과 이름이 같은 신규 ("이수진 전출 → 이수진 신규")
 */
export type ConflictType = 'name_changed' | 'number_changed' | 'returning_inactive';

/** 사용자 결정 가능한 액션 */
export type ImportAction = 'replace' | 'addNew' | 'merge' | 'skip';

export interface MatchedRow {
  /** 매칭된 기존 학생 id — 외부 참조 보존 */
  readonly existingId: string;
  /** 가져오는 데이터 (replace 시 적용) */
  readonly imported: ImportReadyStudent;
}

export interface ConflictRow {
  /** 충돌 고유 키 (existingId + ":" + type) — 모달이 resolution Map의 key로 사용 */
  readonly key: string;
  readonly type: ConflictType;
  readonly existing: Student;
  readonly imported: ImportReadyStudent;
}

export interface PlanResult {
  readonly matched: readonly MatchedRow[];
  readonly conflicts: readonly ConflictRow[];
  readonly newOnly: readonly ImportReadyStudent[];
}

/**
 * 매칭 알고리즘 — 외부 참조(student.id)를 최대한 보존.
 *
 * 매칭 우선순위(각 imported 학생에 대해):
 *  1. (이름 trim, 학번) 완전 일치 → matched (id 재사용)
 *  2. (학번) 같지만 이름 다름 → conflict 'name_changed'
 *  3. (이름) 같은 활성 학생 있고 학번 다름 → conflict 'number_changed'
 *  4. (이름) 같은 비활성 학생만 있음 → conflict 'returning_inactive'
 *  5. 어떤 기존 학생과도 매칭 안 됨 → newOnly
 *
 * 이미 매칭에 사용된 기존 학생은 다른 imported에 다시 매칭되지 않는다 (usedExistingIds).
 */
export function planImport(
  existing: readonly Student[],
  imported: readonly ImportReadyStudent[],
): PlanResult {
  const matched: MatchedRow[] = [];
  const conflicts: ConflictRow[] = [];
  const newOnly: ImportReadyStudent[] = [];

  const usedExistingIds = new Set<string>();

  // 인덱스: 빠른 조회용
  const byNumber = new Map<number, Student>();
  const byName = new Map<string, Student[]>();
  for (const s of existing) {
    if (s.studentNumber !== undefined) {
      // 같은 학번이 여러 명일 수는 없지만 방어적으로 첫 번째만 유지
      if (!byNumber.has(s.studentNumber)) byNumber.set(s.studentNumber, s);
    }
    const trimmedName = s.name.trim();
    const list = byName.get(trimmedName) ?? [];
    list.push(s);
    byName.set(trimmedName, list);
  }

  for (const imp of imported) {
    const impName = imp.name.trim();
    const byNum = byNumber.get(imp.studentNumber);
    const byNm = byName.get(impName) ?? [];

    // 우선순위 1: 이름+학번 완전 일치
    if (
      byNum &&
      byNum.name.trim() === impName &&
      !usedExistingIds.has(byNum.id)
    ) {
      matched.push({ existingId: byNum.id, imported: imp });
      usedExistingIds.add(byNum.id);
      continue;
    }

    // 우선순위 2: 학번 같음, 이름 다름 (그 학번이 이미 다른 매칭에 사용 안 됨)
    if (
      byNum &&
      byNum.name.trim() !== impName &&
      !usedExistingIds.has(byNum.id)
    ) {
      conflicts.push({
        key: `${byNum.id}:name_changed`,
        type: 'name_changed',
        existing: byNum,
        imported: imp,
      });
      usedExistingIds.add(byNum.id);
      continue;
    }

    // 우선순위 3: 이름 같은 활성 학생 (학번 다름)
    const activeByName = byNm.find(
      (s) => !usedExistingIds.has(s.id) && !isStudentInactive(s),
    );
    if (activeByName) {
      conflicts.push({
        key: `${activeByName.id}:number_changed`,
        type: 'number_changed',
        existing: activeByName,
        imported: imp,
      });
      usedExistingIds.add(activeByName.id);
      continue;
    }

    // 우선순위 4: 이름 같은 비활성 학생만 있음
    const inactiveByName = byNm.find((s) => !usedExistingIds.has(s.id));
    if (inactiveByName) {
      conflicts.push({
        key: `${inactiveByName.id}:returning_inactive`,
        type: 'returning_inactive',
        existing: inactiveByName,
        imported: imp,
      });
      usedExistingIds.add(inactiveByName.id);
      continue;
    }

    // 우선순위 5: 매칭 없음 = 신규
    newOnly.push(imp);
  }

  return { matched, conflicts, newOnly };
}
