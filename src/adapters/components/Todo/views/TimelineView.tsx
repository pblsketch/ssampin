import { useMemo } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import {
  filterActive,
  filterByCategory,
} from '@domain/rules/todoRules';
import { TimelineBar } from '../components/TimelineBar';

interface TimelineViewProps {
  categoryFilter: string | null;
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function TimelineView({ categoryFilter }: TimelineViewProps) {
  const { todos, categories } = useTodoStore();

  // 활성 할 일 + 카테고리 필터 적용
  const filteredTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) {
      filtered = filterByCategory(filtered, categoryFilter);
    }
    return filtered;
  }, [todos, categoryFilter]);

  // 마감일이 있는 할 일만 표시
  const todosWithDueDate = useMemo(
    () => filteredTodos.filter(t => t.dueDate),
    [filteredTodos],
  );

  // 마감일 없는 할 일 수
  const todosWithoutDueDate = useMemo(
    () => filteredTodos.filter(t => !t.dueDate).length,
    [filteredTodos],
  );

  // 날짜 범위: 오늘 ~ 가장 늦은 마감일 + 7일 (최소 14일, 최대 90일)
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = todosWithDueDate.map(t => new Date(t.dueDate!));
    const maxDate = dates.length > 0
      ? new Date(Math.max(...dates.map(d => d.getTime())))
      : today;

    const end = new Date(Math.max(maxDate.getTime(), today.getTime() + 14 * 86400000));
    end.setDate(end.getDate() + 7);

    // 최대 90일 제한
    const maxEnd = new Date(today.getTime() + 90 * 86400000);
    if (end > maxEnd) end.setTime(maxEnd.getTime());

    return { start: today, end };
  }, [todosWithDueDate]);

  // 날짜 목록 생성
  const days = useMemo(() => {
    const result: string[] = [];
    const d = new Date(dateRange.start);
    while (d <= dateRange.end) {
      result.push(formatDateToYMD(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [dateRange]);

  const todayStr = formatDateToYMD(new Date());

  return (
    <div className="flex flex-col h-[calc(100vh-320px)] min-h-[400px]">
      {/* 마감일 없는 항목 안내 */}
      {todosWithoutDueDate > 0 && (
        <div className="px-4 py-2 text-xs text-sp-muted bg-sp-surface rounded-lg mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-icon">info</span>
          마감일 없는 할 일 {todosWithoutDueDate}개는 타임라인에 표시되지 않습니다.
        </div>
      )}

      {todosWithDueDate.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sp-muted">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl mb-3 opacity-40">timeline</span>
            <p className="text-lg">마감일이 설정된 할 일이 없습니다</p>
            <p className="text-sm mt-1">할 일에 마감일을 추가하면 타임라인에 표시됩니다</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto bg-sp-card rounded-xl ring-1 ring-sp-border">
          {/* 날짜 헤더 */}
          <div className="flex sticky top-0 z-10 bg-sp-bg">
            <div className="w-64 shrink-0 px-4 py-2 text-xs font-bold text-sp-muted border-b border-r border-sp-border">
              할 일
            </div>
            {days.map(day => {
              const isToday = day === todayStr;
              const date = new Date(day);
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const isMonday = date.getDay() === 1;

              return (
                <div
                  key={day}
                  className={`w-12 shrink-0 border-b border-r border-sp-border/30 text-center py-1 relative ${
                    isToday ? 'bg-sp-accent/10' : isWeekend ? 'bg-sp-surface/50' : ''
                  }`}
                >
                  {isToday && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-sp-accent" />
                  )}
                  <div className={`text-[10px] ${isToday ? 'text-sp-accent font-bold' : 'text-sp-muted'}`}>
                    {DAY_NAMES[date.getDay()]}
                  </div>
                  <div className={`text-xs ${isToday ? 'text-sp-accent font-bold' : isMonday ? 'text-sp-text' : 'text-sp-muted'}`}>
                    {date.getDate()}
                  </div>
                  {(date.getDate() === 1 || isMonday) && (
                    <div className="text-[9px] text-sp-muted">
                      {date.getMonth() + 1}월
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 할 일 행 */}
          {todosWithDueDate.map(todo => (
            <TimelineBar
              key={todo.id}
              todo={todo}
              days={days}
              category={categories.find(c => c.id === todo.category)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
