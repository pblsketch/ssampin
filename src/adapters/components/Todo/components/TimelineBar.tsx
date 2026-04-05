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

  const subTasks = todo.subTasks ?? [];
  const hasSubTasks = subTasks.length > 0;
  const completedCount = subTasks.filter(s => s.completed).length;
  const allDone = hasSubTasks && completedCount === subTasks.length;

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
    <div className="flex items-center bg-sp-card group relative min-w-max">
      {/* 할 일 이름 */}
      <div
        className={`w-64 shrink-0 px-4 h-10 flex items-center text-sm border-r border-b border-sp-border/30 cursor-pointer hover:bg-sp-surface/30 sticky left-0 z-10 bg-sp-card ${isDone ? 'text-sp-muted line-through' : 'text-sp-text'}`}
        title={todo.text}
        onClick={onEdit}
      >
        <span className="truncate">{todo.text}</span>
        {hasSubTasks && (
          <span className="text-[10px] text-sp-muted ml-1.5 shrink-0">
            {completedCount}/{subTasks.length}
          </span>
        )}
      </div>

      {/* 서브태스크 툴팁 */}
      {hasSubTasks && (
        <div className="absolute left-64 top-0 z-40 bg-sp-surface ring-1 ring-sp-border rounded-lg p-2.5 shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity delay-300 min-w-[160px] max-w-[240px]">
          <div className="text-xs font-medium text-sp-text mb-1.5">하위 할 일</div>
          <div className="border-t border-sp-border/50 mb-1.5" />
          {subTasks.map(sub => (
            <div key={sub.id} className="flex items-start gap-1 text-[11px] mb-0.5">
              <span className={sub.completed ? 'text-green-400' : 'text-sp-muted'}>
                {sub.completed ? '☑' : '☐'}
              </span>
              <span className={sub.completed ? 'text-sp-muted line-through' : 'text-sp-text'}>
                {sub.text}
              </span>
            </div>
          ))}
          <div className="text-[10px] text-sp-muted mt-1.5 pt-1.5 border-t border-sp-border/30">
            진행률 {completedCount}/{subTasks.length} 완료
          </div>
        </div>
      )}

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
              hasSubTasks ? (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-4 flex gap-px ${
                    idx === startIdx ? 'left-1' : 'left-0'
                  } right-0`}
                >
                  {subTasks.map((sub) => (
                    <div
                      key={sub.id}
                      className={`flex-1 h-full rounded-sm ${barColor} ${
                        isDone ? 'opacity-20' : sub.completed ? 'opacity-70' : 'opacity-20'
                      }`}
                    />
                  ))}
                </div>
              ) : (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full ${barColor} ${
                    isDone ? 'opacity-30' : 'opacity-70'
                  } ${idx === startIdx ? 'left-1 rounded-l-full' : 'left-0'} ${
                    isDueDate ? 'right-0 rounded-r-full' : 'right-0'
                  }`}
                />
              )
            )}
            {isDueDate && !isInRange && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={`w-2.5 h-2.5 rounded-full ${barColor} ${
                  isDone ? 'opacity-40' : ''
                } ring-2 ring-sp-card ${
                  hasSubTasks && !allDone ? 'ring-current opacity-60' : ''
                }`} />
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
