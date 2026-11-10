/**
 * 하위 할 일의 글 고치기·순서 바꾸기 (건의: "세부 할 일을 추가는 되는데 수정하는 방법,
 * 정렬하는 기능이 있으면 좋겠다").
 *
 * ★ 단언 대상은 **저장소에 실제로 넘어간 배열**이다(`ManageTodos.localOnly.test.ts` 와 같은 이유).
 *   "저장하지 않는다"는 `saveTodos` 가 한 번도 불리지 않았는지로 본다 — 고친 것이 없는데
 *   저장하면 수정 시각과 구글 쓰기 예약만 바뀌어 동기화가 헛돈다.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SubTask, Todo, TodosData } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import { ManageTodos } from '../ManageTodos';

const SUBS: readonly SubTask[] = [
  { id: 's1', text: '안내문 초안', completed: false },
  { id: 's2', text: '결재 올리기', completed: true },
  { id: 's3', text: '가정통신문 배부', completed: false },
];

const base = (over: Partial<Todo> = {}): Todo => ({
  id: 't1',
  text: '현장체험학습 준비',
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  subTasks: SUBS,
  ...over,
});

/** 마지막으로 저장된 데이터를 붙잡아 두는 가짜 저장소. */
function makeRepo(initial: readonly Todo[]) {
  let saved: TodosData | null = null;
  const saveTodos = vi.fn(async (data: TodosData) => {
    saved = data;
  });
  const repo = {
    getTodos: vi.fn(async () => ({ todos: initial, categories: undefined }) as TodosData),
    saveTodos,
  } as unknown as ITodoRepository;
  return {
    repo,
    saveTodos,
    savedTodo: (id: string): Todo | undefined => saved?.todos.find((t) => t.id === id),
    savedSubs: (id: string): readonly SubTask[] =>
      saved?.todos.find((t) => t.id === id)?.subTasks ?? [],
  };
}

describe('ManageTodos.updateSubTaskText — 하위 할 일 글 고치기', () => {
  it('글을 고치면 그 항목만 바뀐다', async () => {
    const other = base({
      id: 't2',
      text: '다른 할 일',
      subTasks: [{ id: 's1', text: '안내문 초안', completed: false }],
    });
    const c = makeRepo([base(), other]);

    const changed = await new ManageTodos(c.repo).updateSubTaskText('t1', 's2', '교감 결재 올리기');

    expect(changed).toBe(true);
    expect(c.savedSubs('t1').map((s) => s.text)).toEqual([
      '안내문 초안',
      '교감 결재 올리기',
      '가정통신문 배부',
    ]);
    // 같은 id 를 가진 다른 할 일의 하위 항목은 건드리지 않는다.
    expect(c.savedTodo('t2')).toBe(other);
  });

  it('앞뒤 공백은 떼고 저장한다', async () => {
    const c = makeRepo([base()]);

    await new ManageTodos(c.repo).updateSubTaskText('t1', 's1', '  안내문 최종본  ');

    expect(c.savedSubs('t1')[0]?.text).toBe('안내문 최종본');
  });

  it('빈 글은 저장하지 않는다', async () => {
    const c = makeRepo([base()]);
    const usecase = new ManageTodos(c.repo);

    expect(await usecase.updateSubTaskText('t1', 's1', '')).toBe(false);
    expect(await usecase.updateSubTaskText('t1', 's1', '   ')).toBe(false);

    expect(c.saveTodos).not.toHaveBeenCalled();
  });

  it('같은 글이면 저장하지 않는다', async () => {
    const c = makeRepo([base()]);
    const usecase = new ManageTodos(c.repo);

    expect(await usecase.updateSubTaskText('t1', 's1', '안내문 초안')).toBe(false);
    // 공백만 다른 것도 같은 글이다.
    expect(await usecase.updateSubTaskText('t1', 's1', ' 안내문 초안 ')).toBe(false);

    expect(c.saveTodos).not.toHaveBeenCalled();
  });

  it('없는 할 일·없는 하위 항목이면 저장하지 않는다', async () => {
    const c = makeRepo([base()]);
    const usecase = new ManageTodos(c.repo);

    expect(await usecase.updateSubTaskText('없는할일', 's1', '새 글')).toBe(false);
    expect(await usecase.updateSubTaskText('t1', '없는항목', '새 글')).toBe(false);

    expect(c.saveTodos).not.toHaveBeenCalled();
  });

  it('id·완료 상태·순서를 보존한다', async () => {
    const c = makeRepo([base()]);

    await new ManageTodos(c.repo).updateSubTaskText('t1', 's2', '교감 결재 올리기');

    expect(c.savedSubs('t1')).toEqual([
      { id: 's1', text: '안내문 초안', completed: false },
      { id: 's2', text: '교감 결재 올리기', completed: true },
      { id: 's3', text: '가정통신문 배부', completed: false },
    ]);
  });

  it('동기화 메타는 기존 하위 할 일 액션과 같다 — 구글에 있는 할 일은 update 로 예약', async () => {
    const c = makeRepo([base({ googleTaskId: 'g1', pendingRemoteOp: undefined })]);

    await new ManageTodos(c.repo).updateSubTaskText('t1', 's1', '안내문 최종본');

    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('update');
    expect(c.savedTodo('t1')?.updatedAt).toBeDefined();
  });

  it('구글에 아직 없는 할 일은 create 로 예약된다', async () => {
    const c = makeRepo([base()]);

    await new ManageTodos(c.repo).updateSubTaskText('t1', 's1', '안내문 최종본');

    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('create');
  });
});

