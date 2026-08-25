/**
 * 원클릭업무포털에서 바로 열 수 있는 업무 목록 (화면 표시용).
 *
 * 정본은 그 프로그램의 `PortalTaskCatalog.cs` 이고, 여기 `key` 는 그 값과 글자까지 같아야 한다.
 * 실행 인자를 만드는 쪽은 이 파일이 아니라 메인 프로세스(`electron/ipc/oneclickPortal.ts`)이며,
 * 그쪽도 같은 목록을 따로 들고 대조한다 — 화면이 보낸 값을 그대로 믿지 않기 위해서다.
 *
 * ⚠️ 이 기능은 원클릭업무포털 **v0.1.15 이상**에서만 동작한다. 그보다 낮은 버전이 깔려 있으면
 * 목록 자체를 보여주지 않는다(`OneClickPortalStatus.supportsTasks`).
 *
 * 순서는 그 프로그램 창의 버튼 순서와 맞춰 두었다 — 두 화면을 오가는 선생님이 헷갈리지 않도록.
 */
export interface OneClickPortalTaskItem {
  /** 그 프로그램에 넘기는 이름. 임의로 바꾸면 안 된다. */
  readonly key: string;
  /** 화면에 보이는 이름 */
  readonly label: string;
  readonly icon: string;
}

export const ONECLICK_PORTAL_TASKS: readonly OneClickPortalTaskItem[] = [
  { key: 'nice', label: '나이스', icon: '🏫' },
  { key: 'leave', label: '복무', icon: '🗓️' },
  { key: 'trip', label: '출장', icon: '🚗' },
  { key: 'edufine', label: '에듀파인', icon: '💰' },
  { key: 'draft', label: '기안', icon: '📝' },
  { key: 'purchase', label: '품의', icon: '🧾' },
];

/** 업무 이름(`key`)으로 화면에 쓸 이름을 찾는다. 모르는 값이면 그 값을 그대로 돌려준다. */
export function getOneClickPortalTaskLabel(key: string): string {
  return ONECLICK_PORTAL_TASKS.find((task) => task.key === key)?.label ?? key;
}
