import { create } from 'zustand';
import type { Todo, TodoCategory, TodoPriority, TodoRecurrence } from '@domain/entities/Todo';
import { DEFAULT_TODO_CATEGORIES } from '@domain/entities/Todo';
import { todoRepository } from '@adapters/di/container';
import { ManageTodos } from '@usecases/todo/ManageTodos';

interface TodoState {
  todos: readonly Todo[];
  categories: readonly TodoCategory[];
  loaded: boolean;

  load: () => Promise<void>;
  addTodo: (
    text: string,
    dueDate?: string,
    priority?: TodoPriority,
    category?: string,
    recurrence?: TodoRecurrence,
  ) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  updateTodo: (id: string, changes: Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate'>>) => Promise<void>;

  // 아카이브
  archiveCompleted: () => Promise<number>;
  restoreFromArchive: (id: string) => Promise<void>;
  deleteArchived: (ids?: string[]) => Promise<void>;

  // 카테고리
  saveCategories: (categories: readonly TodoCategory[]) => Promise<void>;
}

export const useTodoStore = create<TodoState>((set, get) => {
  const manageTodos = new ManageTodos(todoRepository);

  return {
    todos: [],
    categories: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await manageTodos.getData();
        // 기존 데이터 마이그레이션: priority 없으면 'none'
        const migrated = (data.todos ?? []).map((todo) => ({
          ...todo,
          priority: todo.priority ?? 'none' as TodoPriority,
        }));
        const categories = data.categories ?? [...DEFAULT_TODO_CATEGORIES];
        set({ todos: migrated, categories, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    addTodo: async (text, dueDate, priority, category, recurrence) => {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
        priority: priority ?? 'none',
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(recurrence !== undefined ? { recurrence } : {}),
      };
      await manageTodos.add(newTodo);
      set((state) => ({ todos: [...state.todos, newTodo] }));
    },

    toggleTodo: async (id) => {
      // 즉시 UI 업데이트 (낙관적)
      const target = get().todos.find((t) => t.id === id);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        ),
      }));

      const nextTodo = await manageTodos.toggleTodo(id);

      // 반복 할 일에서 새 인스턴스가 생성된 경우 추가
      if (nextTodo && target && !target.completed) {
        set((state) => ({ todos: [...state.todos, nextTodo] }));
      }
    },

    deleteTodo: async (id) => {
      await manageTodos.delete(id);
      set((state) => ({
        todos: state.todos.filter((todo) => todo.id !== id),
      }));
    },

    updateTodo: async (id, changes) => {
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, ...changes } : todo,
        ),
      }));
      await manageTodos.updateTodo(id, changes);
    },

    archiveCompleted: async () => {
      const count = await manageTodos.archiveCompleted();
      if (count > 0) {
        const now = new Date().toISOString();
        set((state) => ({
          todos: state.todos.map((todo) =>
            todo.completed && !todo.archivedAt ? { ...todo, archivedAt: now } : todo,
          ),
        }));
      }
      return count;
    },

    restoreFromArchive: async (id) => {
      await manageTodos.restoreFromArchive(id);
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, archivedAt: undefined, completed: false } : todo,
        ),
      }));
    },

    deleteArchived: async (ids) => {
      await manageTodos.deleteArchived(ids);
      set((state) => ({
        todos: ids
          ? state.todos.filter((t) => !ids.includes(t.id))
          : state.todos.filter((t) => !t.archivedAt),
      }));
    },

    saveCategories: async (categories) => {
      await manageTodos.saveCategories(categories);
      set({ categories });
    },
  };
});
