/**
 * @vitest-environment jsdom
 *
 * 홈 대시보드 할 일 입력 — 저장 실패가 조용히 사라지던 문제 (2026-10-12·11-03 신고).
 *
 * "홈 대시보드에서나 할 일 탭에서나 할 일을 입력하면 목록에 뜨지 않습니다."
 * 할 일 탭은 v2.5.5 에서 실패를 알리게 고쳤지만, 홈의 확장 편집기(TodoEditor)는 빠져 있었다.
 * 입력칸을 먼저 비우고 저장을 기다렸는데 실패를 받는 곳이 없어 글만 사라졌다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodoEditor } from './TodoEditor';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useToastStore } from '@adapters/components/common/Toast';

const originalTodoState = useTodoStore.getState();
const originalToastState = useToastStore.getState();

beforeEach(() => {
  useTodoStore.setState({ todos: [] });
});

afterEach(() => {
  cleanup();
  useTodoStore.setState(originalTodoState, true);
  useToastStore.setState(originalToastState, true);
});

describe('TodoEditor — 저장 실패', () => {
  it('저장하지 못하면 입력한 글을 되돌려 놓고 이유를 알린다', async () => {
    const addTodo = vi.fn().mockRejectedValue(new Error('디스크에 쓰지 못했습니다'));
    useTodoStore.setState({ addTodo });
    render(<TodoEditor />);
    const input = screen.getByPlaceholderText('새로운 할 일 추가... (Enter)') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '가정통신문 걷기' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(input.value).toBe('가정통신문 걷기'));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toContain(
        '할 일을 저장하지 못했어요',
      ),
    );
    expect(addTodo).toHaveBeenCalledTimes(1);
  });

  it('저장에 성공하면 입력칸이 비워진다', async () => {
    const addTodo = vi.fn().mockResolvedValue(undefined);
    useTodoStore.setState({ addTodo });
    render(<TodoEditor />);
    const input = screen.getByPlaceholderText('새로운 할 일 추가... (Enter)') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '가정통신문 걷기' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(addTodo).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('');
  });
});
