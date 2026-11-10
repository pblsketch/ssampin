import { create } from 'zustand';
import type {
  Todo,
  TodoCategory,
  TodoPriority,
  TodoRecurrence,
  SubTask,
} from '@domain/entities/Todo';
import { DEFAULT_TODO_CATEGORIES, TODO_LOCAL_ONLY_FIELDS } from '@domain/entities/Todo';
import { todoRepository } from '@adapters/di/container';
import { ManageTodos } from '@usecases/todo/ManageTodos';
import { generateUUID } from '@infrastructure/utils/uuid';

interface TodoState {
  todos: readonly Todo[];
  categories: readonly TodoCategory[];
  loaded: boolean;
  /**
   * 이 창에서 방금 추가한 할 일 id(최근 것이 뒤, 최대 RECENTLY_ADDED_LIMIT 개).
   * 홈 카드·확장 편집기는 목록을 앞에서 N개만 보여 주는데, 새 할 일은 정렬상 뒤에 놓여
   * "입력했는데 안 생긴다"로 보였다. 잘라 낼 때 이 id 들은 빼고 자른다. 저장하지 않는다.
   */
  recentlyAddedIds: readonly string[];

  load: () => Promise<void>;
  /**
   * 강제 재로딩 — 동기화 후 UI 갱신용.
   * 읽어 온 내용이 지금과 같으면 `todos` 배열을 바꾸지 않는다(자동 동기화가 배열 교체를
   * "할 일이 바뀌었다"로 읽어 다시 동기화하기 때문 — useTasksAutoSync).
   */
  refresh: () => Promise<void>;
  /** 새 할 일을 저장하고 그 id 를 돌려준다. 저장에 실패하면 던진다. */
  addTodo: (
    text: string,
    dueDate?: string,
    priority?: TodoPriority,
    category?: string,
    recurrence?: TodoRecurrence,
    time?: string,
    startDate?: string,
  ) => Promise<string>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  updateTodo: (
    id: string,
    changes: Partial<
      Pick<
        Todo,
        | 'text'
        | 'priority'
        | 'category'
        | 'recurrence'
        | 'dueDate'
        | 'startDate'
        | 'subTasks'
        | 'sortOrder'
        | 'time'
        | 'status'
        | 'completed'
        | 'checkAt'
        | 'relatedStaff'
      >
    >,
  ) => Promise<void>;

  // 서브태스크
  addSubTask: (todoId: string, text: string) => Promise<void>;
  toggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  deleteSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  /** 하위 할 일 글 고치기 — 빈 글·같은 글이면 저장하지 않는다 */
  updateSubTaskText: (todoId: string, subTaskId: string, text: string) => Promise<void>;
  /** 하위 할 일을 한 칸 위(-1)·아래(1)로 — 끝에서는 그대로 */
  moveSubTask: (todoId: string, subTaskId: string, direction: -1 | 1) => Promise<void>;

  // 정렬
  reorderTodos: (todoIds: string[], groupKey: string) => Promise<void>;

  // 아카이브
  archiveCompleted: () => Promise<number>;
  restoreFromArchive: (id: string) => Promise<void>;
  deleteArchived: (ids?: string[]) => Promise<void>;

  // 카테고리
  saveCategories: (categories: readonly TodoCategory[]) => Promise<void>;
}

/**
 * Google Tasks 연동된 todo의 원격 삭제 큐 등록.
 * useTasksSyncStore가 활성화돼 있을 때만 동작.
 */
async function enqueueRemoteDeletes(googleTaskIds: readonly string[]): Promise<void> {
  if (googleTaskIds.length === 0) return;
  try {
    const { useTasksSyncStore } = await import('./useTasksSyncStore');
    const tasksState = useTasksSyncStore.getState();
    if (!tasksState.isEnabled || !tasksState.taskListId) return;
    for (const gid of googleTaskIds) {
      await tasksState.markForRemoteDelete(gid);
    }
  } catch (err) {
    console.error('[Todo] enqueueRemoteDeletes 실패:', err);
  }
}

/** 방금 추가한 할 일로 기억해 둘 개수 — 여러 건을 한꺼번에 넣어도 목록이 한없이 길어지지 않게 */
const RECENTLY_ADDED_LIMIT = 5;

