import type { SchoolEvent } from '@domain/entities/SchoolEvent';

/**
 * 이벤트 제목이 URL 형식인지 판별
 */
export function isUrlLike(text: string): boolean {
  const trimmed = text.trim();
  return /^(https?:\/\/|webcal:\/\/|ftp:\/\/)/i.test(trimmed);
}

/**
 * 이벤트 제목 정제 — URL이면 "(제목 없음)"으로 대체
 */
export function sanitizeEventTitle(title: string): string {
  if (!title || !title.trim()) return '(제목 없음)';
  if (isUrlLike(title)) return '(제목 없음)';
  return title;
}

/**
 * 다일 일정 캘린더 바 (CalendarView 주 단위 렌더링용)
 */
export interface CalendarBar {
  readonly eventId: string;
  readonly title: string;
  readonly category: string;
  readonly startCol: number;    // 0-6: 해당 주에서의 시작 열
  readonly span: number;        // 1-7: 바가 차지하는 열 수
  readonly isContinuation: boolean; // 이전 주에서 이어지는 바인지
  readonly isContinued: boolean;    // 다음 주로 이어지는 바인지
  readonly row: number;         // 0-2: 겹침 처리 행
}

/**
 * "YYYY-MM-DD" → Date (로컬 자정 기준)
 */
export function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(y, m - 1, d);
}

/**
 * 숨기지 않은(visible) 이벤트만 필터링
 */
export function getVisibleEvents(events: readonly SchoolEvent[]): readonly SchoolEvent[] {
  return events.filter((e) => !e.isHidden);
}

/**
 * 카테고리별 필터링
 */
export function filterByCategory(
  events: readonly SchoolEvent[],
  categoryId: string,
): readonly SchoolEvent[] {
  return events.filter((e) => e.category === categoryId);
}

/**
 * 날짜순 정렬 (오름차순)
 * 같은 날짜 내에서는 sortOrder → id(생성순) 순으로 정렬
 */
export function sortByDate(events: readonly SchoolEvent[]): readonly SchoolEvent[] {
  return [...events].sort((a, b) => {
    // 1차: 날짜순
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    // 2차: sortOrder (낮을수록 위)
    const orderA = a.sortOrder ?? 0;
    const orderB = b.sortOrder ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    // 3차: ID (생성순 폴백)
    return a.id.localeCompare(b.id);
  });
}

/**
 * 반복 이벤트가 특정 날짜에 해당하는지 판정
 * - weekly: 같은 요일
 * - monthly: 같은 일자
 * - yearly: 같은 월/일
 */
export function isRecurring(event: SchoolEvent, targetDate: Date): boolean {
  if (!event.recurrence) return false;

  const eventDate = parseLocalDate(event.date);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  // 이벤트 시작일 이전이면 해당 안 됨
  if (eventDate.getTime() > target.getTime()) return false;

  // 원본 날짜와 같으면 반복이 아닌 원본임
  if (eventDate.getTime() === target.getTime()) return false;

  // excludeDates에 포함된 날짜는 건너뛰기
  if (event.excludeDates) {
    const targetStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    if (event.excludeDates.includes(targetStr)) return false;
  }

  switch (event.recurrence) {
    case 'weekly':
      return eventDate.getDay() === target.getDay();
    case 'monthly':
      return eventDate.getDate() === target.getDate();
    case 'yearly':
      return (
        eventDate.getMonth() === target.getMonth() &&
        eventDate.getDate() === target.getDate()
      );
    default:
      return false;
  }
}

/**
 * 특정 월의 이벤트 필터링 (해당 월에 걸치는 모든 이벤트)
 */
export function getEventsForMonth(
  events: readonly SchoolEvent[],
  year: number,
  month: number, // 0-based (0 = 1월)
): readonly SchoolEvent[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0); // 해당 월 마지막 날

  return events.filter((event) => {
    const eventStart = parseLocalDate(event.date);
    const eventEnd = event.endDate ? parseLocalDate(event.endDate) : eventStart;

    // 이벤트 기간이 해당 월과 겹치는지 확인
    return eventStart.getTime() <= monthEnd.getTime() && eventEnd.getTime() >= monthStart.getTime();
  });
}

/**
 * 특정 날짜의 이벤트 필터링
 */
export function getEventsForDate(
  events: readonly SchoolEvent[],
  date: Date,
): readonly SchoolEvent[] {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetMs = target.getTime();

  return events.filter((event) => {
    const eventStart = parseLocalDate(event.date);
    const eventEnd = event.endDate ? parseLocalDate(event.endDate) : eventStart;

    // excludeDates 체크 (반복 일정 전용)
    if (event.recurrence && event.excludeDates) {
      const targetStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
      if (event.excludeDates.includes(targetStr)) return false;
    }

    // 원본 이벤트가 해당 날짜에 포함되는지
    const inRange = eventStart.getTime() <= targetMs && eventEnd.getTime() >= targetMs;
    if (inRange) return true;

    // 반복 이벤트 확인
    return isRecurring(event, date);
  });
}

