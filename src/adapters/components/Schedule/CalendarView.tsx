import { useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import {
  getMultiDayBarsForWeek,
  getMultiDayEventIdsOnDate,
  getEventsForDate,
} from '@domain/rules/eventRules';
import type { CalendarBar } from '@domain/rules/eventRules';
import { getCategoryColors, getCategoryInfo, getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { getHolidayMapForMonth } from '@domain/rules/holidayRules';

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'] as const;

interface CalendarViewProps {
  year: number;
  month: number; // 0-based
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

interface CalendarDay {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  categoryColors: readonly string[]; // 단일 일정 dot 색상 (다일 제외)
}

function getCalendarDays(year: number, month: number, events: readonly SchoolEvent[], categories: readonly CategoryItem[]): CalendarDay[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const holidayMap = getHolidayMapForMonth(year, month);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDow = firstDay.getDay(); // 0=일요일
  const daysInMonth = lastDay.getDate();

  const days: CalendarDay[] = [];

  // 이전 달 날짜 (빈칸 채우기)
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const date = new Date(year, month - 1, d);
    days.push({
      date,
      day: d,
      isCurrentMonth: false,
      isToday: false,
      isSunday: date.getDay() === 0,
      isSaturday: date.getDay() === 6,
      isHoliday: false,
      holidayName: null,
      categoryColors: [],
    });
  }

  // 이번 달 날짜
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    // 다일 이벤트 ID 목록 (dot에서 제외)
    const multiDayIds = new Set(getMultiDayEventIdsOnDate(events, date));

    // 단일 일정만 dot 표시
    const dateEvents = getEventsForDate(events, date);
    const singleDayEvents = dateEvents.filter((e) => !multiDayIds.has(e.id));
    const catIds = [...new Set(singleDayEvents.map((e) => e.category))];
    const colors = catIds.map((catId) => {
      const info = getCategoryInfo(catId, categories);
      return getCategoryColors(info.color).dot;
    });

    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const holidayName = holidayMap.get(dateKey) ?? null;

    days.push({
      date,
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isSunday: date.getDay() === 0,
      isSaturday: date.getDay() === 6,
      isHoliday: holidayName !== null,
      holidayName,
      categoryColors: colors.slice(0, 3),
    });
  }

  // 다음 달 날짜 (줄 채우기)
  const totalCells = Math.ceil(days.length / 7) * 7;
  let nextDay = 1;
  while (days.length < totalCells) {
    const date = new Date(year, month + 1, nextDay);
    days.push({
      date,
      day: nextDay,
      isCurrentMonth: false,
      isToday: false,
      isSunday: date.getDay() === 0,
      isSaturday: date.getDay() === 6,
      isHoliday: false,
      holidayName: null,
      categoryColors: [],
    });
    nextDay++;
  }

  return days;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 주 단위로 바 계산 */
function computeWeekBars(
  weekDays: CalendarDay[],
  events: readonly SchoolEvent[],
): CalendarBar[] {
  if (weekDays.length < 7) return [];
  const weekStart = weekDays[0]!.date;
  const weekEnd = weekDays[6]!.date;
  return getMultiDayBarsForWeek(events, weekStart, weekEnd);
}

/** 다일 바 컴포넌트 */
function MultiDayBar({
  bar,
  categories,
}: {
  bar: CalendarBar;
  categories: readonly CategoryItem[];
}) {
  const colors = getColorsForCategory(bar.category, categories);

  const roundedLeft = bar.isContinuation ? '' : 'rounded-l-md';
  const roundedRight = bar.isContinued ? '' : 'rounded-r-md';

  return (
    <div
      className={`h-[18px] ${colors.bar} text-white text-caption leading-[18px] px-1.5 truncate cursor-pointer hover:brightness-110 transition-all ${roundedLeft} ${roundedRight}`}
      style={{
        gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
        gridRow: bar.row + 1,
      }}
      title={bar.title}
    >
      {!bar.isContinuation && bar.title}
    </div>
  );
}

export function CalendarView({
  year,
  month,
  events,
  categories,
  selectedDate,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: CalendarViewProps) {
  const days = useMemo(
    () => getCalendarDays(year, month, events, categories),
    [year, month, events, categories],
  );

  // 주 단위로 분할
  const weeks = useMemo(() => {
    const result: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  // 각 주의 바 계산
  const weekBars = useMemo(
    () => weeks.map((weekDays) => computeWeekBars(weekDays, events)),
    [weeks, events],
  );

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="flex flex-col bg-sp-card rounded-3xl p-6 border border-sp-border shadow-xl h-full">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-8 px-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-colors text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h3 className="text-xl font-bold text-sp-text">{monthLabel}</h3>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-colors text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-4">
        {DAY_HEADERS.map((day, i) => (
          <div
            key={day}
            className={`text-center text-sm py-2 font-medium ${
              i === 0 ? 'text-red-400 font-bold' : i === 6 ? 'text-blue-400 font-bold' : 'text-sp-muted'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 주 단위 렌더링 */}
      <div className="flex flex-col gap-y-1 flex-1">
        {weeks.map((weekDays, weekIdx) => {
          const bars = weekBars[weekIdx] ?? [];
          const maxRow = bars.length > 0 ? Math.max(...bars.map((b) => b.row)) + 1 : 0;

          return (
            <div key={weekIdx}>
              {/* 날짜 셀 */}
              <div className="grid grid-cols-7 gap-x-1">
                {weekDays.map((d, dayIdx) => {
                  const isSelected = selectedDate !== null && isSameDate(d.date, selectedDate);

                  let cellClass = 'group relative flex flex-col items-center gap-1 py-2 px-1 rounded-xl cursor-pointer transition-colors ';
                  let textClass = 'text-sm font-medium ';

                  if (d.isToday) {
                    cellClass += 'bg-sp-accent/20 border border-sp-accent shadow-[0_0_15px_rgba(59,130,246,0.2)] ';
                  } else if (isSelected) {
                    cellClass += 'bg-sp-accent/15 border border-sp-accent/40 ';
                  } else {
                    cellClass += 'hover:bg-sp-surface border border-transparent hover:border-sp-border ';
                  }

                  if (!d.isCurrentMonth) {
                    textClass += 'text-sp-muted opacity-40';
                  } else if (d.isSunday || d.isHoliday) {
                    textClass += 'text-red-400';
                  } else if (d.isSaturday) {
                    textClass += 'text-blue-400';
                  } else {
                    textClass += 'text-sp-text';
                  }

                  return (
                    <div
                      key={dayIdx}
                      className={cellClass}
                      onClick={() => onSelectDate(d.date)}
                      title={d.holidayName ?? undefined}
                    >
                      {d.isToday ? (
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sp-accent text-white font-bold text-sm shadow-md">
                          {d.day}
                        </span>
                      ) : (
                        <span className={textClass}>{d.day}</span>
                      )}
                      {/* 공휴일 이름 */}
                      {d.isHoliday && d.isCurrentMonth && (
                        <span className="text-tiny text-red-400/80 leading-tight truncate w-full text-center">
                          {d.holidayName}
                        </span>
                      )}
                      {/* 단일 일정 dot (다일 이벤트 제외) */}
                      {d.categoryColors.length > 0 && (
                        <div className="flex gap-0.5">
                          {d.categoryColors.map((color, ci) => (
                            <div key={ci} className={`w-1.5 h-1.5 rounded-full ${color}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 다일 바 오버레이 */}
              {bars.length > 0 && (
                <div
                  className="grid grid-cols-7 gap-x-1 mt-0.5"
                  style={{ gridTemplateRows: `repeat(${maxRow}, 20px)` }}
                >
                  {bars.map((bar) => (
                    <MultiDayBar
                      key={`${bar.eventId}-${bar.startCol}`}
                      bar={bar}
                      categories={categories}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
