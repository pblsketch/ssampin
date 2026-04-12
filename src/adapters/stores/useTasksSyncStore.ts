import { create } from 'zustand';
import type { GoogleTaskList } from '@domain/ports/IGoogleTasksPort';
import type { Todo } from '@domain/entities/Todo';
import { generateUUID } from '@infrastructure/utils/uuid';

interface TasksSyncState {
  // 동기화 설정
  isEnabled: boolean;
  taskListId: string | null;
  taskListName: string | null;
  taskLists: readonly GoogleTaskList[];

  // 동기화 상태
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;

  // 모달 표시
  showScopeRequestModal: boolean;
  showTaskListPicker: boolean;

  /** 원격에서 삭제 대기 중인 Google Task ID 목록 */
  pendingDeleteIds: readonly string[];

  // 액션
  enableSync: () => Promise<void>;
  disableSync: () => Promise<void>;
  setShowScopeRequestModal: (show: boolean) => void;
  setShowTaskListPicker: (show: boolean) => void;
  fetchTaskLists: () => Promise<void>;
  selectTaskList: (id: string, name: string) => Promise<void>;
  syncNow: () => Promise<void>;
  initialize: () => Promise<void>;
  /** 삭제 예약 (로컬 delete 시 호출) */
  markForRemoteDelete: (googleTaskId: string) => Promise<void>;
}

const STORAGE_KEY = 'tasks-sync-state';
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';

interface PersistedState {
  isEnabled: boolean;
  taskListId: string | null;
  taskListName: string | null;
  lastSyncedAt: string | null;
  pendingDeleteIds: readonly string[];
}

async function persistState(state: PersistedState): Promise<void> {
  const { storage } = await import('@adapters/di/container');
  await storage.write<PersistedState>(STORAGE_KEY, state);
}