/**
 * 이벤트가 특정 날짜에 존재하는지 (캘린더 dot 표시용)
 */
export function hasEventOnDate(
  events: readonly SchoolEvent[],
  date: Date,
): boolean {
  return getEventsForDate(events, date).length > 0;
}

/**
 * 특정 날짜에 있는 이벤트들의 카테고리 목록 (캘린더 컬러 dot용)
 */
export function getCategoriesOnDate(
  events: readonly SchoolEvent[],
  date: Date,
): readonly string[] {
  const dateEvents = getEventsForDate(events, date);
  return [...new Set(dateEvents.map((e) => e.category))];
}

/**
 * 다일 이벤트 판별
 */
export function isMultiDayEvent(event: SchoolEvent): boolean {
  return !!event.endDate && event.endDate !== event.date;
}

const DAY_MS = 86400000;

/**
 * 특정 주(week)의 다일 이벤트 바 목록을 계산
 * @param events 전체 이벤트
 * @param weekStart 해당 주의 첫 날 (일요일)
 * @param weekEnd 해당 주의 마지막 날 (토요일)
 * @returns 해당 주에 표시할 바 목록 (최대 3행)
 */
export function getMultiDayBarsForWeek(
  events: readonly SchoolEvent[],
  weekStart: Date,
  weekEnd: Date,
): CalendarBar[] {
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();

  // 다일 이벤트 중 이 주와 겹치는 것만 필터
  const multiDayEvents = events.filter((e) => {
    if (!isMultiDayEvent(e)) return false;
    const eStart = parseLocalDate(e.date).getTime();
    const eEnd = parseLocalDate(e.endDate!).getTime();
    return eStart <= weekEndMs && eEnd >= weekStartMs;
  });

  // 시작일 오름차순, 같으면 기간 긴 것 우선
  const sorted = [...multiDayEvents].sort((a, b) => {
    const diff = parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime();
    if (diff !== 0) return diff;
    const aDur = parseLocalDate(a.endDate!).getTime() - parseLocalDate(a.date).getTime();
    const bDur = parseLocalDate(b.endDate!).getTime() - parseLocalDate(b.date).getTime();
    return bDur - aDur;
  });

  // 각 행의 열 점유 상태
  const rows: boolean[][] = [];
  const bars: CalendarBar[] = [];
  const MAX_ROWS = 3;

  for (const event of sorted) {
    const eStartMs = Math.max(parseLocalDate(event.date).getTime(), weekStartMs);
    const eEndMs = Math.min(parseLocalDate(event.endDate!).getTime(), weekEndMs);
    const startCol = Math.round((eStartMs - weekStartMs) / DAY_MS);
    const endCol = Math.round((eEndMs - weekStartMs) / DAY_MS);
    const span = endCol - startCol + 1;

    const isContinuation = parseLocalDate(event.date).getTime() < weekStartMs;
    const isContinued = parseLocalDate(event.endDate!).getTime() > weekEndMs;

    // 겹치지 않는 행 찾기
    let assignedRow = -1;
    for (let r = 0; r < MAX_ROWS; r++) {
      if (!rows[r]) rows[r] = Array(7).fill(false) as boolean[];
      const occupied = rows[r]!.slice(startCol, startCol + span).some(Boolean);
      if (!occupied) {
        assignedRow = r;
        for (let c = startCol; c < startCol + span; c++) {
          rows[r]![c] = true;
        }
        break;
      }
    }

    if (assignedRow === -1) continue; // 최대 행 초과

    bars.push({
      eventId: event.id,
      title: event.title,
      category: event.category,
      startCol,
      span,
      isContinuation,
      isContinued,
      row: assignedRow,
    });
  }

  return bars;
}

/**
 * 특정 날짜에 다일 이벤트(바로 표시되는)가 있는지 확인
 * (dot 표시를 제외하기 위함)
 */
export function getMultiDayEventIdsOnDate(
  events: readonly SchoolEvent[],
  date: Date,
): readonly string[] {
  const targetMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return events
    .filter((e) => {
      if (!isMultiDayEvent(e)) return false;
      const eStart = parseLocalDate(e.date).getTime();
      const eEnd = parseLocalDate(e.endDate!).getTime();
      return eStart <= targetMs && eEnd >= targetMs;
    })
    .map((e) => e.id);
}
