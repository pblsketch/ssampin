import type { Todo, TodoCategory } from '@domain/entities/Todo';
import { inferStatus } from '@domain/rules/todoRules';

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  purple: 'bg-purple-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  gray: 'bg-gray-500',
};

interface TimelineBarProps {
  todo: Todo;
  days: string[];
  category?: TodoCategory;
  zoomLevel?: 'day' | 'week' | 'month';
  onEdit?: () => void;
}

export function TimelineBar({ todo, days, category, zoomLevel = 'day', onEdit }: TimelineBarProps) {
  const status = inferStatus(todo);
  const isDone = status === 'done';

  // 줌 레벨에 따라 날짜를 해당 기간 인덱스로 매핑
  const findPeriodIdx = (dateStr: string | undefined): number => {
    if (!dateStr) return -1;
    if (zoomLevel === 'day') return days.findIndex(d => d === dateStr);
    // week/month: 해당 날짜가 속하는 기간 찾기
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] !== undefined && dateStr >= days[i]!) return i;
    }
    return -1;
  };

  const dueDateIdx = findPeriodIdx(todo.dueDate);
  const hasRange = !!todo.startDate;
  const startIdx = hasRange ? findPeriodIdx(todo.startDate) : -1;

  const barColor = category
    ? (CATEGORY_COLORS[category.color] ?? 'bg-sp-accent')
    : 'bg-sp-accent';

  const todayStr = new Date().toISOString().slice(0, 10);
  const cellWidth = zoomLevel === 'day' ? 'w-12' : zoomLevel === 'week' ? 'w-16' : 'w-20';

  return (
    <div className="flex items-center">
      {/* 할 일 이름 */}
      <div
        className={`w-64 shrink-0 px-4 h-10 flex items-center truncate text-sm border-r border-b border-sp-border/30 cursor-pointer hover:bg-sp-surface/30 sticky left-0 z-10 bg-sp-card ${isDone ? 'text-sp-muted line-through' : 'text-sp-text'}`}
        title={todo.text}
        onClick={onEdit}
      >
        {todo.text}
      </div>

      {/* 타임라인 셀 */}
      {days.map((day, idx) => {
        const isToday = zoomLevel === 'day'
          ? day === todayStr
          : zoomLevel === 'week'
            ? todayStr >= day && todayStr < (days[idx + 1] ?? '9999-12-31')
            : todayStr >= day && todayStr < (days[idx + 1] ?? '9999-12-31');
        const isInRange = hasRange && dueDateIdx >= 0 && startIdx >= 0 && idx >= startIdx && idx <= dueDateIdx;
        const isDueDate = idx === dueDateIdx;

        return (
          <div
            key={day}
            className={`${cellWidth} shrink-0 h-10 border-r border-b border-sp-border/30 relative ${
              isToday ? 'bg-sp-accent/5' : ''
            }`}
          >
            {/* 오늘 마커 라인 */}
            {isToday && (
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-sp-accent/30 z-10" />
            )}
            {isInRange && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full ${barColor} ${
                  isDone ? 'opacity-30' : 'opacity-70'
                } ${idx === startIdx ? 'left-1 rounded-l-full' : 'left-0'} ${
                  isDueDate ? 'right-0 rounded-r-full' : 'right-0'
                }`}
              />
            )}
            {isDueDate && !isInRange && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${barColor} ${
                  isDone ? 'opacity-40' : ''
                } ring-2 ring-sp-card`} />
              </div>
            )}
            {isDueDate && isInRange && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${barColor} ${
                  isDone ? 'opacity-40' : ''
                } ring-2 ring-sp-card z-10`} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
