import type { Todo, TodoCategory, TodosData, SubTask } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import { calculateNextDueDate } from '@domain/rules/todoRules';
import { generateUUID } from '@infrastructure/utils/uuid';

/**
 * 로컬 변경에 따른 Google Tasks `pendingRemoteOp` 결정 규칙.
 * - archive 중 → 'delete' (원격에서 지워야 함, 단 googleTaskId 있을 때만)
 * - googleTaskId 없음 → 'create'
 * - googleTaskId 있음 → 'update'
 *
 * remoteDeletedAt(원격에서 의도적 삭제됨)이 마킹된 항목은 자동 push 대상에서 제외된다.
 */
function nextPendingOp(todo: Pick<Todo, 'googleTaskId' | 'archivedAt' | 'remoteDeletedAt'>): Todo['pendingRemoteOp'] {
  if (todo.remoteDeletedAt) return undefined;
  if (todo.archivedAt) return todo.googleTaskId ? 'delete' : undefined;
  return todo.googleTaskId ? 'update' : 'create';
}

/** mutation 시 메타데이터(updatedAt + pendingRemoteOp) 자동 부여 헬퍼. */
function withSyncMeta<T extends Todo>(todo: T, now: string): T {
  return {
    ...todo,
    updatedAt: now,
    pendingRemoteOp: nextPendingOp(todo),
  };
}

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
   * 새로운 투두를 추가합니다. updatedAt + pendingRemoteOp:'create' 자동 부여.
   */
  async add(todo: Todo): Promise<void> {
    const now = new Date().toISOString();
    const enriched: Todo = {
      ...todo,
      updatedAt: todo.updatedAt ?? now,
      pendingRemoteOp: todo.pendingRemoteOp ?? 'create',
    };

    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const newTodos: readonly Todo[] = [...currentTodos, enriched];
    await this.todoRepository.saveTodos({ todos: newTodos, categories: data?.categories });
  }

  /**
   * 투두를 부분 업데이트합니다 (우선순위, 카테고리 등).
   */
  async updateTodo(id: string, changes: Partial<Pick<Todo, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'subTasks' | 'sortOrder' | 'time' | 'startDate' | 'status' | 'completed' | 'notes'>>): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const now = new Date().toISOString();

    const updatedTodos: readonly Todo[] = currentTodos.map((todo) =>
      todo.id === id ? withSyncMeta({ ...todo, ...changes }, now) : todo,
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
    const now = new Date().toISOString();

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
          createdAt: now,
          updatedAt: now,
          pendingRemoteOp: 'create',  // 새 인스턴스는 원격에 신규 생성 필요
        };

        const updated = currentTodos.map((t) =>
          t.id === id ? withSyncMeta({ ...t, completed: true }, now) : t,
        );
        await this.todoRepository.saveTodos({ todos: [...updated, nextTodo], categories: data?.categories });
        return nextTodo;
      }
    }

    // 일반 토글
    const updatedTodos: readonly Todo[] = currentTodos.map((todo) =>
      todo.id === id ? withSyncMeta({ ...todo, completed: !todo.completed }, now) : todo,
    );

    await this.todoRepository.saveTodos({ todos: updatedTodos, categories: data?.categories });
    return null;
  }

  /**
   * 특정 투두를 삭제합니다 (영구 삭제).
   * googleTaskId가 있는 항목의 원격 정리는 호출 측(useTodoStore)에서 markForRemoteDelete로 처리.
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
    const now = new Date().toISOString();

    const updated = todos.map((todo) =>
      todo.id === todoId
        ? withSyncMeta({ ...todo, subTasks: [...(todo.subTasks ?? []), subTask] }, now)
        : todo,
    );
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
    return subTask;
  }

  /** 서브태스크 토글 */
  async toggleSubTask(todoId: string, subTaskId: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const now = new Date().toISOString();

    const updated = todos.map((todo) => {
      if (todo.id !== todoId) return todo;
      const subTasks = (todo.subTasks ?? []).map((st) =>
        st.id === subTaskId ? { ...st, completed: !st.completed } : st,
      );
      return withSyncMeta({ ...todo, subTasks }, now);
    });
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /** 서브태스크 삭제 */
  async deleteSubTask(todoId: string, subTaskId: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const now = new Date().toISOString();

    const updated = todos.map((todo) => {
      if (todo.id !== todoId) return todo;
      const subTasks = (todo.subTasks ?? []).filter((st) => st.id !== subTaskId);
      return withSyncMeta({ ...todo, subTasks }, now);
    });
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /**
   * 완료된 할 일 일괄 아카이브.
   * Google Tasks와 연동된 항목은 pendingRemoteOp:'delete' + pendingDeleteIds 반환 → 호출 측에서 원격 삭제 큐에 등록.
   */
  async archiveCompleted(): Promise<{ archivedCount: number; pendingDeleteIds: readonly string[] }> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const now = new Date().toISOString();
    const pendingDeleteIds: string[] = [];

    let archivedCount = 0;
    const updated = todos.map((todo) => {
      if (todo.completed && !todo.archivedAt) {
        archivedCount++;
        if (todo.googleTaskId && !todo.remoteDeletedAt) {
          pendingDeleteIds.push(todo.googleTaskId);
        }
        return withSyncMeta({ ...todo, archivedAt: now }, now);
      }
      return todo;
    });

    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
    return { archivedCount, pendingDeleteIds };
  }

  /** 아카이브에서 복원. 이전에 원격 삭제됐었다면 신규 생성 큐로 진입. */
  async restoreFromArchive(id: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];
    const now = new Date().toISOString();

    const updated = todos.map((todo) => {
      if (todo.id !== id) return todo;
      const restored: Todo = {
        ...todo,
        archivedAt: undefined,
        completed: false,
        updatedAt: now,
      };
      // remoteDeletedAt이 있었다면(원격 정리 완료된 항목) → 신규 생성으로 재진입
      if (restored.remoteDeletedAt) {
        return {
          ...restored,
          remoteDeletedAt: undefined,
          googleTaskId: undefined,
          googleTaskListId: undefined,
          pendingRemoteOp: 'create' as const,
        };
      }
      // googleTaskId 살아있으면 update, 없으면 create
      return {
        ...restored,
        pendingRemoteOp: (restored.googleTaskId ? 'update' : 'create') as Todo['pendingRemoteOp'],
      };
    });
    await this.todoRepository.saveTodos({ todos: updated, categories: data?.categories });
  }

  /**
   * 아카이브 항목 영구 삭제.
   * googleTaskId가 살아있는 항목들은 pendingDeleteIds로 반환 → 호출 측에서 원격 삭제 큐에 등록.
   */
  async deleteArchived(ids?: string[]): Promise<{ deletedCount: number; pendingDeleteIds: readonly string[] }> {
    const data = await this.todoRepository.getTodos();
    const todos = data?.todos ?? [];

    // 삭제 대상 식별
    const willDelete = ids
      ? todos.filter((t) => ids.includes(t.id))
      : todos.filter((t) => !!t.archivedAt);

    // googleTaskId가 있고 아직 원격에 살아있는 항목만 원격 삭제 큐로
    const pendingDeleteIds = willDelete
      .filter((t) => !!t.googleTaskId && !t.remoteDeletedAt)
      .map((t) => t.googleTaskId as string);

    // 로컬에서는 즉시 제거 (영구 삭제는 hard delete)
    const remaining = ids
      ? todos.filter((t) => !ids.includes(t.id))
      : todos.filter((t) => !t.archivedAt);

    await this.todoRepository.saveTodos({ todos: remaining, categories: data?.categories });
    return { deletedCount: willDelete.length, pendingDeleteIds };
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
