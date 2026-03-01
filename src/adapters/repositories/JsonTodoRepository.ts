import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';
import type { TodosData } from '@domain/entities/Todo';

export class JsonTodoRepository implements ITodoRepository {
  constructor(private readonly storage: IStoragePort) {}

  getTodos(): Promise<TodosData | null> {
    return this.storage.read<TodosData>('todos');
  }

  saveTodos(data: TodosData): Promise<void> {
    return this.storage.write('todos', data);
  }
}
