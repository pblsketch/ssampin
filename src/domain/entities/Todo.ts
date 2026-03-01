export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;   // "YYYY-MM-DD"
  readonly createdAt: string;  // ISO 8601
}

export interface TodosData {
  readonly todos: readonly Todo[];
}
