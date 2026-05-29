import type { IAuditLogger } from '@domain/ports/IAuditLogger';
import type { ConsentMode } from '@domain/valueObjects/ConsentMode';

/**
 * RecordConsent — PII 동의 상태 기록 usecase
 *
 * - `persisted` / `session-only` → `consent_grant` sticky 이벤트
 * - `denied` → `consent_deny` sticky 이벤트
 *
 * 또한 결정된 ConsentMode를 호출자에게 반환하여 DI 팩토리가 적절한
 * `IStudentPiiRepository` 구현체(File vs SessionOnly)를 swap할 수 있다.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 10 + §Legal Basis (PIPA §15(2))
 */
export class RecordConsent {
  constructor(private readonly audit: IAuditLogger) {}

  async execute(mode: ConsentMode): Promise<ConsentMode> {
    const action = mode === 'denied' ? 'consent_deny' : 'consent_grant';
    await Promise.resolve(
      this.audit.logPiiAccess({
        action,
        studentIdHash: '',
        capability: 'system',
        timestamp: Date.now(),
        meta: { mode },
      }),
    );
    return mode;
  }
}
