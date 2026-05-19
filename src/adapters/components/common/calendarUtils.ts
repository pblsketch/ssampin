/**
 * Calendar Utilities — `CalendarPicker`/`MultiDatePicker` 공유 순수 유틸리티.
 *
 * - 외부 의존성 없음 (도메인·React·infra 모두 import 금지)
 * - 모든 함수 결정론적·side-effect free
 * - 시간 처리: 로컬 자정 기준 (`T00:00:00`)으로 UTC 밀림 방지
 *
 * Spec: `docs/02-design/features/multi-date-attendance.design.md` §3.2
 */

/* ──────────────────────── 기본 상수 ──────────────────────── */

export const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** MultiDatePicker 기본 선택 상한 */
export const DEFAULT_MAX_COUNT = 30;

/* ──────────────────────── Date <-> ISO 변환 ──────────────────────── */

/** Date → "YYYY-MM-DD" (로컬 타임존 기준) */
export function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" → Date (로컬 자정) */
export function parseDateStr(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/** 두 Date가 같은 날짜인지 (year + month + day 일치) */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/* ──────────────────────── 달력 그리드 ──────────────────────── */

/**
 * 6주 × 7일 = 42 cells (앞·뒤 월 spillover 포함)을 반환한다.
 *
 * - 일요일(JS getDay=0) 기준 정렬
 * - 항상 42개 보장 — 셀 개수 가변으로 인한 레이아웃 시프트 차단
 *
 * @param year 4-digit year
 * @param month 0-based month (0=Jan, 11=Dec)
 */
export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=일

  const days: Date[] = [];
  // 이전 달 spillover
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // 이번 달
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  // 다음 달 spillover (6줄 채우기)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push(new Date(year, month + 1, d));
  }
  return days;
}

/* ──────────────────────── 날짜 범위 & 프리셋 ──────────────────────── */

/**
 * 두 ISO 날짜 사이의 모든 날짜를 inclusive 로 enumeration 한다.
 *
 * @param start "YYYY-MM-DD"
 * @param end   "YYYY-MM-DD"
 * @returns 시작·종료 포함 ISO 날짜 배열. start > end 면 빈 배열.
 *
 * @example
 * enumerateRange("2026-05-01", "2026-05-03") // ["2026-05-01", "2026-05-02", "2026-05-03"]
 */
export function enumerateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = parseDateStr(start);
  const endDate = parseDateStr(end);

  if (d > endDate) return dates;

  while (d <= endDate) {
    dates.push(formatDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * 오늘이 속한 주 (일요일 ~ 토요일) 7일을 ISO 문자열 배열로 반환.
 *
 * @param today  기준일 (기본: 현재 시각)
 * @param weekdaysOnly true 면 월~금 5일만
 */
export function getThisWeekDates(today?: Date, weekdaysOnly = false): string[] {
  const base = today ? new Date(today) : new Date();
  base.setHours(0, 0, 0, 0);
  const sunday = new Date(base);
  sunday.setDate(base.getDate() - base.getDay()); // 일요일로 이동

  const result: string[] = [];
  const startOffset = weekdaysOnly ? 1 : 0; // 평일만이면 월요일부터
  const endOffset = weekdaysOnly ? 5 : 6; // 평일만이면 금요일까지
  for (let i = startOffset; i <= endOffset; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    result.push(formatDateStr(d));
  }
  return result;
}

/**
 * 다음 주 (일요일 ~ 토요일) 7일을 ISO 문자열 배열로 반환.
 *
 * @param today  기준일 (기본: 현재 시각)
 * @param weekdaysOnly true 면 월~금 5일만
 */
export function getNextWeekDates(today?: Date, weekdaysOnly = false): string[] {
  const base = today ? new Date(today) : new Date();
  base.setHours(0, 0, 0, 0);
  const nextSunday = new Date(base);
  nextSunday.setDate(base.getDate() - base.getDay() + 7); // 다음 일요일

  const result: string[] = [];
  const startOffset = weekdaysOnly ? 1 : 0;
  const endOffset = weekdaysOnly ? 5 : 6;
  for (let i = startOffset; i <= endOffset; i++) {
    const d = new Date(nextSunday);
    d.setDate(nextSunday.getDate() + i);
    result.push(formatDateStr(d));
  }
  return result;
}

/* ──────────────────────── 표시 헬퍼 ──────────────────────── */

/** "M월 D일" (예: "5월 5일") */
export function formatDateKR(dateStr: string): string {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** "M/D" 짧은 형태 (예: "5/5") — 칩 라벨용 */
export function formatDateChip(dateStr: string): string {
  const d = parseDateStr(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
