import type { IPinGate, PinSession } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import type { IAuditLogger } from '@domain/ports/IAuditLogger';
import type { PinCapability } from '@domain/valueObjects/PinCapability';

/**
 * RequirePiiCapability — capability 게이트 usecase
 *
 * 입력 capability를 보유한 활성 세션이 없으면 `PiiAccessDenied` throw.
 * 실패는 자동으로 `access_denied` sticky 이벤트로 감사 로그에 남는다.
 *
 * 사용 예 (P5 RosterManagementTab):
 *   ```ts
 *   const require = new RequirePiiCapability(pinGate, auditLogger);
 *   try {
 *     await require.execute('ViewStudentPii');
 *     // 통과 → PII 마스크 해제 진행
 *   } catch (e) {
 *     if (e instanceof PiiAccessDenied) showLockedNotice();
 *   }
 *   ```
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 2 + Decision 5
 */
export class RequirePiiCapability {
  constructor(
    private readonly gate: IPinGate,
    private readonly audit: IAuditLogger,
  ) {}

  /**
   * 주어진 capability 보유 검증. 실패 시 `PiiAccessDenied` throw + audit log.
   *
   * @param capability 요구 capability
   * @param studentIdHash (선택) 대상 학생 ID의 SHA-256 hex. 미지정 시 빈 문자열로 기록.
   * @returns 검증된 활성 세션
   */
  async execute(capability: PinCapability, studentIdHash = ''): Promise<PinSession> {
    const session = this.gate.currentSession();
    try {
      this.gate.requireCapability(capability, session);
    } catch (err) {
      await Promise.resolve(
        this.audit.logPiiAccess({
          action: 'access_denied',
          studentIdHash,
          capability,
          timestamp: Date.now(),
          meta: {
            reason: err instanceof PiiAccessDenied ? err.reason : 'unknown',
          },
        }),
      );
      throw err;
    }
    // session은 requireCapability 통과 시 non-null 보장됨
    return session!;
  }
}
