import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';

/**
 * Analytics가 비활성화된 경우 사용하는 Null Object 패턴 구현체.
 * 모든 메서드가 no-op이다.
 */
export class NullAnalyticsAdapter implements IAnalyticsPort {
  track(): void {
    // no-op
  }

  async flush(): Promise<void> {
    // no-op
  }

  setDeviceId(): void {
    // no-op
  }

  setAppVersion(): void {
    // no-op
  }
}
