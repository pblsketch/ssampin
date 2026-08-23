/**
 * @vitest-environment jsdom
 *
 * 자동 보드 칸 이동 확인창 — 실기기 확인 E6 을 자동 검사로 옮긴 것.
 *
 * **왜 이 창이 있는가.** 자동 보드는 날짜가 자리를 정한다. 그러니 카드를 손으로 옮긴다는 건
 * **선생님이 적어 둔 마감일을 바꾼다**는 뜻이다. 소리 없이 바뀌면 안 되니 무엇이 어떻게
 * 바뀌는지 먼저 보여 주고 받는다.
 *
 * **그래서 여기서 가장 중요한 단언은 "취소하면 아무 일도 안 일어난다"** 이다.
 * 취소했는데도 날짜가 바뀌면 확인창은 있으나 마나이고, 사용자는 자기가 무엇을 잃었는지도
 * 모른다. 그 경로를 눈으로만 확인하던 것을 여기서 잠근다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Todo } from '@domain/entities/Todo';
import { BucketMoveConfirm } from './BucketMoveConfirm';

const TODAY = '2026-08-23';

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '2학년 체험학습 공문 회신',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  dueDate: '2026-08-28',
  ...over,
});

afterEach(cleanup);

describe('무엇이 바뀌는지 먼저 보여준다', () => {
  it('옮길 칸 이름과 할 일 제목이 함께 보인다', () => {
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/오늘 처리/)).toBeTruthy();
    expect(screen.getByText('2학년 체험학습 공문 회신')).toBeTruthy();
  });

  it('마감일이 바뀐다는 사실을 문장으로 알려준다', () => {
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/마감일을 오늘\(8\/23\)로 바꿉니다/)).toBeTruthy();
  });

  it('날짜를 지우는 이동은 "지웁니다"라고 말한다 — 앱이 날짜를 지어내지 않는다', () => {
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="upcoming"
        todayStr={TODAY}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/마감일을 지웁니다/)).toBeTruthy();
  });
});

describe('★ 취소하면 아무 일도 일어나지 않는다 (E6)', () => {
  it('취소를 누르면 onCancel 만 불린다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('취소'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled(); // ← 이게 깨지면 취소해도 날짜가 바뀐다
  });

  it('창 바깥(어두운 곳)을 눌러도 취소다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const backdrop = container.firstElementChild;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('창 안을 눌러도 닫히지 않는다 — 글자를 읽다 눌렀다고 취소되면 안 된다', () => {
    const onCancel = vi.fn();
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('dialog'));

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('옮기기를 눌렀을 때만 실제로 옮긴다', () => {
  it('옮기기를 누르면 onConfirm 만 불린다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="today"
        todayStr={TODAY}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByText('옮기기'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('창을 여는 것만으로는 어느 쪽도 불리지 않는다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <BucketMoveConfirm
        todo={todo()}
        target="inProgress"
        todayStr={TODAY}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
