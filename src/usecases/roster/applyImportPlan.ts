/**
 * applyImportPlan.ts
 *
 * planImport 결과 + 사용자 충돌 해결 결정 + 기존 학생 명단을 받아
 * 최종 적용할 새 Student[] 를 반환하는 순수 함수.
 *
 * Repository 호출은 컴포넌트가 결과를 받아서 직접 수행한다 — usecase는
 * 외부 의존 없이 동작하도록 newIdGenerator를 주입받는다.
 *
 * 자세한 로직: `docs/02-design/features/roster-data-consistency.design.md` §5.2
 */

import type { Student } from '@domain/entities/Student';
import type {
  PlanResult,
  ImportAction,
} from '@domain/rules/rosterImportPlan';
import type { ImportReadyStudent } from '@domain/rules/rosterImportRules';

/** 충돌 해결 방식: existingId+":"+ConflictType 키 → 사용자 선택 액션 */
export type ConflictResolutions = ReadonlyMap<string, ImportAction>;

/**
 * planResult + 사용자 결정 + 기존 명단 → 최종 Student[].
 *
 * 동작:
 *  1. matched: 기존 id 보존 + imported 필드로 replace
 *  2. conflicts: resolution(replace/addNew/merge/skip) 별 분기
 *  3. newOnly: newIdGenerator()로 새 id 발급
 *  4. 처리 안 된 기존 학생 (가져오기 명단에 없음): 기본 보존
 */
export function applyImportPlan(
  existing: readonly Student[],
  plan: PlanResult,
  resolutions: ConflictResolutions,
  newIdGenerator: () => string,
): Student[] {
  const result: Student[] = [];
  const handledExistingIds = new Set<string>();

  // 1. matched: 기존 id 보존, imported 필드로 update
  for (const m of plan.matched) {
    const exist = existing.find((s) => s.id === m.existingId);
    if (!exist) continue;
    result.push(mergeStudent(exist, m.imported, 'replace'));
    handledExistingIds.add(exist.id);
  }

  // 2. conflicts: resolution에 따라 분기
  for (const c of plan.conflicts) {
    const action = resolutions.get(c.key) ?? 'skip';
    handledExistingIds.add(c.existing.id);

    switch (action) {
      case 'replace':
        result.push(mergeStudent(c.existing, c.imported, 'replace'));
        break;
      case 'merge':
        result.push(mergeStudent(c.existing, c.imported, 'merge'));
        break;
      case 'addNew':
        result.push(c.existing); // 기존 유지
        result.push(toNewStudent(c.imported, newIdGenerator()));
        break;
      case 'skip':
        result.push(c.existing); // 기존만 유지
        break;
    }
  }

  // 3. newOnly: 새 id로 추가
  for (const n of plan.newOnly) {
    result.push(toNewStudent(n, newIdGenerator()));
  }

  // 4. 처리되지 않은 기존 학생: 가져오기 명단에서 빠진 학생 → 보존
  //    (명시적 삭제는 별도 기능. 본 PDCA에서는 항상 보존)
  for (const exist of existing) {
    if (!handledExistingIds.has(exist.id)) {
      result.push(exist);
    }
  }

  return result;
}

/**
 * mergeStudent — 기존 학생을 imported 데이터로 갱신.
 *
 * - replace: imported의 모든 필드를 적용. status·statusNote·statusChangedAt는
 *            기존 비활성 정보를 보존하기 위해 유지.
 * - merge: 기존 빈 필드만 imported로 채움 (기존 입력 유지)
 *
 * 두 경우 모두 id는 기존 학생의 id를 보존 (외부 참조 무결성).
 */
function mergeStudent(
  existing: Student,
  imported: ImportReadyStudent,
  mode: 'replace' | 'merge',
): Student {
  if (mode === 'replace') {
    return {
      ...existing,
      name: imported.name,
      studentNumber: imported.studentNumber,
      phone: imported.phone,
      parentPhone: imported.parentPhone,
      parentPhoneLabel: imported.parentPhoneLabel,
      parentPhone2: imported.parentPhone2,
      parentPhone2Label: imported.parentPhone2Label,
      birthDate: imported.birthDate,
      isVacant: imported.isVacant,
      // status 계열은 보존 (외부에서 변경된 비활성 상태 유지)
    };
  }
  // merge: 기존 빈 필드만 채움
  return {
    ...existing,
    name: existing.name || imported.name,
    studentNumber: existing.studentNumber ?? imported.studentNumber,
    phone: existing.phone || imported.phone,
    parentPhone: existing.parentPhone || imported.parentPhone,
    parentPhoneLabel: existing.parentPhoneLabel || imported.parentPhoneLabel,
    parentPhone2: existing.parentPhone2 || imported.parentPhone2,
    parentPhone2Label: existing.parentPhone2Label || imported.parentPhone2Label,
    birthDate: existing.birthDate || imported.birthDate,
  };
}

function toNewStudent(imp: ImportReadyStudent, id: string): Student {
  return {
    id,
    name: imp.name,
    studentNumber: imp.studentNumber,
    phone: imp.phone,
    parentPhone: imp.parentPhone,
    parentPhoneLabel: imp.parentPhoneLabel,
    parentPhone2: imp.parentPhone2,
    parentPhone2Label: imp.parentPhone2Label,
    birthDate: imp.birthDate,
    isVacant: imp.isVacant,
  };
}
