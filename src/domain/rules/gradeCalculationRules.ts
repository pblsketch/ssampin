/**
 * 성적 산출 — 환산점/학기 합산 규칙 (순수 함수, 부동소수점 안전).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§4.3)
 * 제1원칙: 학생 개인정보 미포함 — 점수(숫자)만 다룬다.
 *
 * 정밀도(D1): 반영비율 환산·합산의 부동소수점 드리프트를 막기 위해
 * 모든 합산/비교를 센티포인트(×100 정수)로 수행한다.
 * 결시/인정점은 자동 산출하지 않는다(수동 입력 값만 사용).
 */

/** 점수 → 센티(×100 정수). */
function toCents(points: number): number {
  return Math.round(points * 100);
}

/** 센티 → 점수. */
function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * 환산점 = (받은점수 / 만점) × 반영비율(%).
 * 만점이 0 이하이면 0을 반환한다. 센티 정밀도로 반올림한다.
 */
export function convertedScore(score: number, fullScore: number, weightPercent: number): number {
  if (fullScore <= 0) return 0;
  const cents = Math.round((score / fullScore) * weightPercent * 100);
  return fromCents(cents);
}

/** 환산점 합 — 센티 정수 합산 후 환산(드리프트 0). */
export function sumConverted(values: readonly number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/** 학기 환산 원점수 = 지필 환산 합 + 수행 환산 합. */
export function semesterConvertedTotal(
  written: readonly number[],
  performance: readonly number[],
): number {
  return sumConverted([...written, ...performance]);
}

/** 반영비율 합계(%). */
export function totalWeightPercent(weights: readonly number[]): number {
  return fromCents(weights.reduce((acc, w) => acc + toCents(w), 0));
}

/** 반영비율 합계가 기대값(기본 100%)과 정확히 일치하는지(센티 정수 비교). */
export function isWeightComplete(weights: readonly number[], expected = 100): boolean {
  const sum = weights.reduce((acc, w) => acc + toCents(w), 0);
  return sum === toCents(expected);
}