export const useTasksSyncStore = create<TasksSyncState>((set, get) => ({
  isEnabled: false,
  taskListId: null,
  taskListName: null,
  taskLists: [],
  isSyncing: false,
  lastSyncedAt: null,
  error: null,
  showScopeRequestModal: false,
  showTaskListPicker: false,
  pendingDeleteIds: [],

  enableSync: async () => {
    const { useCalendarSyncStore } = await import('./useCalendarSyncStore');
    const calendarState = useCalendarSyncStore.getState();

    if (!calendarState.isConnected) {
      set({ error: 'Google 계정이 연결되어 있지 않습니다. 먼저 구글 캘린더 연동을 완료해주세요.' });
      return;
    }

    try {
      const { calendarSyncRepo } = await import('@adapters/di/container');
      const tokens = await calendarSyncRepo.getAuthTokens();
      const granted = tokens?.grantedScopes ?? [];

      if (!granted.includes(TASKS_SCOPE)) {
        set({ showScopeRequestModal: true });
        return;
      }

      // Tasks 스코프 있음 → Task List 선택 모달 표시 + 즉시 로드
      set({ showTaskListPicker: true });
      await get().fetchTaskLists();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Tasks 동기화 활성화 중 오류가 발생했습니다.' });
    }
  },

  disableSync: async () => {
    set({
      isEnabled: false,
      taskListId: null,
      taskListName: null,
      lastSyncedAt: null,
      error: null,
      pendingDeleteIds: [],
    });

    try {
      await persistState({
        isEnabled: false,
        taskListId: null,
        taskListName: null,
        lastSyncedAt: null,
        pendingDeleteIds: [],
      });
    } catch (err) {
      console.error('[TasksSync] disableSync 저장 오류:', err);
    }
  },

  setShowScopeRequestModal: (show) => set({ showScopeRequestModal: show }),
  setShowTaskListPicker: (show) => set({ showTaskListPicker: show }),

  fetchTaskLists: async () => {
    try {
      const { authenticateGoogle, googleTasksPort } = await import('@adapters/di/container');
      const accessToken = await authenticateGoogle.getValidAccessToken();
      const lists = await googleTasksPort.listTaskLists(accessToken);
      set({ taskLists: lists });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Task List 조회 중 오류가 발생했습니다.' });
    }
  },

  selectTaskList: async (id, name) => {
    set({
      isEnabled: true,
      taskListId: id,
      taskListName: name,
      showTaskListPicker: false,
      error: null,
    });

    try {
      const state = get();
      await persistState({
        isEnabled: true,
        taskListId: id,
        taskListName: name,
        lastSyncedAt: state.lastSyncedAt,
        pendingDeleteIds: state.pendingDeleteIds,
      });
    } catch (err) {
      console.error('[TasksSync] selectTaskList 저장 오류:', err);
    }

    // 선택 즉시 동기화 실행
    await get().syncNow();
  },

  syncNow: async () => {
    const state = get();
    if (!state.isEnabled || !state.taskListId) return;

    set({ isSyncing: true, error: null });
    const taskListId = state.taskListId;

    try {
      const { authenticateGoogle, googleTasksPort, todoRepository } = await import('@adapters/di/container');
      const { useTodoStore } = await import('./useTodoStore');

      const accessToken = await authenticateGoogle.getValidAccessToken();

      // 삭제 대기 중인 원격 Task 처리 (tombstone)
      const pending = get().pendingDeleteIds;
      if (pending.length > 0) {
        for (const id of pending) {
          try {
            await googleTasksPort.deleteTask(accessToken, taskListId, id);
          } catch (err) {
            // 이미 없거나 권한 문제 — 무시하고 계속 (tombstone은 클리어)
            console.warn('[TasksSync] pending delete 실패 (무시):', id, err);
          }
        }
        set({ pendingDeleteIds: [] });
        // 영속화는 syncNow 마지막 persistState에서 자동 반영
      }

      // 로컬 todos 로드
      const data = await todoRepository.getTodos();
      const localTodos: readonly Todo[] = data?.todos ?? [];

      // Google Tasks에서 최신 목록 조회
      const remoteTasks = await googleTasksPort.listTasks(accessToken, taskListId);
      const remoteMap = new Map(remoteTasks.filter((t) => !t.deleted).map((t) => [t.id, t]));

      // 업데이트된 todos 배열 구성
      const processedTodos: Todo[] = [];

      for (const todo of localTodos) {
        if (todo.archivedAt) {
          processedTodos.push(todo);
          continue;
        }

        if (!todo.googleTaskId) {
          // 원격에 없는 todo → 생성
          const created = await googleTasksPort.createTask(accessToken, taskListId, {
            title: todo.text,
            status: todo.completed ? 'completed' : 'needsAction',
            ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
          });
          processedTodos.push({ ...todo, googleTaskId: created.id, googleTaskListId: taskListId });
        } else {
          const remote = remoteMap.get(todo.googleTaskId);
          if (!remote) {
            // 원격에서 삭제된 경우 — 로컬 연동 해제 후 유지
            const { googleTaskId: _removed, googleTaskListId: _removed2, ...rest } = todo;
            void _removed;
            void _removed2;
            processedTodos.push(rest as Todo);
          } else {
            // 원격 업데이트 (로컬 기준)
            await googleTasksPort.updateTask(accessToken, taskListId, todo.googleTaskId, {
              title: todo.text,
              status: todo.completed ? 'completed' : 'needsAction',
              ...(todo.dueDate ? { due: `${todo.dueDate}T00:00:00.000Z` } : {}),
            });
            processedTodos.push(todo);
            remoteMap.delete(todo.googleTaskId);
          }
        }
      }

      // 원격에만 있는 Task → 로컬에 신규 추가
      const now = new Date().toISOString();
      for (const remote of remoteMap.values()) {
        const newTodo: Todo = {
          id: generateUUID(),
          text: remote.title,
          completed: remote.status === 'completed',
          createdAt: now,
          googleTaskId: remote.id,
          googleTaskListId: taskListId,
          ...(remote.due ? { dueDate: remote.due.substring(0, 10) } : {}),
          ...(remote.notes ? { notes: remote.notes } : {}),
        };
        processedTodos.push(newTodo);
      }

      // 저장
      await todoRepository.saveTodos({ todos: processedTodos, categories: data?.categories });

      const lastSyncedAt = new Date().toISOString();
      set({ lastSyncedAt, isSyncing: false });

      // 스토어 갱신
      await useTodoStore.getState().refresh();

      // 상태 영속
      await persistState({
        isEnabled: get().isEnabled,
        taskListId: get().taskListId,
        taskListName: get().taskListName,
        lastSyncedAt,
        pendingDeleteIds: get().pendingDeleteIds,
      });
    } catch (err) {
      console.error('[TasksSync] syncNow 오류:', err);
      set({
        isSyncing: false,
        error: err instanceof Error ? err.message : '동기화 중 오류가 발생했습니다.',
      });
    }
  },

  initialize: async () => {
    try {
      const { storage } = await import('@adapters/di/container');
      const saved = await storage.read<PersistedState>(STORAGE_KEY);
      if (!saved) return;

      set({
        isEnabled: saved.isEnabled,
        taskListId: saved.taskListId,
        taskListName: saved.taskListName,
        lastSyncedAt: saved.lastSyncedAt,
        pendingDeleteIds: saved.pendingDeleteIds ?? [],
      });
    } catch (err) {
      console.error('[TasksSync] initialize 오류:', err);
    }
  },

  markForRemoteDelete: async (googleTaskId) => {
    const current = get().pendingDeleteIds;
    if (current.includes(googleTaskId)) return;
    const next = [...current, googleTaskId];
    set({ pendingDeleteIds: next });

    try {
      const state = get();
      await persistState({
        isEnabled: state.isEnabled,
        taskListId: state.taskListId,
        taskListName: state.taskListName,
        lastSyncedAt: state.lastSyncedAt,
        pendingDeleteIds: next,
      });
    } catch (err) {
      console.error('[TasksSync] markForRemoteDelete 저장 오류:', err);
    }
  },
}));