describe('ManageTodos.moveSubTask — 하위 할 일 순서 바꾸기', () => {
  it('위로 옮긴다', async () => {
    const c = makeRepo([base()]);

    const moved = await new ManageTodos(c.repo).moveSubTask('t1', 's2', -1);

    expect(moved).toBe(true);
    expect(c.savedSubs('t1').map((s) => s.id)).toEqual(['s2', 's1', 's3']);
  });

  it('아래로 옮긴다', async () => {
    const c = makeRepo([base()]);

    await new ManageTodos(c.repo).moveSubTask('t1', 's2', 1);

    expect(c.savedSubs('t1').map((s) => s.id)).toEqual(['s1', 's3', 's2']);
  });

  it('끝에서는 그대로다 — 저장도 하지 않는다', async () => {
    const c = makeRepo([base()]);
    const usecase = new ManageTodos(c.repo);

    expect(await usecase.moveSubTask('t1', 's1', -1)).toBe(false);
    expect(await usecase.moveSubTask('t1', 's3', 1)).toBe(false);
    expect(await usecase.moveSubTask('t1', '없는항목', 1)).toBe(false);

    expect(c.saveTodos).not.toHaveBeenCalled();
  });

  it('옮겨도 글·완료 상태는 그대로이고 개수도 같다', async () => {
    const c = makeRepo([base()]);

    await new ManageTodos(c.repo).moveSubTask('t1', 's3', -1);

    expect(c.savedSubs('t1')).toEqual([
      { id: 's1', text: '안내문 초안', completed: false },
      { id: 's3', text: '가정통신문 배부', completed: false },
      { id: 's2', text: '결재 올리기', completed: true },
    ]);
  });

  it('다른 할 일의 하위 항목 순서는 건드리지 않는다', async () => {
    const other = base({ id: 't2', text: '다른 할 일' });
    const c = makeRepo([base(), other]);

    await new ManageTodos(c.repo).moveSubTask('t1', 's1', 1);

    expect(c.savedTodo('t2')).toBe(other);
  });

  it('순서를 바꾸면 구글 쓰기가 예약된다 (기존 하위 할 일 액션과 같은 메타)', async () => {
    const c = makeRepo([base({ googleTaskId: 'g1', pendingRemoteOp: undefined })]);

    await new ManageTodos(c.repo).moveSubTask('t1', 's1', 1);

    expect(c.savedTodo('t1')?.pendingRemoteOp).toBe('update');
  });
});
