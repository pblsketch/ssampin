import type { TodoRecurrence } from '@domain/entities/Todo';

export const RECURRENCE_PRESETS: {
  label: string;
  value: TodoRecurrence | null;
}[] = [
  { label: '반복 없음', value: null },
  { label: '매일', value: { type: 'daily', interval: 1 } },
  { label: '평일마다', value: { type: 'weekdays', interval: 1 } },
  { label: '매주', value: { type: 'weekly', interval: 1 } },
  { label: '격주', value: { type: 'weekly', interval: 2 } },
  { label: '매월', value: { type: 'monthly', interval: 1 } },
  { label: '매년', value: { type: 'yearly', interval: 1 } },
];

export function getRecurrenceLabel(recurrence: TodoRecurrence): string {
  const preset = RECURRENCE_PRESETS.find(
    (p) => p.value && p.value.type === recurrence.type && p.value.interval === recurrence.interval,
  );
  return preset?.label ?? '사용자 정의';
}
