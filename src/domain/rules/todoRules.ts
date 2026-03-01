import type { Todo } from '@domain/entities/Todo';

/**
 * 투두 정렬: 미완료 위, 완료 아래. 각 그룹 내에서는 생성순 유지.
 */
export function sortTodos(todos: readonly Todo[]): readonly Todo[] {
  const incomplete = todos.filter((t) => !t.completed);
  const complete = todos.filter((t) => t.completed);
  return [...incomplete, ...complete];
}

/**
 * 날짜 범위 필터링
 */
export function filterByDateRange(
  todos: readonly Todo[],
  range: 'today' | 'week' | 'all',
  today: Date = new Date(),
): readonly Todo[] {
  if (range === 'all') return todos;

  const todayStr = formatDate(today);

  if (range === 'today') {
    return todos.filter((t) => t.dueDate === todayStr || !t.dueDate);
  }

  // 'week': 오늘부터 7일 이내
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = formatDate(weekEnd);

  return todos.filter((t) => {
    if (!t.dueDate) return true;
    return t.dueDate >= todayStr && t.dueDate <= weekEndStr;
  });
}

/**
 * 날짜별 그룹핑: "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "noDueDate"
 */
export function groupByDate(
  todos: readonly Todo[],
  today: Date = new Date(),
): Record<string, readonly Todo[]> {
  const todayStr = formatDate(today);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDate(tomorrow);

  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = formatDate(weekEnd);

  const overdue: Todo[] = [];
  const todayGroup: Todo[] = [];
  const tomorrowGroup: Todo[] = [];
  const thisWeek: Todo[] = [];
  const later: Todo[] = [];
  const noDueDate: Todo[] = [];

  for (const todo of todos) {
    if (!todo.dueDate) {
      noDueDate.push(todo);
    } else if (todo.dueDate < todayStr && !todo.completed) {
      overdue.push(todo);
    } else if (todo.dueDate === todayStr) {
      todayGroup.push(todo);
    } else if (todo.dueDate === tomorrowStr) {
      tomorrowGroup.push(todo);
    } else if (todo.dueDate <= weekEndStr) {
      thisWeek.push(todo);
    } else {
      later.push(todo);
    }
  }

  const groups: Record<string, readonly Todo[]> = {
    overdue,
    today: todayGroup,
    tomorrow: tomorrowGroup,
    thisWeek,
    later,
    noDueDate,
  };

  return groups;
}

/**
 * 기한 초과 여부 판정
 */
export function isOverdue(todo: Todo, today: Date = new Date()): boolean {
  if (!todo.dueDate || todo.completed) return false;
  return todo.dueDate < formatDate(today);
}

/** Date → "YYYY-MM-DD" */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
