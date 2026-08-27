import { useState, useEffect, useCallback, useMemo } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { useMobileEventsStore } from '@mobile/stores/useMobileEventsStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import { useMobileUiTriggerStore } from '@mobile/stores/useMobileUiTriggerStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { Toggle } from '@mobile/components/common/Toggle';
import { EmptyState } from '@mobile/components/common/EmptyState';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { getVisibleEvents, sortByDate } from '@domain/rules/eventRules';
import type { TodoCalendarChip } from '@domain/rules/todoCalendarRules';
import { getTodoChipsByDate } from '@domain/rules/todoCalendarRules';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfDay,
} from 'date-fns';
import { ko } from 'date-fns/locale';

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
  red: 'bg-red-400',
  pink: 'bg-pink-400',
  indigo: 'bg-indigo-400',
  teal: 'bg-teal-400',
  gray: 'bg-gray-400',
};

const DOT_COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-purple-400',
  red: 'bg-red-400',
  pink: 'bg-pink-400',
  indigo: 'bg-indigo-400',
  teal: 'bg-teal-400',
  gray: 'bg-gray-400',
};

/**
 * 할 일 표시는 **테두리만 있는 동그라미**다 (2026-08-27).
 *
 * 일정 점은 꽉 찬 원이라, 같은 크기·같은 색으로 그리면 6px 안에서 둘이 구분되지 않는다.
 * 속을 비우면 "아직 안 한 것"이라는 체크박스의 뜻도 함께 실린다 — PC 달력의 칩과 같은 모양이다.
 */
const TODO_RING_COLOR_MAP: Record<string, string> = {
  blue: 'border-blue-400',
  green: 'border-green-400',
  yellow: 'border-yellow-400',
  purple: 'border-purple-400',
  red: 'border-red-400',
  pink: 'border-pink-400',
  indigo: 'border-indigo-400',
  teal: 'border-teal-400',
  gray: 'border-gray-400',
};

function getCategoryColor(categoryId: string, categories: readonly CategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  return cat?.color ?? 'gray';
}

/** 할 일 카테고리 → 테두리 색. 지난 마감은 분류보다 상태가 먼저라 빨강으로 덮는다. */
function getTodoRingClass(
  chip: TodoCalendarChip,
  categories: readonly { readonly id: string; readonly color: string }[],
): string {
  if (chip.overdue) return 'border-red-400';
  const color = chip.categoryId
    ? (categories.find((c) => c.id === chip.categoryId)?.color ?? 'gray')
    : 'gray';
  return TODO_RING_COLOR_MAP[color] ?? 'border-gray-400';
}

