/**
 * PinCapability — `classManagement` PIN unlock이 부여하는 capability 태그
 *
 * 단일 PIN 재사용 + capability 세분화 (Decision 2). 신규 PIN 키 도입 금지.
 *
 * - `ViewStudentPii`  — PII 마스크 해제 (성별·학업성취도 표시)
 * - `EditStudentPii`  — PII 편집 (입력·수정)
 * - `ImportStudentPii` — `.ssampin` import 시 PII 페이로드 수용
 * - `ExportStudentPii` — Excel/HWPX export 시 PII 컬럼 포함
 *
 * 미해결 결정: v1.11 + 6개월 시점에 차등 정책 부재 시 `{Read, Write}` 2-way로 collapse.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 2 + Decision 8
 * 관련 문서: docs/architecture/pin-capabilities.md
 */
export type PinCapability =
  | 'ViewStudentPii'
  | 'EditStudentPii'
  | 'ImportStudentPii'
  | 'ExportStudentPii';

export const PIN_CAPABILITIES: readonly PinCapability[] = [
  'ViewStudentPii',
  'EditStudentPii',
  'ImportStudentPii',
  'ExportStudentPii',
] as const;

export function isPinCapability(value: unknown): value is PinCapability {
  return (
    value === 'ViewStudentPii' ||
    value === 'EditStudentPii' ||
    value === 'ImportStudentPii' ||
    value === 'ExportStudentPii'
  );
}
