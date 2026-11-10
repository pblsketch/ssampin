/**
 * @vitest-environment jsdom
 *
 * 할 일 화면(일반 모드 목록) — 하위 할 일 글 고치기·순서 바꾸기.
 *
 * 건의: "세부(하위) 할 일을 추가는 되는데 수정하는 방법, 정렬하는 기능이 있으면 좋겠다."
 *
 * 규칙은 `ManageTodos.subTaskEdit.test.ts` 가 잠근다. 여기서 잠그는 것은 **화면의 단추·입력이
 * 실제 저장까지 이어졌는가**다 — 화면(`Todo`) → 스토어(`useTodoStore`) → 유스케이스 → 저장소를
 * 가짜 없이 그대로 통과시키고, 화면 상태와 **저장소에 남은 값**을 둘 다 본다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SubTask, Todo as TodoType } from '@domain/entities/Todo';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { todoRepository } from '@adapters/di/container';
import { Todo } from './Todo';

const SUBS: readonly SubTask[] = [
  { id: 's1', text: '안내문 초안', completed: false },
  { id: 's2', text: '결재 올리기', completed: false },
  { id: 's3', text: '가정통신문 배부', completed: true },
];

const PARENT: TodoType = {
  id: 't1',
  text: '현장체험학습 준비',
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  priority: 'none',
  subTasks: SUBS,
};

const originalTodoState = useTodoStore.getState();

/** 화면에 그려진 하위 할 일 글을 위에서부터 — 줄마다 하나씩 있는 삭제 단추로 줄을 찾는다. */
function renderedSubTexts(): string[] {
  return screen
    .getAllByLabelText('하위 할 일 삭제')
    .map((button) => button.closest('li')?.querySelector(':scope > span')?.textContent ?? '');
}

function storeSubs(): readonly SubTask[] {
  return useTodoStore.getState().todos.find((t) => t.id === 't1')?.subTasks ?? [];
}

async function savedSubs(): Promise<readonly SubTask[]> {
  const data = await todoRepository.getTodos();
  return data?.todos.find((t) => t.id === 't1')?.subTasks ?? [];
}

/** 하위 할 일 한 줄(li) — 그 줄 안의 단추만 고르기 위해. */
function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest('li');
  if (!row) throw new Error(`"${text}" 줄을 찾지 못했다`);
  return row;
}

beforeEach(async () => {
  localStorage.clear();
  await todoRepository.saveTodos({ todos: [PARENT] });
  useTodoStore.setState({ todos: [PARENT], categories: [], loaded: true });
});

afterEach(() => {
  cleanup();
  useTodoStore.setState(originalTodoState, true);
  localStorage.clear();
});

describe('하위 할 일 글 고치기', () => {
  it('더블클릭 → Enter 저장', async () => {
    render(<Todo />);

    fireEvent.doubleClick(screen.getByText('결재 올리기'));
    const input = screen.getByLabelText('하위 할 일 내용') as HTMLInputElement;
    expect(input.value).toBe('결재 올리기');

    fireEvent.change(input, { target: { value: '교감 결재 올리기' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.queryByLabelText('하위 할 일 내용')).toBeNull();
    expect(screen.getByText('교감 결재 올리기')).toBeTruthy();
    expect(storeSubs().map((s) => s.text)).toEqual([
      '안내문 초안',
      '교감 결재 올리기',
      '가정통신문 배부',
    ]);
    // 화면만 바뀌고 저장이 빠지는 일이 없게 — 저장소에 남은 값까지 본다.
    await waitFor(async () =>
      expect((await savedSubs()).map((s) => s.text)).toEqual([
        '안내문 초안',
        '교감 결재 올리기',
        '가정통신문 배부',
      ]),
    );
  });

  it('연필 단추로도 고칠 수 있고, 바깥을 누르면(blur) 저장된다', async () => {
    render(<Todo />);

    fireEvent.click(within(rowOf('안내문 초안')).getByLabelText('하위 할 일 수정'));
    const input = screen.getByLabelText('하위 할 일 내용') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '안내문 최종본' } });
    fireEvent.blur(input);

    expect(screen.queryByLabelText('하위 할 일 내용')).toBeNull();
    expect(storeSubs()[0]?.text).toBe('안내문 최종본');
    await waitFor(async () => expect((await savedSubs())[0]?.text).toBe('안내문 최종본'));
  });

  it('Esc 는 원래 글로 되돌린다 — 뒤따르는 blur 도 저장하지 않는다', async () => {
    render(<Todo />);
    const before = useTodoStore.getState().todos;

    fireEvent.doubleClick(screen.getByText('결재 올리기'));
    const input = screen.getByLabelText('하위 할 일 내용') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '지워질 글' } });
    // 입력이 사라지며 blur 가 곧바로 뒤따라온다(크롬·Electron) — 화면이 다시 그려지기 전이라
    // 입력은 아직 붙어 있고 "수정 중" 상태값도 옛것이다. 그때 취소한 글이 저장되면 안 된다.
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' });
      fireEvent.blur(input);
    });

    expect(screen.queryByLabelText('하위 할 일 내용')).toBeNull();
    expect(screen.getByText('결재 올리기')).toBeTruthy();
    expect(screen.queryByText('지워질 글')).toBeNull();
    expect(useTodoStore.getState().todos).toBe(before);
    expect((await savedSubs()).map((s) => s.text)).toEqual(SUBS.map((s) => s.text));
  });

  it('조합 중 Enter 는 저장하지 않는다', () => {
    render(<Todo />);
    const before = useTodoStore.getState().todos;

    fireEvent.doubleClick(screen.getByText('결재 올리기'));
    const input = screen.getByLabelText('하위 할 일 내용') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '교감 결' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    // 아직 고치는 중이다 — 입력이 그대로 있고 아무것도 저장되지 않았다.
    expect(screen.getByLabelText('하위 할 일 내용')).toBe(input);
    expect(useTodoStore.getState().todos).toBe(before);

    // 조합이 끝난 뒤의 Enter 는 저장한다.
    fireEvent.change(input, { target: { value: '교감 결재' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(storeSubs()[1]?.text).toBe('교감 결재');
  });

  it('빈 글로 저장하면 원래 글이 남는다', () => {
    render(<Todo />);
    const before = useTodoStore.getState().todos;

    fireEvent.doubleClick(screen.getByText('결재 올리기'));
    const input = screen.getByLabelText('하위 할 일 내용') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('결재 올리기')).toBeTruthy();
    expect(useTodoStore.getState().todos).toBe(before);
  });

  it('완료한 하위 할 일은 고칠 수 없다 — 더블클릭해도 입력이 안 뜨고 연필도 없다', () => {
    render(<Todo />);

    fireEvent.doubleClick(screen.getByText('가정통신문 배부'));

    expect(screen.queryByLabelText('하위 할 일 내용')).toBeNull();
    expect(within(rowOf('가정통신문 배부')).queryByLabelText('하위 할 일 수정')).toBeNull();
  });
});

