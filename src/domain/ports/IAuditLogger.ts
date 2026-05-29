import type { PinCapability } from '../valueObjects/PinCapability';

/**
 * PiiAccessEvent — 감사 로그 이벤트 도메인 모델
 *
 * - `studentId`는 SHA-256 해시로 저장 (raw 식별자 비포함).
 * - PII 값(gender, academicLevel) 자체는 절대 로그에 남기지 않는다.
 *
 * 2-tier 보존 정책 (Decision 5):
 * - **Sticky tier** (무한, 1000건/event-type-class 보존): `migrate`, `consent_grant`, `consent_deny`, `access_denied`
 * - **FIFO tier** (5MB rolling): `view`, `update`
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 5, §Hash Functions
 */
export type PiiAuditAction =
  | 'view'
  | 'update'
  | 'consent_grant'
  | 'consent_deny'
  | 'migrate'
  | 'access_denied';

export interface PiiAccessEvent {
  readonly action: PiiAuditAction;
  /** SHA-256 hex digest of studentId. 빈 문자열은 '학생 미지정 이벤트(예: migrate)'. */
  readonly studentIdHash: string;
  /** 행동에 사용된 capability (없으면 'system'). */
  readonly capability: PinCapability | 'system';
  /** Unix ms */
  readonly timestamp: number;
  /** 선택 메타 (PII 값 금지). 예: `{ field: 'gender' }` */
  readonly meta?: Record<string, string | number | boolean>;
}

/** 본 이벤트가 sticky tier 대상인지 */
export function isStickyEvent(action: PiiAuditAction): boolean {
  return (
    action === 'migrate' ||
    action === 'consent_grant' ||
    action === 'consent_deny' ||
    action === 'access_denied'
  );
}

/**
 * IAuditLogger — 도메인 포트. PII 접근/변경 감사 로그.
 *
 * Adapter 구현: `src/adapters/audit/PiiAuditLogger.ts` (P2)
 * - Sticky/FIFO 2-tier 자동 분기 (`isStickyEvent` 기반).
 */
export interface IAuditLogger {
  /** 단일 이벤트 기록. 자동으로 sticky/FIFO 분기. 동기 / 비동기 모두 허용. */
  logPiiAccess(event: PiiAccessEvent): void | Promise<void>;
}