function getDDayLabel(dateStr: string): string | null {
  const today = startOfDay(new Date());
  const eventDate = startOfDay(new Date(dateStr));
  const diff = Math.ceil((eventDate.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'D-Day';
  if (diff > 0) return `D-${diff}`;
  return null;
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];

export function SchedulePage() {
  const loadEvents = useMobileEventsStore((s) => s.load);
  const loadSettings = useMobileSettingsStore((s) => s.load);
  const events = useMobileEventsStore((s) => s.events);
  const categories = useMobileEventsStore((s) => s.categories);
  const addEvent = useMobileEventsStore((s) => s.addEvent);

  /* 할 일 겹쳐 보기 (2026-08-27) — PC 일정 달력과 같은 도메인 규칙을 그대로 쓴다.
     끄는 스위치는 PC 에만 있고 폰은 그 값을 따른다(useMobileSettingsStore 주석 참고). */
  const showTodos = useMobileSettingsStore((s) => s.settings.scheduleShowTodos ?? true);
  const todos = useMobileTodoStore((s) => s.todos);
  const todoCategories = useMobileTodoStore((s) => s.categories);
  const loadTodos = useMobileTodoStore((s) => s.load);
  const toggleTodo = useMobileTodoStore((s) => s.toggleTodo);

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  /** 월 전체 펼침. 기본은 이번 주 한 줄. */
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  /** 접힌 주 보기에서 화살표로 옮겨 둔 주(그 주의 아무 날). 선택한 날이 있으면 그쪽이 우선. */
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useBottomSheet(showAddModal, () => setShowAddModal(false));

  // Add modal form state
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isAllDay, setIsAllDay] = useState(true);
  const [newStartTime, setNewStartTime] = useState('');
  const [newEndTime, setNewEndTime] = useState('');

  useEffect(() => {
    void loadEvents();
    void loadSettings();
  }, [loadEvents, loadSettings]);

  // 꺼 두었으면 읽지도 않는다 — 안 쓰는 선생님에게는 없는 기능이어야 한다
  useEffect(() => {
    if (!showTodos) return;
    void loadTodos();
  }, [showTodos, loadTodos]);

  /**
   * 기준일이 속한 주(일~토) 7칸.
   * 선택한 날이 있으면 그 주를, 없으면 화살표로 옮겨 둔 주를, 그것도 없으면 오늘이 속한
   * 주를 보여준다 — 날짜를 고르고 나서 그 주가 사라지면 맥락을 잃는다.
   */
  const weekAnchor = selectedDay ?? weekAnchorDate ?? new Date();
  const weekStart = new Date(weekAnchor);
  weekStart.setDate(weekAnchor.getDate() - weekAnchor.getDay());
  const weekCells: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Build calendar days grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad to start on Sunday
  const startPad = monthStart.getDay(); // 0=Sun
  // Pad to fill last row
  const totalCells = Math.ceil((startPad + daysInMonth.length) / 7) * 7;
  const endPad = totalCells - startPad - daysInMonth.length;

  const prevMonthEnd = endOfMonth(subMonths(currentMonth, 1));
  const prevDays: Date[] = [];
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(prevMonthEnd);
    d.setDate(prevMonthEnd.getDate() - i);
    prevDays.push(d);
  }

  const nextMonthStart = startOfMonth(addMonths(currentMonth, 1));
  const nextDays: Date[] = [];
  for (let i = 0; i < endPad; i++) {
    const d = new Date(nextMonthStart);
    d.setDate(nextMonthStart.getDate() + i);
    nextDays.push(d);
  }

  const allCells = [...prevDays, ...daysInMonth, ...nextDays];

  /**
   * 기본은 이번 주 한 줄, 필요하면 월 전체로 펼친다.
   *
   * 월 달력은 실측 기준 화면의 57%(620px 중 355px)를 먹었다. 8월처럼 일정이 있는 날이
   * 며칠뿐이어도 6주치가 항상 펼쳐져 있어서, 정작 일정 목록은 아래에 두 줄만 남았다.
   * 교사의 일상 단위는 "이번 주"라 주를 기본으로 두는 편이 맞다.
   *
   * 없애는 게 아니라 접는 것이다. 월 전체가 필요할 때가 분명히 있다(다음 달 행사 확인 등).
   */
  const visibleCells = monthExpanded ? allCells : weekCells;

  const today = startOfDay(new Date());

  // Visible (non-hidden) events
  const visibleEvents = getVisibleEvents(events);

  // Events for a given day
  const eventsOnDay = useCallback(
    (day: Date): readonly SchoolEvent[] =>
      // 같은 날 안의 순서는 사용자가 PC에서 정할 수 있다(sortOrder). 도메인 규칙을
      // 거쳐야 PC 목록과 위아래가 같아진다.
      sortByDate(visibleEvents.filter((e) => isSameDay(new Date(e.date), day))),
    [visibleEvents],
  );

  const isViewingCurrentMonth = isSameMonth(currentMonth, today);

  const todayKey = format(today, 'yyyy-MM-dd');

  /**
   * 날짜별 할 일 — **앞뒤 달까지 세 달치를 합쳐 둔다.**
   *
   * 이번 달만 계산하면 두 가지 자리에서 표시가 사라진다. ① 월 달력의 앞뒤 여백 칸(7월 27일,
   * 9월 1일 같은 회색 날짜)과 ② 달을 걸치는 주(8/31~9/5). 접힌 주 보기가 기본이라 ②는
   * 매달 한 번씩 반드시 걸린다 — "달 바뀌는 주에는 마감이 안 보인다"는 제보가 될 자리다.
   */
  const todoChipsByDate = useMemo(() => {
    const merged = new Map<string, readonly TodoCalendarChip[]>();
    if (!showTodos) return merged;
    for (const m of [subMonths(currentMonth, 1), currentMonth, addMonths(currentMonth, 1)]) {
      for (const [key, chips] of getTodoChipsByDate(todos, format(m, 'yyyy-MM'), todayKey)) {
        merged.set(key, chips);
      }
    }
    return merged;
  }, [showTodos, todos, currentMonth, todayKey]);

  /**
   * 아래 목록에 띄울 할 일.
   *
   * 일정 목록과 달리 **지난 것을 걸러내지 않는다.** 지난 일정은 이미 끝난 일이지만 지난
   * 마감은 아직 남은 일이라, 여기서 빼면 정작 가장 급한 것이 안 보인다. 완료한 것은
   * 도메인 규칙이 이미 뺐으므로, 남은 것은 전부 "지났거나 앞으로 올" 미완료다.
   */
  const displayedTodos = useMemo<readonly TodoCalendarChip[]>(() => {
    if (!showTodos) return [];
    const all = [...todoChipsByDate.values()].flat();
    if (selectedDay) {
      const key = format(selectedDay, 'yyyy-MM-dd');
      return all.filter((c) => c.dateKey === key);
    }
    const monthKey = format(currentMonth, 'yyyy-MM');
    // 날짜 오름차순 — 지난 마감이 자연히 맨 위로 온다. 같은 날 안의 순서는
    // 도메인 규칙이 정해 둔 그대로다(정렬이 안정적이라 유지된다).
    return all
      .filter((c) => c.dateKey.startsWith(monthKey))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [showTodos, todoChipsByDate, selectedDay, currentMonth]);

  // Displayed events list
  const displayedEvents: readonly SchoolEvent[] = (() => {
    if (selectedDay) {
      return eventsOnDay(selectedDay);
    }
    // Upcoming (current month): only today and after
    // Past/future month: full month
    return sortByDate(
      visibleEvents.filter((e) => {
        const eventDate = new Date(e.date);
        if (!isSameMonth(eventDate, currentMonth)) return false;
        if (isViewingCurrentMonth) return eventDate >= today;
        return true;
      }),
    );
  })();

  /**
   * 좌우 화살표 — **보이는 것을** 옮긴다.
   *
   * 월 전체를 펼쳤으면 달을, 접힌 주 보기에서는 주를 옮긴다.
   * 접힌 상태에서 달만 바꾸면 제목과 목록은 다음 달로 가는데 날짜줄은 이번 주 그대로라,
   * 사용자에겐 "버튼이 제목만 바꾸는" 고장으로 보인다.
   */
  const shiftPeriod = (dir: -1 | 1) => {
    if (monthExpanded) {
      setCurrentMonth((m) => (dir === 1 ? addMonths(m, 1) : subMonths(m, 1)));
      return;
    }
    const next = new Date(weekAnchor);
    next.setDate(weekAnchor.getDate() + dir * 7);
    // 다른 주로 옮겼으면 이전 주에서 고른 날은 더 이상 맞지 않는다.
    setSelectedDay(null);
    setWeekAnchorDate(next);
    // 제목과 아래 목록도 그 주가 속한 달을 따라간다.
    setCurrentMonth(next);
  };

  const handlePrevMonth = () => shiftPeriod(-1);
  const handleNextMonth = () => shiftPeriod(1);

  const handleDayClick = (day: Date) => {
    if (selectedDay && isSameDay(day, selectedDay)) {
      setSelectedDay(null);
    } else {
      setSelectedDay(day);
    }
  };

  const openAddModal = () => {
    const defaultDate = selectedDay
      ? format(selectedDay, 'yyyy-MM-dd')
      : format(today, 'yyyy-MM-dd');
    setNewTitle('');
    setNewDate(defaultDate);
    setNewCategory(categories[0]?.id ?? '');
    setIsAllDay(true);
    setNewStartTime('');
    setNewEndTime('');
    setShowAddModal(true);
  };

  // 전역 FAB → "일정 추가" 트리거 소비
  const pendingUiAction = useMobileUiTriggerStore((s) => s.pendingAction);
  const consumeUiAction = useMobileUiTriggerStore((s) => s.consumeAction);
  useEffect(() => {
    if (pendingUiAction === 'add-event') {
      openAddModal();
      consumeUiAction('add-event');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUiAction]);

  const handleAdd = async () => {
    if (!newTitle.trim() || !newDate) return;
    const start = isAllDay ? '' : newStartTime.trim();
    const end = isAllDay ? '' : newEndTime.trim();
    const timeStr = start ? (end ? `${start} - ${end}` : start) : undefined;
    const event: SchoolEvent = {
      id: generateUUID(),
      title: newTitle.trim(),
      date: newDate,
      category: newCategory,
      ...(timeStr ? { time: timeStr } : {}),
      ...(start ? { startTime: start } : {}),
      ...(end ? { endTime: end } : {}),
    };
    await addEvent(event);
    setShowAddModal(false);
  };

  const listHeader = selectedDay
    ? `${format(selectedDay, 'M월 d일', { locale: ko })} 일정`
    : isViewingCurrentMonth
      ? '다가오는 일정'
      : `${format(currentMonth, 'M월', { locale: ko })} 일정`;

  return (
    // 페이지 전체(달력 + 다가오는 일정)가 하나로 상하 스크롤된다.
    // 이전에는 달력이 고정되고 아래 목록만 따로 스크롤됐으나, 모바일에서 정보 확인이
    // 불편해 전체 스크롤로 통합했다 (사용자 요청, 2026-07-03).
    <div className="h-full overflow-y-auto">
      {/* Mini Calendar */}
      <div className="glass-card mx-3 mt-3 rounded-xl">
        {/* Month Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handlePrevMonth}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 transition-colors"
            // 접힌 주 보기에서는 주를 옮기므로 읽어주는 말도 그에 맞춘다.
            aria-label={monthExpanded ? '이전 달' : '이전 주'}
          >
            <span className="material-symbols-outlined text-sp-text text-xl" aria-hidden="true">
              chevron_left
            </span>
          </button>
          <h2 className="text-sp-text font-bold text-base">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h2>
          <button
            onClick={handleNextMonth}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 transition-colors"
            aria-label={monthExpanded ? '다음 달' : '다음 주'}
          >
            <span className="material-symbols-outlined text-sp-text text-xl" aria-hidden="true">
              chevron_right
            </span>
          </button>
        </div>

        {/* Day-of-week Headers */}
        <div className="grid grid-cols-7 px-2 pb-1">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-sp-muted'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day Grid */}
        <div className="grid grid-cols-7 px-2 gap-y-0.5">
          {visibleCells.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const dayEvents = eventsOnDay(day);
            const dayTodos = todoChipsByDate.get(format(day, 'yyyy-MM-dd')) ?? [];
            const colIndex = idx % 7;

            return (
              <button
                key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                data-day={format(day, 'yyyy-MM-dd')}
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center py-1 rounded-lg min-h-[44px] transition-colors ${
                  isSelected && !isToday ? 'ring-2 ring-blue-500' : ''
                } ${isCurrentMonth ? '' : 'opacity-30'}`}
              >
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-sp-accent text-sp-accent-fg font-bold'
                      : isSelected
                        ? 'ring-2 ring-blue-500 text-sp-text font-medium'
                        : colIndex === 0
                          ? 'text-red-400'
                          : colIndex === 6
                            ? 'text-blue-400'
                            : 'text-sp-text'
                  }`}
                >
                  {day.getDate()}
                </span>
                {/* 일정은 채운 점, 할 일은 속 빈 동그라미.
                    합쳐서 4개까지만 — 칸 너비가 좁아 그 이상은 점끼리 붙어 뭉개진다. */}
                <div className="flex gap-0.5 mt-0.5 min-h-[6px]">
                  {dayEvents.slice(0, 3).map((ev) => {
                    const color = getCategoryColor(ev.category, categories);
                    return (
                      <span
                        key={ev.id}
                        className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR_MAP[color] ?? 'bg-gray-400'}`}
                      />
                    );
                  })}
                  {dayTodos.slice(0, Math.max(0, 4 - Math.min(dayEvents.length, 3))).map((chip) => (
                    <span
                      key={chip.todoId}
                      className={`w-1.5 h-1.5 rounded-full border ${getTodoRingClass(chip, todoCategories)}`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* 월 전체 펼치기 — 없애는 게 아니라 접는 것이다.
            기본을 주로 두면 달력이 화면의 57% 대신 한 줄만 차지하고, 그만큼 일정 목록이
            더 보인다. 월 전체가 필요한 순간(다음 달 행사 확인 등)은 여기서 편다. */}
        <button
          onClick={() => setMonthExpanded((v) => !v)}
          aria-expanded={monthExpanded}
          className="flex items-center justify-center gap-1 w-full py-2 text-xs text-sp-muted active:bg-black/5 dark:active:bg-white/10"
          style={{ minHeight: 44 }}
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {monthExpanded ? 'expand_less' : 'expand_more'}
          </span>
          {monthExpanded
            ? '이번 주만 보기'
            : `${format(currentMonth, 'M월', { locale: ko })} 전체 보기`}
        </button>
      </div>

      {/* Events List — 전체 스크롤 컨테이너 안의 일반 블록 (하단 FAB 여백 확보) */}
      <div className="pb-24">
        {/* 일정이 없고 할 일만 있으면 제목만 덩그러니 남는다 — 그럴 때는 제목도 같이 접는다 */}
        {(displayedEvents.length > 0 || displayedTodos.length === 0) && (
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sp-text font-semibold text-sm">{listHeader}</h3>
          </div>
        )}

        {displayedEvents.length === 0 ? (
          displayedTodos.length === 0 && (
            <EmptyState
              icon="event_available"
              text="표시할 일정이 없어요"
              hint="+ 버튼으로 일정을 추가할 수 있어요."
            />
          )
        ) : (
          <ul className="divide-y divide-sp-border">
            {displayedEvents.map((ev) => {
              const color = getCategoryColor(ev.category, categories);
              const dday = getDDayLabel(ev.date);
              const evDate = new Date(ev.date);
              return (
                <li key={ev.id} className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${COLOR_MAP[color] ?? 'bg-gray-400'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sp-text text-sm font-medium truncate">{ev.title}</p>
                    <p className="text-sp-muted text-xs mt-0.5">
                      {format(evDate, 'M월 d일 (E)', { locale: ko })}
                      {ev.time ? ` ${ev.time}` : ''}
                    </p>
                  </div>
                  {dday && (
                    <span
                      className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                        dday === 'D-Day'
                          ? 'bg-sp-accent text-sp-accent-fg'
                          : 'bg-sp-accent/15 text-sp-accent border border-sp-accent/40'
                      }`}
                    >
                      {dday}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/*
          할 일 (2026-08-27) — 일정 목록에 **섞지 않고 따로 세운다.**

          섞으면 같은 줄에 선 두 가지가 서로 다른 것을 눌러야 하는 물건이 된다(일정은
          내용을 보러, 할 일은 끝내러). 무엇보다 일정과 할 일은 저장되는 곳도 고치는
          길도 달라, 한 목록에 두면 다음 사람이 반드시 같은 경로로 다루려 든다.
          PC 의 하루 상세 창도 같은 이유로 나눠 두었다.
        */}
        {displayedTodos.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-4 pt-5 pb-2">
              <span className="material-symbols-outlined text-sp-muted text-base" aria-hidden>
                checklist
              </span>
              <h3 className="text-sp-text font-semibold text-sm">할 일</h3>
              <span className="text-sp-muted text-xs tabular-nums">{displayedTodos.length}</span>
            </div>
            <ul className="divide-y divide-sp-border">
              {displayedTodos.map((chip) => {
                const chipDate = new Date(`${chip.dateKey}T00:00:00`);
                return (
                  <li key={chip.todoId} className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
                    {/* 누르면 그 자리에서 끝난다 — 할 일 화면으로 건너가지 않아도 된다.
                        44px 는 손가락이 빗나가지 않는 최소 크기다. */}
                    <button
                      onClick={() => void toggleTodo(chip.todoId)}
                      aria-label={`'${chip.title}' 완료`}
                      className={`shrink-0 -ml-2 w-11 h-11 flex items-center justify-center rounded-full active:bg-black/5 dark:active:bg-white/10 transition-colors ${
                        chip.overdue ? 'text-red-400' : 'text-sp-muted'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xl" aria-hidden>
                        radio_button_unchecked
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sp-text text-sm font-medium truncate">{chip.title}</p>
                      <p className="text-sp-muted text-xs mt-0.5">
                        {format(chipDate, 'M월 d일 (E)', { locale: ko })}
                        {chip.time ? ` ${chip.time}` : ''}
                      </p>
                    </div>
                    {chip.overdue && (
                      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-red-400/15 text-red-400 border border-red-400/40">
                        지남
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="px-4 pt-2 text-sp-muted text-xs">
              할 일 화면에서 만든 항목입니다. 내용을 고치려면 할 일에서 열어주세요.
            </p>
          </>
        )}
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-lg glass-card rounded-t-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sp-text font-bold text-base">일정 추가</h3>

            {/* Title */}
            <div>
              <label className="block text-sp-muted text-xs mb-1">제목</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="일정 제목을 입력하세요"
                className="w-full glass-input text-sm"
                autoFocus
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-sp-muted text-xs mb-1">날짜</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full glass-input text-sm"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sp-muted text-xs mb-1">카테고리</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full glass-input text-sm"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 종일 토글 */}
            <div className="flex items-center justify-between glass-card rounded-xl px-4 py-3">
              <span className="text-sp-text text-sm">종일</span>
              <Toggle checked={isAllDay} onChange={setIsAllDay} label="종일 일정 설정" />
            </div>

            {/* 시작/종료 시간 — 종일이 아닐 때만 */}
            {!isAllDay && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sp-muted text-xs mb-1">시작 시간</label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    aria-label="시작 시간"
                    className="w-full glass-input text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sp-muted text-xs mb-1">종료 시간 (선택)</label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    disabled={!newStartTime}
                    aria-label="종료 시간"
                    className="w-full glass-input text-sm disabled:opacity-40"
                  />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 h-11 rounded-xl border border-sp-border text-sp-muted text-sm font-medium active:scale-[0.98] transition-all"
              >
                취소
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={!newTitle.trim() || !newDate}
                className="flex-1 h-11 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
