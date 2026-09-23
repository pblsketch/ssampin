/**
 * 관찰 기록 응원 2·3차(ADR-137) — '등교일' 판정.
 *
 * - 학사일정(나이스 학교 일정 + 공휴일)이 있으면: 월~금 가운데 공휴일도 방학 날도 아닌 날.
 *   시험 날은 등교일이다.
 * - 학사일정이 없으면(날짜 집합이 모두 비어 있으면): 월~금.
 *
 * 오늘 챙길 학생·한 주 정리·학기 돌아보기 알림이 모두 이 판정을 쓴다.
 * ★학사일정을 불러오기 **전에** 판정하면 금요일 공휴일 주의 마지막 등교일을 금요일로 잘못 본다 —
 *   호출자가 불러온 뒤에 부른다.
 */
import { addDaysIso, type SchoolCalendarDays } from './schoolCalendarDays';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayOfWeek(date: string): number | null {
  if (!DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

export function isSchoolDay(date: string, cal: SchoolCalendarDays): boolean {
  const dow = dayOfWeek(date);
  if (dow === null || dow === 0 || dow === 6) return false;
  return !cal.holidayDays.has(date) && !cal.vacationDays.has(date);
}

/** 그 주(월요일 시작)의 등교일들, 날짜순. */
export function schoolDaysOfWeek(weekStart: string, cal: SchoolCalendarDays): string[] {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const day = addDaysIso(weekStart, i);
    if (isSchoolDay(day, cal)) out.push(day);
  }
  return out;
}

/** 그 주의 마지막 등교일. 등교일이 없으면 null. */
export function lastSchoolDayOfWeek(weekStart: string, cal: SchoolCalendarDays): string | null {
  const days = schoolDaysOfWeek(weekStart, cal);
  return days[days.length - 1] ?? null;
}

/** `date` 다음 날부터 찾은 첫 등교일. `maxDays` 안에 없으면 null. */
export function nextSchoolDayAfter(
  date: string,
  cal: SchoolCalendarDays,
  maxDays = 120,
): string | null {
  let cursor = date;
  for (let i = 0; i < maxDays; i++) {
    cursor = addDaysIso(cursor, 1);
    if (isSchoolDay(cursor, cal)) return cursor;
  }
  return null;
}

/** 두 날짜 사이 달력 일수(`to` - `from`). 형식이 아니면 NaN. */
export function calendarDaysBetween(from: string, to: string): number {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return Number.NaN;
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
