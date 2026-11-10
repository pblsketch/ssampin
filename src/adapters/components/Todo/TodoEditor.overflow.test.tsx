/**
 * @vitest-environment jsdom
 *
 * 홈 확장 편집기 — "입력해도 목록에 안 뜬다"의 근본 원인 (2026-10-12·11-03 신고).
 *
 * 저장은 됐는데 안 보였다. 새 할 일은 우선순위가 없고 마감이 오늘이라 정렬상 뒤에 놓이고,
 * 편집기는 앞에서 50개만 그렸다. 잘렸다는 표시도, 새 줄로 옮겨 가는 동작도 없었다.
 *
 * 화면(TodoEditor) → 스토어 → 유스케이스 → 저장소(localStorage)를 가짜 없이 통과한다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Todo } from '@domain/entities/Todo';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { todoRepository } from '@adapters/di/container';
import { TodoEditor } from './TodoEditor';

const originalTodoState = useTodoStore.getState();
const originalScrollIntoView = Element.prototype.scrollIntoView;

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

/** scrollIntoView 가 불린 줄의 글과 넘긴 옵션 */
let scrolled: { text: string; options: unknown }[];

async function seed(todos: Todo[]): Promise<void> {
  await todoRepository.saveTodos({ todos });
  useTodoStore.setState({ todos, categories: [], loaded: true, recentlyAddedIds: [] });
}

function typeAndEnter(text: string): void {
  const input = screen.getByPlaceholderText('새로운 할 일 추가... (Enter)');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  localStorage.clear();
  scrolled = [];
  // jsdom 에는 scrollIntoView 가 없다 — 어느 줄에 어떤 옵션으로 불렸는지만 받아 둔다.
  Element.prototype.scrollIntoView = function (this: Element, options?: unknown): void {
    scrolled.push({ text: this.textContent ?? '', options });
  };
});

afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  useTodoStore.setState(originalTodoState, true);
  localStorage.clear();
});

describe('TodoEditor — 잘림과 방금 추가한 할 일', () => {
  it('우선순위 높은 미완료 50개가 있어도 방금 추가한 글이 편집기에 보인다', async () => {
    await seed(urgentTodos(50));
    render(<TodoEditor />);

    typeAndEnter('가정통신문 걷기');

    expect(await screen.findByText('가정통신문 걷기')).toBeTruthy();
    // 저장도 실제로 됐다
    const saved = await todoRepository.getTodos();
    expect(saved?.todos.some((t) => t.text === '가정통신문 걷기')).toBe(true);
    // 앞의 50개도 그대로 다 보인다 — 새 줄 때문에 밀려난 것이 없다
    expect(screen.getByText('급한 일 50')).toBeTruthy();
    expect(document.querySelector('[data-todo-overflow-note]')).toBeNull();
  });

  it('방금 추가한 줄이 보이는 곳까지 목록을 옮긴다', async () => {
    await seed(urgentTodos(50));
    render(<TodoEditor />);

    typeAndEnter('가정통신문 걷기');

    await waitFor(() => expect(scrolled.length).toBe(1));
    expect(scrolled[0]?.text).toContain('가정통신문 걷기');
    expect(scrolled[0]?.options).toEqual({ block: 'nearest' });
  });

  it('잘린 할 일이 있으면 잘린 개수를 보인다', async () => {
    await seed(urgentTodos(53));
    render(<TodoEditor />);

    expect(screen.getByText('급한 일 50')).toBeTruthy();
    expect(screen.queryByText('급한 일 51')).toBeNull();
    expect(document.querySelector('[data-todo-overflow-note]')?.textContent).toContain('외 3개');
  });

  it('잘린 목록에 추가해도 새 글은 보이고 잘린 개수는 그대로다', async () => {
    await seed(urgentTodos(53));
    render(<TodoEditor />);

    typeAndEnter('가정통신문 걷기');

    expect(await screen.findByText('가정통신문 걷기')).toBeTruthy();
    expect(document.querySelector('[data-todo-overflow-note]')?.textContent).toContain('외 3개');
  });

  it('50개 이하면 잘린 개수를 보이지 않는다', async () => {
    await seed(urgentTodos(50));
    render(<TodoEditor />);

    expect(document.querySelector('[data-todo-overflow-note]')).toBeNull();
  });
});
