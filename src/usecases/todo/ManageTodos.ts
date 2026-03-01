import type { Todo } from '@domain/entities/Todo';
import type { ITodoRepository } from '@domain/repositories/ITodoRepository';

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

  /**
   * 새로운 투두를 추가합니다.
   */
  async add(todo: Todo): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];
    const newTodos: readonly Todo[] = [...currentTodos, todo];
    await this.todoRepository.saveTodos({ todos: newTodos });
  }

  /**
   * 특정 투두의 완료 상태를 토글합니다.
   */
  async toggleTodo(id: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];

    const updatedTodos: readonly Todo[] = currentTodos.map((todo) =>
      todo.id === id
        ? {
            ...todo,
            completed: !todo.completed,
          }
        : todo,
    );

    await this.todoRepository.saveTodos({ todos: updatedTodos });
  }

  /**
   * 특정 투두를 삭제합니다.
   */
  async delete(id: string): Promise<void> {
    const data = await this.todoRepository.getTodos();
    const currentTodos = data?.todos ?? [];

    const filteredTodos: readonly Todo[] = currentTodos.filter(
      (todo) => todo.id !== id,
    );

    await this.todoRepository.saveTodos({ todos: filteredTodos });
  }
}
