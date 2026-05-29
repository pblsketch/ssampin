/**
 * ConsentMode — 학생 PII 저장 동의 3-way 선택
 *
 * - `persisted`     : 영구 저장 (FileStudentPiiRepository)
 * - `session-only`  : 이번 세션만 (SessionOnlyStudentPiiRepository, 앱 종료 시 소실)
 * - `denied`        : 동의 거부 (PII 입력 컨트롤 비활성)
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 10 + §Legal Basis (PIPA §15(2))
 */
export type ConsentMode = 'persisted' | 'session-only' | 'denied';

export const CONSENT_MODE_LABELS: Record<ConsentMode, string> = {
  persisted: '영구 저장',
  'session-only': '이번 세션만',
  denied: '거부',
};

export function isConsentMode(value: unknown): value is ConsentMode {
  return value === 'persisted' || value === 'session-only' || value === 'denied';
}
