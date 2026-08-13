import { useState, useEffect, useCallback } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { useMobileEventsStore } from '@mobile/stores/useMobileEventsStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileUiTriggerStore } from '@mobile/stores/useMobileUiTriggerStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { Toggle } from '@mobile/components/common/Toggle';
import { EmptyState } from '@mobile/components/common/EmptyState';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
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

function getCategoryColor(categoryId: string, categories: readonly CategoryItem[]): string {
  const cat = categories.find((c) => c.id === categoryId);
  return cat?.color ?? 'gray';
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

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  /** 월 전체 펼침. 기본은 이번 주 한 줄. */
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  /** 접힌 주 보기에서 화살표로 옮겨 둔 주(그 주의 아무 날). 선택한 날이 있으면 그쪽이 우선. */
  const [weekAnchorDate, setWeekAnchorDate] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  useBottomSheet(showAddModal);

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
  const visibleEvents = events.filter((e) => !e.isHidden);

  // Events for a given day
  const eventsOnDay = useCallback(
    (day: Date): readonly SchoolEvent[] =>
      visibleEvents.filter((e) => isSameDay(new Date(e.date), day)),
    [visibleEvents],
  );

  const isViewingCurrentMonth = isSameMonth(currentMonth, today);

  // Displayed events list
  const displayedEvents: readonly SchoolEvent[] = (() => {
    if (selectedDay) {
      return eventsOnDay(selectedDay);
    }
    // Upcoming (current month): only today and after
    // Past/future month: full month
    return [...visibleEvents]
      .filter((e) => {
        const eventDate = new Date(e.date);
        if (!isSameMonth(eventDate, currentMonth)) return false;
        if (isViewingCurrentMonth) return eventDate >= today;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
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
            <span className="material-symbols-outlined text-sp-text text-xl">chevron_left</span>
          </button>
          <h2 className="text-sp-text font-bold text-base">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h2>
          <button
            onClick={handleNextMonth}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 transition-colors"
            aria-label={monthExpanded ? '다음 달' : '다음 주'}
          >
            <span className="material-symbols-outlined text-sp-text text-xl">chevron_right</span>
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
                {/* Event dots */}
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
        >
          <span className="material-symbols-outlined text-base">
            {monthExpanded ? 'expand_less' : 'expand_more'}
          </span>
          {monthExpanded
            ? '이번 주만 보기'
            : `${format(currentMonth, 'M월', { locale: ko })} 전체 보기`}
        </button>
      </div>

      {/* Events List — 전체 스크롤 컨테이너 안의 일반 블록 (하단 FAB 여백 확보) */}
      <div className="pb-24">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sp-text font-semibold text-sm">{listHeader}</h3>
        </div>

        {displayedEvents.length === 0 ? (
          <EmptyState
            icon="event_available"
            text="표시할 일정이 없어요"
            hint="+ 버튼으로 일정을 추가할 수 있어요."
          />
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
