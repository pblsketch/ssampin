/**
 * 통계에 남기지 않을 **잡음 오류**를 가려낸다.
 *
 * ★왜 필요한가 (2026-09-01 실측)
 * 8월 한 달 오류 5,888건 중 **5,715건(97%)이 `ResizeObserver` 한 줄**이었다.
 * 진짜 결함은 그 아래 파묻혀 보이지 않았다 — 오류 통계가 사실상 못 쓰는 상태였다.
 *
 * ★`ResizeObserver loop ...` 는 브라우저가 "크기 재는 일을 다음 프레임으로 미뤘다"고
 * 알리는 신호다. 화면이 깨지지도, 기능이 멈추지도 않는다. 크롬 계열이 이걸 전역 오류로
 * 올리기 때문에 잡히는 것뿐이다.
 *
 * ★거르는 기준은 **여기 적힌 것만**이다. "오류가 많으니 대충 줄이자"는 식으로 넓히면,
 * 진짜 결함을 조용히 숨기게 된다. 실제로 같은 기간의 `prompt() is not supported` 168건은
 * 버튼이 아무 동작도 안 하던 **진짜 결함**이었고, 통계에 남아 있었기 때문에 찾아냈다.
 */
const NOISE_PATTERNS: readonly string[] = [
  'ResizeObserver loop completed with undelivered notifications',
  'ResizeObserver loop limit exceeded',
];

/** 통계에 남기지 않을 오류면 true */
export function isNoiseError(message: string): boolean {
  return NOISE_PATTERNS.some((pattern) => message.includes(pattern));
}
