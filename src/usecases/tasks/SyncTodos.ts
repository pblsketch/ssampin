/**
 * Google Tasks 동기화 유스케이스
 *
 * 로컬 Todo ↔ Google Tasks 양방향 동기화 처리.
 * domain 레이어만 의존.
 */
import type { Todo } from '@domain/entities/Todo';
import type { IGoogleTasksPort, GoogleTask } from '@domain/ports/IGoogleTasksPort';

/** 동기화 결과 */
export interface TasksSyncResult {
  readonly pushed: number;    // 로컬 → Google 전송 수
  readonly pulled: number;    // Google → 로컬 가져온 수
  readonly updated: number;   // 양쪽 업데이트 수
  readonly deleted: number;   // 삭제된 수
  readonly conflicts: number; // 충돌 수
}

/** 동기화 변경 항목 */
export interface TasksSyncChange {
  readonly type: 'push' | 'pull' | 'conflict' | 'delete-remote' | 'delete-local';
  readonly localTodo?: Todo;
  readonly remoteTask?: GoogleTask;
}

export class SyncTodos {
  constructor(
    private readonly tasksPort: IGoogleTasksPort,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  /**
   * 로컬 Todo를 Google Tasks로 푸시
   * googleTaskId가 없으면 create, 있으면 update
   */
  async pushToGoogle(
    todos: readonly Todo[],
    taskListId: string,
  ): Promise<readonly Todo[]> {
    const accessToken = await this.getAccessToken();
    const updatedTodos: Todo[] = [];

    for (const todo of todos) {
      // 아카이브된 항목은 동기화하지 않음
      if (todo.archivedAt) continue;

      const googleTask = this.toGoogleTask(todo);

      if (todo.googleTaskId) {
        // 기존 Task 업데이트
        await this.tasksPort.updateTask(
          accessToken,
          taskListId,
          todo.googleTaskId,
          googleTask,
        );
        updatedTodos.push(todo);
      } else {
        // 새 Task 생성
        const created = await this.tasksPort.createTask(
          accessToken,
          taskListId,
          googleTask,
        );
        updatedTodos.push({
          ...todo,
          googleTaskId: created.id,
          googleTaskListId: taskListId,
        });
      }
    }

    return updatedTodos;
  }

  /**
   * Google Tasks에서 로컬로 가져오기
   * 기존 Todo와 googleTaskId로 매칭, 없으면 새 Todo 생성
   */
  async pullFromGoogle(
    existingTodos: readonly Todo[],
    taskListId: string,
    lastSyncedAt?: string,
  ): Promise<{ todos: readonly Todo[]; hasChanges: boolean }> {
    const accessToken = await this.getAccessToken();
    const remoteTasks = await this.tasksPort.listTasks(
      accessToken,
      taskListId,
      lastSyncedAt,
    );

    const todoMap = new Map(
      existingTodos
        .filter((t) => t.googleTaskId)
        .map((t) => [t.googleTaskId!, t]),
    );

    let hasChanges = false;
    const result = [...existingTodos];

    for (const remoteTask of remoteTasks) {
      // 삭제된 Task 처리
      if (remoteTask.deleted) {
        const idx = result.findIndex((t) => t.googleTaskId === remoteTask.id);
        if (idx >= 0) {
          result.splice(idx, 1);
          hasChanges = true;
        }
        continue;
      }

      // 하위 Task는 건너뛰기 (쌤핀 subTask로 매핑 불가)
      if (remoteTask.parent) continue;

      const existing = todoMap.get(remoteTask.id);

      if (existing) {
        // 기존 Todo 업데이트
        const updated = this.mergeFromGoogle(existing, remoteTask);
        const idx = result.findIndex((t) => t.id === existing.id);
        if (idx >= 0) {
          result[idx] = updated;
          hasChanges = true;
        }
      } else {
        // 새 Todo 생성
        const newTodo = this.fromGoogleTask(remoteTask, taskListId);
        result.push(newTodo);
        hasChanges = true;
      }
    }

    return { todos: result, hasChanges };
  }

  /**
   * 전체 동기화 (push + pull)
   */
  async fullSync(
    todos: readonly Todo[],
    taskListId: string,
    lastSyncedAt?: string,
  ): Promise<{ todos: readonly Todo[]; result: TasksSyncResult }> {
    // 1. 먼저 로컬 → Google 푸시
    const pushedTodos = await this.pushToGoogle(todos, taskListId);

    // 푸시된 Todo로 기존 목록 업데이트
    const mergedAfterPush = todos.map((t) => {
      const pushed = pushedTodos.find((p) => p.id === t.id);
      return pushed ?? t;
    });

    // 2. Google → 로컬 풀
    const { todos: finalTodos, hasChanges } = await this.pullFromGoogle(
      mergedAfterPush,
      taskListId,
      lastSyncedAt,
    );

    const pushed = pushedTodos.length;
    const pulled = hasChanges ? finalTodos.length - mergedAfterPush.length : 0;

    return {
      todos: finalTodos,
      result: {
        pushed,
        pulled: Math.max(0, pulled),
        updated: 0,
        deleted: 0,
        conflicts: 0,
      },
    };
  }

  /** Todo → Google Task 변환 */
  private toGoogleTask(todo: Todo): Partial<GoogleTask> {
    const task: Record<string, unknown> = {
      title: todo.text,
      status: todo.completed ? 'completed' : 'needsAction',
    };

    if (todo.notes) {
      task['notes'] = todo.notes;
    }

    if (todo.dueDate) {
      // Google Tasks는 RFC3339 date 형식 (시간 없이 날짜만)
      task['due'] = `${todo.dueDate}T00:00:00.000Z`;
    }

    return task as Partial<GoogleTask>;
  }

  /** Google Task → 새 Todo 생성 */
  private fromGoogleTask(task: GoogleTask, taskListId: string): Todo {
    return {
      id: crypto.randomUUID(),
      text: task.title,
      completed: task.status === 'completed',
      dueDate: task.due ? task.due.split('T')[0] : undefined,
      notes: task.notes,
      createdAt: new Date().toISOString(),
      googleTaskId: task.id,
      googleTaskListId: taskListId,
    };
  }

  /** 기존 Todo에 Google Task 데이터 병합 */
  private mergeFromGoogle(existing: Todo, remote: GoogleTask): Todo {
    return {
      ...existing,
      text: remote.title,
      completed: remote.status === 'completed',
      dueDate: remote.due ? remote.due.split('T')[0] : existing.dueDate,
      notes: remote.notes ?? existing.notes,
    };
  }
}
