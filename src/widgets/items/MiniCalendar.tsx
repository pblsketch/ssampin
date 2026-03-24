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

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
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

  return (
    <div className="h-full flex flex-col">
      {/* 위젯 제목 */}
      <div className="mb-2 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>📅</span>미니 캘린더</h3>
      </div>
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between mb-2">
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
          <div
            key={idx}
            className={`relative flex flex-col items-center py-0.5 ${
              !day.isCurrentMonth ? 'opacity-20' : ''
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
          </div>
        ))}
      </div>

      {/* 하단: 이번 달 일정 수 */}
      <div className="mt-1 pt-1 border-t border-sp-border/20 text-center">
        <span className="text-caption text-sp-muted">
          이번 달 일정 {monthEventCount}건
        </span>
      </div>
    </div>
  );
}
