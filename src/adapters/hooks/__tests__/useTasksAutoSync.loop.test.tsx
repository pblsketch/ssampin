/**
 * @vitest-environment jsdom
 *
 * Google Tasks 자동 동기화가 "동기화 → refresh → 다시 동기화"로 끝없이 돌지 않는다.
 *
 * 고리의 세 조각(2026-11 조사):
 *   1) 동기화는 끝날 때마다 `useTodoStore.refresh()` 를 부른다.
 *   2) `refresh` 는 내용이 그대로여도 `todos` 배열을 새로 갈아 끼웠다.
 *   3) 자동 동기화(`useTasksAutoSync`)는 배열이 바뀌면 2.5초 뒤 동기화를 건다.
 * → 바뀐 것이 없어도 2.5초마다 구글을 읽었다(하루 호출 한도를 깎고, 저장과 겹칠 틈을 늘린다).
 *
 * 구글만 가짜다. 훅·두 스토어·유스케이스·저장소(localStorage)는 실제 것을 그대로 통과한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { GoogleTask, GoogleTaskUpdate } from '@domain/ports/IGoogleTasksPort';
import type { SyncSettings } from '@domain/entities/Settings';
import type { Todo } from '@domain/entities/Todo';

const google = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('@adapters/di/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@adapters/di/container')>();
  return {
    ...actual,
    authenticateGoogle: { getValidAccessToken: async () => 'token' },
    googleTasksPort: {
      listTaskLists: async () => [],
      listTasks: google.listTasks,
      createTask: google.createTask,
      updateTask: google.updateTask,
      deleteTask: google.deleteTask,
    },
  };
});

import { todoRepository } from '@adapters/di/container';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTasksAutoSync } from '../useTasksAutoSync';

const LIST = 'list-1';
const T0 = '2026-11-10T08:00:00.000Z'; // 마지막 동기화
const NOW = '2026-11-10T09:00:00.000Z'; // 테스트가 시작하는 시각
const DEBOUNCE_MS = 2500;

const SYNC_ON_SAVE: SyncSettings = {
  enabled: true,
  autoSyncOnStart: false,
  autoSyncOnSave: true,
  autoSyncIntervalMin: 0,
  conflictPolicy: 'latest',
  lastSyncedAt: null,
  deviceId: 'device-test',
};

const originalTodoState = useTodoStore.getState();
const originalTasksState = useTasksSyncStore.getState();
const originalSettingsState = useSettingsStore.getState();
const realSyncNow = originalTasksState.syncNow;

/** 가짜 구글의 할 일 */
let remoteTasks: Map<string, GoogleTask>;
/** 자동 동기화가 실제로 시작한 회차들 */
let syncRuns: Promise<void>[];

function syncedTodo(over: Partial<Todo> & { id: string; googleTaskId: string }): Todo {
  return {
    text: '가정통신문 걷기',
    completed: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    priority: 'none',
    googleTaskListId: LIST,
    lastSyncedAt: T0,
    ...over,
  };
}

function remoteTask(over: Partial<GoogleTask> & { id: string }): GoogleTask {
  return { title: '가정통신문 걷기', status: 'needsAction', updated: T0, etag: 'e', ...over };
}

/** 파일과 화면을 같은 내용으로 맞춘다(앱이 켜져 할 일을 읽어 둔 상태). */
async function seed(todos: Todo[], remotes: GoogleTask[]): Promise<void> {
  remoteTasks = new Map(remotes.map((r) => [r.id, r]));
  await todoRepository.saveTodos({ todos });
  await useTodoStore.getState().refresh();
  useTodoStore.setState({ loaded: true });
}

/** 디바운스 한 번(2.5초)을 보내고, 그때 시작된 동기화가 끝나기를 기다린다. */
async function passDebounceWindow(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  await Promise.all(syncRuns);
  // 동기화 끝의 refresh 가 구독자를 깨워 다음 타이머를 걸 틈
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  remoteTasks = new Map();
  syncRuns = [];

  google.listTasks.mockImplementation(async () => [...remoteTasks.values()]);
  google.updateTask.mockImplementation(
    async (_token: string, _list: string, id: string, patch: GoogleTaskUpdate) => {
      const current = remoteTasks.get(id);
      if (!current) throw Object.assign(new Error('Not Found'), { code: 404 });
      const next: GoogleTask = {
        ...current,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updated: new Date().toISOString(),
      };
      remoteTasks.set(id, next);
      return next;
    },
  );

  useSettingsStore.setState((s) => ({ settings: { ...s.settings, sync: SYNC_ON_SAVE } }));
  useTasksSyncStore.setState({
    isEnabled: true,
    taskListId: LIST,
    taskListName: '내 목록',
    isSyncing: false,
    lastSyncedAt: null,
    error: null,
    quotaCooldownUntil: null,
    pendingDeleteIds: [],
    conflicts: [],
    // 실제 syncNow 를 그대로 부르되, 몇 번 돌았는지와 끝나는 때만 잡아 둔다.
    syncNow: () => {
      const run = realSyncNow();
      syncRuns.push(run);
      return run;
    },
  });

  // 시계는 타이머로만 흐른다 — 화면과 저장이 같은 시각을 찍어 결과가 흔들리지 않는다.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: new Date(NOW) });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useTodoStore.setState(originalTodoState, true);
  useTasksSyncStore.setState(originalTasksState, true);
  useSettingsStore.setState(originalSettingsState, true);
  localStorage.clear();
});

