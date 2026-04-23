import { useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import {
  getMultiDayBarsForWeek,
} from '@domain/rules/eventRules';
import type { CalendarBar, WeekBarsResult } from '@domain/rules/eventRules';
import { getColorsForCategory } from '@adapters/presenters/categoryPresenter';
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
  dateKey: string; // yyyy-mm-dd
}

function getCalendarDays(year: number, month: number): CalendarDay[] {
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
    const dk = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
      dateKey: dk,
    });
  }

  // 이번 달 날짜
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dateStr = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    const colors: string[] = [];

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
      categoryColors: colors,
      dateKey,
    });
  }

  // 다음 달 날짜 (줄 채우기)
  const totalCells = Math.ceil(days.length / 7) * 7;
  let nextDay = 1;
  while (days.length < totalCells) {
    const date = new Date(year, month + 1, nextDay);
    const dk = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
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
      dateKey: dk,
    });
    nextDay++;
  }

  return days;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 주 단위로 바 계산 */
function computeWeekBars(
  weekDays: CalendarDay[],
  events: readonly SchoolEvent[],
): WeekBarsResult {
  if (weekDays.length < 7) return { bars: [], overflowCounts: Array(7).fill(0) as number[] };
  const weekStart = weekDays[0]!.date;
  const weekEnd = weekDays[6]!.date;
  return getMultiDayBarsForWeek(events, weekStart, weekEnd);
}

/** 다일 바 컴포넌트 */
function MultiDayBar({
  bar,
  categories,
  onClick,
}: {
  bar: CalendarBar;
  categories: readonly CategoryItem[];
  onClick?: () => void;
}) {
  const colors = getColorsForCategory(bar.category, categories);

  const roundedLeft = bar.isContinuation ? '' : 'rounded-l-md';
  const roundedRight = bar.isContinued ? '' : 'rounded-r-md';

  return (
    <div
      className={`h-4 ${colors.bar} text-white text-[10px] leading-4 px-1 truncate cursor-pointer hover:brightness-110 transition-all duration-sp-quick ease-sp-out ${roundedLeft} ${roundedRight}`}
      style={{
        gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
        gridRow: bar.row + 1,
      }}
      title={bar.title}
      onClick={onClick}
    >
      {!bar.isContinuation && bar.title}
    </div>
  );
}

/** 단일 이벤트 칩 */
function SingleEventChip({
  title,
  barClass,
  onClick,
}: {
  title: string;
  barClass: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full text-left text-[10px] leading-none px-1 py-0.5 rounded-md text-white truncate cursor-pointer transition-all duration-sp-quick ease-sp-out hover:brightness-110 ${barClass}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
    >
      {title}
    </button>
  );
}

