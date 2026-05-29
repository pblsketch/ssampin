/**
 * isWidgetWindow — Decision 9 위젯 윈도우 감지 헬퍼
 *
 * **ADR Addendum 1** (Critic v1.2): 본 함수는 **개발자 경험 신호**일 뿐
 * 프라이버시 경계가 아니다. 실제 경계는 `Brand<NoPii>` 타입 + `createNoPiiDto`
 * 팩토리 + IPC 채널 allowlist로 강제된다. 해시 위변조해도 위젯 IPC 채널로
 * 흐르는 데이터는 타입·채널 계층에서 구조적으로 PII가 제거되어 있다.
 *
 * 그럼에도 본 함수는 위젯 윈도우에서 PII reveal/edit 컴포넌트 마운트 자체를
 * 방지하여 UI 사고를 줄이는 1차 방어로 사용된다.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 9 + Addendum 1
 */
export function isWidgetWindow(): boolean {
  if (typeof window === 'undefined') return false;
  // 위젯 라우트는 hash 기반. App.tsx::isWidgetMode()는 `#widget`을 사용하며
  // 향후 라우터 변경 가능성을 고려해 `#/widget` 변형도 함께 인식한다.
  const hash = window.location.hash;
  if (hash === '#widget' || hash.startsWith('#/widget')) return true;
  // 위젯 라우트가 query string으로 표시되는 변형도 안전 처리
  if (window.location.search.includes('mode=widget')) return true;
  return false;
}
