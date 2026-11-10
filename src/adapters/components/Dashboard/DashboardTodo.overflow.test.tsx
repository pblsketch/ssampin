/**
 * @vitest-environment jsdom
 *
 * 홈 할 일 카드 — 20개에서 잘릴 때 잘렸다고 알리고, 방금 추가한 할 일은 자르지 않는다.
 *
 * 신고(2026-10-12·11-03): "홈에서 할 일을 입력하면 목록에 뜨지 않습니다." 저장은 됐는데
 * 새 할 일이 정렬상 뒤에 놓여 20개 밖으로 잘렸고, 잘렸다는 표시가 없었다.
 *
 * 같은 카드가 메인 창·바탕화면 위젯 창·옆핀 창에 놓인다(`TodoWidget` 은 이 컴포넌트를 그대로
 * 내보낸다). 창마다 할 일 화면으로 가는 길이 달라, 길이 없는 창에서는 단추를 그리지 않는다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Todo } from '@domain/entities/Todo';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { useWidgetModalStore } from '@widgets/stores/useWidgetModalStore';
import { todoRepository } from '@adapters/di/container';
import { takeVisibleTodos } from '@adapters/components/Todo/todoOverflow';
import { TodoWidget } from '@widgets/items/TodoWidget';
import { DashboardTodo } from './DashboardTodo';

const originalTodoState = useTodoStore.getState();

/** jsdom 에는 ResizeObserver 가 없다 — 카드 폭을 재지 않으므로(세로 배치) 빈 껍데기면 된다. */
class ResizeObserverStub {
  observe(): void {
    /* 재지 않는다 */
  }
  unobserve(): void {
    /* 재지 않는다 */
  }
  disconnect(): void {
    /* 재지 않는다 */
  }
}

/** 우선순위 높은 미완료 할 일 n개 — 손으로 정한 순서(sortOrder)로 1번이 맨 앞에 온다. */
function urgentTodos(n: number): Todo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `u${i + 1}`,
    text: `급한 일 ${i + 1}`,
    completed: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    priority: 'high' as const,
    dueDate: '2026-01-05',
    sortOrder: i,
  }));
}

async function seed(todos: Todo[]): Promise<void> {
  await todoRepository.saveTodos({ todos });
  useTodoStore.setState({ todos, categories: [], loaded: true, recentlyAddedIds: [] });
}

function overflowNote(): Element | null {
  return document.querySelector('[data-todo-overflow-note]');
}

