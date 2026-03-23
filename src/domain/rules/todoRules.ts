import type { Todo, TodoRecurrence } from '@domain/entities/Todo';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';

/** 할 일 정렬 모드 */
export type TodoSortMode = 'priority' | 'dueDate';

/**
 * 투두 정렬
 * @param mode 'priority' = 우선순위 우선 (기본), 'dueDate' = 마감일 우선 (D-Day 순)
 */
export function sortTodos(
  todos: readonly Todo[],
  mode: TodoSortMode = 'priority',
): readonly Todo[] {
  return [...todos].sort((a, b) => {
    // 1차: 완료 여부
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    if (mode === 'dueDate') {
      // D-Day 순: 마감일 빠른 순 → 우선순위
      if (a.dueDate && b.dueDate) {
        const cmp = a.dueDate.localeCompare(b.dueDate);
        if (cmp !== 0) return cmp;
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      // 마감일 같으면 우선순위
      const pa = PRIORITY_CONFIG[a.priority ?? 'none'].sortOrder;
      const pb = PRIORITY_CONFIG[b.priority ?? 'none'].sortOrder;
      return pa - pb;
    }

    // priority 모드 (기존 로직)
    // 2차: 수동 정렬 순서 (설정된 경우 최우선)
    if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    }
    // 3차: 우선순위 (높은 순)
    const pa = PRIORITY_CONFIG[a.priority ?? 'none'].sortOrder;
    const pb = PRIORITY_CONFIG[b.priority ?? 'none'].sortOrder;
    if (pa !== pb) return pa - pb;
    // 4차: 마감일 (빠른 순)
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
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

/** 카테고리 필터링 */
export function filterByCategory(
  todos: readonly Todo[],
  categoryId: string | null,
): readonly Todo[] {
  if (!categoryId) return todos;
  return todos.filter((t) => t.category === categoryId);
}

/** 아카이브되지 않은 (활성) 할 일만 필터 */
export function filterActive(todos: readonly Todo[]): readonly Todo[] {
  return todos.filter((t) => !t.archivedAt);
}

/** 아카이브된 할 일만 필터 */
export function filterArchived(todos: readonly Todo[]): readonly Todo[] {
  return todos.filter((t) => !!t.archivedAt);
}

/** 반복 할 일의 다음 마감일 계산 */
export function calculateNextDueDate(
  currentDate: string,
  recurrence: TodoRecurrence,
): string {
  const date = new Date(currentDate + 'T00:00:00');

  switch (recurrence.type) {
    case 'daily':
      date.setDate(date.getDate() + recurrence.interval);
      break;
    case 'weekdays': {
      let daysToAdd = recurrence.interval;
      while (daysToAdd > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) daysToAdd--;
      }
      break;
    }
    case 'weekly':
      date.setDate(date.getDate() + 7 * recurrence.interval);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + recurrence.interval);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + recurrence.interval);
      break;
  }

  return formatDate(date);
}

/** Date → "YYYY-MM-DD" */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