/** 날짜별 단일 이벤트 조회 (다일 이벤트 제외, 숨긴 일정 제외) */
function getSingleDayEventsForDate(
  events: readonly SchoolEvent[],
  dateKey: string,
): readonly SchoolEvent[] {
  return events.filter((e) => {
    if (e.isHidden) return false;
    // endDate 있고 다른 날이면 다일 바로 처리됨
    if (e.endDate && e.endDate !== e.date) return false;
    return e.date === dateKey;
  });
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
    () => getCalendarDays(year, month),
    [year, month],
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

  // 날짜별 단일 이벤트 맵
  const singleEventMap = useMemo(() => {
    const map = new Map<string, readonly SchoolEvent[]>();
    for (const day of days) {
      if (!day.isCurrentMonth) continue;
      map.set(day.dateKey, getSingleDayEventsForDate(events, day.dateKey));
    }
    return map;
  }, [days, events]);

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="flex flex-col bg-sp-card rounded-3xl p-6 border border-sp-border shadow-sp-md h-full min-h-0 flex-1 overflow-hidden">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-4 px-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-all duration-sp-quick ease-sp-out text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h3 className="text-xl font-sp-bold text-sp-text">{monthLabel}</h3>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-all duration-sp-quick ease-sp-out text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_HEADERS.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs py-2 font-sp-semibold uppercase tracking-wider ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-sp-muted'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 주 단위 렌더링 */}
      <div
        className="flex-1 min-h-0 grid gap-y-1"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((weekDays, weekIdx) => {
          const { bars, overflowCounts } = weekBars[weekIdx] ?? {
            bars: [],
            overflowCounts: Array(7).fill(0) as number[],
          };
          const maxRow = bars.length > 0 ? Math.max(...bars.map((b) => b.row)) + 1 : 0;

          // 이번 주에서 다일 바가 차지하는 날 목록 (단일 칩 억제)
          const multiDayDateKeys = new Set<string>();
          for (const bar of bars) {
            for (let col = bar.startCol; col < bar.startCol + bar.span; col++) {
              const wd = weekDays[col];
              if (wd) multiDayDateKeys.add(wd.dateKey);
            }
          }

          return (
            <div key={weekIdx} className="flex flex-col min-h-0 overflow-hidden">
              {/* 날짜 셀 */}
              <div className="grid grid-cols-7 gap-x-1 flex-1 min-h-0">
                {weekDays.map((d, dayIdx) => {
                  const isSelected = selectedDate !== null && isSameDate(d.date, selectedDate);

                  // 단일 이벤트 칩 (이번 달, 다일 바 없는 날만)
                  const singleEvts =
                    d.isCurrentMonth && !multiDayDateKeys.has(d.dateKey)
                      ? (singleEventMap.get(d.dateKey) ?? [])
                      : [];
                  const chipsToShow = singleEvts.slice(0, 2);
                  const chipOverflow = singleEvts.length - chipsToShow.length;

                  // cell 상태 클래스
                  let cellClass =
                    'group relative flex flex-col py-1 px-0.5 rounded-xl cursor-pointer transition-all duration-sp-base ease-sp-out h-full overflow-hidden ';

                  if (isSelected) {
                    cellClass += 'bg-sp-accent/15 border border-sp-accent/40 ';
                  } else {
                    cellClass +=
                      'border border-transparent hover:bg-sp-text/5 hover:border-sp-border/40 ';
                  }

                  // 날짜 숫자 색상
                  let textClass = 'text-sm font-sp-medium leading-none ';
                  if (!d.isCurrentMonth) {
                    textClass += 'text-sp-muted opacity-30';
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
                      {/* 날짜 숫자 */}
                      <div className="flex items-center justify-center mb-0.5 pt-0.5">
                        {d.isToday ? (
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sp-accent text-white font-sp-bold text-sm shadow-sp-sm">
                            {d.day}
                          </span>
                        ) : (
                          <span className={textClass}>{d.day}</span>
                        )}
                      </div>

                      {/* 공휴일 이름 */}
                      {d.isHoliday && d.isCurrentMonth && (
                        <span className="text-[9px] leading-none text-red-400/70 truncate w-full text-center px-0.5 mb-0.5">
                          {d.holidayName}
                        </span>
                      )}

                      {/* 단일 이벤트 칩 */}
                      {chipsToShow.length > 0 && (
                        <div className="flex flex-col gap-px w-full px-0.5">
                          {chipsToShow.map((evt) => {
                            const colors = getColorsForCategory(evt.category, categories);
                            return (
                              <SingleEventChip
                                key={evt.id}
                                title={evt.title}
                                barClass={colors.bar}
                                onClick={() => onSelectDate(d.date)}
                              />
                            );
                          })}
                          {chipOverflow > 0 && (
                            <span className="text-[10px] text-sp-muted hover:text-sp-accent font-sp-medium text-center leading-none transition-colors duration-sp-quick">
                              +{chipOverflow}
                            </span>
                          )}
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
                  style={{ gridTemplateRows: `repeat(${maxRow}, 16px)` }}
                >
                  {bars.map((bar) => (
                    <MultiDayBar
                      key={`${bar.eventId}-${bar.startCol}`}
                      bar={bar}
                      categories={categories}
                      onClick={() => onSelectDate(weekDays[bar.startCol]!.date)}
                    />
                  ))}
                </div>
              )}

              {/* +N 다일 오버플로 */}
              {overflowCounts.some((c) => c > 0) && (
                <div className="grid grid-cols-7 gap-x-1">
                  {overflowCounts.map((count, colIdx) => (
                    <div key={colIdx} className="flex justify-center">
                      {count > 0 ? (
                        <button
                          type="button"
                          className="text-[10px] text-sp-muted hover:text-sp-accent font-sp-medium leading-3 transition-colors duration-sp-quick"
                          onClick={() => onSelectDate(weekDays[colIdx]!.date)}
                        >
                          +{count}
                        </button>
                      ) : null}
                    </div>
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
