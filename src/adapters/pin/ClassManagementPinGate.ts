import type { IPinGate, PinSession } from '@domain/ports/IPinGate';
import { PiiAccessDenied } from '@domain/ports/IPinGate';
import type { PinCapability } from '@domain/valueObjects/PinCapability';
import { PIN_CAPABILITIES } from '@domain/valueObjects/PinCapability';
import { usePinStore } from '@adapters/stores/usePinStore';

/**
 * ClassManagementPinGate — `classManagement` PIN 재사용 IPinGate 어댑터
 *
 * **Principle 2** (단일 PIN 재사용): 별도 `studentPii` 키 도입 안 함.
 * `classManagement` PIN unlock 시 모든 `PinCapability`를 부여하며,
 * `usePinStore.lastUnlockedAt`을 단일 소스로 사용한다.
 *
 * **세션 만료**: `pinSettings.autoLockMinutes` 와 동일.
 * **PII overlay 5분 idle re-lock**은 별도 컴포넌트(`PinUnlockOverlay`)가 처리한다.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 2 + Decision 9
 */
export class ClassManagementPinGate implements IPinGate {
  /** 세션 만료까지 남은 시간 (ms). lastUnlockedAt + autoLock 분 기반. */
  private static computeExpiresAt(lastUnlockedAt: number, autoLockMinutes: number): number {
    if (autoLockMinutes <= 0) return lastUnlockedAt; // 즉시 만료 정책
    return lastUnlockedAt + autoLockMinutes * 60 * 1000;
  }

  async unlock(pin: string): Promise<PinSession | null> {
    const ok = usePinStore.getState().verify(pin);
    if (!ok) return null;
    return this.currentSession();
  }

  currentSession(): PinSession | null {
    const state = usePinStore.getState();
    const lastUnlockedAt = state.lastUnlockedAt;
    if (lastUnlockedAt === null) return null;

    const settings = state.getPinSettings();
    if (!settings.enabled || !settings.pinHash) return null;
    // classManagement가 보호 켜져있어야 PII gate 의미가 있다.
    // 보호 OFF면 PIN 자체가 무의미하므로 unlock된 것으로 간주.
    const now = Date.now();
    const expiresAt = ClassManagementPinGate.computeExpiresAt(
      lastUnlockedAt,
      settings.autoLockMinutes,
    );
    if (expiresAt <= now) return null;
    return {
      capabilities: PIN_CAPABILITIES,
      expiresAt,
    };
  }

  requireCapability(capability: PinCapability, session: PinSession | null): void {
    if (session === null) {
      throw new PiiAccessDenied(capability, 'no-session');
    }
    if (session.expiresAt <= Date.now()) {
      throw new PiiAccessDenied(capability, 'expired');
    }
    if (!session.capabilities.includes(capability)) {
      throw new PiiAccessDenied(capability, 'capability-missing');
    }
  }
}
