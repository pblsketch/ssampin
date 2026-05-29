/**
 * AcademicLevel — 학생 학업성취도 5단계 PII 값 객체
 *
 * - `'A' | 'B' | 'C' | 'D' | 'E'` (A 최상위, E 최하위).
 * - 미설정은 `undefined`.
 * - `StudentPiiOverlay`의 일부로만 사용된다.
 *
 * 매핑: ABCDE → 기존 grouping `Level` (high/mid/low)는 `src/adapters/legacy/groupingLevelAdapter.ts::toLegacyLevel`에서 수행.
 * (A·B → high, C → mid, D·E → low)
 *
 * Follow-up #PII-TRACK-1 (v1.12): `Quintile = { rank: 1..5 }` ordinal 타입으로 마이그레이션 예정.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 1, §Hash Functions
 */
export type AcademicLevel = 'A' | 'B' | 'C' | 'D' | 'E';

export const ACADEMIC_LEVELS: readonly AcademicLevel[] = ['A', 'B', 'C', 'D', 'E'] as const;

export function isAcademicLevel(value: unknown): value is AcademicLevel {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' || value === 'E';
}
