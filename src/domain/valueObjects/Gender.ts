/**
 * Gender — 학생 성별 PII 값 객체
 *
 * - `'M' | 'F'`만 보유. 미지정은 `undefined` (도메인 모델에서 명시).
 * - 본 타입은 `StudentPiiOverlay`의 일부로만 사용된다.
 * - `Student` 도메인 코어는 본 타입을 임포트하지 않는다 (Principle 1: PII isolation by construction).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 1
 */
export type Gender = 'M' | 'F';

/** 한국어 라벨 (UI 표시용) */
export const GENDER_LABELS: Record<Gender, string> = {
  M: '남',
  F: '여',
};

export function isGender(value: unknown): value is Gender {
  return value === 'M' || value === 'F';
}
