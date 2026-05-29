import type { PinCapability } from '../valueObjects/PinCapability';

/**
 * PinSession — PIN unlock 후 발행되는 capability 보유 세션 토큰
 *
 * - `capabilities`: 본 세션이 보유한 PII capability 집합
 * - `expiresAt`: 세션 만료 timestamp (Unix ms). PII overlay 5분 idle re-lock과 별개로,
 *   전역 PIN 세션도 자체 만료 기준을 가진다.
 */
export interface PinSession {
  readonly capabilities: readonly PinCapability[];
  readonly expiresAt: number;
}

/** capability 미보유 시 도메인 에러로 throw됨 */
export class PiiAccessDenied extends Error {
  constructor(
    public readonly capability: PinCapability,
    public readonly reason: 'no-session' | 'expired' | 'capability-missing',
  ) {
    super(`PII access denied: ${capability} (${reason})`);
    this.name = 'PiiAccessDenied';
  }
}

/**
 * IPinGate — 도메인 포트. PIN 인증 + capability 검사.
 *
 * Adapter 구현: `src/adapters/pin/ClassManagementPinGate.ts` (P2)
 * - 기존 `classManagement` PIN을 재사용한다 (Decision 2).
 * - 신규 PIN 키 추가 금지.
 */
export interface IPinGate {
  /** PIN으로 잠금 해제. 성공 시 새 세션 발행. */
  unlock(pin: string): Promise<PinSession | null>;

  /** 현재 활성 세션 (없으면 null) */
  currentSession(): PinSession | null;

  /**
   * 지정 capability 미보유 시 `PiiAccessDenied` throw.
   * 통과 시 무반환.
   */
  requireCapability(capability: PinCapability, session: PinSession | null): void;
}
