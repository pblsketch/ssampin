import type { TodosData } from '../entities/Todo';

export interface ITodoRepository {
  getTodos(): Promise<TodosData | null>;
  saveTodos(data: TodosData): Promise<void>;
}
