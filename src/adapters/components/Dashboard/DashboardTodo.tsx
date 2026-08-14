import { useEffect, useMemo, useRef, useState } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { Todo } from '@domain/entities/Todo';
import { filterActive, sortTodos } from '@domain/rules/todoRules';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { TodoEditor } from '@adapters/components/Todo/TodoEditor';

const MAX_VISIBLE = 20;

interface TimelineEntry {
  id: string;
  type: 'timetable' | 'event';
  time: string | null;
  title: string;
  icon: string;
}

interface DashboardTodoProps {
  /** false일 때(모달 확장 뷰) 팝업 헤더 클릭 전용. 기본값 true(카드 뷰) */
  isCompactMode?: boolean;
}

export function DashboardTodo({ isCompactMode = true }: DashboardTodoProps) {
  const { todos, load, toggleTodo } = useTodoStore();
  const { teacherSchedule, classSchedule, load: loadSchedule } = useScheduleStore();
  const { events, load: loadEvents } = useEventsStore();
  const { settings } = useSettingsStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsWide(entry.contentRect.width >= 400);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void load();
    void loadSchedule();
    void loadEvents();
  }, [load, loadSchedule, loadEvents]);

  // 아카이브 제외 + 정렬 (우선순위 반영)
  const sorted = useMemo<readonly Todo[]>(() => {
    const active = filterActive(todos);
    return sortTodos(active);
  }, [todos]);

  // 타임라인 통합 아이템
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const showTimetable = settings.todoShowTimetable ?? false;
    const showEvents = settings.todoShowEvents ?? false;
    if (!showTimetable && !showEvents) return [];

    const items: TimelineEntry[] = [];
    const now = new Date();
    const todayKey = getDayOfWeek(now) ?? '';
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (showTimetable) {
      const dayPeriods = teacherSchedule?.[todayKey] ?? [];
      dayPeriods.forEach((p, idx) => {
        if (!p) return;
        const periodTime = settings.periodTimes.find((pt) => pt.period === idx + 1);
        items.push({
          id: `tt-${idx + 1}`,
          type: 'timetable',
          time: periodTime?.start ?? null,
          title: `${resolvePeriodLabel(idx + 1, settings.periodTimes)} ${p.subject}`,
          icon: '📚',
        });
      });

      if (dayPeriods.length === 0 || dayPeriods.every((p) => !p)) {
        const classPeriods = classSchedule?.[todayKey] ?? [];
        classPeriods.forEach((p, idx) => {
          if (!p || !p.subject) return;
          const periodTime = settings.periodTimes.find((pt) => pt.period === idx + 1);
          items.push({
            id: `tt-${idx + 1}`,
            type: 'timetable',
            time: periodTime?.start ?? null,
            title: `${resolvePeriodLabel(idx + 1, settings.periodTimes)} ${p.subject}`,
            icon: '📚',
          });
        });
      }
    }

    if (showEvents) {
      const todayEvents = events.filter(
        (e) =>
          !('isHidden' in e && e.isHidden) &&
          (e.date === todayStr ||
            (e.endDate !== undefined && e.date <= todayStr && e.endDate >= todayStr)),
      );
      for (const ev of todayEvents) {
        items.push({
          id: `ev-${ev.id}`,
          type: 'event',
          time: ev.startTime ?? ev.time?.split(' - ')[0]?.trim() ?? null,
          title: ev.title,
          icon: '📅',
        });
      }
    }

    return items.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return 0;
    });
  }, [
    settings.todoShowTimetable,
    settings.todoShowEvents,
    teacherSchedule,
    classSchedule,
    events,
    settings.periodTimes,
  ]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const completedCount = activeTodos.filter((t) => t.completed).length;
  const totalCount = activeTodos.length;

  // 미완료/완료 분리 (구분선용)
  const incomplete = visible.filter((t) => !t.completed);
  const completed = visible.filter((t) => t.completed);

  // widget-expanded-editors Phase 1A: 모달(확장) 모드는 TodoEditor에 위임.
  // WidgetModal이 헤더/패딩/배경을 제공하므로 본 컴포넌트는 본문만 렌더.
  if (!isCompactMode) {
    return <TodoEditor />;
  }

  const hasBothSections =
    timelineEntries.length > 0 && (incomplete.length > 0 || completed.length > 0);
  const showWideLayout = isWide && hasBothSections;

  const timelineList = (
    <ul className="space-y-0.5">
      {timelineEntries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-2 rounded-lg px-2 py-1 opacity-60">
          <span className="text-caption text-sp-muted w-10 text-right font-mono shrink-0">
            {entry.time ?? '--:--'}
          </span>
          <span className="text-xs shrink-0">{entry.icon}</span>
          <span className="text-xs text-sp-text truncate flex-1">{entry.title}</span>
        </li>
      ))}
    </ul>
  );

  const handleToggle = (id: string, wasCompleted: boolean) => {
    void toggleTodo(id);
    const msg = wasCompleted ? '할 일 미완료로 변경됨' : '할 일 완료';
    useToastStore
      .getState()
      .show(msg, 'success', { label: '되돌리기', onClick: () => void toggleTodo(id) }, 5000);
  };

  const todoList = (
    <>
      <ul className="space-y-1">
        {incomplete.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
        ))}
      </ul>
      {completed.length > 0 && incomplete.length > 0 && (
        <div className="my-2 border-t border-sp-border/30" />
      )}
      {completed.length > 0 && (
        <ul className="space-y-1">
          {completed.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div ref={containerRef} className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 — 클릭은 카드 본체로 bubble → WidgetCard 가 WidgetModal 오픈 */}
      <div className="mb-4 flex items-center justify-between -mx-1 px-1 py-0.5">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>✅</span>할 일 목록
        </h3>
        {totalCount > 0 && (
          <span className="text-xs text-sp-muted">
            {completedCount}/{totalCount} 완료
          </span>
        )}
      </div>

      {/* 콘텐츠 — 빈 상태 클릭도 카드 본체로 bubble → WidgetModal */}
      {totalCount === 0 && timelineEntries.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-sp-muted">클릭하여 할 일을 추가하세요</p>
        </div>
      ) : showWideLayout ? (
        /* 가로 레이아웃: 시간표/일정 | 할 일 */
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="flex-1 min-h-0 overflow-y-auto">{timelineList}</div>
          <div className="w-px bg-sp-border/30 shrink-0" />
          <div className="flex-1 min-h-0 overflow-y-auto">{todoList}</div>
        </div>
      ) : (
        /* 세로 레이아웃 (기존) */
        <div className="flex-1 min-h-0 overflow-y-auto">
          {timelineEntries.length > 0 && (
            <>
              {timelineList}
              <div className="border-t border-sp-border/30 my-2" />
            </>
          )}
          {todoList}
        </div>
      )}
    </div>
  );
}

