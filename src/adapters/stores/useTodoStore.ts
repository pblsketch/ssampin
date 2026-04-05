import { create } from 'zustand';
import type { Todo, TodoCategory, TodoPriority, TodoRecurrence, SubTask } from '@domain/entities/Todo';
import { DEFAULT_TODO_CATEGORIES } from '@domain/entities/Todo';
import { todoRepository } from '@adapters/di/container';
import { ManageTodos } from '@usecases/todo/ManageTodos';
import { generateUUID } from '@infrastructure/utils/uuid';

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
    time?: string,
  ) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  updateTodo: (id: string, changes: Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'subTasks' | 'sortOrder' | 'time' | 'status' | 'completed'>>) => Promise<void>;

  // 서브태스크
  addSubTask: (todoId: string, text: string) => Promise<void>;
  toggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  deleteSubTask: (todoId: string, subTaskId: string) => Promise<void>;

  // 정렬
  reorderTodos: (todoIds: string[], groupKey: string) => Promise<void>;

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

    addTodo: async (text, dueDate, priority, category, recurrence, time) => {
      const newTodo: Todo = {
        id: generateUUID(),
        text,
        completed: false,
        createdAt: new Date().toISOString(),
        priority: priority ?? 'none',
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(recurrence !== undefined ? { recurrence } : {}),
        ...(time !== undefined ? { time } : {}),
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
      // status ↔ completed 동기화
      let syncedChanges = { ...changes };
      if (syncedChanges.status !== undefined) {
        syncedChanges = { ...syncedChanges, completed: syncedChanges.status === 'done' };
      } else if (syncedChanges.completed !== undefined) {
        syncedChanges = { ...syncedChanges, status: syncedChanges.completed ? 'done' : 'todo' };
      }

      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === id ? { ...todo, ...syncedChanges } : todo,
        ),
      }));
      await manageTodos.updateTodo(id, syncedChanges);
    },

    addSubTask: async (todoId, text) => {
      const subTask: SubTask = { id: generateUUID(), text, completed: false };
      set((state) => ({
        todos: state.todos.map((todo) =>
          todo.id === todoId
            ? { ...todo, subTasks: [...(todo.subTasks ?? []), subTask] }
            : todo,
        ),
      }));
      await manageTodos.addSubTask(todoId, text);
    },

    toggleSubTask: async (todoId, subTaskId) => {
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = (todo.subTasks ?? []).map((st) =>
            st.id === subTaskId ? { ...st, completed: !st.completed } : st,
          );
          return { ...todo, subTasks };
        }),
      }));
      await manageTodos.toggleSubTask(todoId, subTaskId);
    },

    deleteSubTask: async (todoId, subTaskId) => {
      set((state) => ({
        todos: state.todos.map((todo) => {
          if (todo.id !== todoId) return todo;
          const subTasks = (todo.subTasks ?? []).filter((st) => st.id !== subTaskId);
          return { ...todo, subTasks };
        }),
      }));
      await manageTodos.deleteSubTask(todoId, subTaskId);
    },

    reorderTodos: async (todoIds) => {
      const updates: { id: string; sortOrder: number }[] = todoIds.map((id, idx) => ({ id, sortOrder: idx }));
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
