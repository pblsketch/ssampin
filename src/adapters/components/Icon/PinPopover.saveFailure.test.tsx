/**
 * @vitest-environment jsdom
 *
 * 아이콘 창 "오늘 요약"의 할 일 빠른 추가 — 저장 실패가 삼켜지던 문제 (2026-11 조사).
 *
 * 저장이 실패해도 받는 곳이 없어 아무 표시가 없었다. 홈 편집기(TodoEditor)와 같은 방식으로
 * 알리고(`reportTodoSaveFailure`), 아이콘 창에는 토스트 표시기가 없으므로 입력칸 아래에도 적는다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useToastStore } from '@adapters/components/common/Toast';
import { PinPopover } from './PinPopover';

const originalToastState = useToastStore.getState();

function renderPopover(onQuickAdd: (text: string) => Promise<void>): HTMLInputElement {
  render(
    <PinPopover
      now={new Date('2026-11-10T09:00:00')}
      statusTitle="쉬는 시간"
      classes={[]}
      todos={[]}
      lunchMenu={null}
      onToggleTodo={() => undefined}
      onQuickAdd={onQuickAdd}
      onOpenWidget={() => undefined}
      onOpenMain={() => undefined}
    />,
  );
  return screen.getByLabelText('할 일 빠른 추가') as HTMLInputElement;
}

function submit(input: HTMLInputElement, text: string): void {
  fireEvent.change(input, { target: { value: text } });
  const form = input.closest('form');
  if (!form) throw new Error('빠른 추가 입력칸의 form 을 찾지 못했다');
  fireEvent.submit(form);
}

afterEach(() => {
  cleanup();
  useToastStore.setState(originalToastState, true);
  vi.restoreAllMocks();
});

describe('PinPopover — 할 일 빠른 추가', () => {
  it('빠른 추가 실패 시 글을 되돌리고 알린다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onQuickAdd = vi.fn().mockRejectedValue(new Error('디스크에 쓰지 못했습니다'));
    const input = renderPopover(onQuickAdd);

    submit(input, '가정통신문 걷기');

    // 입력칸 아래 안내 — 아이콘 창에는 토스트 표시기가 없다
    expect((await screen.findByRole('alert')).textContent).toContain('저장하지 못했어요');
    expect(input.value).toBe('가정통신문 걷기');
    // 홈 편집기와 같은 알림 경로
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toContain(
        '할 일을 저장하지 못했어요',
      ),
    );
    expect(onQuickAdd).toHaveBeenCalledTimes(1);
  });

  it('다시 글을 치면 실패 안내가 걷힌다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const input = renderPopover(vi.fn().mockRejectedValue(new Error('실패')));

    submit(input, '가정통신문 걷기');
    await screen.findByRole('alert');

    fireEvent.change(input, { target: { value: '가정통신문 걷기 2반' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('저장에 성공하면 입력칸이 비워지고 안내가 없다', async () => {
    const onQuickAdd = vi.fn().mockResolvedValue(undefined);
    const input = renderPopover(onQuickAdd);

    submit(input, '가정통신문 걷기');

    await waitFor(() => expect(input.value).toBe(''));
    expect(onQuickAdd).toHaveBeenCalledWith('가정통신문 걷기');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('저장을 기다리는 동안 Enter 를 연달아 눌러도 한 번만 추가한다', async () => {
    let finish: () => void = () => undefined;
    const onQuickAdd = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const input = renderPopover(onQuickAdd);
    const form = input.closest('form');
    if (!form) throw new Error('빠른 추가 입력칸의 form 을 찾지 못했다');

    fireEvent.change(input, { target: { value: '가정통신문 걷기' } });
    // 같은 순간에 두 번 — 화면이 다시 그려지기 전이다
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await waitFor(() => expect(input.value).toBe(''));
  });
});