describe('useTasksAutoSync — 저장 뒤 자동 동기화', () => {
  it('동기화가 끝난 뒤 바뀐 것이 없으면 자동 동기화가 다시 돌지 않는다', async () => {
    await seed([syncedTodo({ id: 't1', googleTaskId: 'g1' })], [remoteTask({ id: 'g1' })]);
    renderHook(() => useTasksAutoSync());

    // 선생님이 할 일을 고친다 → 2.5초 뒤 자동 동기화가 구글에 올린다.
    await useTodoStore.getState().updateTodo('t1', { text: '가정통신문 걷기(2반)' });
    await passDebounceWindow();
    expect(google.updateTask).toHaveBeenCalledTimes(1);
    expect(remoteTasks.get('g1')?.title).toBe('가정통신문 걷기(2반)');

    // 올리고 나면 파일 내용이 실제로 달라진다(올림 표시 해제·동기화 시각).
    // 그래서 한 번 더 도는 것까지는 정상이다.
    await passDebounceWindow();
    const settled = syncRuns.length;
    expect(settled).toBeLessThanOrEqual(2);

    // 그 뒤로는 아무것도 바뀌지 않았다 — 얼마를 기다려도 다시 돌면 안 된다.
    for (let i = 0; i < 5; i += 1) {
      await passDebounceWindow();
    }
    expect(syncRuns.length).toBe(settled);
    expect(google.updateTask).toHaveBeenCalledTimes(1);
  });

  it('내용이 같은 refresh 는 할 일 배열을 바꾸지 않고, 달라졌으면 바꾼다', async () => {
    await seed([syncedTodo({ id: 't1', googleTaskId: 'g1' })], []);
    const before = useTodoStore.getState().todos;

    await useTodoStore.getState().refresh();
    expect(useTodoStore.getState().todos).toBe(before);

    // 다른 기기에서 내려받은 것처럼 파일만 바뀐 경우 — 화면이 따라가야 한다.
    await todoRepository.saveTodos({
      todos: [syncedTodo({ id: 't1', googleTaskId: 'g1', text: '다른 기기에서 고친 글' })],
    });
    await useTodoStore.getState().refresh();
    expect(useTodoStore.getState().todos).not.toBe(before);
    expect(useTodoStore.getState().todos[0]?.text).toBe('다른 기기에서 고친 글');
  });

  it('동기화가 도는 중에 고친 할 일은 그 동기화가 끝난 뒤 구글에 올라간다', async () => {
    await seed([syncedTodo({ id: 't1', googleTaskId: 'g1' })], [remoteTask({ id: 'g1' })]);
    renderHook(() => useTasksAutoSync());

    // 다른 계기(주기·창 포커스)로 시작된 동기화가 구글 응답을 기다리고 있다.
    let release: (tasks: readonly GoogleTask[]) => void = () => undefined;
    let markReached: () => void = () => undefined;
    const reachedGoogle = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    google.listTasks.mockImplementationOnce(
      () =>
        new Promise<readonly GoogleTask[]>((resolve) => {
          release = resolve;
          markReached();
        }),
    );
    const running = useTasksSyncStore.getState().syncNow();
    await reachedGoogle;

    // 그 사이 선생님이 할 일을 고친다. 2.5초 뒤에도 앞의 동기화는 아직 돌고 있다.
    await useTodoStore.getState().updateTodo('t1', { text: '가정통신문 걷기(2반)' });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(useTasksSyncStore.getState().isSyncing).toBe(true);
    expect(google.updateTask).not.toHaveBeenCalled();

    release([...remoteTasks.values()]);
    await running;

    // 앞의 동기화는 고치기 전 내용을 읽었으므로 이 변경을 올리지 못했다.
    // 끝난 뒤 다시 돌아 올려야 한다(다음 주기·창 포커스까지 기다리게 두지 않는다).
    await passDebounceWindow();
    expect(google.updateTask).toHaveBeenCalledTimes(1);
    expect(remoteTasks.get('g1')?.title).toBe('가정통신문 걷기(2반)');
  });
});
