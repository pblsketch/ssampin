import { useMemo, useRef, useState } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { toLocalDateString } from '@shared/utils/localDate';
import type { Todo } from '@domain/entities/Todo';
import {
  filterActive,
  filterByCategory,
} from '@domain/rules/todoRules';
import { TimelineBar } from '../components/TimelineBar';
import { TodoEditModal } from '../components/TodoEditModal';

interface TimelineViewProps {
  categoryFilter: string | null;
}

type ZoomLevel = 'day' | 'week' | 'month';

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the Monday of the week containing `d` */
function getMondayOf(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  const dow = result.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  result.setDate(result.getDate() + diff);
  return result;
}

/** Return the first day of the month containing `d` */
function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function TimelineView({ categoryFilter }: TimelineViewProps) {
  const { todos, categories, updateTodo, addTodo } = useTodoStore();
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('day');
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [quickAddText, setQuickAddText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = direction === 'left' ? -300 : 300;
    scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  // 활성 할 일 + 카테고리 필터 적용
  const filteredTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) {
      filtered = filterByCategory(filtered, categoryFilter);
    }
    return filtered;
  }, [todos, categoryFilter]);

  // 마감일 또는 시작일이 있는 할 일만 표시
  const todosWithDueDate = useMemo(
    () => filteredTodos.filter(t => t.dueDate || t.startDate),
    [filteredTodos],
  );

  // 마감일/시작일 없는 할 일 수
  const todosWithoutDueDate = useMemo(
    () => filteredTodos.filter(t => !t.dueDate && !t.startDate).length,
    [filteredTodos],
  );

  // 날짜 범위 계산 (줌 레벨별)
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dateCandidates = todosWithDueDate.flatMap(t => {
      const arr: Date[] = [];
      if (t.dueDate) arr.push(new Date(t.dueDate));
      if (t.startDate) arr.push(new Date(t.startDate));
      return arr;
    });
    const maxDate = dateCandidates.length > 0
      ? new Date(Math.max(...dateCandidates.map(d => d.getTime())))
      : today;

    if (zoomLevel === 'day') {
      const minEnd = new Date(today.getTime() + 14 * 86400000);
      let end = new Date(Math.max(maxDate.getTime(), minEnd.getTime()));
      end.setDate(end.getDate() + 7);
      const maxEnd = new Date(today.getTime() + 90 * 86400000);
      if (end > maxEnd) end = maxEnd;
      return { start: today, end };
    }

    if (zoomLevel === 'week') {
      // min 8 weeks, max 26 weeks
      const minEnd = new Date(today.getTime() + 8 * 7 * 86400000);
      let end = new Date(Math.max(maxDate.getTime(), minEnd.getTime()));
      // add 2 weeks padding
      end = new Date(end.getTime() + 2 * 7 * 86400000);
      const maxEnd = new Date(today.getTime() + 26 * 7 * 86400000);
      if (end > maxEnd) end = maxEnd;
      return { start: getMondayOf(today), end };
    }

    // month
    const minEnd = new Date(today.getFullYear(), today.getMonth() + 4, 1);
    let endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 1);
    if (endMonth < minEnd) endMonth = minEnd;
    const maxEnd = new Date(today.getFullYear(), today.getMonth() + 12, 1);
    if (endMonth > maxEnd) endMonth = maxEnd;
    return { start: getMonthStart(today), end: endMonth };
  }, [todosWithDueDate, zoomLevel]);

  // 컬럼(일/주/월) 목록 생성
  const days = useMemo(() => {
    const result: string[] = [];
    if (zoomLevel === 'day') {
      const d = new Date(dateRange.start);
      while (d <= dateRange.end) {
        result.push(formatDateToYMD(d));
        d.setDate(d.getDate() + 1);
      }
    } else if (zoomLevel === 'week') {
      const d = new Date(dateRange.start);
      while (d <= dateRange.end) {
        result.push(formatDateToYMD(d));
        d.setDate(d.getDate() + 7);
      }
    } else {
      // month
      const d = new Date(dateRange.start);
      while (d <= dateRange.end) {
        result.push(formatDateToYMD(d));
        d.setMonth(d.getMonth() + 1);
      }
    }
    return result;
  }, [dateRange, zoomLevel]);

  const todayStr = formatDateToYMD(new Date());

  const colWidth =
    zoomLevel === 'day' ? 'w-12' : zoomLevel === 'week' ? 'w-16' : 'w-20';

  return (
    <>
    <div className="flex items-center gap-2 mb-3">
      <input
        type="text"
        value={quickAddText}
        onChange={(e) => setQuickAddText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && quickAddText.trim()) { void addTodo(quickAddText.trim(), toLocalDateString()); setQuickAddText(''); }}}
        placeholder="새 할 일 추가... (오늘 날짜로 타임라인에 표시됩니다)"
        className="flex-1 bg-sp-surface text-sp-text text-sm px-3 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none placeholder:text-sp-muted"
      />
      <button
        type="button"
        onClick={() => { if (quickAddText.trim()) { void addTodo(quickAddText.trim(), toLocalDateString()); setQuickAddText(''); }}}
        disabled={!quickAddText.trim()}
        className="flex items-center gap-1.5 bg-sp-accent hover:bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <span className="material-symbols-outlined text-icon">add</span>
        추가
      </button>
    </div>
    <div className="flex flex-col h-[calc(100vh-320px)] min-h-[400px]">
      {/* 줌 레벨 토글 */}
      <div className="flex items-center justify-between mb-2">
        <div />
        <div className="flex items-center gap-1 bg-sp-surface rounded-lg p-0.5">
          {(['day', 'week', 'month'] as const).map(level => (
            <button
              key={level}
              type="button"
              onClick={() => setZoomLevel(level)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                zoomLevel === level
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {{ day: '일', week: '주', month: '월' }[level]}
            </button>
          ))}
        </div>
      </div>

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
        <div className="flex-1 relative overflow-hidden">
          {/* 좌우 스크롤 버튼 */}
          <button
            type="button"
            onClick={() => scrollTimeline('left')}
            className="absolute left-1 bottom-4 z-20 w-8 h-8 rounded-full bg-sp-surface hover:bg-sp-accent/20 border border-sp-border flex items-center justify-center text-sp-muted hover:text-sp-text transition-colors shadow-lg"
          >
            <span className="material-symbols-outlined text-icon">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => scrollTimeline('right')}
            className="absolute right-1 bottom-4 z-20 w-8 h-8 rounded-full bg-sp-surface hover:bg-sp-accent/20 border border-sp-border flex items-center justify-center text-sp-muted hover:text-sp-text transition-colors shadow-lg"
          >
            <span className="material-symbols-outlined text-icon">chevron_right</span>
          </button>
          <div ref={scrollRef} className="overflow-x-auto overflow-y-auto bg-sp-card rounded-xl ring-1 ring-sp-border h-full">
          {/* 날짜 헤더 */}
          <div className="flex sticky top-0 z-30 bg-sp-bg min-w-max">
            <div className="w-64 shrink-0 px-4 flex items-center text-xs font-bold text-sp-muted border-b border-r border-sp-border h-14 sticky left-0 z-20 bg-sp-bg">
              할 일
            </div>
            {days.map(day => {
              const date = new Date(day);

              if (zoomLevel === 'day') {
                const isToday = day === todayStr;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isMonday = date.getDay() === 1;
                return (
                  <div
                    key={day}
                    className={`${colWidth} shrink-0 border-b border-r border-sp-border/30 text-center py-1 relative h-14 flex flex-col items-center justify-center ${
                      isToday ? 'bg-sp-accent/10' : isWeekend ? 'bg-sp-surface/50' : ''
                    }`}
                  >
                    <div className={`text-[10px] ${isToday ? 'text-sp-accent font-bold' : 'text-sp-muted'}`}>
                      {DAY_NAMES[date.getDay()]}
                    </div>
                    <div className={`text-xs ${isToday ? 'text-sp-accent font-bold' : isMonday ? 'text-sp-text' : 'text-sp-muted'}`}>
                      {date.getMonth() + 1}/{date.getDate()}
                    </div>
                    {isToday && (
                      <div className="text-[9px] text-sp-accent font-bold">(오늘)</div>
                    )}
                  </div>
                );
              }

              if (zoomLevel === 'week') {
                const mondayStr = formatDateToYMD(date);
                const isCurrentWeek = todayStr >= mondayStr &&
                  todayStr < formatDateToYMD(new Date(date.getTime() + 7 * 86400000));
                return (
                  <div
                    key={day}
                    className={`${colWidth} shrink-0 border-b border-r border-sp-border/30 text-center py-1 h-14 flex flex-col items-center justify-center ${
                      isCurrentWeek ? 'bg-sp-accent/10' : ''
                    }`}
                  >
                    <div className={`text-xs ${isCurrentWeek ? 'text-sp-accent font-bold' : 'text-sp-muted'}`}>
                      {date.getMonth() + 1}/{date.getDate()}
                    </div>
                    {isCurrentWeek && (
                      <div className="text-[9px] text-sp-accent">이번주</div>
                    )}
                  </div>
                );
              }

              // month
              const isCurrentMonth =
                date.getFullYear() === new Date().getFullYear() &&
                date.getMonth() === new Date().getMonth();
              return (
                <div
                  key={day}
                  className={`${colWidth} shrink-0 border-b border-r border-sp-border/30 text-center py-1 h-14 flex flex-col items-center justify-center ${
                    isCurrentMonth ? 'bg-sp-accent/10' : ''
                  }`}
                >
                  <div className={`text-xs font-medium ${isCurrentMonth ? 'text-sp-accent font-bold' : 'text-sp-muted'}`}>
                    {date.getMonth() + 1}월
                  </div>
                  {isCurrentMonth && (
                    <div className="text-[9px] text-sp-accent">이번달</div>
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
              zoomLevel={zoomLevel}
              onEdit={() => setEditingTodo(todo)}
            />
          ))}
          </div>
        </div>
      )}

      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          categories={categories}
          onUpdate={(id, changes) => void updateTodo(id, changes)}
          onClose={() => setEditingTodo(null)}
        />
      )}
    </div>
    </>
  );
}
