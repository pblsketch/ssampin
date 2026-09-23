/**
 * 수업 기록 탭의 보기(입력·통계·조회·생기부 초안) 전환 요청 — `classManagementTabIntent` 와 같은 방식.
 *
 * 학기 돌아보기의 [초안 쓰러 가기](ADR-137)가 그 반 수업 기록의 **생기부 초안** 보기로 데려가려고 쓴다.
 * 기존 `RecordFlowIntent` 는 학생이 정해져 있어야 해서, 반만 정해 가는 작은 요청을 따로 둔다.
 * 수업 기록 탭이 아직 없으면(페이지 이동 중) 마운트될 때 consume 으로 받는다.
 * 요청은 잠깐만 유효하다 — 그 사이 탭이 열리지 않았으면 나중에 그 탭을 열 때 엉뚱한 보기로 들어가지 않게 버린다.
 */
export type ClassRecordView = 'input' | 'stats' | 'search' | 'draft';

export const CLASS_RECORD_OPEN_VIEW_EVENT = 'ssampin:class-record-open-view';

/** 이동 중 요청이 살아 있는 시간(ms) — 화면 전환·반 고르기에 충분한 길이. */
const PENDING_TTL_MS = 10_000;

let pendingView: { readonly view: ClassRecordView; readonly at: number } | null = null;

export function requestClassRecordView(view: ClassRecordView): void {
  pendingView = { view, at: Date.now() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(CLASS_RECORD_OPEN_VIEW_EVENT, { detail: view }));
  }
}

export function consumePendingClassRecordView(): ClassRecordView | null {
  const p = pendingView;
  pendingView = null;
  if (p === null || Date.now() - p.at > PENDING_TTL_MS) return null;
  return p.view;
}
