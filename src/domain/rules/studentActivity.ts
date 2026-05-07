/**
 * studentActivity.ts
 *
 * 활성 학생 판정의 단일 진실 원천 (Single Source of Truth).
 *
 * 모든 호출처(컴포넌트·스토어·도구·export·도메인 규칙)는 이 모듈의
 * `isStudentActive` / `isStudentInactive` 를 사용해야 한다. `.isVacant`
 * 또는 `status === 'active'` 같은 직접 비교는 마이그레이션 코드와 UI 표시
 * 가드를 제외하면 금지된다(메타 테스트로 강제).
 *
 * 자세한 배경은 `docs/03-analysis/roster-data-consistency.analysis.md` 와
 * `docs/02-design/features/roster-data-consistency.design.md` 의 Phase 1 참조.
 */

import type { StudentStatus } from '@domain/entities/Student';

/**
 * 활성 학생 판정 — 모든 호출처가 이 함수를 사용해야 한다.
 *
 * 우선순위:
 *  1. status가 명시되어 있으면 status === 'active'
 *  2. status가 undefined이면 !isVacant (하위 호환)
 *
 * 두 필드가 불일치하면 status를 신뢰한다.
 * 정상 경로에서는 `useStudentStore.changeStatus`와 `normalizeStudentStatus`가
 * 두 필드를 항상 일치시키므로 불일치 케이스는 외부 sync·legacy 데이터에서만 발생.
 */
export function isStudentActive(
  s: { readonly status?: StudentStatus; readonly isVacant?: boolean },
): boolean {
  if (s.status !== undefined) return s.status === 'active';
  return !s.isVacant;
}

/** `isStudentActive`의 부정. */
export function isStudentInactive(
  s: { readonly status?: StudentStatus; readonly isVacant?: boolean },
): boolean {
  return !isStudentActive(s);
}

/**
 * 학생 데이터를 정규화 — status와 isVacant를 일치시킨다.
 *
 * - status 있음 → isVacant = (status !== 'active')
 * - status 없음, isVacant=true → status = 'withdrawn' (하위 호환 추정값)
 * - 둘 다 없음 → 변경 없음 (기본 'active' 취급, 저장소에는 빈값 그대로)
 *
 * 마이그레이션 시 한 번에 양방향으로 정규화 가능.
 * 이미 정규화된 데이터는 같은 참조를 반환하여 불필요한 set / save를 방지한다.
 */
export function normalizeStudentStatus<
  T extends { status?: StudentStatus; isVacant?: boolean },
>(s: T): T {
  if (s.status !== undefined) {
    const targetVacant = s.status !== 'active';
    if (s.isVacant === targetVacant) return s;
    return { ...s, isVacant: targetVacant };
  }
  // status undefined
  if (s.isVacant === true) {
    return { ...s, status: 'withdrawn' as StudentStatus };
  }
  // 둘 다 없음 — 기본 'active' 취급. 저장소에는 빈값 그대로 두어 불필요한 변경 방지.
  return s;
}

/** 활성 학생만 필터링 (편의 함수, 가독성 향상용). */
export function filterActive<
  T extends { status?: StudentStatus; isVacant?: boolean },
>(list: readonly T[]): T[] {
  return list.filter(isStudentActive);
}

/** 비활성 학생만 필터링. */
export function filterInactive<
  T extends { status?: StudentStatus; isVacant?: boolean },
>(list: readonly T[]): T[] {
  return list.filter(isStudentInactive);
}

/**
 * 배열 단위 정규화 — 변경된 항목이 없으면 같은 참조를 반환.
 * 스토어 load() 마이그레이션에서 사용.
 */
export function normalizeStudentList<
  T extends { status?: StudentStatus; isVacant?: boolean },
>(list: readonly T[]): readonly T[] {
  let dirty = false;
  const next: T[] = list.map((s) => {
    const norm = normalizeStudentStatus(s);
    if (norm !== s) dirty = true;
    return norm;
  });
  return dirty ? next : list;
}
