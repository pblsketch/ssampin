import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import type { Todo, TodosData } from '@domain/entities/Todo';
import { stampTodoCompletions } from '@domain/rules/todoCompletion';

export class JsonTodoRepository implements ITodoRepository {
  constructor(
    private readonly storage: IStoragePort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  getTodos(): Promise<TodosData | null> {
    return this.storage.read<TodosData>('todos');
  }

  /**
   * 완료 시각은 **여기서** 찍는다(`stampTodoCompletions`). 할 일을 완료하는 길이 화면·모바일·
   * 구글 할 일 동기화·AI 연결로 여럿이라, 길마다 챙기게 두면 한 곳은 반드시 빠진다.
   *
   * 직전 저장본을 못 읽어도 저장은 막지 않는다 — 그때는 새로 끝낸 일의 시각이 비어 있을 뿐이다.
   */
  async saveTodos(data: TodosData): Promise<void> {
    const todos = stampTodoCompletions(await this.readPreviousTodos(), data.todos, this.now());
    await this.storage.write('todos', todos === data.todos ? data : { ...data, todos });
  }

  private async readPreviousTodos(): Promise<readonly Todo[] | null> {
    try {
      const todos = (await this.storage.read<TodosData>('todos'))?.todos;
      return Array.isArray(todos) ? todos : null;
    } catch {
      return null;
    }
  }
}
