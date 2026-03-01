import { create } from 'zustand';
import type { Todo } from '@domain/entities/Todo';
import { todoRepository } from '@adapters/di/container';
import { ManageTodos } from '@usecases/todo/ManageTodos';

interface TodoState {
  todos: readonly Todo[];
  loaded: boolean;
  load: () => Promise<void>;
  addTodo: (text: string, dueDate?: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
}

export const useTodoStore = create<TodoState>((set, get) => {
  const manageTodos = new ManageTodos(todoRepository);

  return {
    todos: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const todos = await manageTodos.getAll();
        set({ todos, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    addTodo: async (text, dueDate) => {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
        ...(dueDate !== undefined ? { dueDate } : {}),
      };
      await manageTodos.add(newTodo);
      set((state) => ({ todos: [...state.todos, newTodo] }));
    },

    toggleTodo: async (id) => {
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        ),
      }));
      await manageTodos.toggleTodo(id);
    },

    deleteTodo: async (id) => {
      await manageTodos.delete(id);
      set((state) => ({
        todos: state.todos.filter((todo) => todo.id !== id),
      }));
    },
  };
});