/**
 * 내용 비교용 문자열 — 키 순서와 `undefined` 값에 흔들리지 않는다.
 * 화면이 든 할 일과 파일에서 읽은 할 일은 값이 같아도 키 순서가 다를 수 있다.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const source = v as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) ordered[key] = source[key];
    return ordered;
  });
}

export const useTodoStore = create<TodoState>((set, get) => {
  const manageTodos = new ManageTodos(todoRepository);

  return {
    todos: [],
    categories: [],
    loaded: false,
    recentlyAddedIds: [],

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await manageTodos.getData();
        // 기존 데이터 마이그레이션: priority 없으면 'none'
        const migrated = (data.todos ?? []).map((todo) => ({
          ...todo,
          priority: todo.priority ?? ('none' as TodoPriority),
        }));
        const categories = (data.categories ?? [...DEFAULT_TODO_CATEGORIES]).map((cat) => ({
          ...cat,
          icon: cat.icon || '📌',
        }));
        set({ todos: migrated, categories, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    refresh: async () => {
      try {
        const data = await manageTodos.getData();
        // 기존 데이터 마이그레이션: priority 없으면 'none'
        const migrated = (data.todos ?? []).map((todo) => ({
          ...todo,
          priority: todo.priority ?? ('none' as TodoPriority),
        }));
        const categories = (data.categories ?? [...DEFAULT_TODO_CATEGORIES]).map((cat) => ({
          ...cat,
          icon: cat.icon || '📌',
        }));
        // 내용이 같으면 배열을 그대로 둔다. 동기화는 끝날 때마다 refresh 를 부르는데, 매번 새
        // 배열을 넣으면 자동 동기화(배열이 바뀌면 2.5초 뒤 동기화)가 그것을 변경으로 읽어
        // 동기화 → refresh → 동기화가 끝없이 돌았다. 비교는 동기화가 끝날 때 한 번뿐이다.
        const prev = get();
        const sameTodos = canonicalJson(prev.todos) === canonicalJson(migrated);
        const sameCategories = canonicalJson(prev.categories) === canonicalJson(categories);
        if (sameTodos && sameCategories) return;
        set({
          todos: sameTodos ? prev.todos : migrated,
          categories: sameCategories ? prev.categories : categories,
        });
      } catch (err) {
        console.error('[Todo] refresh 오류:', err);
      }
    },

    addTodo: async (text, dueDate, priority, category, recurrence, time, startDate) => {
      const now = new Date().toISOString();
      const newTodo: Todo = {
        id: generateUUID(),
        text,
        completed: false,
        createdAt: now,
        updatedAt: now,
        pendingRemoteOp: 'create',
        priority: priority ?? 'none',
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(recurrence !== undefined ? { recurrence } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
      };
      await manageTodos.add(newTodo);
      set((state) => ({
        todos: [...state.todos, newTodo],
        recentlyAddedIds: [...state.recentlyAddedIds, newTodo.id].slice(-RECENTLY_ADDED_LIMIT),
      }));
      return newTodo.id;
    },

    toggleTodo: async (id) => {
      // 즉시 UI 업데이트 (낙관적) — 메타데이터도 동기화
      const target = get().todos.find((t) => t.id === id);
      const nextCompleted = target ? !target.completed : true;
      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== id) return todo;
          // 서브태스크가 있으면 모두 동기화
          const subTasks =
            todo.subTasks && todo.subTasks.length > 0
              ? todo.subTasks.map((st) => ({ ...st, completed: nextCompleted }))
              : todo.subTasks;
          return {
            ...todo,
            completed: nextCompleted,
            subTasks,
            updatedAt: now,
            pendingRemoteOp: todo.archivedAt
              ? todo.googleTaskId
                ? ('delete' as const)
                : undefined
              : todo.googleTaskId
                ? ('update' as const)
                : ('create' as const),
          };
        }),
      }));

      const nextTodo = await manageTodos.toggleTodo(id);

      // 반복 할 일에서 새 인스턴스가 생성된 경우 추가
      if (nextTodo && target && !target.completed) {
        set((state) => ({ todos: [...state.todos, nextTodo] }));
      }
    },

    deleteTodo: async (id) => {
      const target = get().todos.find((t) => t.id === id);

      await manageTodos.delete(id);
      set((state) => ({
        todos: state.todos.filter((todo) => todo.id !== id),
      }));

      // Google Tasks 연동된 할 일이면 원격 삭제 예약
      if (target?.googleTaskId && !target.remoteDeletedAt) {
        await enqueueRemoteDeletes([target.googleTaskId]);
      }
    },

    updateTodo: async (id, changes) => {
      // status ↔ completed 동기화
      let syncedChanges = { ...changes };
      if (syncedChanges.status !== undefined) {
        syncedChanges = { ...syncedChanges, completed: syncedChanges.status === 'done' };
      } else if (syncedChanges.completed !== undefined) {
        syncedChanges = { ...syncedChanges, status: syncedChanges.completed ? 'done' : 'todo' };
      }

      const now = new Date().toISOString();
      // 쌤핀 전용 항목(점검 날짜·관련인)만 바뀌었으면 구글 쓰기를 새로 걸지 않는다.
      // 구글 Tasks 에는 대응하는 자리가 없어 올려도 사라지는데, 매번 쓰기를 걸면
      // 동기화가 쉬지 않고 도는 핑퐁이 된다(ADR-039/040). 유스케이스 쪽
      // ManageTodos.withSyncMeta 와 **같은 판정**을 여기서도 해야 화면과 저장이 어긋나지 않는다.
      const changedKeys = Object.keys(syncedChanges);
      const localOnlyChange =
        changedKeys.length > 0 &&
        changedKeys.every((k) => (TODO_LOCAL_ONLY_FIELDS as readonly string[]).includes(k));

      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id
            ? {
                ...todo,
                ...syncedChanges,
                updatedAt: now,
                pendingRemoteOp: localOnlyChange
                  ? todo.pendingRemoteOp
                  : todo.archivedAt
                    ? todo.googleTaskId
                      ? ('delete' as const)
                      : undefined
                    : todo.googleTaskId
                      ? ('update' as const)
                      : ('create' as const),
              }
            : todo,
        ),
      }));
      await manageTodos.updateTodo(id, syncedChanges);
    },

    addSubTask: async (todoId, text) => {
      const subTask: SubTask = { id: generateUUID(), text, completed: false };
      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? {
                ...todo,
                subTasks: [...(todo.subTasks ?? []), subTask],
                updatedAt: now,
                pendingRemoteOp: todo.archivedAt
                  ? todo.googleTaskId
                    ? ('delete' as const)
                    : undefined
                  : todo.googleTaskId
                    ? ('update' as const)
                    : ('create' as const),
              }
            : todo,
        ),
      }));
      await manageTodos.addSubTask(todoId, text);
    },

    toggleSubTask: async (todoId, subTaskId) => {
      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = (todo.subTasks ?? []).map((st) =>
            st.id === subTaskId ? { ...st, completed: !st.completed } : st,
          );
          const allDone = subTasks.length > 0 && subTasks.every((st) => st.completed);
          const anyUndone = subTasks.some((st) => !st.completed);
          const completed = allDone ? true : anyUndone ? false : todo.completed;
          const status = allDone
            ? ('done' as const)
            : anyUndone && todo.status === 'done'
              ? ('todo' as const)
              : todo.status;
          return {
            ...todo,
            subTasks,
            completed,
            status,
            updatedAt: now,
            pendingRemoteOp: todo.archivedAt
              ? todo.googleTaskId
                ? ('delete' as const)
                : undefined
              : todo.googleTaskId
                ? ('update' as const)
                : ('create' as const),
          };
        }),
      }));
      await manageTodos.toggleSubTask(todoId, subTaskId);
    },

    deleteSubTask: async (todoId, subTaskId) => {
      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = (todo.subTasks ?? []).filter((st) => st.id !== subTaskId);
          return {
            ...todo,
            subTasks,
            updatedAt: now,
            pendingRemoteOp: todo.archivedAt
              ? todo.googleTaskId
                ? ('delete' as const)
                : undefined
              : todo.googleTaskId
                ? ('update' as const)
                : ('create' as const),
          };
        }),
      }));
      await manageTodos.deleteSubTask(todoId, subTaskId);
    },

    updateSubTaskText: async (todoId, subTaskId, text) => {
      // 유스케이스(ManageTodos.updateSubTaskText)와 **같은 판정** — 빈 글·같은 글이면
      // 화면도 저장도 건드리지 않는다. 여기서 걸러야 수정 시각·구글 쓰기 예약이 헛돌지 않는다.
      const trimmed = text.trim();
      if (!trimmed) return;
      const target = get()
        .todos.find((todo) => todo.id === todoId)
        ?.subTasks?.find((st) => st.id === subTaskId);
      if (!target || target.text === trimmed) return;

      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = (todo.subTasks ?? []).map((st) =>
            st.id === subTaskId ? { ...st, text: trimmed } : st,
          );
          return {
            ...todo,
            subTasks,
            updatedAt: now,
            pendingRemoteOp: todo.archivedAt
              ? todo.googleTaskId
                ? ('delete' as const)
                : undefined
              : todo.googleTaskId
                ? ('update' as const)
                : ('create' as const),
          };
        }),
      }));
      await manageTodos.updateSubTaskText(todoId, subTaskId, trimmed);
    },

    moveSubTask: async (todoId, subTaskId, direction) => {
      const current = get().todos.find((todo) => todo.id === todoId)?.subTasks ?? [];
      const from = current.findIndex((st) => st.id === subTaskId);
      const to = from + direction;
      // 맨 끝에서 더 나가려 하면 아무것도 하지 않는다.
      if (from === -1 || to < 0 || to >= current.length) return;

      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = [...(todo.subTasks ?? [])];
          const [moved] = subTasks.splice(from, 1);
          if (moved === undefined) return todo;
          subTasks.splice(to, 0, moved);
          return {
            ...todo,
            subTasks,
            updatedAt: now,
            pendingRemoteOp: todo.archivedAt
              ? todo.googleTaskId
                ? ('delete' as const)
                : undefined
              : todo.googleTaskId
                ? ('update' as const)
                : ('create' as const),
          };
        }),
      }));
      await manageTodos.moveSubTask(todoId, subTaskId, direction);
    },

    reorderTodos: async (todoIds) => {
      const updates: { id: string; sortOrder: number }[] = todoIds.map((id, idx) => ({
        id,
        sortOrder: idx,
      }));
      set((state) => ({
        todos: state.todos.map((todo) => {
          const entry = updates.find((u) => u.id === todo.id);
          return entry ? { ...todo, sortOrder: entry.sortOrder } : todo;
        }),
      }));
      for (const { id, sortOrder } of updates) {
        await manageTodos.updateTodo(id, { sortOrder });
      }
    },

    archiveCompleted: async () => {
      const { archivedCount, pendingDeleteIds } = await manageTodos.archiveCompleted();
      if (archivedCount > 0) {
        const now = new Date().toISOString();
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.completed && !todo.archivedAt
              ? {
                  ...todo,
                  archivedAt: now,
                  updatedAt: now,
                  pendingRemoteOp:
                    todo.googleTaskId && !todo.remoteDeletedAt ? ('delete' as const) : undefined,
                }
              : todo,
          ),
        }));

        // Google Tasks 원격 삭제 큐 등록 (Bug 2 핵심 픽스)
        await enqueueRemoteDeletes(pendingDeleteIds);
      }
      return archivedCount;
    },

    restoreFromArchive: async (id) => {
      await manageTodos.restoreFromArchive(id);
      const now = new Date().toISOString();
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== id) return todo;
          // ManageTodos.restoreFromArchive와 동일 로직
          if (todo.remoteDeletedAt) {
            return {
              ...todo,
              archivedAt: undefined,
              completed: false,
              updatedAt: now,
              remoteDeletedAt: undefined,
              googleTaskId: undefined,
              googleTaskListId: undefined,
              pendingRemoteOp: 'create' as const,
            };
          }
          return {
            ...todo,
            archivedAt: undefined,
            completed: false,
            updatedAt: now,
            pendingRemoteOp: (todo.googleTaskId ? 'update' : 'create') as Todo['pendingRemoteOp'],
          };
        }),
      }));
    },

    deleteArchived: async (ids) => {
      const { pendingDeleteIds } = await manageTodos.deleteArchived(ids);

      set((state) => ({
        todos: ids
          ? state.todos.filter((t) => !ids.includes(t.id))
          : state.todos.filter((t) => !t.archivedAt),
      }));

      // Google Tasks 원격 정리
      await enqueueRemoteDeletes(pendingDeleteIds);
    },

    saveCategories: async (categories) => {
      await manageTodos.saveCategories(categories);
      set({ categories });
    },
  };
});
