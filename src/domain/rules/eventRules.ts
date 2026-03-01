import type { SchoolEvent } from '@domain/entities/SchoolEvent';

/**
 * "YYYY-MM-DD" → Date (로컬 자정 기준)
 */
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  return new Date(y, m - 1, d);
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
 */
export function sortByDate(events: readonly SchoolEvent[]): readonly SchoolEvent[] {
  return [...events].sort(
    (a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime(),
  );
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
