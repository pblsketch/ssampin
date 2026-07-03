import { todayISO } from '@mobile/utils/date';
import type { TodoPriority } from '@domain/entities/Todo';

export const PRIORITY_CONFIG: Record<
  TodoPriority,
  { label: string; emoji: string; color: string }
> = {
  high: { label: '긴급', emoji: '🔴', color: 'text-red-400' },
  medium: { label: '보통', emoji: '🟡', color: 'text-yellow-400' },
  low: { label: '낮음', emoji: '🟢', color: 'text-green-400' },
  none: { label: '없음', emoji: '', color: 'text-sp-muted' },
};

export function calcDDay(dueDate: string): { label: string; colorClass: string } {
  const today = todayISO();
  const todayMs = new Date(today).getTime();
  const dueMs = new Date(dueDate).getTime();
  const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `D+${Math.abs(diffDays)}`, colorClass: 'text-red-400' };
  } else if (diffDays === 0) {
    return { label: 'D-Day', colorClass: 'text-sp-accent' };
  } else {
    return { label: `D-${diffDays}`, colorClass: 'text-sp-muted' };
  }
}
