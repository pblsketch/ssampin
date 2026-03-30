import type { Todo, TodoCategory, TodosData, SubTask } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import { calculateNextDueDate } from '@domain/rules/todoRules';
import { generateUUID } from '@infrastructure/utils/uuid';

export class ManageTodos {
  constructor(private readonly todoRepository: ITodoRepository) {}

  /**
   * 모든 투두를 조회합니다.
   * 저장된 데이터가 없으면 빈 배열을 반환합니다.
   */
  async getAll(): Promise<readonly Todo[]> {
    const data = await this.todoRepository.getTodos();
    return data?.todos ?? [];
  }

  /** 전체 데이터 조회 (카테고리 포함) */
  async getData(): Promise<TodosData> {
    const data = await this.todoRepository.getTodos();
    return data ?? { todos: [] };
  }

  /**
   * 새로운 투두를 추가합니다.
   */
  async add(todo: Todo): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const newTodos: readonly Todo[] = [...currentTodos, todo];
    await this.todoRepository.saveTodos({ todos: newTodos, categories: data?.categories });
  }

  /**
   * 투두를 부분 업데이트합니다 (우선순위, 카테고리 등).
   */
  async updateTodo(id: string, changes: Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'subTasks' | 'sortOrder' | 'time'>>): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];

    const updatedTodos: readonly Todo[] = currentTodos.map((todo) =>
      todo.id === id ? { ...todo, ...changes } : todo,
    );

    await this.todoRepository.saveTodos({ todos: updatedTodos, categories: data?.categories });
  }

  /**
   * 특정 투두의 완료 상태를 토글합니다.
   * 반복 할 일이 완료되면 다음 인스턴스를 자동 생성합니다.
   * @returns 새로 생성된 반복 인스턴스 (있을 경우), 없으면 null
   */
  async toggleTodo(id: string): Promise<Todo | null> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const target = currentTodos.find((t) => t.id === id);

    if (!target) return null;

    // 반복 할 일이 완료되면 → 다음 인스턴스 자동 생성
    if (!target.completed && target.recurrence && target.dueDate) {
      const nextDueDate = calculateNextDueDate(target.dueDate, target.recurrence);

      // 종료일 체크
      if (!target.recurrence.endDate || nextDueDate <= target.recurrence.endDate) {
        const nextTodo: Todo = {
          id: generateUUID(),
          text: target.text,
          completed: false,
          priority: target.priority,
          category: target.category,
          recurrence: target.recurrence,
          dueDate: nextDueDate,
          createdAt: new Date().toISOString(),
        };

        const updated = currentTodos.map((t) =>
          t.id === id ? { ...t, completed: true } : t,
        );
        await this.todoRepository.saveTodos({ todos: [...updated, nextTodo], categories: data?.categories });
        return nextTodo;
      }
    }

    // 일반 토글
    const updatedTodos: readonly Todo[] = currentTodos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo,
    );

    await this.todoRepository.saveTodos({ todos: updatedTodos, categories: data?.categories });
    return null;
  }

  /**
   * 특정 투두를 삭제합니다.
   */
  async delete(id: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const filteredTodos: readonly Todo[] = currentTodos.filter((todo) => todo.id !== id);
    await this.todoRepository.saveTodos({ todos: filteredTodos, categories: data?.categories });
  }

  /** 서브태스크 추가 */
  async addSubTask(todoId: string, text: string): Promise<SubTask> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const subTask: SubTask = { id: generateUUID(), text, completed: false };

    const updated = todos.map((todo) =>
      todo.id === todoId
        ? { ...todo, subTasks: [...(todo.subTasks ?? []), subTask] }
        : todo,
    );
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
    return subTask;
  }

  /** 서브태스크 토글 */
  async toggleSubTask(todoId: string, subTaskId: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];

    const updated = todos.map((todo) => {
      if (todo.id !== todoId) return todo;
      const subTasks = (todo.subTasks ?? []).map((st) =>
        st.id === subTaskId ? { ...st, completed: !st.completed } : st,
      );
      return { ...todo, subTasks };
    });
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /** 서브태스크 삭제 */
  async deleteSubTask(todoId: string, subTaskId: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];

    const updated = todos.map((todo) => {
      if (todo.id !== todoId) return todo;
      const subTasks = (todo.subTasks ?? []).filter((st) => st.id !== subTaskId);
      return { ...todo, subTasks };
    });
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /** 완료된 할 일 일괄 아카이브 */
  async archiveCompleted(): Promise<number> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const now = new Date().toISOString();

    let archivedCount = 0;
    const updated = todos.map((todo) => {
      if (todo.completed && !todo.archivedAt) {
        archivedCount++;
        return { ...todo, archivedAt: now };
      }
      return todo;
    });

    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
    return archivedCount;
  }

  /** 아카이브에서 복원 */
  async restoreFromArchive(id: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const updated = todos.map((todo) =>
      todo.id === id ? { ...todo, archivedAt: undefined, completed: false } : todo,
    );
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /** 아카이브 항목 영구 삭제 */
  async deleteArchived(ids?: string[]): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const filtered = ids
      ? todos.filter((t) => !ids.includes(t.id))
      : todos.filter((t) => !t.archivedAt);
    await this.todoRepository.saveTodos({ todos: filtered, categories: data?.categories });
  }

  /** 카테고리 저장 */
  async saveCategories(categories: readonly TodoCategory[]): Promise<void> {
    const data = await this.todoRepository.getTodos();
    await this.todoRepository.saveTodos({ todos: data?.todos ?? [], categories });
  }

  /** 카테고리 조회 */
  async getCategories(): Promise<readonly TodoCategory[]> {
    const data = await this.todoRepository.getTodos();
    return data?.categories ?? [];
  }
}
