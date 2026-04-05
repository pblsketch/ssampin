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
}

export function TimelineBar({ todo, days, category }: TimelineBarProps) {
  const status = inferStatus(todo);
  const isDone = status === 'done';

  // 마감일 인덱스 찾기
  const dueDateIdx = days.findIndex(d => d === todo.dueDate);
  // 생성일 인덱스 (타임라인 범위 내)
  const createdDate = todo.createdAt.slice(0, 10);
  const createdIdx = days.findIndex(d => d === createdDate);
  const startIdx = createdIdx >= 0 ? createdIdx : 0;

  const barColor = category
    ? (CATEGORY_COLORS[category.color] ?? 'bg-sp-accent')
    : 'bg-sp-accent';

  return (
    <div className="flex items-center min-h-[36px] border-b border-sp-border/20">
      {/* 할 일 이름 */}
      <div className={`w-52 shrink-0 px-4 py-1.5 truncate text-sm ${isDone ? 'text-sp-muted line-through' : 'text-sp-text'}`}>
        {todo.text}
      </div>

      {/* 타임라인 셀 */}
      {days.map((day, idx) => {
        const isToday = day === new Date().toISOString().slice(0, 10);
        const isInRange = dueDateIdx >= 0 && idx >= startIdx && idx <= dueDateIdx;
        const isDueDate = idx === dueDateIdx;

        return (
          <div
            key={day}
            className={`w-10 shrink-0 h-9 border-r border-sp-border/10 relative ${
              isToday ? 'bg-sp-accent/5' : ''
            }`}
          >
            {isInRange && (
              <div
                className={`absolute top-1/2 -translate-y-1/2 h-3 rounded-full ${barColor} ${
                  isDone ? 'opacity-30' : 'opacity-70'
                } ${idx === startIdx ? 'left-1 rounded-l-full' : 'left-0'} ${
                  isDueDate ? 'right-1 rounded-r-full' : 'right-0'
                }`}
              />
            )}
            {isDueDate && (
              <div className={`absolute top-1/2 -translate-y-1/2 right-1 w-2.5 h-2.5 rounded-full ${barColor} ${
                isDone ? 'opacity-40' : ''
              } ring-2 ring-sp-card`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
