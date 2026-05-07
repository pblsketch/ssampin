/**
 * studentCountRules.ts
 *
 * 명렬 학생 수 조절(setStudentCount) 안전화를 위한 순수 도메인 함수.
 *
 * 기존: 학생 수 감소 시 끝번호 학생을 무경고로 slice → 활성 학생 데이터 손실 위험.
 *
 * 신규: 비활성 학생부터 끝번호 우선 제거. 그래도 부족하면 활성 학생 제거 대상
 *       목록을 반환하여 컴포넌트가 사용자 확인 모달을 노출하도록 한다.
 *
 * 자세한 설계: `docs/02-design/features/roster-data-consistency.design.md` §6.1
 */

import type { Student } from '@domain/entities/Student';
import { isStudentInactive } from './studentActivity';

/**
 * 학생 수 감소 계획 결과.
 *
 * - `safe`: 비활성 학생만 제거하면 충분 → 즉시 적용 안전
 * - `requiresConfirm`: 활성 학생도 제거해야 함 → 사용자 confirm 모달 필요
 */
export type ReduceCountPlan =
  | {
      readonly kind: 'safe';
      readonly newStudents: readonly Student[];
      readonly removedInactive: readonly Student[];
    }
  | {
      readonly kind: 'requiresConfirm';
      readonly removedInactive: readonly Student[];
      readonly removedActive: readonly Student[];
      readonly committed: readonly Student[]; // confirm 시 적용할 결과
    };

/**
 * 학생 수를 `targetCount`로 줄이는 계획을 수립.
 *
 * 알고리즘:
 *  1. 학번 오름차순 정렬
 *  2. 끝번호부터 비활성 학생을 우선 제거 (필요한 만큼)
 *  3. 그래도 부족하면 끝번호 활성 학생을 제거 대상으로 표시
 *  4. 활성 학생 제거가 필요하면 `requiresConfirm` 반환
 *
 * 호출 측은 `requiresConfirm`이면 모달을 띄우고, 사용자 confirm 시 `committed`를 적용.
 *
 * @returns 항상 비파괴 계획. 실제 저장은 호출자 책임.
 */
export function planStudentCountReduce(
  current: readonly Student[],
  targetCount: number,
): ReduceCountPlan {
  const sorted = [...current].sort(
    (a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0),
  );

  const toRemoveCount = current.length - targetCount;
  if (toRemoveCount <= 0) {
    // 감소가 아니면 의미 없는 호출 — 안전 케이스로 반환
    return { kind: 'safe', newStudents: sorted, removedInactive: [] };
  }

  // 1단계: 끝번호부터 비활성 학생 우선 수집
  const inactiveFromEnd: Student[] = [];
  for (let i = sorted.length - 1; i >= 0 && inactiveFromEnd.length < toRemoveCount; i--) {
    if (isStudentInactive(sorted[i]!)) {
      inactiveFromEnd.push(sorted[i]!);
    }
  }

  if (inactiveFromEnd.length === toRemoveCount) {
    // 비활성만으로 충분 → 안전
    const removeIds = new Set(inactiveFromEnd.map((s) => s.id));
    const newStudents = sorted.filter((s) => !removeIds.has(s.id));
    return { kind: 'safe', newStudents, removedInactive: inactiveFromEnd };
  }

  // 2단계: 활성 학생도 끝번호부터 추가 제거 필요
  const stillNeed = toRemoveCount - inactiveFromEnd.length;
  const inactiveIdSet = new Set(inactiveFromEnd.map((s) => s.id));

  const activeFromEnd: Student[] = [];
  for (let i = sorted.length - 1; i >= 0 && activeFromEnd.length < stillNeed; i--) {
    const s = sorted[i]!;
    if (inactiveIdSet.has(s.id)) continue; // 이미 제거 대상
    if (!isStudentInactive(s)) {
      activeFromEnd.push(s);
    }
  }

  const allRemoveIds = new Set([
    ...inactiveFromEnd.map((s) => s.id),
    ...activeFromEnd.map((s) => s.id),
  ]);
  const committed = sorted.filter((s) => !allRemoveIds.has(s.id));

  return {
    kind: 'requiresConfirm',
    removedInactive: inactiveFromEnd,
    removedActive: activeFromEnd,
    committed,
  };
}
