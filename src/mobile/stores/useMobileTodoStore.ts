import { create } from 'zustand';
import type { Todo } from '@domain/entities/Todo';
import { todoRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileTodoState {
  todos: readonly Todo[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addTodo: (todo: Todo) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

export const useMobileTodoStore = create<MobileTodoState>((set, get) => ({
  todos: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await todoRepository.getTodos();
      if (data?.todos) {
        set({ todos: data.todos, loaded: true });
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
    await todoRepository.saveTodos({ todos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  toggleTodo: async (id) => {
    const todos = get().todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t,
    );
    set({ todos });
    await todoRepository.saveTodos({ todos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteTodo: async (id) => {
    const todos = get().todos.filter((t) => t.id !== id);
    set({ todos });
    await todoRepository.saveTodos({ todos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