describe('하위 할 일 순서 바꾸기·단추 이름', () => {
  it('단추에 한국어 aria-label 이 있다', () => {
    render(<Todo />);

    const row = within(rowOf('결재 올리기'));
    for (const label of [
      '하위 할 일 위로',
      '하위 할 일 아래로',
      '하위 할 일 수정',
      '하위 할 일 삭제',
    ]) {
      expect(row.getByLabelText(label), `${label} 단추가 없다`).toBeTruthy();
    }
    expect(screen.getAllByLabelText('하위 할 일 삭제')).toHaveLength(SUBS.length);
  });

  it('맨 위 줄의 [위로]와 맨 아래 줄의 [아래로]는 눌리지 않는다', () => {
    render(<Todo />);
    const disabled = (text: string, label: string): boolean =>
      (within(rowOf(text)).getByLabelText(label) as HTMLButtonElement).disabled;

    expect(disabled('안내문 초안', '하위 할 일 위로')).toBe(true);
    expect(disabled('안내문 초안', '하위 할 일 아래로')).toBe(false);
    expect(disabled('결재 올리기', '하위 할 일 위로')).toBe(false);
    expect(disabled('결재 올리기', '하위 할 일 아래로')).toBe(false);
    expect(disabled('가정통신문 배부', '하위 할 일 위로')).toBe(false);
    expect(disabled('가정통신문 배부', '하위 할 일 아래로')).toBe(true);
  });

  it('[아래로]를 누르면 한 칸 내려가고 저장된다', async () => {
    render(<Todo />);

    fireEvent.click(within(rowOf('안내문 초안')).getByLabelText('하위 할 일 아래로'));

    expect(renderedSubTexts()).toEqual(['결재 올리기', '안내문 초안', '가정통신문 배부']);
    expect(storeSubs().map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    await waitFor(async () =>
      expect((await savedSubs()).map((s) => s.id)).toEqual(['s2', 's1', 's3']),
    );
  });

  it('[위로]를 누르면 한 칸 올라가고, 글·완료 상태는 그대로다', async () => {
    render(<Todo />);

    fireEvent.click(within(rowOf('가정통신문 배부')).getByLabelText('하위 할 일 위로'));

    expect(storeSubs()).toEqual([SUBS[0], SUBS[2], SUBS[1]]);
    await waitFor(async () => expect(await savedSubs()).toEqual([SUBS[0], SUBS[2], SUBS[1]]));
  });

  it('[삭제]는 그 줄만 지운다', () => {
    render(<Todo />);

    fireEvent.click(within(rowOf('결재 올리기')).getByLabelText('하위 할 일 삭제'));

    expect(screen.queryByText('결재 올리기')).toBeNull();
    expect(storeSubs().map((s) => s.id)).toEqual(['s1', 's3']);
  });
});

describe('화면 문구', () => {
  it('"서브태스크"라는 말이 화면에 남아 있지 않다', () => {
    const { container } = render(<Todo />);

    fireEvent.click(screen.getByTitle('하위 할 일 추가'));

    expect(screen.getByPlaceholderText('하위 할 일 입력...')).toBeTruthy();
    expect(container.innerHTML).not.toContain('서브태스크');
  });
});
