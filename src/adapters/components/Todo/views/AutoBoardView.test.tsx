/**
 * @vitest-environment jsdom
 *
 * 자동 배치 보드 화면 — 실기기 확인 E6c 를 자동 검사로 옮긴 것.
 *
 * 규칙(`todoAutoBoard.ts`)은 이미 테스트가 두껍다. 여기서 잠그는 것은 **그 규칙이 화면까지
 * 실제로 이어졌는가**다. 이 저장소는 "층은 만들었는데 배선을 잊은" 사고를 여러 번 겪었다 —
 * 규칙이 완료 항목을 걸러도 화면이 제 목록을 따로 그리면 아무 소용이 없다.
 *
 * ★ 가장 중요한 단언: **완료한 할 일은 어느 칸에도 그려지지 않는다.**
 *   자동 보드에는 '완료' 칸이 아예 없어서, 완료 항목이 화면에 남으면 옮길 곳이 없는 카드가
 *   떠 있게 되고 "자동 보드가 완료를 건드린다"는 경로가 생긴다.
 *
 * 끌어 옮기는 동작 자체(포인터 제스처)는 여기서 확인하지 않는다 — dnd-kit 의 몫이고,
 * 끌고 난 **뒤**의 확인창 동작은 `BucketMoveConfirm.test.tsx` 가 맡는다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Todo } from '@domain/entities/Todo';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { AutoBoardView } from './AutoBoardView';

const todo = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '할 일',
  completed: false,
  createdAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

function seed(todos: readonly Todo[]): void {
  useTodoStore.setState({ todos, categories: [], loaded: true });
}

beforeEach(() => {
  seed([]);
});

afterEach(cleanup);

describe('네 칸이 항상 그려진다', () => {
  it('할 일이 하나도 없어도 칸 이름과 설명이 보인다', () => {
    render(<AutoBoardView categoryFilter={null} />);

    for (const label of ['분류 대기', '오늘 처리', '진행 중', '예정·대기']) {
      expect(screen.getByText(label), `${label} 칸이 없다`).toBeTruthy();
    }
    expect(screen.getByText('마감일도 확인할 날도 없는 일')).toBeTruthy();
  });
});

describe('★ 완료한 할 일은 보드에 그려지지 않는다 (E6c)', () => {
  it('완료 체크한 할 일이 어느 칸에도 없다', () => {
    seed([
      todo({ id: 'done', text: '끝낸 일', completed: true, dueDate: '2026-08-23' }),
      todo({ id: 'open', text: '남은 일', dueDate: '2026-08-23' }),
    ]);

    render(<AutoBoardView categoryFilter={null} />);

    expect(screen.queryByText('끝낸 일')).toBeNull();
    expect(screen.getByText('남은 일')).toBeTruthy();
  });

  it("status 가 'done' 인 것도 마찬가지다 — 체크와 상태 두 갈래를 모두 막는다", () => {
    seed([todo({ id: 'done2', text: '완료 상태', status: 'done', dueDate: '2026-08-23' })]);

    render(<AutoBoardView categoryFilter={null} />);

    expect(screen.queryByText('완료 상태')).toBeNull();
  });

  it('보관한 할 일도 보드에 없다', () => {
    seed([
      todo({ id: 'arc', text: '보관된 일', archivedAt: '2026-08-20T00:00:00.000Z' }),
      todo({ id: 'open', text: '남은 일' }),
    ]);

    render(<AutoBoardView categoryFilter={null} />);

    expect(screen.queryByText('보관된 일')).toBeNull();
    expect(screen.getByText('남은 일')).toBeTruthy();
  });
});

describe('화면이 규칙대로 칸을 나눈다', () => {
  it('날짜가 없는 일은 분류 대기에 그려진다', () => {
    seed([todo({ id: 'a', text: '날짜 없는 일' })]);

    render(<AutoBoardView categoryFilter={null} />);

    expect(screen.getByText('날짜 없는 일')).toBeTruthy();
  });

  it('카테고리로 걸러내면 그 카테고리만 남는다', () => {
    seed([
      todo({ id: 'a', text: '업무 일', category: 'admin' }),
      todo({ id: 'b', text: '수업 일', category: 'class' }),
    ]);

    render(<AutoBoardView categoryFilter="admin" />);

    expect(screen.getByText('업무 일')).toBeTruthy();
    expect(screen.queryByText('수업 일')).toBeNull();
  });
});

describe('화면이 약속을 글자로도 알려준다', () => {
  it('"완료한 일은 보드에 나오지 않습니다"를 안내한다', () => {
    render(<AutoBoardView categoryFilter={null} />);

    expect(screen.getByText(/완료한 일은 보드에\s*나오지 않습니다/)).toBeTruthy();
  });
});
