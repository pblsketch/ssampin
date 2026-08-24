import { useCallback, useMemo, useState } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { canMoveEventByDrag, getMultiDayBarsForWeek } from '@domain/rules/eventRules';
import type { CalendarBar, WeekBarsResult } from '@domain/rules/eventRules';
import { getColorsForCategory } from '@adapters/presenters/categoryPresenter';
import { getHolidayMapForMonth } from '@domain/rules/holidayRules';
import { columnIndexFromX } from './calendarDropColumn';

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
  /**
   * 일정을 끌어다 다른 날짜에 놓았을 때 (2026-08-22).
   * `grabDateKey` 는 **잡은 날**이다 — 여러 날 일정의 가운데를 잡아도 잡은 지점 기준으로
   * 이동량이 정해져야 손끝 느낌과 결과가 어긋나지 않는다.
   */
  onMoveEvent?: (eventId: string, grabDateKey: string, dropDateKey: string) => void;
}

/** 드래그 중인 일정 (잡은 날짜를 함께 기억해야 이동량을 셀 수 있다) */
interface DragState {
  readonly eventId: string;
  readonly grabDateKey: string;
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
function computeWeekBars(weekDays: CalendarDay[], events: readonly SchoolEvent[]): WeekBarsResult {
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
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: {
  bar: CalendarBar;
  categories: readonly CategoryItem[];
  onClick?: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  const colors = getColorsForCategory(bar.category, categories);

  const roundedLeft = bar.isContinuation ? '' : 'rounded-l-md';
  const roundedRight = bar.isContinued ? '' : 'rounded-r-md';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      /* 단색 채움 + 흰 글자였다. 한 달치가 색 벽이 되고(특히 구글 일정은 전부 파랑)
         라이트 테마에서 `text-white` 는 본문색으로 강제 치환돼 흰 배경에 흰 글자가 될
         위험도 있었다. 옅은 면 + 본문색으로 바꿔 제목이 먼저 읽히게 한다. */
      className={`flex h-4 items-center gap-1 ${colors.chip} text-sp-text text-caption leading-4 px-1 truncate hover:brightness-95 transition-all duration-sp-quick ease-sp-out ${roundedLeft} ${roundedRight} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''}`}
      style={{
        gridColumn: `${bar.startCol + 1} / span ${bar.span}`,
        gridRow: bar.row + 1,
      }}
      title={bar.title}
      onClick={onClick}
    >
      {!bar.isContinuation && (
        <>
          <span className={`w-1 h-1 shrink-0 rounded-full ${colors.dot}`} aria-hidden />
          <span className="truncate">{bar.title}</span>
        </>
      )}
    </div>
  );
}

/** 단일 일정 칩 — 다일 바 없는 날의 이벤트를 표시 */
function SingleEventChip({
  title,
  chipClass,
  dotClass,
  onClick,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  chipClass: string;
  dotClass: string;
  onClick: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex w-full items-center gap-1 text-left text-caption leading-none px-1 py-0.5 rounded-md text-sp-text truncate transition-all duration-sp-quick ease-sp-out hover:brightness-95 ${chipClass} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
    >
      <span className={`w-1 h-1 shrink-0 rounded-full ${dotClass}`} aria-hidden />
      <span className="truncate">{title}</span>
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
    // endDate 있고 다른 날이면 다일 바로 처리됨 — 칩 제외
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
  onMoveEvent,
}: CalendarViewProps) {
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  /* 끌고 있는 일정과, 지금 손이 올라가 있는 날짜 칸 */
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverDateKey, setHoverDateKey] = useState<string | null>(null);

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

  /* 옮길 수 있는 일정인지 빠르게 보려고 id 로 찾아 둔다 */
  const eventById = useMemo(() => {
    const map = new Map<string, SchoolEvent>();
    for (const e of events) map.set(e.id, e);
    return map;
  }, [events]);

  const isMovable = useCallback(
    (eventId: string) => {
      const evt = eventById.get(eventId);
      return onMoveEvent !== undefined && evt !== undefined && canMoveEventByDrag(evt).ok;
    },
    [eventById, onMoveEvent],
  );

  const beginDrag = useCallback((e: React.DragEvent, eventId: string, grabDateKey: string) => {
    e.dataTransfer.effectAllowed = 'move';
    /* 브라우저·다른 앱이 알아볼 수 있게 최소한의 텍스트도 같이 실어 준다 */
    e.dataTransfer.setData('text/plain', eventId);
    setDrag({ eventId, grabDateKey });
  }, []);

