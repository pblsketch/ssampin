import type { HomeroomTab } from './HomeroomTabBar';

/** 담임 업무 하위 탭 전환 커스텀 이벤트 이름 */
export const HOMEROOM_OPEN_TAB_EVENT = 'ssampin:homeroom-open-tab';

/**
 * 페이지 마운트 전에 들어온 탭 요청을 잠시 보관한다.
 *
 * 명령 팔레트 등에서 다른 페이지 → 담임 업무로 이동하는 순간엔 HomeroomPage가 아직
 * 마운트되지 않아 이벤트만으로는 요청을 놓친다. 그래서 마운트 시 consume으로 보강한다.
 * 이미 담임 업무에 떠 있는 경우엔 이벤트 핸들러가 즉시 처리하며 대기열도 함께 비운다.
 */
let pendingTab: HomeroomTab | null = null;

/** 담임 업무 특정 탭 열기 요청 — 떠 있으면 이벤트로 즉시, 새로 진입하면 마운트 시 consume으로 반영 */
export function requestHomeroomTab(tab: HomeroomTab): void {
  pendingTab = tab;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(HOMEROOM_OPEN_TAB_EVENT, { detail: tab }));
  }
}

/** 마운트 시(또는 이벤트 처리 시) 호출 — 대기 중인 탭 요청을 반환하고 비운다 */
export function consumePendingHomeroomTab(): HomeroomTab | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
