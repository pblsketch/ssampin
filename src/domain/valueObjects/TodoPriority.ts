import type { TodoPriority } from '@domain/entities/Todo';

export const PRIORITY_CONFIG: Record<TodoPriority, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  sortOrder: number;
}> = {
  high:   { label: '높음', icon: '🔴', color: 'text-red-500',    bgColor: 'bg-red-500/10',    sortOrder: 0 },
  medium: { label: '보통', icon: '🟡', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', sortOrder: 1 },
  low:    { label: '낮음', icon: '🔵', color: 'text-blue-500',   bgColor: 'bg-blue-500/10',   sortOrder: 2 },
  none:   { label: '없음', icon: '⚪', color: 'text-sp-muted',   bgColor: '',                  sortOrder: 3 },
};
