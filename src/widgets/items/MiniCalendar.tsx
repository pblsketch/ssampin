import { useState, useMemo, useEffect } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { getCategoryInfo, getCategoryColors } from '@adapters/presenters/categoryPresenter';
import { getHolidayMapForMonth } from '@domain/rules/holidayRules';

export function MiniCalendar() {
  const events = useEventsStore((s) => s.events);
  const categories = useEventsStore((s) => s.categories);
  const loaded = useEventsStore((s) => s.loaded);
  const load = useEventsStore((s) => s.load);

  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => { setViewDate(new Date(year, month - 1, 1)); setSelectedDate(null); };
  const nextMonth = () => { setViewDate(new Date(year, month + 1, 1)); setSelectedDate(null); };
  const goToday = () => setViewDate(new Date());

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const holidayMap = getHolidayMapForMonth(year, month);

    const days: Array<{
      date: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSunday: boolean;
      isSaturday: boolean;
      isHoliday: boolean;
      eventColors: string[];
    }> = [];

    // 이전 달 채우기
    const prevLastDay = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevLastDay - i;
      days.push({
        date: d,
        dateStr: '',
        isCurrentMonth: false,
        isToday: false,
        isSunday: false,
        isSaturday: false,
        isHoliday: false,
        eventColors: [],
      });
    }

    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(year, month, d).getDay();
      const dayEvents = events.filter(
        (e) => e.date === dateStr || (e.endDate && e.date <= dateStr && e.endDate >= dateStr),
      );
      const colors = dayEvents
        .map((e) => {
          const info = getCategoryInfo(e.category, categories);
          return getCategoryColors(info.color).dot;
        })
        .filter((c, i, arr) => arr.indexOf(c) === i)
        .slice(0, 3);

      days.push({
        date: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSunday: dow === 0,
        isSaturday: dow === 6,
        isHoliday: holidayMap.has(dateStr),
        eventColors: colors,
      });
    }

    // 다음 달 채우기 (6행 맞추기)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: d,
        dateStr: '',
        isCurrentMonth: false,
        isToday: false,
        isSunday: false,
        isSaturday: false,
        isHoliday: false,
        eventColors: [],
      });
    }

    return days;
  }, [year, month, events, categories]);

  const monthEventCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return events.filter((e) => e.date.startsWith(prefix)).length;
  }, [events, year, month]);

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return events
      .filter((e) => !e.isHidden)
      .filter((e) =>
        e.date === selectedDate ||
        (e.endDate && e.date <= selectedDate && e.endDate >= selectedDate)
      )
      .sort((a, b) => {
        const timeA = a.startTime ?? a.time?.split(' - ')[0]?.trim() ?? '';
        const timeB = b.startTime ?? b.time?.split(' - ')[0]?.trim() ?? '';
        if (timeA && timeB) return timeA.localeCompare(timeB);
        if (timeA) return -1;
        if (timeB) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [selectedDate, events]);

  return (
    <div className="h-full flex flex-col p-4">
      {/* 헤더: 제목 + 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📅</span>미니 캘린더</h3>
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="text-sp-muted hover:text-sp-text p-0.5">
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button onClick={goToday} className="text-xs font-bold text-sp-text hover:text-sp-accent">
            {year}년 {month + 1}월
          </button>
          <button onClick={nextMonth} className="text-sp-muted hover:text-sp-text p-0.5">
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-0.5">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className={`text-center text-tiny font-medium py-0.5 ${
              i === 0 ? 'text-red-400/70' : i === 6 ? 'text-blue-400/70' : 'text-sp-muted/50'
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 flex-1">
        {calendarDays.map((day, idx) => (
          <button
            key={idx}
            type="button"
            disabled={!day.isCurrentMonth || day.eventColors.length === 0}
            onClick={() => {
              if (day.isCurrentMonth && day.eventColors.length > 0) {
                setSelectedDate(selectedDate === day.dateStr ? null : day.dateStr);
              }
            }}
            className={`relative flex flex-col items-center py-0.5 transition-colors rounded ${
              !day.isCurrentMonth ? 'opacity-20' : ''
            } ${
              day.eventColors.length > 0 && day.isCurrentMonth
                ? 'hover:bg-sp-accent/10 cursor-pointer'
                : ''
            } ${
              selectedDate === day.dateStr ? 'bg-sp-accent/15 ring-1 ring-sp-accent/30' : ''
            }`}
          >
            <span
              className={`text-caption w-5 h-5 flex items-center justify-center rounded-full ${
                day.isToday
                  ? 'bg-sp-accent text-sp-accent-fg font-bold'
                  : day.isHoliday || day.isSunday
                    ? 'text-red-400'
                    : day.isSaturday
                      ? 'text-blue-400'
                      : 'text-sp-text/80'
              }`}
            >
              {day.date}
            </span>

            {day.eventColors.length > 0 && (
              <div className="flex gap-px mt-px">
                {day.eventColors.map((color, i) => (
                  <div key={i} className={`w-1 h-1 rounded-full ${color}`} />
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* 선택된 날짜의 일정 팝업 */}
      {selectedDate && selectedEvents.length > 0 && (
        <div className="mt-1 pt-1.5 border-t border-sp-border/30 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-sp-text">
              {parseInt(selectedDate.slice(5, 7), 10)}/{parseInt(selectedDate.slice(8, 10), 10)}
              {' '}
              {['일', '월', '화', '수', '목', '금', '토'][new Date(selectedDate + 'T00:00:00').getDay()]}요일
            </span>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-sp-muted hover:text-sp-text"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
            </button>
          </div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {selectedEvents.map((event) => {
              const info = getCategoryInfo(event.category, categories);
              const colors = getCategoryColors(info.color);
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-sp-surface/50 transition-colors"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
                  <span className="text-[10px] text-sp-text truncate flex-1">
                    {event.title}
                  </span>
                  {(event.startTime || event.time) && (
                    <span className="text-tiny text-sp-muted shrink-0">
                      {event.startTime ?? event.time?.split(' - ')[0]?.trim()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 — 팝업 열려있으면 숨김 */}
      {!selectedDate && (
        <div className="mt-1 pt-1 border-t border-sp-border/20 text-center">
          <span className="text-caption text-sp-muted">
            이번 달 일정 {monthEventCount}건
          </span>
        </div>
      )}
    </div>
  );
}
