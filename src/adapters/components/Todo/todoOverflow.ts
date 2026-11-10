/**
 * 홈 카드·확장 편집기의 "앞에서 N개만 보이기" 규칙과, 잘린 나머지를 볼 수 있는 길.
 *
 * ★왜 필요한가(2026-10-12·11-03 신고 "입력해도 목록에 안 뜬다"): 새 할 일은 우선순위가 없고
 * 마감이 오늘이라 정렬상 뒤에 놓인다. 목록을 앞에서 20개(카드)·50개(편집기)만 그리던 탓에
 * 저장은 됐는데 화면에 안 보였고, 잘렸다는 표시도 없었다. 정렬 규칙은 그대로 두고
 * "방금 추가한 것은 자르지 않는다 + 잘린 개수를 알린다"로 고친다.
 */
import type { Todo } from '@domain/entities/Todo';
import { useWidgetModalStore } from '@widgets/stores/useWidgetModalStore';

export interface VisibleTodos {
  /** 화면에 그릴 할 일 — 정렬 순서 그대로 */
  readonly visible: readonly Todo[];
  /** 잘려서 안 보이는 개수 */
  readonly hiddenCount: number;
}

/**
 * 정렬된 목록을 앞에서 `max` 개로 자르되, `keepIds`(방금 추가한 할 일)는 잘리는 자리에
 * 있어도 남긴다. 순서는 바꾸지 않는다 — 남긴 항목도 제 정렬 자리에 그대로 있다.
 */
export function takeVisibleTodos(
  sorted: readonly Todo[],
  max: number,
  keepIds: readonly string[],
): VisibleTodos {
  if (sorted.length <= max) return { visible: sorted, hiddenCount: 0 };
  const keep = new Set(keepIds);
  const visible = sorted.filter((todo, index) => index < max || keep.has(todo.id));
  return { visible, hiddenCount: sorted.length - visible.length };
}

/** 할 일 위젯의 id — 확장 창이 열려 있는지 볼 때 쓴다(`src/widgets/registry.ts`) */
export const TODO_WIDGET_ID = 'todo';

/**
 * 이 창에서 할 일 화면으로 가는 길을 돌려준다. **길이 없으면 null** — 그때는 단추를 그리지 않는다.
 *
 * 같은 카드가 메인 창·바탕화면 위젯 창·옆핀 창에 모두 놓인다. `ssampin:navigate` 는 메인 창의
 * 화면만 받는다 — 다른 창에서 쏘면 아무도 받지 않아 단추가 죽는다(위젯 "출결 기록" 단추 전례).
 * 메인 창이 아니면 메인 창을 띄우는 IPC 로 보내고, 그 IPC 도 없으면(브라우저 미리보기) 길이 없다.
 */
export function resolveTodoPageNavigation(isDesktopWidget: boolean): (() => void) | null {
  if (typeof window === 'undefined') return null;
  const mode = new URLSearchParams(window.location.search).get('mode');
  const outsideMainWindow = isDesktopWidget || mode !== null || window.location.hash === '#widget';
  if (outsideMainWindow) {
    const api = window.electronAPI;
    if (!api?.navigateToPage) return null;
    return () => {
      void api.navigateToPage('todo');
    };
  }
  return () => {
    window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'todo' }));
  };
}

/**
 * 확장 창 안에서 화면을 옮기면 창을 닫는 절차 없이 카드가 사라져 "할 일 창이 열려 있다"는
 * 표시만 남는다. 그대로 두면 홈으로 돌아왔을 때 다른 카드를 눌러도 열리지 않는다.
 */
export function clearStaleTodoModalMark(): void {
  const modal = useWidgetModalStore.getState();
  if (modal.openId === TODO_WIDGET_ID) modal.setOpenId(null);
}