function setElectronApi(
  api: { navigateToPage?: (page: string) => Promise<void> } | undefined,
): void {
  Object.defineProperty(window, 'electronAPI', { value: api, configurable: true, writable: true });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  window.history.replaceState({}, '', '/');
  setElectronApi(undefined);
  useDesktopWidgetContextStore.setState({ isDesktopWidget: false });
  useWidgetModalStore.setState({ openId: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  setElectronApi(undefined);
  useDesktopWidgetContextStore.setState({ isDesktopWidget: false });
  useWidgetModalStore.setState({ openId: null });
  useTodoStore.setState(originalTodoState, true);
  localStorage.clear();
});

describe('takeVisibleTodos — 자르는 규칙', () => {
  it('넘치지 않으면 그대로 돌려준다', () => {
    const todos = urgentTodos(3);
    expect(takeVisibleTodos(todos, 3, [])).toEqual({ visible: todos, hiddenCount: 0 });
  });

  it('남긴 할 일도 제 정렬 자리에 그대로 있다', () => {
    const todos = urgentTodos(6);
    const { visible, hiddenCount } = takeVisibleTodos(todos, 2, ['u5']);
    expect(visible.map((t) => t.id)).toEqual(['u1', 'u2', 'u5']);
    expect(hiddenCount).toBe(3);
  });
});

describe('홈 할 일 카드 — 잘린 개수', () => {
  it('21개째에 홈 카드가 「외 1개」를 보인다', async () => {
    await seed(urgentTodos(21));
    render(<DashboardTodo />);

    expect(screen.getByText('급한 일 20')).toBeTruthy();
    expect(screen.queryByText('급한 일 21')).toBeNull();
    expect(overflowNote()?.textContent).toContain('외 1개');
  });

  it('20개면 잘린 개수를 보이지 않는다', async () => {
    await seed(urgentTodos(20));
    render(<DashboardTodo />);

    expect(screen.getByText('급한 일 20')).toBeTruthy();
    expect(overflowNote()).toBeNull();
  });

  it('위젯 창의 할 일 위젯도 같은 컴포넌트라 같은 표시를 받는다', async () => {
    expect(TodoWidget).toBe(DashboardTodo);
    await seed(urgentTodos(23));
    render(<TodoWidget />);

    expect(overflowNote()?.textContent).toContain('외 3개');
  });
});

describe('홈 할 일 카드 — 방금 추가한 할 일', () => {
  it('확장 편집기에서 추가한 직후 카드로 돌아와도 방금 추가한 글이 보인다', async () => {
    await seed(urgentTodos(25));

    // 카드를 눌러 연 확장 편집기에서 추가한다
    const editor = render(<DashboardTodo isCompactMode={false} />);
    const input = screen.getByPlaceholderText('새로운 할 일 추가... (Enter)');
    fireEvent.change(input, { target: { value: '가정통신문 걷기' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('가정통신문 걷기')).toBeTruthy();
    editor.unmount();

    // 편집기를 닫고 카드로 돌아온다 — 새 글은 26번째(20개 밖)지만 보여야 한다
    render(<DashboardTodo />);
    expect(screen.getByText('가정통신문 걷기')).toBeTruthy();
    expect(screen.getByText('급한 일 20')).toBeTruthy();
    expect(screen.queryByText('급한 일 21')).toBeNull();
    expect(overflowNote()?.textContent).toContain('외 5개');
  });
});

describe('홈 할 일 카드 — 할 일 화면으로 가는 길', () => {
  it('메인 창에서는 [할 일에서 모두 보기] 가 할 일 화면으로 옮기고, 카드 누르기로 번지지 않는다', async () => {
    await seed(urgentTodos(21));
    const onNavigate = vi.fn((e: Event) => (e as CustomEvent<string>).detail);
    window.addEventListener('ssampin:navigate', onNavigate);
    const onCardClick = vi.fn();
    try {
      render(
        <div onClick={onCardClick}>
          <DashboardTodo />
        </div>,
      );

      fireEvent.click(screen.getByRole('button', { name: '할 일에서 모두 보기' }));

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate.mock.results[0]?.value).toBe('todo');
      expect(onCardClick).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('ssampin:navigate', onNavigate);
    }
  });

  it('위젯 창에서는 앱 안 이벤트가 아니라 메인 창을 띄우는 길로 보낸다', async () => {
    await seed(urgentTodos(21));
    const navigateToPage = vi.fn().mockResolvedValue(undefined);
    setElectronApi({ navigateToPage });
    useDesktopWidgetContextStore.setState({ isDesktopWidget: true });
    const onNavigate = vi.fn();
    window.addEventListener('ssampin:navigate', onNavigate);
    try {
      render(<DashboardTodo />);

      fireEvent.click(screen.getByRole('button', { name: '할 일에서 모두 보기' }));

      expect(navigateToPage).toHaveBeenCalledWith('todo');
      // 위젯 창에는 이 이벤트를 받는 화면이 없다 — 쏘면 단추가 죽는다
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('ssampin:navigate', onNavigate);
    }
  });

  it('위젯 창에 메인 창을 띄울 길이 없으면 단추 없이 글자만 보인다', async () => {
    await seed(urgentTodos(21));
    useDesktopWidgetContextStore.setState({ isDesktopWidget: true });
    render(<DashboardTodo />);

    expect(overflowNote()?.textContent).toBe('외 1개');
    expect(screen.queryByRole('button', { name: '할 일에서 모두 보기' })).toBeNull();
  });

  it('옆핀 창(주소에 mode 가 붙은 창)도 메인 창이 아니다 — 앱 안 이벤트를 쏘지 않는다', async () => {
    await seed(urgentTodos(21));
    window.history.replaceState({}, '', '/?mode=sidePin');
    const navigateToPage = vi.fn().mockResolvedValue(undefined);
    setElectronApi({ navigateToPage });
    const onNavigate = vi.fn();
    window.addEventListener('ssampin:navigate', onNavigate);
    try {
      render(<DashboardTodo />);

      fireEvent.click(screen.getByRole('button', { name: '할 일에서 모두 보기' }));

      expect(navigateToPage).toHaveBeenCalledWith('todo');
      expect(onNavigate).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('ssampin:navigate', onNavigate);
    }
  });

  it('확장 창 안에서 화면을 옮기면 "할 일 창이 열려 있다"는 표시를 남기지 않는다', async () => {
    await seed(urgentTodos(51));
    // 카드를 눌러 확장 창을 연 상태 — WidgetCard 가 이 표시를 세운다
    useWidgetModalStore.setState({ openId: 'todo' });
    const editor = render(<DashboardTodo isCompactMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: '할 일에서 모두 보기' }));
    // 화면이 바뀌면 홈이 통째로 사라진다(닫기 절차를 거치지 않는다)
    editor.unmount();

    expect(useWidgetModalStore.getState().openId).toBeNull();
  });

  it('단추를 누르지 않았으면 그 표시를 건드리지 않는다(닫기 절차가 지운다)', async () => {
    await seed(urgentTodos(51));
    useWidgetModalStore.setState({ openId: 'todo' });
    const editor = render(<DashboardTodo isCompactMode={false} />);

    editor.unmount();

    expect(useWidgetModalStore.getState().openId).toBe('todo');
  });
});
