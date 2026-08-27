/**
 * 모바일이 할 일을 저장해도 **데스크톱 전용 항목이 사라지지 않는다.**
 *
 * 왜 이걸 따로 잠그나: 모바일은 "다시 확인할 날"(`checkAt`)과 "관련인"(`relatedStaff`)을
 * **보여주기만 하고 고치지 못한다.** 그런데 완료 체크·삭제·보관 같은 동작은 할 일 파일을
 * **통째로 다시 쓴다.** 그 과정에서 모바일이 모르는 항목을 빠뜨리면, 선생님이 휴대폰에서
 * 체크 한 번 한 것만으로 데스크톱에서 적어 둔 점검 날짜와 관련인이 **조용히 지워진다.**
 * 아무 에러도 안 나고, 데스크톱을 열어 보기 전까지는 아무도 모른다.
 *
 * ⚠️ 이 테스트가 보증하지 **않는** 것: 동시 편집. 모바일은 파일 전체를 저장하므로,
 *    데스크톱과 휴대폰에서 같은 시각에 고치면 나중에 저장한 쪽이 이긴다. 그건 별개 과제다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Todo, TodosData } from '@domain/entities/Todo';

const { todoRepoFake, syncFake } = vi.hoisted(() => {
  const repo: {
    stored: TodosData | null;
    getTodos(): Promise<TodosData | null>;
    saveTodos(data: TodosData): Promise<void>;
  } = {
    stored: null,
    async getTodos() {
      return this.stored;
    },
    async saveTodos(data) {
      // 실제 저장소처럼 JSON 왕복을 시킨다 — 직렬화에서 빠지는 항목까지 잡기 위해서다.
      this.stored = JSON.parse(JSON.stringify(data)) as TodosData;
    },
  };
  return { todoRepoFake: repo, syncFake: { triggerSaveSync: vi.fn() } };
});

vi.mock('@mobile/di/container', () => ({
  todoRepository: todoRepoFake,
}));

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: { getState: () => syncFake },
}));

import { useMobileTodoStore } from '../useMobileTodoStore';

const DESKTOP_TODO: Todo = {
  id: 't1',
  text: '2학년 체험학습 공문 회신',
  completed: false,
  createdAt: '2026-08-20T00:00:00.000Z',
  dueDate: '2026-08-28',
  // ↓ 데스크톱에서만 만들 수 있는 두 항목
  checkAt: '2026-08-25',
  relatedStaff: [{ staffId: 's-1', nameSnapshot: '김민호' }],
  subTasks: [{ id: 'st1', text: '기안 올리기', completed: false }],
};

const OTHER_TODO: Todo = {
  id: 't2',
  text: '동아리 명단 정리',
  completed: true,
  createdAt: '2026-08-19T00:00:00.000Z',
  checkAt: '2026-08-26',
  relatedStaff: [{ staffId: 's-2', nameSnapshot: '박서연' }],
};

function storedTodo(id: string): Todo | undefined {
  return todoRepoFake.stored?.todos.find((t) => t.id === id);
}

beforeEach(async () => {
  todoRepoFake.stored = { todos: [DESKTOP_TODO, OTHER_TODO], categories: [] };
  useMobileTodoStore.setState({ todos: [], categories: [], loaded: false });
  await useMobileTodoStore.getState().load();
});

describe('모바일은 데스크톱 전용 항목을 지우지 않는다', () => {
  it('완료 체크를 해도 점검 날짜·관련인이 그대로 남는다', async () => {
    await useMobileTodoStore.getState().toggleTodo('t1');

    const saved = storedTodo('t1');
    expect(saved?.completed).toBe(true); // 하려던 일은 됐고
    expect(saved?.checkAt).toBe('2026-08-25'); // 나머지는 그대로다
    expect(saved?.relatedStaff).toEqual([{ staffId: 's-1', nameSnapshot: '김민호' }]);
  });

  it('마감일을 옮겨도 점검 날짜·관련인이 그대로 남는다', async () => {
    await useMobileTodoStore.getState().setTodoDueDate('t1', '2026-09-03');

    const saved = storedTodo('t1');
    expect(saved?.dueDate).toBe('2026-09-03'); // 하려던 일은 됐고
    expect(saved?.checkAt).toBe('2026-08-25'); // 나머지는 그대로다
    expect(saved?.relatedStaff).toEqual([{ staffId: 's-1', nameSnapshot: '김민호' }]);
    expect(saved?.subTasks).toHaveLength(1);
  });

  it('하위 할 일을 체크해도 그대로 남는다', async () => {
    await useMobileTodoStore.getState().toggleSubTask('t1', 'st1');

    const saved = storedTodo('t1');
    expect(saved?.subTasks?.[0]?.completed).toBe(true);
    expect(saved?.checkAt).toBe('2026-08-25');
    expect(saved?.relatedStaff).toHaveLength(1);
  });

  it('다른 할 일을 지워도 남은 할 일의 항목이 그대로다', async () => {
    await useMobileTodoStore.getState().deleteTodo('t2');

    expect(todoRepoFake.stored?.todos).toHaveLength(1);
    expect(storedTodo('t1')?.checkAt).toBe('2026-08-25');
    expect(storedTodo('t1')?.relatedStaff).toHaveLength(1);
  });

  it('완료된 것을 보관해도 그대로 남는다', async () => {
    const count = await useMobileTodoStore.getState().archiveCompleted();

    expect(count).toBe(1);
    expect(storedTodo('t2')?.archivedAt).toBeDefined();
    expect(storedTodo('t2')?.checkAt).toBe('2026-08-26');
    expect(storedTodo('t2')?.relatedStaff).toEqual([{ staffId: 's-2', nameSnapshot: '박서연' }]);
  });

  it('보관함에서 되살려도 그대로 남는다', async () => {
    await useMobileTodoStore.getState().archiveCompleted();
    await useMobileTodoStore.getState().restoreFromArchive('t2');

    const saved = storedTodo('t2');
    expect(saved?.archivedAt).toBeUndefined();
    expect(saved?.checkAt).toBe('2026-08-26');
    expect(saved?.relatedStaff).toHaveLength(1);
  });

  it('휴대폰에서 새로 만든 할 일에는 두 항목이 없다 — 데스크톱에서만 붙인다', async () => {
    await useMobileTodoStore.getState().addTodo({
      id: 't3',
      text: '휴대폰에서 적은 일',
      completed: false,
      createdAt: '2026-08-22T00:00:00.000Z',
    });

    expect(storedTodo('t3')?.checkAt).toBeUndefined();
    expect(storedTodo('t3')?.relatedStaff).toBeUndefined();
    // 그리고 기존 할 일은 여전히 멀쩡하다.
    expect(storedTodo('t1')?.checkAt).toBe('2026-08-25');
  });
});

/**
 * 마감일 옮기기는 **데스크톱과 같은 도메인 규칙**을 탄다. 여기서 잠그는 것은
 * "모바일 저장 경로가 그 규칙의 결과를 그대로 반영하는가"다.
 */