  const endDrag = useCallback(() => {
    setDrag(null);
    setHoverDateKey(null);
  }, []);

  /*
    드롭은 **주 한 줄 전체**가 받는다. 날짜 칸만 받게 하면 다일 바를 잡았을 때
    손이 이미 바 위(=칸 아래)에 있어서 위로 한참 올라와야 놓을 수 있다.
    가로 위치로 요일을 계산하면 줄 어디에 놓아도 의도한 날에 떨어진다.

    요일 판정은 줄 너비 7 등분이 아니라 **실제 날짜 칸의 경계**로 한다 — 칸 사이 gap-x-1
    때문에 등분 경계가 어긋나, 좁은 창에서 경계 근처 드롭이 하루 밀릴 수 있다. 계산 자체는
    순수 함수(columnIndexFromX)에 있고 테스트가 잠근다.
  */
  const dayKeyFromX = useCallback((e: React.DragEvent<HTMLDivElement>, weekDays: CalendarDay[]) => {
    const cells = e.currentTarget.querySelectorAll<HTMLElement>('[data-day-cell]');
    const bounds = Array.from(cells, (cell) => {
      const r = cell.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    const col = columnIndexFromX(e.clientX, bounds);
    if (col !== null) return weekDays[col]?.dateKey ?? null;

    // 칸을 못 쟀을 때(레이아웃 미확정 등)만 예전 등분 방식으로라도 받는다
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const fallbackCol = Math.min(
      6,
      Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 7)),
    );
    return weekDays[fallbackCol]?.dateKey ?? null;
  }, []);

