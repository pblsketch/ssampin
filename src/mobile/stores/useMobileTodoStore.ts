import { create } from 'zustand';
import type { Todo, TodoCategory } from '@domain/entities/Todo';
import { todoRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileTodoState {
  todos: readonly Todo[];
  categories: readonly TodoCategory[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addTodo: (todo: Todo) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  toggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  /** 완료된(미보관) 할 일을 일괄 보관. 보관된 개수 반환. */
  archiveCompleted: () => Promise<number>;
  /** 보관함 항목을 다시 활성(미완료)으로 복원. */
  restoreFromArchive: (id: string) => Promise<void>;
}

export const useMobileTodoStore = create<MobileTodoState>((set, get) => ({
  todos: [],
  categories: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await todoRepository.getTodos();
      if (data?.todos) {
        set({ todos: data.todos, categories: data.categories ?? [], loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  addTodo: async (todo) => {
    const todos = [...get().todos, todo];
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  toggleTodo: async (id) => {
    const todos = get().todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteTodo: async (id) => {
    const todos = get().todos.filter((t) => t.id !== id);
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  toggleSubTask: async (todoId, subTaskId) => {
    const todos = get().todos.map((t) =>
      t.id === todoId && t.subTasks
        ? {
            ...t,
            subTasks: t.subTasks.map((st) =>
              st.id === subTaskId ? { ...st, completed: !st.completed } : st,
            ),
          }
        : t,
    );
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  archiveCompleted: async () => {
    const now = new Date().toISOString();
    let count = 0;
    const todos = get().todos.map((t) => {
      if (t.completed && !t.archivedAt) {
        count++;
        const archived: Todo = { ...t, archivedAt: now, updatedAt: now };
        // Google Tasks 연동 항목은 다음 PC 동기화에서 원격 삭제되도록 표시(데스크톱 archiveCompleted와 동일)
        if (t.googleTaskId && !t.remoteDeletedAt) {
          return { ...archived, pendingRemoteOp: 'delete' as const };
        }
        return archived;
      }
      return t;
    });
    if (count === 0) return 0;
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
    return count;
  },

  restoreFromArchive: async (id) => {
    const now = new Date().toISOString();
    const todos = get().todos.map((t) => {
      if (t.id !== id) return t;
      const restored: Todo = { ...t, archivedAt: undefined, completed: false, updatedAt: now };
      // 이전에 원격 정리된 항목이면 다음 동기화에서 신규 생성으로 재진입
      if (restored.remoteDeletedAt) {
        return { ...restored, remoteDeletedAt: undefined, pendingRemoteOp: 'create' as const };
      }
      return restored;
    });
    set({ todos });
    await todoRepository.saveTodos({ todos, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
