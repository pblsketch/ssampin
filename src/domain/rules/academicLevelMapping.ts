import type { AcademicLevel } from '../valueObjects/AcademicLevel';
import type { Level } from './groupingRules';

/**
 * academicLevelMapping — ABCDE (5단계) → 3단계 high/mid/low 매핑
 *
 * **Mapping**: A·B → high, C → mid, D·E → low.
 *
 * **Tracking #PII-TRACK-2 (v1.13)**: native 5-level `groupingRules` 도입 후
 * 본 매핑 함수 삭제 예정. 그때까지 transition adapter 역할.
 *
 * 매핑 손실: A와 B의 차이가 grouping 알고리즘 단계에서 사라짐. ADR 명시 trade-off.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Tension 3.3 + Decision 7
 */
export function toLegacyLevel(level?: AcademicLevel): Level | undefined {
  switch (level) {
    case 'A':
    case 'B':
      return 'high';
    case 'C':
      return 'mid';
    case 'D':
    case 'E':
      return 'low';
    default:
      return undefined;
  }
}

