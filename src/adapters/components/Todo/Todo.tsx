import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { toLocalDateString } from '@shared/utils/localDate';
import type { Todo as TodoType, TodoPriority, TodoCategory } from '@domain/entities/Todo';
import type { TodoViewMode } from '@domain/entities/TodoSettings';
import { DEFAULT_TODO_SETTINGS } from '@domain/entities/TodoSettings';
import type { TodoSortMode } from '@domain/rules/todoRules';
import { ViewToggle } from './components/ViewToggle';

// 프로 모드 뷰 — lazy 로딩 (기본 모드에서는 import 안 됨)
const KanbanView = lazy(() => import('./views/KanbanView').then(m => ({ default: m.KanbanView })));
const ListView = lazy(() => import('./views/ListView').then(m => ({ default: m.ListView })));
const TimelineView = lazy(() => import('./views/TimelineView').then(m => ({ default: m.TimelineView })));
import {
  sortTodos,
  filterByDateRange,
  filterByCategory,
  filterActive,
  filterArchived,
  groupByDate,
  isOverdue,
} from '@domain/rules/todoRules';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { RECURRENCE_PRESETS, getRecurrenceLabel } from '@domain/valueObjects/TodoRecurrence';
import { TodoCategoryModal } from './TodoCategoryModal';
import { TodoEditModal } from './components/TodoEditModal';
import { DatePopover } from './components/DatePopover';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatDistanceToNow, isToday, isThisWeek, isThisMonth, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

type DateFilter = 'all' | 'today' | 'week';
type ViewMode = 'active' | 'archive';

const FILTER_LABELS: Record<DateFilter, string> = {
  all: '전체',
  today: '오늘',
  week: '이번 주',
};

const GROUP_LABELS: Record<string, string> = {
  overdue: '지난 할 일',
  today: '오늘',
  tomorrow: '내일',
  thisWeek: '이번 주',
  later: '나중에',
  noDueDate: '기한 없음',
};

const GROUP_ORDER = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDueDate'];

const PRIORITY_OPTIONS: TodoPriority[] = ['none', 'low', 'medium', 'high'];

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400',
  green: 'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  purple: 'bg-purple-500/20 text-purple-400',
  red: 'bg-red-500/20 text-red-400',
  pink: 'bg-pink-500/20 text-pink-400',
  gray: 'bg-gray-500/20 text-gray-400',
};

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  none: '없음',
  low: '낮음',
  medium: '보통',
  high: '높음',
};

/* ─── Quick Postpone Options ─── */

interface PostponeOption {
  label: string;
  getDate: () => string;
}

function getPostponeOptions(): PostponeOption[] {
  const fmt = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  // Next Monday
  const nextMonday = new Date(today);
  const dayOfWeek = nextMonday.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return [
    { label: '내일', getDate: () => fmt(tomorrow) },
    { label: '모레', getDate: () => fmt(dayAfter) },
    { label: '다음 주 월요일', getDate: () => fmt(nextMonday) },
    { label: '다음 주', getDate: () => fmt(nextWeek) },
  ];
}

/* ─── Timeline Types ─── */

type TimelineItemType = 'todo' | 'timetable' | 'event';

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  time: string | null;
  title: string;
  subtitle?: string;
  color: string;
  icon: string;
  isCompleted?: boolean;
  originalId: string;
}


/* ─── Main Todo Component ─── */