  const handleWeekDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, weekDays: CalendarDay[]) => {
      if (!drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const key = dayKeyFromX(e, weekDays);
      if (key !== null && key !== hoverDateKey) setHoverDateKey(key);
    },
    [drag, dayKeyFromX, hoverDateKey],
  );

  const handleWeekDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, weekDays: CalendarDay[]) => {
      if (!drag) return;
      e.preventDefault();
      const key = dayKeyFromX(e, weekDays);
      if (key !== null && key !== drag.grabDateKey) {
        onMoveEvent?.(drag.eventId, drag.grabDateKey, key);
      }
      endDrag();
    },
    [drag, dayKeyFromX, onMoveEvent, endDrag],
  );

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="flex flex-col bg-sp-card rounded-3xl p-4 sm:p-5 lg:p-6 border border-sp-border shadow-sp-md lg:h-full lg:min-h-0 lg:flex-1 overflow-hidden">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3 lg:mb-4 px-1 sm:px-2">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-all duration-sp-quick ease-sp-out text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h3 className="text-lg sm:text-xl font-sp-bold text-sp-text">{monthLabel}</h3>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-2 hover:bg-sp-surface rounded-full transition-all duration-sp-quick ease-sp-out text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1 sm:mb-2">
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
        className="lg:flex-1 lg:min-h-0 grid gap-y-1 lg:overflow-y-auto"
        style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(64px, 1fr))` }}
      >
        {weeks.map((weekDays, weekIdx) => {
          const { bars, overflowCounts } = weekBars[weekIdx] ?? {
            bars: [],
            overflowCounts: Array(7).fill(0) as number[],
          };
          const maxRow = bars.length > 0 ? Math.max(...bars.map((b) => b.row)) + 1 : 0;

          // 이번 주에서 다일 바가 차지하는 날 목록 (칩 표시 억제)
          const multiDayDateKeys = new Set<string>();
          for (const bar of bars) {
            for (let col = bar.startCol; col < bar.startCol + bar.span; col++) {
              const wd = weekDays[col];
              if (wd) multiDayDateKeys.add(wd.dateKey);
            }
          }

          return (
            <div
              key={weekIdx}
              className="flex flex-col overflow-visible"
              onDragOver={(e) => handleWeekDragOver(e, weekDays)}
              onDrop={(e) => handleWeekDrop(e, weekDays)}
            >
              {/* 날짜 셀 */}
              <div className="grid grid-cols-7 gap-x-1 flex-shrink-0" style={{ minHeight: '2rem' }}>
                {weekDays.map((d, dayIdx) => {
                  const isSelected = selectedDate !== null && isSameDate(d.date, selectedDate);

                  // 단일 이벤트 칩 (이번 달, 다일 바 없는 날만)
                  const singleEvts =
                    d.isCurrentMonth && !multiDayDateKeys.has(d.dateKey)
                      ? (singleEventMap.get(d.dateKey) ?? [])
                      : [];
                  const chipsToShow = singleEvts.slice(0, 2);
                  const chipOverflow = singleEvts.length - chipsToShow.length;

                  /* 지금 놓으면 여기로 간다 — 잡은 날 그대로면 강조하지 않는다 */
                  const isDropTarget =
                    drag !== null && hoverDateKey === d.dateKey && drag.grabDateKey !== d.dateKey;

                  // ── cell 상태 클래스 ──
                  let cellClass =
                    'group relative flex flex-col py-1 px-0.5 rounded-xl cursor-pointer transition-all duration-sp-base ease-sp-out h-full overflow-hidden ';

                  // today는 숫자의 원형 파란 배지 + cell 하단 accent bar로 강조
                  // (ring-offset은 overflow-hidden 부모에 잘리므로 사용 안 함)
                  if (isDropTarget) {
                    cellClass += 'bg-sp-accent/20 border border-sp-accent border-dashed ';
                  } else if (isSelected) {
                    cellClass += 'bg-sp-accent/15 border border-sp-accent/40 ';
                  } else {
                    cellClass +=
                      'border border-transparent hover:bg-sp-text/5 hover:border-sp-border/40 ';
                  }

                  // ── 날짜 숫자 색상 ──
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
                      data-day-cell
                      className={cellClass}
                      onClick={() => onSelectDate(d.date)}
                      title={d.holidayName ?? undefined}
                    >
                      {/* 날짜 숫자 */}
                      <div className="flex items-center justify-center mb-0.5 pt-0.5">
                        {d.isToday ? (
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sp-accent text-white font-sp-bold text-sm shadow-sp-accent">
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
                                chipClass={colors.chip}
                                dotClass={colors.dot}
                                onClick={() => onSelectDate(d.date)}
                                draggable={isMovable(evt.id)}
                                isDragging={drag?.eventId === evt.id}
                                onDragStart={(e) => beginDrag(e, evt.id, d.dateKey)}
                                onDragEnd={endDrag}
                              />
                            );
                          })}
                          {chipOverflow > 0 && (
                            <span className="text-caption text-sp-muted hover:text-sp-accent font-sp-medium text-center leading-none transition-colors duration-sp-quick">
                              +{chipOverflow}개 더
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
                  className="grid grid-cols-7 gap-x-1 mt-0.5 flex-shrink-0"
                  style={{ gridTemplateRows: `repeat(${maxRow}, 16px)` }}
                >
                  {bars.map((bar) => (
                    <MultiDayBar
                      key={`${bar.eventId}-${bar.startCol}`}
                      bar={bar}
                      categories={categories}
                      onClick={() => onSelectDate(weekDays[bar.startCol]!.date)}
                      draggable={isMovable(bar.eventId)}
                      isDragging={drag?.eventId === bar.eventId}
                      onDragStart={(e) => {
                        /* 바의 어느 칸을 잡았는지 — 가운데를 잡으면 가운데 기준으로 움직인다 */
                        const rect = e.currentTarget.getBoundingClientRect();
                        const offset =
                          rect.width > 0
                            ? Math.min(
                                bar.span - 1,
                                Math.max(
                                  0,
                                  Math.floor(((e.clientX - rect.left) / rect.width) * bar.span),
                                ),
                              )
                            : 0;
                        const grabDay = weekDays[bar.startCol + offset] ?? weekDays[bar.startCol]!;
                        beginDrag(e, bar.eventId, grabDay.dateKey);
                      }}
                      onDragEnd={endDrag}
                    />
                  ))}
                </div>
              )}

              {/* +N 다일 오버플로 */}
              {overflowCounts.some((c) => c > 0) && (
                <div className="grid grid-cols-7 gap-x-1 flex-shrink-0">
                  {overflowCounts.map((count, colIdx) => (
                    <div key={colIdx} className="flex justify-center">
                      {count > 0 ? (
                        <button
                          type="button"
                          className="text-caption text-sp-muted hover:text-sp-accent font-sp-medium leading-3 transition-colors duration-sp-quick"
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
