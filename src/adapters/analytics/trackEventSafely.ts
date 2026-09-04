import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@domain/valueObjects/AnalyticsEvent';

/**
 * 스토어(React 밖)에서 쓰는 계측 호출 — **절대 저장 경로를 막지 않는다.**
 *
 * 컨테이너를 동적으로 불러 실패(테스트의 부분 모킹·초기화 전)해도 조용히 넘긴다. 계측은 이름만
 * 담는 부수 효과이지 기능이 아니다 — 계측 때문에 관찰이 저장되지 않으면 본말이 뒤집힌다.
 * 값이 아니라 이름만 담는 규칙(ADR-081)은 호출자가 지킨다(타입이 강제).
 */
export function trackEventSafely<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  void import('@adapters/di/container')
    .then((m) => {
      m.analyticsPort.track(event, properties as Record<string, unknown>);
    })
    .catch(() => {
      /* 계측 실패는 무시 — 저장이 우선이다 */
    });
}
