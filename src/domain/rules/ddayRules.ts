import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { DDayItem } from '@domain/entities/DDay';

/**
 * D-Day 계산 (eventDate - today, 날짜만 비교)
 * 양수면 미래, 0이면 오늘, 음수면 과거
 */
export function calculateDDay(eventDate: string, today: Date): number {
  // eventDate is "YYYY-MM-DD" format
  // Compare date-only (ignore time)
  const event = new Date(eventDate + 'T00:00:00');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = event.getTime() - todayStart.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

/**
 * 오늘 알림 대상 판정: D-0 (오늘 행사)
 */
export function isTodayEvent(event: SchoolEvent, today: Date): boolean {
  const dday = calculateDDay(event.date, today);
  // For multi-day events, check if today falls within range
  if (event.endDate) {
    const endDDay = calculateDDay(event.endDate, today);
    return dday <= 0 && endDDay >= 0;
  }
  return dday === 0;
}

/**
 * D-Day 알림 대상 판정: D-0, D-1, D-3인 이벤트
 */
export function isAlertTarget(event: SchoolEvent, today: Date): boolean {
  const dday = calculateDDay(event.date, today);
  return dday === 0 || dday === 1 || dday === 3;
}

/**
 * 다가오는 이벤트 필터 (D-1 ~ D-7, D-0 제외)
 * 팝업 하단 UPCOMING 섹션용
 */
export function getUpcomingEvents(
  events: readonly SchoolEvent[],
  today: Date,
): Array<{ event: SchoolEvent; dday: number }> {
  return events
    .map((event) => ({ event, dday: calculateDDay(event.date, today) }))
    .filter(({ dday }) => dday >= 1 && dday <= 7)
    .sort((a, b) => a.dday - b.dday);
}

/**
 * 오늘 행사 필터 (D-0, multi-day 포함)
 */
export function getTodayEvents(events: readonly SchoolEvent[], today: Date): SchoolEvent[] {
  return events.filter((event) => isTodayEvent(event, today));
}

/**
 * D-Day 표시 텍스트
 */
export function formatDDay(dday: number): string {
  if (dday === 0) return 'D-Day';
  if (dday > 0) return `D-${dday}`;
  return `D+${Math.abs(dday)}`;
}

/**
 * D-Day 항목 정렬: 고정(pinned) 우선 → 미래 우선 → D-Day 가까운 순 → 과거는 뒤로
 */
export function sortDDayItems(items: readonly DDayItem[], today: Date): DDayItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ddayA = calculateDDay(a.targetDate, today);
    const ddayB = calculateDDay(b.targetDate, today);
    const futureA = ddayA >= 0;
    const futureB = ddayB >= 0;
    if (futureA !== futureB) return futureA ? -1 : 1;
    return ddayA - ddayB;
  });
}