export function Todo() {
  const {
    todos,
    categories,
    loaded,
    load,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodo,
    addSubTask,
    toggleSubTask,
    deleteSubTask,
    reorderTodos,
    archiveCompleted,
    restoreFromArchive,
    deleteArchived,
  } = useTodoStore();

  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => toLocalDateString());
  const [noDueDate, setNoDueDate] = useState(false);
  const [newPriority, setNewPriority] = useState<TodoPriority>('none');
  const [newRecurrenceIdx, setNewRecurrenceIdx] = useState(0);
  const [newCategory, setNewCategory] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newStartDate, setNewStartDate] = useState<string | undefined>(undefined);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortMode, setSortMode] = useState<TodoSortMode>('priority');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showEditHint, setShowEditHint] = useState(() => {
    return !localStorage.getItem('ssampin:todo-edit-hint-dismissed');
  });

  const tasksSyncing = useTasksSyncStore((s) => s.isSyncing);
  const tasksEnabled = useTasksSyncStore((s) => s.isEnabled);

  const { classSchedule, teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { events, load: loadEvents } = useEventsStore();
  const { settings, update: updateSettings } = useSettingsStore();

  // 프로 모드 상태
  const todoSettings = settings.todoSettings ?? DEFAULT_TODO_SETTINGS;
  const isProMode = todoSettings.mode === 'pro';
  const proLayout = isProMode ? (todoSettings.proLayout ?? 'wide') : 'wide';
  const [dualEditTodo, setDualEditTodo] = useState<TodoType | null>(null);
  const [proViewMode, setProViewMode] = useState<TodoViewMode>(
    todoSettings.lastView ?? todoSettings.defaultView ?? 'todo',
  );

  const handleProViewChange = useCallback((view: TodoViewMode) => {
    setProViewMode(view);
    void updateSettings({ todoSettings: { ...todoSettings, lastView: view } });
  }, [todoSettings, updateSettings]);

  useEffect(() => {
    void load();
    void loadSchedule();
    void loadEvents();
  }, [load, loadSchedule, loadEvents]);

  const now = useMemo(() => new Date(), []);

  // 활성/아카이브 분리
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const archivedTodos = useMemo(() => filterArchived(todos), [todos]);

  // 필터 -> 정렬 (활성 뷰)
  const filtered = useMemo(() => {
    let result = activeTodos;
    result = filterByDateRange(result, filter, now);
    result = filterByCategory(result, categoryFilter);
    return sortTodos(result, sortMode);
  }, [activeTodos, filter, categoryFilter, now, sortMode]);

  // 그룹핑
  const groups = useMemo(() => groupByDate(filtered, now), [filtered, now]);

  // 타임라인 통합 아이템 (시간표 + 일정)
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const showTimetable = settings.todoShowTimetable ?? false;
    const showEvents = settings.todoShowEvents ?? false;
    if (!showTimetable && !showEvents) return [];

    const items: TimelineItem[] = [];
    const todayKey = getDayOfWeek(now) ?? '';
    const todayStr = toLocalDateString(now);

    // 시간표 수업
    if (showTimetable) {
      // teacherSchedule 우선, 없으면 classSchedule
      const dayPeriods = teacherSchedule?.[todayKey] ?? [];
      const hasPeriods = dayPeriods.length > 0 && dayPeriods.some((p) => p !== null);
      if (hasPeriods) {
        dayPeriods.forEach((p, idx) => {
          if (!p) return;
          const periodTime = settings.periodTimes.find((pt) => pt.period === idx + 1);
          items.push({
            id: `tt-${idx + 1}`,
            type: 'timetable',
            time: periodTime?.start ?? null,
            title: `${idx + 1}교시 ${p.subject}`,
            subtitle: p.classroom || undefined,
            color: 'text-purple-400',
            icon: '📚',
            originalId: `period-${idx + 1}`,
          });
        });
      } else {
        const classPeriods = classSchedule?.[todayKey] ?? [];
        classPeriods.forEach((p, idx) => {
          if (!p || !p.subject) return;
          const periodTime = settings.periodTimes.find((pt) => pt.period === idx + 1);
          items.push({
            id: `tt-${idx + 1}`,
            type: 'timetable',
            time: periodTime?.start ?? null,
            title: `${idx + 1}교시 ${p.subject}`,
            subtitle: p.teacher || undefined,
            color: 'text-purple-400',
            icon: '📚',
            originalId: `period-${idx + 1}`,
          });
        });
      }
    }

    // 일정
    if (showEvents) {
      const todayEvents = events.filter((e) => {
        if (e.isHidden) return false;
        return (
          e.date === todayStr ||
          (e.endDate !== undefined && e.date <= todayStr && e.endDate >= todayStr)
        );
      });
      for (const ev of todayEvents) {
        const evTime = ev.startTime ?? (ev.time !== undefined ? ev.time.split(' - ')[0]?.trim() ?? null : null);
        items.push({
          id: `ev-${ev.id}`,
          type: 'event',
          time: evTime,
          title: ev.title,
          subtitle: ev.category,
          color: 'text-emerald-400',
          icon: '📅',
          originalId: ev.id,
        });
      }
    }

    return items;
  }, [settings.todoShowTimetable, settings.todoShowEvents, teacherSchedule, classSchedule, events, settings.periodTimes, now]);

  // 진행률 (활성 항목만)
  const completedCount = activeTodos.filter((t) => t.completed).length;
  const totalCount = activeTodos.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    const recurrence = RECURRENCE_PRESETS[newRecurrenceIdx]?.value ?? undefined;
    void addTodo(
      text,
      noDueDate ? undefined : (newDueDate || undefined),
      newPriority,
      newCategory || undefined,
      recurrence ?? undefined,
      newTime || undefined,
      newStartDate,
    );
    setNewText('');
    setNewPriority('none');
    setNewRecurrenceIdx(0);
    setNewCategory('');
    setNewTime('');
    setNewStartDate(undefined);
    if (!noDueDate) {
      setNewDueDate(toLocalDateString());
    }
  }, [newText, newDueDate, noDueDate, newPriority, newRecurrenceIdx, newCategory, newTime, newStartDate, addTodo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const handleArchiveCompleted = useCallback(() => {
    void archiveCompleted();
  }, [archiveCompleted]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-8">
      <PageHeader
        icon="check_circle"
        iconIsMaterial
        title="할 일"
        leftAddon={tasksEnabled && tasksSyncing ? (
          <span className="inline-flex items-center gap-1 text-xs text-sp-muted">
            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
            동기화 중
          </span>
        ) : undefined}
        rightActions={<>
          {/* 진행률 바 */}
          <div className="flex items-center gap-2 xl:gap-3 mr-2">
            <div className="w-32 xl:w-40 h-2 bg-sp-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-sp-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-xs xl:text-sm text-sp-muted font-sp-medium whitespace-nowrap">
              {completedCount}/{totalCount} ({progressPercent}%)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'active' ? 'archive' : 'active')}
            className={`flex items-center gap-1.5 px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold transition-all duration-sp-base ease-sp-out active:scale-95 ${
              viewMode === 'archive'
                ? 'bg-sp-accent text-white'
                : 'border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface'
            }`}
          >
            <span className="text-base">🗃️</span>
            <span className="hidden sm:inline">아카이브</span>
            {archivedTodos.length > 0 && (
              <span className="text-xs opacity-70">({archivedTodos.length})</span>
            )}
          </button>
        </>}
      />

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto flex flex-col gap-6 max-w-full">
          {viewMode === 'active' ? (
            <>
              {/* 필터 탭 */}
              <div className="flex flex-col gap-3">
                {/* 날짜 필터 + 정렬 모드 */}
                <div className="flex gap-3 items-center">
                  {(Object.keys(FILTER_LABELS) as DateFilter[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={`px-5 py-2 rounded-full text-sm font-bold shadow-sm ring-1 transition-colors ${
                        filter === key
                          ? 'bg-sp-accent text-white ring-sp-accent/30'
                          : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                      }`}
                    >
                      {FILTER_LABELS[key]}
                    </button>
                  ))}

                  <span className="text-sp-border">|</span>

                  <button
                    type="button"
                    onClick={() => setSortMode((m) => m === 'priority' ? 'dueDate' : 'priority')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium ring-1 transition-colors ${
                      sortMode === 'dueDate'
                        ? 'bg-sp-accent text-white ring-sp-accent/30'
                        : 'bg-sp-card text-sp-muted ring-sp-border/50 hover:text-sp-text'
                    }`}
                    title={sortMode === 'dueDate' ? 'D-Day 순 정렬 중' : '우선순위 순 정렬 중'}
                  >
                    <span className="material-symbols-outlined text-icon">
                      {sortMode === 'dueDate' ? 'event' : 'priority_high'}
                    </span>
                    {sortMode === 'dueDate' ? 'D-Day 순' : '우선순위 순'}
                  </button>
                </div>

                {/* 카테고리 필터 */}
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      categoryFilter === null
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-card text-sp-muted hover:text-sp-text ring-1 ring-sp-border/50'
                    }`}
                  >
                    전체
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        categoryFilter === cat.id
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-card text-sp-muted hover:text-sp-text ring-1 ring-sp-border/50'
                      }`}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
                    title="카테고리 관리"
                  >
                    <span className="material-symbols-outlined text-icon">settings</span>
                  </button>
                </div>

                {/* 프로 모드: 뷰 전환 토글 */}
                {isProMode && (
                  <ViewToggle currentView={proViewMode} onViewChange={handleProViewChange} />
                )}

                {/* 타임라인 통합 토글 (기본 모드 또는 프로 모드의 todo 뷰에서만) */}
                {(!isProMode || proViewMode === 'todo') && <div className="flex items-center gap-3 text-xs">
                  <span className="text-sp-muted">통합 보기</span>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.todoShowTimetable ?? false}
                      onChange={(e) => void updateSettings({ todoShowTimetable: e.target.checked })}
                      className="rounded border-sp-border text-sp-accent focus:ring-sp-accent/30 bg-sp-surface"
                    />
                    <span className="text-sp-muted hover:text-sp-text transition-colors">📚 수업</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.todoShowEvents ?? false}
                      onChange={(e) => void updateSettings({ todoShowEvents: e.target.checked })}
                      className="rounded border-sp-border text-sp-accent focus:ring-sp-accent/30 bg-sp-surface"
                    />
                    <span className="text-sp-muted hover:text-sp-text transition-colors">📅 일정</span>
                  </label>
                </div>}
              </div>

              {/* 프로 모드 뷰 분기 */}
              {isProMode && proViewMode !== 'todo' ? (
                proLayout === 'dual' ? (
                  <>
                  <div className="flex gap-6 min-h-[500px]">
                    <div className="flex-1 min-w-0">
                      <Suspense fallback={<div className="flex items-center justify-center py-16 text-sp-muted">뷰 로딩 중...</div>}>
                        {proViewMode === 'kanban' && <KanbanView categoryFilter={categoryFilter} />}
                        {proViewMode === 'list' && <ListView categoryFilter={categoryFilter} />}
                        {proViewMode === 'timeline' && <TimelineView categoryFilter={categoryFilter} />}
                      </Suspense>
                    </div>
                    <div className="w-80 shrink-0 flex flex-col gap-4 bg-sp-card rounded-xl p-4 ring-1 ring-sp-border overflow-y-auto">
                      <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
                        <span className="material-symbols-outlined text-icon">list</span>
                        할 일 목록
                      </h3>
                      {filtered.map(todo => (
                        <div
                          key={todo.id}
                          onClick={() => setDualEditTodo(todo)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer ${
                            todo.completed ? 'text-sp-muted line-through' : 'text-sp-text'
                          } hover:bg-sp-surface transition-colors`}
                        >
                          <input
                            type="checkbox"
                            checked={todo.completed}
                            onChange={() => void toggleTodo(todo.id)}
                            onClick={e => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-sp-border text-sp-accent focus:ring-sp-accent shrink-0"
                          />
                          <span className="truncate">{todo.text}</span>
                          {todo.googleTaskId && (
                            <span className="material-symbols-outlined text-xs text-sp-muted/50 shrink-0" title="Google Tasks 연동됨">cloud_done</span>
                          )}
                          {todo.dueDate && (
                            <span className="shrink-0 text-sp-muted text-caption">
                              {todo.dueDate.slice(5).replace('-', '/')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {dualEditTodo && (
                    <TodoEditModal
                      todo={dualEditTodo}
                      categories={categories}
                      onUpdate={(id, changes) => { void updateTodo(id, changes); }}
                      onClose={() => setDualEditTodo(null)}
                    />
                  )}
                  </>
                ) : (
                  <Suspense fallback={<div className="flex items-center justify-center py-16 text-sp-muted">뷰 로딩 중...</div>}>
                    {proViewMode === 'kanban' && <KanbanView categoryFilter={categoryFilter} />}
                    {proViewMode === 'list' && <ListView categoryFilter={categoryFilter} />}
                    {proViewMode === 'timeline' && <TimelineView categoryFilter={categoryFilter} />}
                  </Suspense>
                )
              ) : (

              <>
              {/* 추가 폼 */}
              <div className="flex flex-col gap-3 bg-sp-card rounded-xl p-4 ring-1 ring-sp-border">
                {/* 첫 번째 줄: 날짜 + 텍스트 + 추가 버튼 */}
                <div className="flex gap-3 items-center">
                  <DatePopover
                    date={newDueDate}
                    endDate={newStartDate ? newDueDate : undefined}
                    noDueDate={noDueDate}
                    onDateChange={(d) => {
                      if (newStartDate) {
                        setNewStartDate(d);
                      } else {
                        setNewDueDate(d);
                        setNoDueDate(false);
                      }
                    }}
                    onEndDateChange={(endDate) => {
                      if (endDate) {
                        setNewStartDate(newDueDate);
                        setNewDueDate(endDate);
                      } else {
                        setNewStartDate(undefined);
                      }
                    }}
                    onNoDueDateChange={(nd) => {
                      setNoDueDate(nd);
                      if (nd) { setNewDueDate(''); setNewStartDate(undefined); }
                      else setNewDueDate(toLocalDateString());
                    }}
                  >
                    <div className={`flex items-center gap-2 shrink-0 bg-sp-surface text-sm px-3 py-2 rounded-lg border border-sp-border hover:border-sp-accent transition-colors ${
                      noDueDate ? 'opacity-40 text-sp-muted' : 'text-sp-text'
                    }`}>
                      <span className="material-symbols-outlined text-icon">calendar_today</span>
                      {noDueDate ? '기한 없음' : newStartDate ? `${newStartDate} → ${newDueDate}` : (newDueDate || '날짜 선택')}
                    </div>
                  </DatePopover>
                  <input
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="할 일을 입력하세요..."
                    className="flex-1 bg-sp-surface text-sp-text text-sm px-4 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors placeholder:text-sp-muted"
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!newText.trim()}
                    className="flex items-center gap-2 bg-sp-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl transition-all shadow-lg shadow-sp-accent/20 text-sm font-bold"
                  >
                    <span className="material-symbols-outlined text-icon-md">add</span>
                    추가
                  </button>
                </div>

                {/* 두 번째 줄: 시간 + 우선순위 + 반복 + 카테고리 */}
                <div className="flex gap-3 items-center flex-wrap">
                  {/* 시간 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">⏰</span>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                      className="bg-sp-surface text-sp-text text-xs px-2 py-1 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
                    />
                    {newTime && (
                      <button
                        type="button"
                        onClick={() => setNewTime('')}
                        className="text-xs text-sp-muted hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <span className="text-sp-border">|</span>

                  {/* 우선순위 */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-sp-muted mr-1">우선순위</span>
                    {PRIORITY_OPTIONS.map((p) => {
                      const config = PRIORITY_CONFIG[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewPriority(p)}
                          className={`flex flex-col items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            newPriority === p
                              ? `${config.bgColor || 'bg-sp-surface'} ${config.color} ring-1 ring-current`
                              : 'text-sp-muted hover:text-sp-text'
                          }`}
                        >
                          <span>{config.icon}</span>
                          <span className="text-caption leading-tight mt-0.5">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="text-sp-border">|</span>

                  {/* 반복 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">🔄</span>
                    <select
                      value={newRecurrenceIdx}
                      onChange={(e) => setNewRecurrenceIdx(Number(e.target.value))}
                      className="bg-sp-surface text-sp-text text-xs px-2 py-1 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
                    >
                      {RECURRENCE_PRESETS.map((preset, idx) => (
                        <option key={idx} value={idx}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-sp-border">|</span>

                  {/* 카테고리 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">📁</span>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="bg-sp-surface text-sp-text text-xs px-2 py-1 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
                    >
                      <option value="">없음</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 타임라인 통합 아이템 (시간표/일정) — 할 일 유무와 무관하게 표시 */}
              {timelineItems.length > 0 && (
                <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
                  <div className="px-4 py-2 border-b border-sp-border/50 flex items-center gap-2">
                    <span className="material-symbols-outlined text-icon text-sp-muted">timeline</span>
                    <span className="text-xs font-medium text-sp-muted">오늘의 시간표 · 일정</span>
                  </div>
                  <div className="divide-y divide-sp-border/30">
                    {[...timelineItems]
                      .sort((a, b) => {
                        if (a.time && b.time) return a.time.localeCompare(b.time);
                        if (a.time && !b.time) return -1;
                        if (!a.time && b.time) return 1;
                        return 0;
                      })
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2 opacity-70"
                        >
                          <span className="text-detail text-sp-muted w-12 shrink-0 text-right font-mono">
                            {item.time ?? '--:--'}
                          </span>
                          <span className="text-sm shrink-0">{item.icon}</span>
                          <span className="text-sm text-sp-text truncate flex-1">
                            {item.title}
                          </span>
                          {item.subtitle !== undefined && (
                            <span className="text-detail text-sp-muted shrink-0">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 1회성 편집 안내 */}
              {showEditHint && viewMode === 'active' && totalCount > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sp-accent/10 border border-sp-accent/20 text-xs text-sp-accent">
                  <span className="material-symbols-outlined text-sm">lightbulb</span>
                  <span>할 일을 더블클릭하면 내용, 날짜, 우선순위를 바로 수정할 수 있어요!</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditHint(false);
                      localStorage.setItem('ssampin:todo-edit-hint-dismissed', 'true');
                    }}
                    className="ml-auto text-sp-accent/50 hover:text-sp-accent transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>
              )}

              {/* 투두 리스트 */}
              {totalCount === 0 && timelineItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
                  <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
                    checklist
                  </span>
                  <p className="text-lg">할 일이 없습니다</p>
                  <p className="text-sm mt-1">위에서 새로운 할 일을 추가해보세요</p>
                </div>
              ) : totalCount === 0 ? (
                null
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
                  <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
                    filter_list
                  </span>
                  <p className="text-lg">필터에 해당하는 할 일이 없습니다</p>
                </div>
              ) : sortMode === 'priority' ? (
                /* 우선순위 모드: 기존 그룹핑 뷰 */
                <div className="flex flex-col gap-4">
                  {GROUP_ORDER.map((groupKey) => {
                    const items = groups[groupKey];
                    if (!items || items.length === 0) return null;

                    const isCollapsed = collapsedGroups[groupKey] ?? false;

                    return (
                      <TodoGroup
                        key={groupKey}
                        groupKey={groupKey}
                        label={GROUP_LABELS[groupKey] ?? groupKey}
                        items={sortTodos(items, sortMode)}
                        isOverdueGroup={groupKey === 'overdue'}
                        collapsed={isCollapsed}
                        onToggleCollapse={() => toggleGroup(groupKey)}
                        categories={categories}
                        now={now}
                        onToggle={toggleTodo}
                        onDelete={deleteTodo}
                        onUpdate={updateTodo}
                        onAddSubTask={addSubTask}
                        onToggleSubTask={toggleSubTask}
                        onDeleteSubTask={deleteSubTask}
                        onReorder={reorderTodos}
                      />
                    );
                  })}
                </div>
              ) : (
                /* D-Day 순 모드: 플랫 리스트 */
                <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-visible">
                  <ul>
                    {filtered.map((todo) => (
                      <TodoItem
                        key={todo.id}
                        todo={todo}
                        overdue={isOverdue(todo, now)}
                        categories={categories}
                        onToggle={toggleTodo}
                        onDelete={deleteTodo}
                        onUpdate={updateTodo}
                        onAddSubTask={addSubTask}
                        onToggleSubTask={toggleSubTask}
                        onDeleteSubTask={deleteSubTask}
                        showDDay
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* 완료 항목 아카이브 버튼 */}
              {completedCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleArchiveCompleted}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-sp-muted hover:text-sp-text bg-sp-card hover:bg-sp-surface ring-1 ring-sp-border transition-colors"
                  >
                    <span className="text-base">📦</span>
                    완료 항목 모두 아카이브 ({completedCount}건)
                  </button>
                </div>
              )}
            </>
              )}
            </>
          ) : (
            /* 아카이브 뷰 */
            <ArchiveView
              todos={archivedTodos}
              categories={categories}
              onRestore={restoreFromArchive}
              onDelete={(id) => void deleteArchived([id])}
              onDeleteAll={() => void deleteArchived()}
              onBack={() => setViewMode('active')}
            />
          )}
        </div>
      </div>

      {/* 카테고리 관리 모달 */}
      {showCategoryModal && (
        <TodoCategoryModal onClose={() => setShowCategoryModal(false)} />
      )}
    </div>
  );
}

/* ─── 아카이브 뷰 ─── */

interface ArchiveViewProps {
  todos: readonly TodoType[];
  categories: readonly TodoCategory[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onBack: () => void;
}

type ArchiveDateGroup = '오늘' | '이번 주' | '이번 달' | '그 이전';

function getArchiveDateGroup(archivedAt: string | undefined): ArchiveDateGroup {
  if (!archivedAt) return '그 이전';
  const date = parseISO(archivedAt);
  if (isToday(date)) return '오늘';
  if (isThisWeek(date, { weekStartsOn: 1 })) return '이번 주';
  if (isThisMonth(date)) return '이번 달';
  return '그 이전';
}

const ARCHIVE_GROUP_ORDER: ArchiveDateGroup[] = ['오늘', '이번 주', '이번 달', '그 이전'];

function ArchiveView({ todos, categories, onRestore, onDelete, onDeleteAll, onBack }: ArchiveViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  type ArchiveDateFilter = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'custom';
  const [dateFilter, setDateFilter] = useState<ArchiveDateFilter>('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');

  // Filter
  const filteredTodos = useMemo(() => {
    let result = [...todos];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => t.text.toLowerCase().includes(q));
    }
    if (selectedCategoryId) {
      result = result.filter((t) => t.category === selectedCategoryId);
    }
    if (dateFilter !== 'all') {
      result = result.filter((t) => {
        if (!t.archivedAt) return false;
        const date = parseISO(t.archivedAt);
        if (dateFilter === 'today') return isToday(date);
        if (dateFilter === 'thisWeek') return isThisWeek(date, { weekStartsOn: 1 });
        if (dateFilter === 'thisMonth') return isThisMonth(date);
        if (dateFilter === 'custom') {
          const dateStr = t.archivedAt.slice(0, 10);
          if (customDateFrom && customDateTo) return dateStr >= customDateFrom && dateStr <= customDateTo;
          if (customDateFrom) return dateStr >= customDateFrom;
          if (customDateTo) return dateStr <= customDateTo;
        }
        return true;
      });
    }
    // Sort by archivedAt descending
    result.sort((a, b) => {
      const aTime = a.archivedAt ? new Date(a.archivedAt).getTime() : 0;
      const bTime = b.archivedAt ? new Date(b.archivedAt).getTime() : 0;
      return bTime - aTime;
    });
    return result;
  }, [todos, searchQuery, selectedCategoryId, dateFilter, customDateFrom, customDateTo]);

  // Group by archive date
  const grouped = useMemo(() => {
    const groups = new Map<ArchiveDateGroup, TodoType[]>();
    for (const todo of filteredTodos) {
      const group = getArchiveDateGroup(todo.archivedAt);
      const arr = groups.get(group);
      if (arr) arr.push(todo);
      else groups.set(group, [todo]);
    }
    return groups;
  }, [filteredTodos]);

  // Categories that have archived items
  const activeCategories = useMemo(() => {
    const catIds = new Set(todos.map((t) => t.category).filter(Boolean));
    return categories.filter((c) => catIds.has(c.id));
  }, [todos, categories]);

  // Selection helpers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredTodos.map((t) => t.id)));
  }, [filteredTodos]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const allSelected = filteredTodos.length > 0 && selectedIds.size === filteredTodos.length;

  // Batch actions
  const handleBatchRestore = useCallback(() => {
    for (const id of selectedIds) {
      onRestore(id);
    }
    setSelectedIds(new Set());
  }, [selectedIds, onRestore]);

  const handleBatchDelete = useCallback(() => {
    for (const id of selectedIds) {
      onDelete(id);
    }
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);
  }, [selectedIds, onDelete]);

  const handleDeleteSingle = useCallback((id: string) => {
    onDelete(id);
    setConfirmDeleteId(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [onDelete]);

  const handleDeleteAll = useCallback(() => {
    onDeleteAll();
    setSelectedIds(new Set());
    setConfirmDeleteAll(false);
  }, [onDeleteAll]);

  const priorityDotColor: Record<string, string> = {
    high: 'bg-red-400',
    medium: 'bg-amber-400',
    low: 'bg-blue-400',
  };

  return (
    <div className="flex flex-col gap-4 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
        >
          <span className="material-symbols-outlined text-icon-lg">arrow_back</span>
        </button>
        <h3 className="text-sp-text text-lg font-bold flex items-center gap-2">
          <span>🗃️</span> 아카이브
        </h3>
        <span className="text-sm text-sp-muted">({todos.length}건)</span>
      </div>

      {/* Search bar */}
      <div className="relative">
        <span className="material-symbols-outlined text-icon-md text-sp-muted absolute left-3 top-1/2 -translate-y-1/2">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="아카이브 검색..."
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-sp-surface ring-1 ring-sp-border text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:ring-sp-accent transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon-sm">close</span>
          </button>
        )}
      </div>

      {/* Date filter */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all', label: '전체' },
              { key: 'today', label: '오늘' },
              { key: 'thisWeek', label: '이번 주' },
              { key: 'thisMonth', label: '이번 달' },
              { key: 'custom', label: '직접 설정' },
            ] as { key: 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'custom'; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDateFilter(key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                dateFilter === key
                  ? 'bg-sp-accent/20 text-sp-accent ring-1 ring-sp-accent/40'
                  : 'bg-sp-surface text-sp-muted ring-1 ring-sp-border hover:text-sp-text'
              }`}
            >
              {label}
            </button>
          ))}
          {dateFilter !== 'all' && (
            <button
              type="button"
              onClick={() => {
                setDateFilter('all');
                setCustomDateFrom('');
                setCustomDateTo('');
              }}
              className="ml-1 text-sp-muted hover:text-sp-text transition-colors"
              title="날짜 필터 초기화"
            >
              <span className="material-symbols-outlined text-icon-sm">close</span>
            </button>
          )}
        </div>
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2 bg-sp-surface/50 rounded-lg px-3 py-2 ring-1 ring-sp-border">
            <span className="text-xs text-sp-muted flex-shrink-0">시작일</span>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="flex-1 min-w-0 bg-sp-surface rounded px-2 py-1 text-xs text-sp-text ring-1 ring-sp-border focus:outline-none focus:ring-sp-accent transition-colors"
            />
            <span className="text-xs text-sp-muted flex-shrink-0">—</span>
            <span className="text-xs text-sp-muted flex-shrink-0">종료일</span>
            <input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="flex-1 min-w-0 bg-sp-surface rounded px-2 py-1 text-xs text-sp-text ring-1 ring-sp-border focus:outline-none focus:ring-sp-accent transition-colors"
            />
          </div>
        )}
      </div>

      {/* Category filter chips */}
      {activeCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedCategoryId === null
                ? 'bg-sp-accent/20 text-sp-accent ring-1 ring-sp-accent/40'
                : 'bg-sp-surface text-sp-muted ring-1 ring-sp-border hover:text-sp-text'
            }`}
          >
            전체
          </button>
          {activeCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(selectedCategoryId === cat.id ? null : cat.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedCategoryId === cat.id
                  ? `${CATEGORY_COLORS[cat.color] ?? 'bg-gray-500/20 text-gray-400'} ring-1 ring-current`
                  : 'bg-sp-surface text-sp-muted ring-1 ring-sp-border hover:text-sp-text'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {filteredTodos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
            inventory_2
          </span>
          <p className="text-lg">
            {todos.length === 0
              ? '아카이브가 비어있습니다'
              : dateFilter !== 'all' || searchQuery || selectedCategoryId
              ? '필터 조건에 맞는 항목이 없습니다'
              : '검색 결과가 없습니다'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {ARCHIVE_GROUP_ORDER.map((groupLabel) => {
            const items = grouped.get(groupLabel);
            if (!items || items.length === 0) return null;
            return (
              <div key={groupLabel}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-sp-muted uppercase tracking-wider">
                    {groupLabel}
                  </span>
                  <span className="text-xs text-sp-muted/50">({items.length})</span>
                  <div className="flex-1 h-px bg-sp-border/50" />
                </div>
                <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
                  {items.map((todo) => {
                    const cat = categories.find((c) => c.id === todo.category);
                    const isConfirming = confirmDeleteId === todo.id;
                    const subTaskCount = todo.subTasks?.length ?? 0;

                    return (
                      <div
                        key={todo.id}
                        className={`flex items-center gap-3 px-4 py-2.5 border-t border-sp-border/50 first:border-t-0 transition-colors ${
                          selectedIds.has(todo.id) ? 'bg-sp-accent/5' : ''
                        }`}
                      >
                        {/* Selection checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleSelect(todo.id)}
                          className="flex-shrink-0"
                        >
                          <div
                            className={`flex h-[18px] w-[18px] items-center justify-center rounded transition-colors ${
                              selectedIds.has(todo.id)
                                ? 'border border-sp-accent bg-sp-accent'
                                : 'border border-sp-border hover:border-sp-accent'
                            }`}
                          >
                            {selectedIds.has(todo.id) && (
                              <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5">
                                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        </button>

                        {/* Priority dot */}
                        {todo.priority && todo.priority !== 'none' && (
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${priorityDotColor[todo.priority] ?? ''}`} />
                        )}

                        {/* Todo text */}
                        <span className="flex-1 text-sm text-sp-muted line-through opacity-50 truncate">
                          {todo.text}
                        </span>

                        {/* Subtask count */}
                        {subTaskCount > 0 && (
                          <span className="text-xs text-sp-muted/50 flex items-center gap-0.5 flex-shrink-0">
                            <span className="material-symbols-outlined text-sm">subdirectory_arrow_right</span>
                            하위 {subTaskCount}건
                          </span>
                        )}

                        {/* Category badge */}
                        {cat && (
                          <span className={`text-caption px-1.5 py-0.5 rounded flex-shrink-0 ${CATEGORY_COLORS[cat.color] ?? 'bg-gray-500/20 text-gray-400'}`}>
                            {cat.icon} {cat.name}
                          </span>
                        )}

                        {/* Due date */}
                        {todo.dueDate && (
                          <span className="text-xs text-sp-muted/50 flex-shrink-0">{formatDueDate(todo.dueDate)}</span>
                        )}

                        {/* Archived date */}
                        {todo.archivedAt && (
                          <span className="text-xs text-sp-muted/40 flex-shrink-0">
                            {formatDistanceToNow(parseISO(todo.archivedAt), { addSuffix: true, locale: ko })}
                          </span>
                        )}

                        {/* Actions */}
                        {isConfirming ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-red-400 mr-1">삭제?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingle(todo.id)}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            >
                              확인
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => onRestore(todo.id)}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-sp-accent hover:bg-sp-accent/10 transition-colors"
                            >
                              복원
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(todo.id)}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-sp-card ring-1 ring-sp-border shadow-2xl shadow-black/40">
          <span className="text-sm text-sp-text font-medium">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-sp-border" />
          <button
            type="button"
            onClick={allSelected ? deselectAll : selectAll}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            {allSelected ? '선택 해제' : '전체 선택'}
          </button>
          <button
            type="button"
            onClick={handleBatchRestore}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-sp-accent bg-sp-accent/10 hover:bg-sp-accent/20 transition-colors"
          >
            일괄 복원
          </button>
          {confirmBatchDelete ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-400">삭제?</span>
              <button
                type="button"
                onClick={handleBatchDelete}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(false)}
                className="px-2 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text transition-colors"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmBatchDelete(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 bg-red-400/10 hover:bg-red-400/20 transition-colors"
            >
              일괄 삭제
            </button>
          )}
          <div className="w-px h-5 bg-sp-border" />
          {confirmDeleteAll ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-red-400">전체?</span>
              <button
                type="button"
                onClick={handleDeleteAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                확인
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteAll(false)}
                className="px-2 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text transition-colors"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteAll(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 ring-1 ring-red-400/30 transition-colors"
            >
              <span className="material-symbols-outlined text-icon-sm align-middle mr-1">delete_forever</span>
              전체 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── TodoGroup (with DnD + Completed Collapsing) ─── */

interface TodoGroupProps {
  groupKey: string;
  label: string;
  items: readonly TodoType[];
  isOverdueGroup: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  categories: readonly TodoCategory[];
  now: Date;
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, changes: Partial<Pick<TodoType, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'startDate' | 'subTasks' | 'sortOrder'>>) => Promise<void>;
  onAddSubTask: (todoId: string, text: string) => Promise<void>;
  onToggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  onDeleteSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  onReorder: (todoIds: string[], groupKey: string) => Promise<void>;
}

function TodoGroup({
  groupKey,
  label,
  items,
  isOverdueGroup,
  collapsed,
  onToggleCollapse,
  categories,
  now,
  onToggle,
  onDelete,
  onUpdate,
  onAddSubTask,
  onToggleSubTask,
  onDeleteSubTask,
  onReorder,
}: TodoGroupProps) {
  // Split items into incomplete and completed
  const incompleteItems = useMemo(() => items.filter((t) => !t.completed), [items]);
  const completedItems = useMemo(() => items.filter((t) => t.completed), [items]);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Build ordered IDs for the incomplete items (sortable)
  const incompleteIds = useMemo(() => incompleteItems.map((t) => t.id), [incompleteItems]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = incompleteIds.indexOf(active.id as string);
      const newIndex = incompleteIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove([...incompleteIds], oldIndex, newIndex);
      void onReorder(reordered, groupKey);
    },
    [incompleteIds, onReorder, groupKey],
  );

  const totalCount = items.length;

  return (
    <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-visible">
      {/* 그룹 헤더 */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-sp-surface/50 transition-colors"
      >
        <span
          className={`material-symbols-outlined text-icon-md transition-transform ${
            collapsed ? '' : 'rotate-90'
          } ${isOverdueGroup ? 'text-red-400' : 'text-sp-muted'}`}
        >
          chevron_right
        </span>
        <span
          className={`text-sm font-bold ${
            isOverdueGroup ? 'text-red-400' : 'text-sp-text'
          }`}
        >
          {label}
        </span>
        <span className="text-xs text-sp-muted ml-1">({totalCount})</span>
      </button>

      {/* 아이템 리스트 */}
      {!collapsed && (
        <>
          {/* Incomplete items with drag-and-drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={incompleteIds} strategy={verticalListSortingStrategy}>
              <ul>
                {incompleteItems.map((todo) => (
                  <SortableTodoItem
                    key={todo.id}
                    todo={todo}
                    overdue={isOverdue(todo, now)}
                    categories={categories}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                    onAddSubTask={onAddSubTask}
                    onToggleSubTask={onToggleSubTask}
                    onDeleteSubTask={onDeleteSubTask}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {/* Completed items collapsible section */}
          {completedItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setCompletedCollapsed((prev) => !prev)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sp-muted hover:bg-sp-surface/30 transition-colors border-t border-sp-border/50"
              >
                <span
                  className={`text-caption transition-transform ${
                    completedCollapsed ? '' : 'rotate-90'
                  }`}
                >
                  ▶
                </span>
                <span className="text-xs font-medium">
                  완료 {completedItems.length}건
                </span>
              </button>
              {!completedCollapsed && (
                <ul>
                  {completedItems.map((todo) => (
                    <TodoItem
                      key={todo.id}
                      todo={todo}
                      overdue={false}
                      categories={categories}
                      onToggle={onToggle}
                      onDelete={onDelete}
                      onUpdate={onUpdate}
                      onAddSubTask={onAddSubTask}
                      onToggleSubTask={onToggleSubTask}
                      onDeleteSubTask={onDeleteSubTask}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── SortableTodoItem (wraps TodoItem with dnd-kit sortable) ─── */

interface SortableTodoItemProps {
  todo: TodoType;
  overdue: boolean;
  categories: readonly TodoCategory[];
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, changes: Partial<Pick<TodoType, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'startDate' | 'subTasks' | 'sortOrder'>>) => Promise<void>;
  onAddSubTask: (todoId: string, text: string) => Promise<void>;
  onToggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  onDeleteSubTask: (todoId: string, subTaskId: string) => Promise<void>;
}

function SortableTodoItem(props: SortableTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TodoItem
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

/* ─── TodoItem (with inline edit, postpone, subtasks, drag handle) ─── */

interface DragHandleProps {
  [key: string]: unknown;
}

interface TodoItemProps {
  todo: TodoType;
  overdue: boolean;
  categories: readonly TodoCategory[];
  onToggle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, changes: Partial<Pick<TodoType, 'text' | 'priority' | 'category' | 'recurrence' | 'dueDate' | 'startDate' | 'subTasks' | 'sortOrder'>>) => Promise<void>;
  onAddSubTask: (todoId: string, text: string) => Promise<void>;
  onToggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  onDeleteSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  dragHandleProps?: DragHandleProps;
  showDDay?: boolean;
}

function TodoItem({
  todo,
  overdue,
  categories,
  onToggle,
  onDelete,
  onUpdate,
  onAddSubTask,
  onToggleSubTask,
  onDeleteSubTask,
  dragHandleProps,
  showDDay,
}: TodoItemProps) {
  const { track } = useAnalytics();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [editDueDate, setEditDueDate] = useState(todo.dueDate ?? '');
  const [editStartDate, setEditStartDate] = useState(todo.startDate ?? '');
  const [editTime, setEditTime] = useState(todo.time ?? '');
  const [editPriority, setEditPriority] = useState<TodoPriority>(todo.priority ?? 'none');
  const [editCategory, setEditCategory] = useState(todo.category ?? '');
  const [showPostpone, setShowPostpone] = useState(false);
  const [showSubTaskInput, setShowSubTaskInput] = useState(false);
  const [subTaskText, setSubTaskText] = useState('');

  const editRef = useRef<HTMLDivElement>(null);
  const postponeRef = useRef<HTMLDivElement>(null);

  const priorityConfig = PRIORITY_CONFIG[todo.priority ?? 'none'];
  const cat = categories.find((c) => c.id === todo.category);

  // D-Day 계산
  const dDayText = useMemo(() => {
    if (!showDDay || !todo.dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(todo.dueDate + 'T00:00:00');
    const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'D-Day';
    if (diff < 0) return `D+${Math.abs(diff)}`;
    return `D-${diff}`;
  }, [todo.dueDate, showDDay]);

  const dDayColor = useMemo(() => {
    if (!dDayText) return '';
    if (dDayText === 'D-Day') return 'text-sp-accent bg-sp-accent/10';
    if (dDayText.startsWith('D+')) return 'text-red-400 bg-red-400/10';
    const num = parseInt(dDayText.replace('D-', ''), 10);
    if (num <= 3) return 'text-amber-400 bg-amber-400/10';
    return 'text-sp-muted bg-sp-surface';
  }, [dDayText]);

  // Subtask stats
  const subTasks = todo.subTasks ?? [];
  const subTaskTotal = subTasks.length;
  const subTaskCompleted = subTasks.filter((s) => s.completed).length;

  // Click outside to save edit
  useEffect(() => {
    if (!editing) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        saveEdit();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  // Click outside to close postpone dropdown
  useEffect(() => {
    if (!showPostpone) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (postponeRef.current && !postponeRef.current.contains(e.target as Node)) {
        setShowPostpone(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  });

  const saveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditText(todo.text);
      setEditing(false);
      return;
    }
    const changes: Record<string, string | undefined> = {};
    if (trimmed !== todo.text) changes.text = trimmed;
    if (editPriority !== (todo.priority ?? 'none')) changes.priority = editPriority;
    if (editCategory !== (todo.category ?? '')) changes.category = editCategory || undefined;
    if (editDueDate !== (todo.dueDate ?? '')) changes.dueDate = editDueDate || undefined;
    if (editStartDate !== (todo.startDate ?? '')) changes.startDate = editStartDate || undefined;
    if (editTime !== (todo.time ?? '')) changes.time = editTime || undefined;

    if (Object.keys(changes).length > 0) {
      void onUpdate(todo.id, changes as Partial<Pick<TodoType, 'text' | 'priority' | 'category' | 'dueDate' | 'startDate' | 'time'>>);
    }
    setEditing(false);
  }, [editText, editPriority, editCategory, editDueDate, editStartDate, editTime, todo, onUpdate]);

  const handleDoubleClick = useCallback(() => {
    if (todo.completed) return;
    setEditText(todo.text);
    setEditDueDate(todo.dueDate ?? '');
    setEditStartDate(todo.startDate ?? '');
    setEditTime(todo.time ?? '');
    setEditPriority(todo.priority ?? 'none');
    setEditCategory(todo.category ?? '');
    setEditing(true);
  }, [todo]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditing(false);
      }
    },
    [saveEdit],
  );

  const handlePostpone = useCallback(
    (newDate: string) => {
      void onUpdate(todo.id, { dueDate: newDate });
      setShowPostpone(false);
    },
    [todo.id, onUpdate],
  );

  const handleAddSubTask = useCallback(() => {
    const text = subTaskText.trim();
    if (!text) return;
    void onAddSubTask(todo.id, text);
    setSubTaskText('');
  }, [subTaskText, todo.id, onAddSubTask]);

  const handleSubTaskKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSubTask();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSubTaskInput(false);
        setSubTaskText('');
      }
    },
    [handleAddSubTask],
  );

  // Auto-complete parent when all subtasks done
  const handleToggleSubTask = useCallback(
    (subTaskId: string) => {
      void onToggleSubTask(todo.id, subTaskId);

      // Check if after this toggle all will be completed
      const targetSt = subTasks.find((s) => s.id === subTaskId);
      if (!targetSt) return;
      const willBeCompleted = !targetSt.completed;
      if (willBeCompleted) {
        const allOthersDone = subTasks.every((s) => s.id === subTaskId || s.completed);
        if (allOthersDone && !todo.completed) {
          // All subtasks will be completed - confirm auto-complete parent
          setTimeout(() => {
            if (window.confirm('모든 서브태스크가 완료되었습니다. 상위 할 일도 완료 처리할까요?')) {
              void onToggle(todo.id);
            }
          }, 100);
        }
      }
    },
    [todo, subTasks, onToggleSubTask, onToggle],
  );

  // Inline edit mode
  if (editing) {
    return (
      <div ref={editRef} className="border-t border-sp-border/50 px-4 py-3 bg-sp-surface/30">
        <div className="flex flex-col gap-2">
          {/* Text input */}
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleEditKeyDown}
            autoFocus
            className="w-full bg-sp-surface text-sp-text text-sm px-3 py-2 rounded-lg border border-sp-accent focus:outline-none transition-colors"
          />
          <div className="flex gap-3 items-center flex-wrap">
            {/* Date input */}
            <DatePopover
              date={editStartDate || editDueDate}
              endDate={editStartDate ? editDueDate : undefined}
              onDateChange={(d) => {
                if (editStartDate) {
                  setEditStartDate(d);
                } else {
                  setEditDueDate(d);
                }
              }}
              onEndDateChange={(endDate) => {
                if (endDate) {
                  setEditStartDate(editDueDate);
                  setEditDueDate(endDate);
                } else {
                  setEditStartDate('');
                }
              }}
            >
              <div className={`flex items-center gap-1.5 bg-sp-surface text-xs px-2 py-1.5 rounded-lg border border-sp-border hover:border-sp-accent transition-colors cursor-pointer ${
                editDueDate ? 'text-sp-text' : 'text-sp-muted'
              }`}>
                <span className="material-symbols-outlined text-base">calendar_today</span>
                {editStartDate ? `${editStartDate} → ${editDueDate}` : editDueDate || '기한 없음'}
              </div>
            </DatePopover>
            {/* Time input */}
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="bg-sp-surface text-sp-text text-xs px-2 py-1.5 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
            />
            {/* Priority buttons */}
            <div className="flex items-center gap-1">
              {PRIORITY_OPTIONS.map((p) => {
                const config = PRIORITY_CONFIG[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setEditPriority(p)}
                    className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                      editPriority === p
                        ? `${config.bgColor || 'bg-sp-surface'} ${config.color} ring-1 ring-current`
                        : 'text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {config.icon} {PRIORITY_LABELS[p]}
                  </button>
                );
              })}
            </div>
            {/* Category select */}
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="bg-sp-surface text-sp-text text-xs px-2 py-1.5 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
            >
              <option value="">카테고리 없음</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-3 py-1 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="px-3 py-1 rounded-lg text-xs font-bold bg-sp-accent hover:bg-blue-600 text-white transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal display mode
  return (
    <>
      <li
        className="flex items-center gap-3 px-4 py-2.5 border-t border-sp-border/50 transition-colors hover:bg-sp-surface/30 group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          // Don't close postpone on mouse leave to allow dropdown interaction
        }}
      >
        {/* Drag handle */}
        {dragHandleProps && (
          <button
            type="button"
            className={`cursor-grab active:cursor-grabbing p-0.5 rounded text-sp-muted/50 hover:text-sp-muted transition-opacity ${
              hovered ? 'opacity-100' : 'opacity-0'
            }`}
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm leading-none select-none">⠿</span>
          </button>
        )}

        {/* 체크박스 */}
        <div
          className="cursor-pointer"
          onClick={() => {
            track('todo_toggle', { completed: !todo.completed });
            void onToggle(todo.id);
          }}
        >
          <Checkbox checked={todo.completed} />
        </div>

        {/* 우선순위 dot */}
        {todo.priority && todo.priority !== 'none' && (
          <span className={`text-caption ${priorityConfig.color}`} title={priorityConfig.label}>
            {priorityConfig.icon}
          </span>
        )}

        {/* D-Day 뱃지 (dueDate 순 모드) */}
        {dDayText && (
          <span className={`text-caption font-bold px-1.5 py-0.5 rounded ${dDayColor} shrink-0 tabular-nums`}>
            {dDayText}
          </span>
        )}

        {/* 반복 아이콘 */}
        {todo.recurrence && (
          <span className="text-caption text-sp-muted" title={getRecurrenceLabel(todo.recurrence)}>
            🔄
          </span>
        )}

        {/* 텍스트 (double-click to edit) */}
        <span
          className={`flex-1 text-sm leading-tight transition-all ${
            todo.completed
              ? 'text-sp-muted line-through opacity-50'
              : 'text-sp-text'
          }`}
          onDoubleClick={handleDoubleClick}
        >
          {todo.text}
        </span>

        {/* Google Tasks 연동 아이콘 */}
        {todo.googleTaskId && (
          <span className="material-symbols-outlined text-xs text-sp-muted/50 shrink-0" title="Google Tasks 연동됨">cloud_done</span>
        )}

        {/* Subtask progress */}
        {subTaskTotal > 0 && (
          <span className="text-caption text-sp-muted font-medium bg-sp-surface px-1.5 py-0.5 rounded">
            {subTaskCompleted}/{subTaskTotal}
          </span>
        )}

        {/* 카테고리 태그 */}
        {cat && (
          <span
            className={`text-caption px-1.5 py-0.5 rounded font-medium ${
              CATEGORY_COLORS[cat.color] ?? 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {cat.icon} {cat.name}
          </span>
        )}

        {/* 날짜 라벨 */}
        {(todo.dueDate || todo.startDate) && (
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              overdue
                ? 'text-red-400 bg-red-400/10'
                : todo.completed
                  ? 'text-sp-muted/50'
                  : 'text-sp-muted'
            }`}
          >
            {todo.startDate && todo.dueDate
              ? `${formatDueDate(todo.startDate)}~${formatDueDate(todo.dueDate)}`
              : formatDueDate(todo.dueDate ?? todo.startDate!)}
          </span>
        )}

        {/* 시간 라벨 */}
        {todo.time && (
          <span
            className={`text-xs font-mono px-1.5 py-0.5 rounded bg-sp-surface ${
              todo.completed ? 'text-sp-muted/50' : 'text-sp-muted'
            }`}
          >
            {todo.time}
          </span>
        )}

        {/* 편집 힌트 아이콘 (hover, incomplete only) */}
        {!todo.completed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDoubleClick();
            }}
            className={`p-1 rounded-lg transition-all ${
              hovered
                ? 'opacity-100 text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10'
                : 'opacity-0'
            }`}
            title="클릭하여 수정"
          >
            <span className="material-symbols-outlined text-icon">edit</span>
          </button>
        )}

        {/* Add subtask button (hover, incomplete only) */}
        {!todo.completed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSubTaskInput((prev) => !prev);
            }}
            className={`p-1 rounded-lg transition-all ${
              hovered
                ? 'opacity-100 text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10'
                : 'opacity-0'
            }`}
            title="서브태스크 추가"
          >
            <span className="material-symbols-outlined text-icon">add_task</span>
          </button>
        )}

        {/* Quick postpone button (hover, incomplete only) */}
        {!todo.completed && (
          <div className="relative" ref={postponeRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPostpone((prev) => !prev);
              }}
              className={`p-1 rounded-lg transition-all ${
                hovered || showPostpone
                  ? 'opacity-100 text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10'
                  : 'opacity-0'
              }`}
              title="날짜 미루기"
            >
              <span className="text-sm">📅</span>
            </button>

            {/* Postpone dropdown */}
            {showPostpone && (
              <div className="absolute right-0 top-full mt-1 bg-sp-card rounded-xl ring-1 ring-sp-border shadow-xl z-20 py-1 min-w-[160px]">
                {getPostponeOptions().map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePostpone(opt.getDate());
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-sp-surface transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="border-t border-sp-border/50 mt-1 pt-1 px-1">
                  <DatePopover
                    date={todo.dueDate ?? toLocalDateString()}
                    endDate={todo.startDate ? todo.dueDate : undefined}
                    onDateChange={(d) => {
                      handlePostpone(d);
                      setShowPostpone(false);
                    }}
                    onEndDateChange={(endDate) => {
                      if (endDate) {
                        void onUpdate(todo.id, { startDate: todo.dueDate, dueDate: endDate });
                        setShowPostpone(false);
                      } else {
                        void onUpdate(todo.id, { startDate: undefined });
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-left px-2 py-1.5 text-xs text-sp-accent hover:bg-sp-surface transition-colors rounded"
                    >
                      📅 달력에서 선택...
                    </button>
                  </DatePopover>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 삭제 버튼 (호버 시) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(todo.id);
          }}
          className={`p-1 rounded-lg transition-all ${
            hovered
              ? 'opacity-100 text-red-400 hover:bg-red-400/10'
              : 'opacity-0'
          }`}
        >
          <span className="material-symbols-outlined text-icon-md">close</span>
        </button>
      </li>

      {/* Subtasks */}
      {subTaskTotal > 0 && (
        <ul className="border-t border-sp-border/30">
          {subTasks.map((st) => (
            <li
              key={st.id}
              className="flex items-center gap-2 pl-8 pr-4 py-1.5 hover:bg-sp-surface/20 transition-colors group/sub"
            >
              <div
                className="cursor-pointer"
                onClick={() => handleToggleSubTask(st.id)}
              >
                <Checkbox checked={st.completed} />
              </div>
              <span
                className={`flex-1 text-xs leading-tight ${
                  st.completed ? 'text-sp-muted line-through opacity-50' : 'text-sp-text/80'
                }`}
              >
                {st.text}
              </span>
              <button
                type="button"
                onClick={() => void onDeleteSubTask(todo.id, st.id)}
                className="p-0.5 rounded text-red-400/60 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover/sub:opacity-100 transition-all"
              >
                <span className="material-symbols-outlined text-icon-sm">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Subtask input */}
      {showSubTaskInput && (
        <div className="flex items-center gap-2 pl-8 pr-4 py-2 border-t border-sp-border/30 bg-sp-surface/20">
          <span className="text-sp-muted text-xs">└</span>
          <input
            type="text"
            value={subTaskText}
            onChange={(e) => setSubTaskText(e.target.value)}
            onKeyDown={handleSubTaskKeyDown}
            placeholder="서브태스크 입력..."
            autoFocus
            className="flex-1 bg-sp-surface text-sp-text text-xs px-2 py-1.5 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors placeholder:text-sp-muted"
          />
          <button
            type="button"
            onClick={handleAddSubTask}
            disabled={!subTaskText.trim()}
            className="px-2 py-1 rounded-lg text-xs font-medium bg-sp-accent hover:bg-blue-600 disabled:opacity-40 text-white transition-colors"
          >
            추가
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSubTaskInput(false);
              setSubTaskText('');
            }}
            className="px-2 py-1 rounded-lg text-xs text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
        </div>
      )}
    </>
  );
}

/* ─── Checkbox ─── */

interface CheckboxProps {
  checked: boolean;
}

function Checkbox({ checked }: CheckboxProps) {
  return (
    <div
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded transition-colors ${
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
          className="h-2.5 w-2.5"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

/** "YYYY-MM-DD" -> "M/D" 형식 */
function formatDueDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const monthStr = parts[1];
  const dayStr = parts[2];
  if (parts.length !== 3 || !monthStr || !dayStr) return dateStr;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  return `${month}/${day}`;
}
