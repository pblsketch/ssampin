/**
 * Analytics 추상 인터페이스 (Port)
 * infrastructure 레이어에서 구현
 */
export interface IAnalyticsPort {
  /**
   * 이벤트를 추적한다. Fire-and-forget — 절대 await 하지 않는다.
   * UI 스레드를 블로킹하지 않으며, 실패해도 예외를 던지지 않는다.
   */
  track(event: string, properties?: Record<string, unknown>): void;

  /**
   * 메모리 버퍼에 쌓인 이벤트를 즉시 전송한다.
   * 앱 종료 시 호출한다.
   */
  flush(): Promise<void>;

  /** 익명 디바이스 ID를 설정한다. */
  setDeviceId(id: string): void;

  /** 앱 버전을 설정한다. */
  setAppVersion(version: string): void;
}