/* ─── 마감일 라벨 ─── */

function getDueDateLabel(dueDate?: string): { text: string; className: string } | null {
  if (!dueDate) return null;

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = formatLocalDate(weekEnd);

  if (dueDate < todayStr) {
    return { text: '지남', className: 'text-red-400 font-bold' };
  }
  if (dueDate === todayStr) {
    return { text: '오늘', className: 'text-red-400' };
  }
  if (dueDate === tomorrowStr) {
    return { text: '내일', className: 'text-orange-400' };
  }
  if (dueDate <= weekEndStr) {
    const day = new Date(dueDate + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return { text: dayNames[day.getDay()] ?? '', className: 'text-sp-muted' };
  }

  // 그 이후: M/D
  const parts = dueDate.split('-');
  const m = parts[1] ?? '1';
  const d = parts[2] ?? '1';
  return { text: `${parseInt(m)}/${parseInt(d)}`, className: 'text-sp-muted' };
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ─── 서브 컴포넌트 ─── */

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string, wasCompleted: boolean) => void;
}

function TodoItem({ todo, onToggle }: TodoItemProps) {
  const priorityConfig = PRIORITY_CONFIG[todo.priority ?? 'none'];
  const showPriority = todo.priority && todo.priority !== 'none';
  const dueDateLabel = getDueDateLabel(todo.dueDate);

  return (
    <li
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sp-surface/50 min-h-6"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(todo.id, todo.completed);
      }}
    >
      <Checkbox checked={todo.completed} />

      {/* 우선순위 dot */}
      {showPriority && (
        <span className={`text-tiny ${priorityConfig.color}`}>{priorityConfig.icon}</span>
      )}

      {/* 시간 표시 */}
      {todo.time && !todo.completed && (
        <span className="text-caption text-sp-accent font-mono shrink-0">{todo.time}</span>
      )}

      <span
        className={`flex-1 text-sm leading-tight truncate transition-all ${
          todo.completed ? 'text-sp-muted line-through opacity-50' : 'text-sp-text'
        }`}
      >
        {todo.text}
      </span>

      {/* 마감일 라벨 */}
      {dueDateLabel && !todo.completed && (
        <span className={`text-detail flex-shrink-0 ${dueDateLabel.className}`}>
          {dueDateLabel.text}
        </span>
      )}
    </li>
  );
}

interface CheckboxProps {
  checked: boolean;
}

function Checkbox({ checked }: CheckboxProps) {
  return (
    <div
      className={`flex min-w-6 min-h-6 h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors ${
        checked
          ? 'border border-sp-accent bg-sp-accent'
          : 'border border-sp-border hover:border-sp-accent'
      }`}
    >
      {checked && (
        <svg
          viewBox="0 0 10 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-2.5 w-2.5 text-sp-accent-fg"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
