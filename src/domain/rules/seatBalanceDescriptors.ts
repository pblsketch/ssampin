/**
 * SeatBalanceDescriptor — 자리 배치 soft 목적 함수 기술자
 *
 * Decision 3 (2-stage solver):
 * - **Hard 제약** (`forbiddenPairs`, `fixedSeats`, `zones`)은 부울 must-pass.
 * - **Soft 목적** (`balanceDescriptors`)은 연속 스코어, 선언 순서대로 lexicographic.
 *
 * 디폴트 순서 (P4 적용):
 *   `balance.academicLevel` ≻ `balance.gender`
 *
 * 결정적 시드 RNG로 동점 타이브레이크.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 3
 */
export type SeatBalanceKind = 'academicLevel' | 'gender';

export interface SeatBalanceDescriptor {
  readonly kind: SeatBalanceKind;
  /** 선택 가중치 (현재 v1.11은 lexicographic만 사용. weight는 미래 확장용.) */
  readonly weight?: number;
}

/** 디폴트 lexicographic 우선순위 */
export const DEFAULT_BALANCE_ORDER: readonly SeatBalanceKind[] = [
  'academicLevel',
  'gender',
] as const;

/** 두 descriptor를 lexicographic으로 비교. 작은 값 = 우선순위 높음. */
export function compareDescriptors(
  a: SeatBalanceDescriptor,
  b: SeatBalanceDescriptor,
): number {
  const ai = DEFAULT_BALANCE_ORDER.indexOf(a.kind);
  const bi = DEFAULT_BALANCE_ORDER.indexOf(b.kind);
  return ai - bi;
}
