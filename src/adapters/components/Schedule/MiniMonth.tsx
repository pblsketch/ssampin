import { memo, useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { getEventsForMonth } from '@domain/rules/eventRules';
import { getHolidayMapForMonth } from '@domain/rules/holidayRules';

interface MiniMonthProps {
  year: number;
  month: number; // 0-based
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onClick: (year: number, month: number) => void;
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function MiniMonthInner({ year, month, events, onClick }: MiniMonthProps) {
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const monthEvents = useMemo(
    () => getEventsForMonth(events, year, month),
    [events, year, month],
  );

  const holidayMap = useMemo(
    () => getHolidayMapForMonth(year, month),
    [year, month],
  );

  // 날짜 계산
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 각 날짜에 이벤트가 있는지 미리 계산
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of monthEvents) {
      const startDate = e.date;
      const endDate = e.endDate ?? e.date;
      // 이 월의 범위 내에서만 체크
      const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const clampedStart = startDate > monthStart ? startDate : monthStart;
      const clampedEnd = endDate < monthEnd ? endDate : monthEnd;
      // 각 날짜에 mark
      const [, , sd] = clampedStart.split('-').map(Number) as [number, number, number];
      const [, , ed] = clampedEnd.split('-').map(Number) as [number, number, number];
      for (let d = sd; d <= ed; d++) {
        set.add(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    return set;
  }, [monthEvents, year, month, daysInMonth]);

  return (
    <div
      className={`p-3 rounded-xl cursor-pointer transition-all hover:bg-sp-surface ${
        isCurrentMonth ? 'ring-2 ring-sp-accent' : 'border border-sp-border/50'
      }`}
      onClick={() => onClick(year, month)}
    >
      <h4 className={`text-sm font-bold mb-2 text-center ${
        isCurrentMonth ? 'text-sp-accent' : 'text-sp-text'
      }`}>
        {month + 1}월
      </h4>
      <div className="grid grid-cols-7 gap-0 text-[9px]">
        {/* 요일 헤더 */}
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-sp-muted/50">{d}</div>
        ))}
        {/* 빈칸 */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {/* 날짜 */}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasEvent = eventDates.has(dateStr);
          const isHoliday = holidayMap.has(dateStr);
          const isToday = today.getFullYear() === year
            && today.getMonth() === month
            && today.getDate() === day;

          return (
            <div
              key={day}
              className={`text-center py-0.5 rounded ${
                isToday ? 'bg-sp-accent text-white font-bold' : ''
              } ${
                isHoliday && !isToday ? 'text-red-400' : ''
              } ${
                hasEvent && !isToday ? 'font-bold text-sp-accent' : ''
              } ${
                !hasEvent && !isHoliday && !isToday ? 'text-sp-muted' : ''
              }`}
            >
              {day}
            </div>
          );
        })}
      </div>
      {/* 이벤트 수 */}
      {monthEvents.length > 0 && (
        <p className="text-[10px] text-sp-muted text-center mt-1">
          일정 {monthEvents.length}건
        </p>
      )}
    </div>
  );
}

export const MiniMonth = memo(MiniMonthInner);
