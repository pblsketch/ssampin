/**
 * Google Tasks 동기화(`syncNow`)의 충돌 알림·기록, 지우기 반영, 호출 수를 고정한다.
 *
 * 구글은 메모리 안의 가짜로, 저장소·토스트·할 일 스토어는 모의로 대체한다.
 * 승자는 늘 쌤핀이다 — 이 테스트는 승자를 바꾸지 않은 채 "알림·기록"만 늘었음을 지킨다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoogleTask } from '@domain/ports/IGoogleTasksPort';
import type { Todo } from '@domain/entities/Todo';

const mocks = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(async () => 'token'),
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getTodos: vi.fn(),
  saveTodos: vi.fn(),
  storageRead: vi.fn(),
  storageWrite: vi.fn(),
  storageRemove: vi.fn(),
  toastShow: vi.fn(),
  refresh: vi.fn(async () => undefined),
}));

vi.mock('@adapters/di/container', () => ({
  authenticateGoogle: { getValidAccessToken: mocks.getValidAccessToken },
  googleTasksPort: {
    listTaskLists: vi.fn(async () => []),
    listTasks: mocks.listTasks,
    createTask: mocks.createTask,
    updateTask: mocks.updateTask,
    deleteTask: mocks.deleteTask,
  },
  todoRepository: { getTodos: mocks.getTodos, saveTodos: mocks.saveTodos },
  storage: { read: mocks.storageRead, write: mocks.storageWrite, remove: mocks.storageRemove },
  calendarSyncRepo: { getAuthTokens: vi.fn(async () => null) },
}));
vi.mock('@adapters/stores/useTodoStore', () => ({
  useTodoStore: { getState: () => ({ refresh: mocks.refresh }) },
}));
vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: { getState: () => ({ show: mocks.toastShow }) },
}));

import { useTasksSyncStore } from '../useTasksSyncStore';

const LIST = 'list-1';
const T0 = '2026-10-14T10:00:00.000Z'; // 마지막 동기화
const T1 = '2026-10-14T11:00:00.000Z'; // 구글에서 고친 시각(1시간 뒤)

// ── 가짜 구글 ──
let remoteTasks: Map<string, GoogleTask>;
let nextId: number;
let storedTodos: Todo[];
let storageFiles: Map<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function remoteTask(over: Partial<GoogleTask> & { id: string }): GoogleTask {
  return { title: '구글 제목', status: 'needsAction', updated: T1, etag: 'e', ...over };
}

function todo(over: Partial<Todo> & { id: string }): Todo {
  return {
    text: '쌤핀 제목',
    completed: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    googleTaskListId: LIST,
    lastSyncedAt: T0,
    ...over,
  };
}

function seed(todos: Todo[], remotes: GoogleTask[] = []): void {
  storedTodos = todos;
  remoteTasks = new Map(remotes.map((r) => [r.id, r]));
}

function notFound(): Error {
  return Object.assign(new Error('Not Found'), { code: 404 });
}

beforeEach(() => {
  vi.clearAllMocks();
  nextId = 1;
  storedTodos = [];
  remoteTasks = new Map();
  storageFiles = new Map();

  mocks.getValidAccessToken.mockResolvedValue('token');
  mocks.listTasks.mockImplementation(async () => [...remoteTasks.values()]);
  mocks.createTask.mockImplementation(
    async (_token: string, _list: string, p: Partial<GoogleTask>) => {
      const id = `new-${nextId++}`;
      const task: GoogleTask = {
        id,
        title: p.title ?? '',
        status: p.status ?? 'needsAction',
        ...(p.due !== undefined ? { due: p.due } : {}),
        ...(p.notes !== undefined ? { notes: p.notes } : {}),
        updated: nowIso(),
        etag: 'e',
      };
      remoteTasks.set(id, task);
      return task;
    },
  );
  mocks.updateTask.mockImplementation(
    async (
      _token: string,
      _list: string,
      id: string,
      p: {
        title?: string;
        status?: 'needsAction' | 'completed';
        due?: string | null;
        notes?: string | null;
      },
    ) => {
      const cur = remoteTasks.get(id);
      // 실제 구글(2026-10-14 확인): 삭제된 항목에 수정을 보내도 오류 없이 200 이고 삭제 상태 그대로다.
      if (!cur) throw notFound();
      const next: GoogleTask = {
        ...cur,
        ...(p.title !== undefined ? { title: p.title } : {}),
        ...(p.status !== undefined ? { status: p.status } : {}),
        updated: nowIso(),
      };
      const { due: _d, notes: _n, ...rest } = next;
      const out: GoogleTask = {
        ...rest,
        ...(p.due === null
          ? {}
          : p.due !== undefined
            ? { due: p.due }
            : cur.due
              ? { due: cur.due }
              : {}),
        ...(p.notes === null
          ? {}
          : p.notes !== undefined
            ? { notes: p.notes }
            : cur.notes
              ? { notes: cur.notes }
              : {}),
      };
      remoteTasks.set(id, out);
      return out;
    },
  );
  mocks.deleteTask.mockImplementation(async (_t: string, _l: string, id: string) => {
    const cur = remoteTasks.get(id);
    if (!cur) throw notFound();
    remoteTasks.set(id, { ...cur, deleted: true });
  });
  mocks.getTodos.mockImplementation(async () => ({ todos: storedTodos.map((t) => ({ ...t })) }));
  mocks.saveTodos.mockImplementation(async (data: { todos: readonly Todo[] }) => {
    storedTodos = data.todos.map((t) => ({ ...t }));
  });
  mocks.storageRead.mockImplementation(async (key: string) => storageFiles.get(key) ?? null);
  mocks.storageWrite.mockImplementation(async (key: string, v: unknown) => {
    storageFiles.set(key, v);
  });
  mocks.storageRemove.mockImplementation(async (key: string) => {
    storageFiles.delete(key);
  });

  useTasksSyncStore.setState({
    isEnabled: true,
    taskListId: LIST,
    taskListName: '내 목록',
    taskLists: [],
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
    quotaCooldownUntil: null,
    showScopeRequestModal: false,
    showTaskListPicker: false,
    pendingDeleteIds: [],
    conflicts: [],
  });
});

async function runSync(): Promise<void> {
  await useTasksSyncStore.getState().syncNow();
}

function found(id: string): Todo {
  const t = storedTodos.find((x) => x.id === id);
  if (!t) throw new Error(`할 일 ${id} 없음`);
  return t;
}

describe('syncNow — 충돌 알림과 기록', () => {
  it('① 변경이 없으면 구글을 한 번만 읽고 기록·알림이 없다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '같은 제목' })],
      [remoteTask({ id: 'g1', title: '같은 제목', updated: T0 })],
    );
    await runSync();
    expect(mocks.listTasks).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('② edit-edit: 쌤핀 내용이 구글을 덮고, 덮인 구글 내용을 기록하고, 토스트는 한 번이다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', notes: '구글 메모', updated: T1 })],
    );
    await runSync();

    // 승자는 쌤핀: 구글로 올라갔다
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(mocks.updateTask.mock.calls[0]?.[3]).toMatchObject({ title: '쌤핀 제목' });
    expect(found('t1').text).toBe('쌤핀 제목');

    const { conflicts } = useTasksSyncStore.getState();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'edit-edit',
      todoId: 't1',
      googleTaskId: 'g1',
      remoteUpdatedAt: T1,
      local: { text: '쌤핀 제목' },
      remote: { text: '구글 제목', notes: '구글 메모' },
    });
    // 올리기 전 스냅샷 1회 + 올린 뒤 가져오기 1회
    expect(mocks.listTasks).toHaveBeenCalledTimes(2);

    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
    const [message, type, action, ms] = mocks.toastShow.mock.calls[0] ?? [];
    expect(type).toBe('info');
    expect(action).toBeUndefined();
    expect(ms).toBe(6000);
    expect(message).toContain('1개');
    expect(message).not.toContain('쌤핀 제목'); // 제목은 알림에 넣지 않는다
    expect(storageFiles.get('tasks-sync-conflicts')).toHaveLength(1);
  });

  it.each([
    ['스냅샷에 없음', undefined],
    [
      '삭제 표시가 있음',
      remoteTask({ id: 'g1', deleted: true, title: '지워진 제목', updated: T1 }),
    ],
  ])(
    '③ remote-deleted(%s): 수정을 보내지 않고 새로 만들고 구글 삭제를 기록한다',
    async (_n, tomb) => {
      seed(
        [
          todo({
            id: 't1',
            googleTaskId: 'g1',
            text: '쌤핀 제목',
            pendingRemoteOp: 'update',
            notes: undefined,
            dueDate: undefined,
          }),
        ],
        tomb ? [tomb] : [],
      );
      await runSync();

      expect(mocks.updateTask).not.toHaveBeenCalled();
      expect(mocks.createTask).toHaveBeenCalledTimes(1);
      const payload = mocks.createTask.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(payload).toMatchObject({ title: '쌤핀 제목', status: 'needsAction' });
      expect('due' in payload).toBe(false);
      expect('notes' in payload).toBe(false);

      expect(found('t1').googleTaskId).toBe('new-1');
      expect(found('t1').pendingRemoteOp).toBeUndefined();

      const [c] = useTasksSyncStore.getState().conflicts;
      expect(c?.kind).toBe('remote-deleted');
      if (tomb) {
        expect(c?.remote?.text).toBe('지워진 제목');
        expect(c?.remoteUpdatedAt).toBe(T1);
      } else {
        expect(c?.remote).toBeUndefined();
        expect(c?.remoteUpdatedAt).toBeUndefined();
      }
      expect(mocks.toastShow).toHaveBeenCalledTimes(1);
    },
  );

  it('④ local-deleted: 보관한 할 일을 구글에서 고쳤다면 지우기 전에 그 내용을 기록한다', async () => {
    seed(
      [
        todo({
          id: 't1',
          googleTaskId: 'g1',
          text: '보관한 할 일',
          pendingRemoteOp: 'delete',
          archivedAt: '2026-10-14T10:30:00.000Z',
        }),
      ],
      [remoteTask({ id: 'g1', title: '구글에서 고친 제목', updated: T1 })],
    );
    await runSync();

    expect(mocks.deleteTask).toHaveBeenCalledTimes(1);
    const [c] = useTasksSyncStore.getState().conflicts;
    expect(c).toMatchObject({
      kind: 'local-deleted',
      local: { text: '보관한 할 일' },
      remote: { text: '구글에서 고친 제목' },
    });
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
  });

  it('④-2 쌤핀도 지우려던 항목을 구글이 이미 지웠다면 알릴 것이 없다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', pendingRemoteOp: 'delete', archivedAt: T0 })],
      [remoteTask({ id: 'g1', deleted: true })],
    );
    await runSync();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('옛 목록에 연결된 할 일은 충돌로 판정하지 않는다(기존대로 404 → 새로 생성)', async () => {
    seed([
      todo({
        id: 't1',
        googleTaskId: 'old-g',
        googleTaskListId: 'old-list',
        pendingRemoteOp: 'update',
      }),
    ]);
    await runSync();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(mocks.updateTask).toHaveBeenCalledTimes(1); // 404
    expect(mocks.createTask).toHaveBeenCalledTimes(1); // 기존 대체 경로
    expect(found('t1').googleTaskListId).toBe(LIST);
  });

  it('⑦ 올리기가 실패해 다음 회차에 같은 충돌이 다시 걸려도 기록·알림은 한 번이다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', updated: T1 })],
    );
    mocks.updateTask.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 500 }));

    await runSync();
    expect(found('t1').pendingRemoteOp).toBe('update'); // 아직 못 올렸다
    expect(useTasksSyncStore.getState().conflicts).toHaveLength(1);
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);

    await runSync();
    expect(found('t1').pendingRemoteOp).toBeUndefined(); // 올라갔다
    expect(useTasksSyncStore.getState().conflicts).toHaveLength(1);
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
  });

  it('⑧ 올리거나 지울 보류 변경이 없으면 구글을 추가로 읽지 않는다', async () => {
    seed(
      [
        todo({ id: 't1', googleTaskId: 'g1', text: 'A', pendingRemoteOp: undefined }),
        todo({ id: 't2', text: 'B', pendingRemoteOp: 'create' }),
      ],
      [remoteTask({ id: 'g1', title: 'A', updated: T0 })],
    );
    await runSync();
    // create 는 구글 상태를 알 필요가 없다 — 가져오기 한 번뿐
    expect(mocks.listTasks).toHaveBeenCalledTimes(1);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
  });

  it('⑨ 스냅샷 읽기에 실패해도 동기화는 진행하고 판정만 건너뛴다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', updated: T1 })],
    );
    mocks.listTasks.mockRejectedValueOnce(new Error('network'));
    await runSync();

    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(found('t1').pendingRemoteOp).toBeUndefined();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(useTasksSyncStore.getState().error).toBeNull();
  });
});

describe('syncNow — 삭제된 항목에 수정이 받아들여지는 구글 동작', () => {
  it('구글 상태를 읽지 못한 회차에도 삭제된 항목에 보낸 수정이 성공으로 끝나지 않고 새로 만든다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', deleted: true, title: '지워진 제목', updated: T1 })],
    );
    mocks.listTasks.mockRejectedValueOnce(new Error('network')); // 스냅샷 읽기 실패

    await runSync();

    // 수정은 200 으로 받아들여졌지만 삭제 상태 그대로 — 쌤핀에서 고친 내용을 살려 새로 만든다
    expect(mocks.updateTask).toHaveBeenCalledTimes(1);
    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(found('t1').text).toBe('쌤핀 제목');
    expect(found('t1').googleTaskId).toBe('new-1');
    expect(found('t1').pendingRemoteOp).toBeUndefined();
    const [c] = useTasksSyncStore.getState().conflicts;
    expect(c?.kind).toBe('remote-deleted');
    expect(mocks.toastShow).toHaveBeenCalledTimes(1);
  });

  it('위 경로에서 재생성이 실패해도 쌤핀 할 일은 남고 다음 회차에 다시 시도한다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', deleted: true, title: '지워진 제목', updated: T1 })],
    );
    mocks.listTasks.mockRejectedValueOnce(new Error('network'));
    mocks.createTask.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 503 }));

    await runSync();

    expect(found('t1').text).toBe('쌤핀 제목');
    expect(found('t1').pendingRemoteOp).toBe('update');
  });
});

describe('syncNow — 지우기 반영', () => {
  it('⑤ 지운 마감일·메모는 수정에서 null 로 보낸다', async () => {
    seed(
      [
        todo({
          id: 't1',
          googleTaskId: 'g1',
          text: '제목',
          pendingRemoteOp: 'update',
          dueDate: undefined,
          notes: undefined,
        }),
      ],
      [
        remoteTask({
          id: 'g1',
          title: '제목',
          due: '2026-10-20T00:00:00.000Z',
          notes: '옛 메모',
          updated: T0, // 구글은 마지막 동기화 이후 안 바뀜 — 충돌 아님
        }),
      ],
    );
    await runSync();
    const payload = mocks.updateTask.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(payload['due']).toBeNull();
    expect(payload['notes']).toBeNull();
    expect(remoteTasks.get('g1')?.due).toBeUndefined();
    expect(remoteTasks.get('g1')?.notes).toBeUndefined();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
  });

  it('⑥ 구글에서 메모를 지우면 쌤핀 메모도 지워지고, 구글에서 받은 자료로 표시된다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '제목', notes: '옛 메모', origin: 'ssampin' })],
      [remoteTask({ id: 'g1', title: '제목', updated: T1 })], // notes 없음 = 지움
    );
    await runSync();
    expect(found('t1').notes).toBeUndefined();
    expect(found('t1').origin).toBe('google'); // ADR-136 D1
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('⑩ 구글에서 완료한 항목은 completedAt 이 찍힌다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '제목', completed: false })],
      [
        remoteTask({
          id: 'g1',
          title: '제목',
          status: 'completed',
          completed: '2026-10-14T10:45:00.000Z',
          updated: T1,
        }),
      ],
    );
    await runSync();
    expect(found('t1').completed).toBe(true);
    expect(found('t1').completedAt).toBe('2026-10-14T10:45:00.000Z');
    expect(found('t1').origin).toBe('google');
  });
});

describe('syncNow — 기록 관리', () => {
  it('⑪ 동기화를 끄면 충돌 기록도 지운다', async () => {
    seed([], []);
    useTasksSyncStore.setState({
      conflicts: [
        {
          id: 'c1',
          kind: 'edit-edit',
          todoId: 't1',
          googleTaskId: 'g1',
          detectedAt: T0,
          local: { text: 'a', completed: false },
        },
      ],
    });
    storageFiles.set('tasks-sync-conflicts', [{ id: 'c1' }]);

    await useTasksSyncStore.getState().disableSync();
    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(storageFiles.has('tasks-sync-conflicts')).toBe(false);
  });

  it('⑫ 일일 한도로 끝난 회차에서도 기록 저장과 알림은 한다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', updated: T1 })],
    );
    let calls = 0;
    mocks.listTasks.mockImplementation(async () => {
      calls += 1;
      if (calls >= 2) throw Object.assign(new Error('quota'), { dailyQuotaExceeded: true });
      return [...remoteTasks.values()];
    });
    await runSync();

    expect(useTasksSyncStore.getState().quotaCooldownUntil).not.toBeNull();
    expect(useTasksSyncStore.getState().conflicts).toHaveLength(1);
    // 쿼터 안내 토스트 + 충돌 토스트
    const messages = mocks.toastShow.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes('서로 다르게 바뀐'))).toBe(true);
  });

  it('⑬ 동기화 도중 "기록 지우기"가 눌려도 새 기록은 지금의 기록에 합쳐진다', async () => {
    const old = {
      id: 'old',
      kind: 'edit-edit' as const,
      todoId: 'tx',
      googleTaskId: 'gx',
      detectedAt: T0,
      remoteUpdatedAt: T0,
      local: { text: '옛 기록', completed: false },
    };
    useTasksSyncStore.setState({ conflicts: [old] });
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', updated: T1 })],
    );
    const original = mocks.updateTask.getMockImplementation();
    mocks.updateTask.mockImplementation(async (...args: unknown[]) => {
      await useTasksSyncStore.getState().clearConflicts(); // 동기화 도중 지우기
      return original ? original(...args) : undefined;
    });

    await runSync();
    const ids = useTasksSyncStore.getState().conflicts.map((c) => c.id);
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain('old');
  });

  it('initialize 는 저장된 기록을 불러온다', async () => {
    storageFiles.set('tasks-sync-conflicts', [
      {
        id: 'c1',
        kind: 'local-deleted',
        todoId: 't1',
        googleTaskId: 'g1',
        detectedAt: T0,
        local: { text: 'a', completed: false },
        remote: { text: 'b', completed: true },
      },
    ]);
    await useTasksSyncStore.getState().initialize();
    expect(useTasksSyncStore.getState().conflicts.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('syncNow — 검토에서 나온 경로', () => {
  it('재생성이 실패해도 같은 회차의 가져오기가 쌤핀에서 고친 할 일을 지우지 않는다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', deleted: true, title: '지워진 제목', updated: T1 })],
    );
    mocks.createTask.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 503 }));

    await runSync();

    // 선생님이 고친 내용이 살아 있고, 다음 회차에 다시 올릴 수 있게 보류 상태다
    expect(found('t1').text).toBe('쌤핀 제목');
    expect(found('t1').pendingRemoteOp).toBe('update');
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });

  it('재생성이 실패한 뒤 다음 회차에 성공하면 구글에 다시 만들어진다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', deleted: true, title: '지워진 제목', updated: T1 })],
    );
    mocks.createTask.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 503 }));

    await runSync();
    await runSync();

    expect(found('t1').googleTaskId).toBe('new-1');
    expect(found('t1').pendingRemoteOp).toBeUndefined();
    expect(useTasksSyncStore.getState().conflicts).toHaveLength(1); // 중복 기록 없음
  });

  it('동기화가 도는 사이 연결을 끊으면 충돌 기록을 다시 남기지 않는다', async () => {
    seed(
      [todo({ id: 't1', googleTaskId: 'g1', text: '쌤핀 제목', pendingRemoteOp: 'update' })],
      [remoteTask({ id: 'g1', title: '구글 제목', updated: T1 })],
    );
    const original = mocks.updateTask.getMockImplementation();
    mocks.updateTask.mockImplementation(async (...args: unknown[]) => {
      await useTasksSyncStore.getState().disableSync(); // 올리는 도중 끊음
      return original ? original(...args) : undefined;
    });

    await runSync();

    expect(useTasksSyncStore.getState().conflicts).toEqual([]);
    expect(storageFiles.has('tasks-sync-conflicts')).toBe(false);
    expect(mocks.toastShow).not.toHaveBeenCalled();
  });

  it('404 대체 생성도 빈 마감일·메모를 null 로 보내지 않는다', async () => {
    seed([
      todo({
        id: 't1',
        googleTaskId: 'old-g',
        googleTaskListId: 'old-list',
        pendingRemoteOp: 'update',
        dueDate: undefined,
        notes: undefined,
      }),
    ]);
    await runSync();
    const payload = mocks.createTask.mock.calls[0]?.[2] as Record<string, unknown>;
    expect('due' in payload).toBe(false);
    expect('notes' in payload).toBe(false);
  });

  it('옛 목록에 연결된 항목만 보류 중이면 구글 상태를 추가로 읽지 않는다', async () => {
    seed([
      todo({
        id: 't1',
        googleTaskId: 'old-g',
        googleTaskListId: 'old-list',
        pendingRemoteOp: 'update',
      }),
    ]);
    await runSync();
    expect(mocks.listTasks).toHaveBeenCalledTimes(1); // 가져오기 한 번뿐
  });
});