describe('모바일 마감일 옮기기', () => {
  it('시작일이 있으면 기간을 유지한 채 함께 밀린다', async () => {
    todoRepoFake.stored = {
      todos: [{ ...DESKTOP_TODO, startDate: '2026-08-26', dueDate: '2026-08-28' }],
      categories: [],
    };
    useMobileTodoStore.setState({ todos: [], categories: [], loaded: false });
    await useMobileTodoStore.getState().load();

    await useMobileTodoStore.getState().setTodoDueDate('t1', '2026-09-04');

    // 마감이 7일 뒤로 갔으니 시작일도 7일 뒤 — 기간(2일)은 그대로다
    expect(storedTodo('t1')?.dueDate).toBe('2026-09-04');
    expect(storedTodo('t1')?.startDate).toBe('2026-09-02');
  });

  it('원래 날짜로 다시 부르면 시작일까지 제자리로 온다 (되돌리기)', async () => {
    todoRepoFake.stored = {
      todos: [{ ...DESKTOP_TODO, startDate: '2026-08-26', dueDate: '2026-08-28' }],
      categories: [],
    };
    useMobileTodoStore.setState({ todos: [], categories: [], loaded: false });
    await useMobileTodoStore.getState().load();

    await useMobileTodoStore.getState().setTodoDueDate('t1', '2026-09-04');
    await useMobileTodoStore.getState().setTodoDueDate('t1', '2026-08-28');

    expect(storedTodo('t1')?.dueDate).toBe('2026-08-28');
    expect(storedTodo('t1')?.startDate).toBe('2026-08-26');
  });

  it('같은 날로 옮기면 저장하지 않는다 — 헛된 동기화를 깨우지 않는다', async () => {
    syncFake.triggerSaveSync.mockClear();

    await useMobileTodoStore.getState().setTodoDueDate('t1', '2026-08-28');

    expect(syncFake.triggerSaveSync).not.toHaveBeenCalled();
  });

  it('없는 할 일을 옮기라고 해도 조용히 넘어간다', async () => {
    syncFake.triggerSaveSync.mockClear();

    await useMobileTodoStore.getState().setTodoDueDate('없는id', '2026-09-01');

    expect(syncFake.triggerSaveSync).not.toHaveBeenCalled();
    expect(todoRepoFake.stored?.todos).toHaveLength(2);
  });
});
