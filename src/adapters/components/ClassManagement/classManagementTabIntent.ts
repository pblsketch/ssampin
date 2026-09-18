/**
 * 수업 관리 하위 탭 전환 요청 — `homeroomTabIntent` 와 같은 방식이다.
 *
 * 대시보드의 빠른 학생 기록 카드에서 "수업 출결"로 들어갈 때, 페이지가 아직 마운트되지 않았을 수
 * 있다. 그래서 이벤트로 바로 보내되, 놓칠 경우를 대비해 마운트 시 consume 으로 한 번 더 받는다.
 *
 * ★출결 저장 경로를 새로 만들지 않는다. 여기서 하는 일은 **기존 화면으로 데려다 놓는 것**뿐이고,
 * 저장 규칙은 그 화면(`ClassRecordInputView` 의 출결 섹션)이 그대로 갖는다.
 */

/** 수업 관리 페이지의 하위 탭 id — `ClassManagementPage` 의 TabId 와 같은 값이다. */
export type ClassManagementTab =
  | 'roster'
  | 'record'
  | 'seating'
  | 'progress'
  | 'survey'
  | 'assignment'
  | 'rubric'
  | 'assessment';

export const CLASS_MANAGEMENT_OPEN_TAB_EVENT = 'ssampin:class-management-open-tab';

let pendingTab: ClassManagementTab | null = null;

/** 수업 관리 특정 탭 열기 요청 — 떠 있으면 이벤트로 즉시, 새로 진입하면 마운트 시 consume 으로 반영 */
export function requestClassManagementTab(tab: ClassManagementTab): void {
  pendingTab = tab;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(CLASS_MANAGEMENT_OPEN_TAB_EVENT, { detail: tab }));
  }
}

/** 마운트 시(또는 이벤트 처리 시) 호출 — 대기 중인 탭 요청을 반환하고 비운다 */
export function consumePendingClassManagementTab(): ClassManagementTab | null {
  const t = pendingTab;
  pendingTab = null;
  return t;
}
