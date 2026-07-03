import { todayISO } from '@mobile/utils/date';
import type { TodoPriority } from '@domain/entities/Todo';

export const PRIORITY_CONFIG: Record<TodoPriority, { label: string; icon: string; color: string }> =
  {
    high: { label: '긴급', icon: 'flag', color: 'text-sp-error' },
    medium: { label: '보통', icon: 'flag', color: 'text-sp-warning' },
    low: { label: '낮음', icon: 'flag', color: 'text-sp-success' },
    none: { label: '없음', icon: '', color: 'text-sp-muted' },
  };

export function calcDDay(dueDate: string): { label: string; colorClass: string } {
  const today = todayISO();
  const todayMs = new Date(today).getTime();
  const dueMs = new Date(dueDate).getTime();
  const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `D+${Math.abs(diffDays)}`, colorClass: 'text-sp-error' };
  } else if (diffDays === 0) {
    return { label: 'D-Day', colorClass: 'text-sp-accent' };
  } else {
    return { label: `D-${diffDays}`, colorClass: 'text-sp-muted' };
  }
}
