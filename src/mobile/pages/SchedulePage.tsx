import { useState, useEffect, useCallback } from 'react';
import { useMobileEventsStore } from '@mobile/stores/useMobileEventsStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
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
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add modal form state
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => {
    void loadEvents();
    void loadSettings();
  }, [loadEvents, loadSettings]);

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

  const today = startOfDay(new Date());

  // Visible (non-hidden) events
  const visibleEvents = events.filter((e) => !e.isHidden);

  // Events for a given day
  const eventsOnDay = useCallback(
    (day: Date): readonly SchoolEvent[] =>
      visibleEvents.filter((e) => isSameDay(new Date(e.date), day)),
    [visibleEvents],
  );

  // Displayed events list
  const displayedEvents: readonly SchoolEvent[] = (() => {
    if (selectedDay) {
      return eventsOnDay(selectedDay);
    }
    // Upcoming: events in the currently displayed month, sorted by date
    return [...visibleEvents]
      .filter((e) => {
        const eventDate = new Date(e.date);
        return isSameMonth(eventDate, currentMonth);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

  const handlePrevMonth = () => setCurrentMonth((m) => subMonths(m, 1));
  const handleNextMonth = () => setCurrentMonth((m) => addMonths(m, 1));

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
    setShowAddModal(true);
  };

  const handleAdd = async () => {
    if (!newTitle.trim() || !newDate) return;
    const event: SchoolEvent = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      date: newDate,
      category: newCategory,
    };
    await addEvent(event);
    setShowAddModal(false);
  };

  const listHeader = selectedDay
    ? `${format(selectedDay, 'M월 d일', { locale: ko })} 일정`
    : '다가오는 일정';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mini Calendar */}
      <div className="glass-card mx-3 mt-3 rounded-xl shrink-0">
        {/* Month Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={handlePrevMonth}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 transition-colors"
            aria-label="이전 달"
          >
            <span className="material-symbols-outlined text-sp-text text-xl">chevron_left</span>
          </button>
          <h2 className="text-sp-text font-bold text-base">
            {format(currentMonth, 'yyyy년 M월', { locale: ko })}
          </h2>
          <button
            onClick={handleNextMonth}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10 transition-colors"
            aria-label="다음 달"
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
        <div className="grid grid-cols-7 px-2 pb-3 gap-y-0.5">
          {allCells.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const dayEvents = eventsOnDay(day);
            const colIndex = idx % 7;

            return (
              <button
                key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center py-1 rounded-lg min-h-[44px] transition-colors ${
                  isSelected && !isToday
                    ? 'ring-2 ring-blue-500'
                    : ''
                } ${isCurrentMonth ? '' : 'opacity-30'}`}
              >
                <span
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                    isToday
                      ? 'bg-blue-500 text-white font-bold'
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
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sp-text font-semibold text-sm">{listHeader}</h3>
        </div>

        {displayedEvents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sp-muted text-sm">일정이 없습니다.</p>
          </div>
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
                          ? 'bg-blue-500 text-white'
                          : 'bg-blue-500/10 text-blue-500 border border-blue-500/40'
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

      {/* FAB */}
      <button
        onClick={openAddModal}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center z-10 active:scale-95 transition-transform"
        aria-label="일정 추가"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

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
                className="flex-1 h-11 rounded-xl bg-blue-500 text-white text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
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
