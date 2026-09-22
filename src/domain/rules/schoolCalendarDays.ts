/**
 * 관찰 기록 응원(ADR-135) — 학사일정에서 '방학 날'·'쉬는 주'를 읽는 규칙.
 *
 * - 쓰는 일정은 **나이스에서 불러온 학교 일정만**이다. 거르는 일은 호출자(어댑터)가 한다.
 *   선생님이 만든 일정·구글 일정은 제목에 '평가'·'방학'이 있어도 쓰지 않는다.
 * - 방학 날: 분류가 방학(`vacation`)인 날. 방학식·종업식은 등교일이라 빼지 않는다
 *   (`lessonDayExclusion.isCeremonyEvent` 를 그대로 쓴다 — '…식으로 끝나는지'로 보면 뚫린다).
 * - 쉬는 주: 월~일 한 주 안에 방학 날이 하루라도 있거나, 시험·평가 일정이 있거나, 평일이 모두
 *   공휴일인 주. **넓게 잡는 것이 의도다** — 잘못 잡혀도 연속이 끊기지 않을 뿐 손해가 없다.
 * - 학사일정이 없으면 모든 집합이 비어 있고, 지금처럼 달력 날짜로 센다.
 */
import { isCeremonyEvent } from './lessonDayExclusion';

export interface SchoolCalendarDays {
  readonly vacationDays: ReadonlySet<string>;
  readonly examDays: ReadonlySet<string>;
  readonly holidayDays: ReadonlySet<string>;
}

export const EMPTY_SCHOOL_CALENDAR: SchoolCalendarDays = {
  vacationDays: new Set<string>(),
  examDays: new Set<string>(),
  holidayDays: new Set<string>(),
};

/** 호출자가 분류(`classifyNeisEvent`)를 붙여 넘기는 학사일정 한 건. */
export interface SchoolCalendarEvent {
  readonly title: string;
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /** 여러 날에 걸친 일정의 끝날 'YYYY-MM-DD'. 없으면 하루. */
  readonly endDate?: string;
  readonly group: 'holiday' | 'exam' | 'vacation' | 'event' | 'etc';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** 잘못된 끝날로 끝없이 펼치지 않도록 한 일정이 덮는 최대 날 수. */
const MAX_EVENT_SPAN_DAYS = 120;

function parseLocal(date: string): Date | null {
  if (!DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(date: string, days: number): string {
  const d = parseLocal(date);
  if (d === null) return date;
  d.setDate(d.getDate() + days);
  return formatLocal(d);
}

/** 일정 한 건이 덮는 날짜들(시작~끝). */
function expandEventDays(ev: SchoolCalendarEvent): string[] {
  const start = parseLocal(ev.date);
  if (start === null) return [];
  const end = ev.endDate !== undefined ? parseLocal(ev.endDate) : null;
  const days: string[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < MAX_EVENT_SPAN_DAYS; i++) {
    days.push(formatLocal(cursor));
    if (end === null || cursor.getTime() >= end.getTime()) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * 학사일정 + 공휴일 날짜 → 날짜 집합.
 * @param holidays 공휴일 날짜('YYYY-MM-DD') — 법정 공휴일 계산 결과를 호출자가 넘긴다.
 */
export function buildSchoolCalendarDays(
  events: readonly SchoolCalendarEvent[],
  holidays: readonly string[] = [],
): SchoolCalendarDays {
  const vacationDays = new Set<string>();
  const examDays = new Set<string>();
  const holidayDays = new Set<string>(holidays.filter((d) => DATE_RE.test(d)));
  for (const ev of events) {
    if (ev.group === 'vacation') {
      if (isCeremonyEvent(ev.title)) continue;
      for (const d of expandEventDays(ev)) vacationDays.add(d);
    } else if (ev.group === 'exam') {
      for (const d of expandEventDays(ev)) examDays.add(d);
    } else if (ev.group === 'holiday') {
      for (const d of expandEventDays(ev)) holidayDays.add(d);
    }
  }
  return { vacationDays, examDays, holidayDays };
}

export function isVacationDay(cal: SchoolCalendarDays, date: string): boolean {
  return cal.vacationDays.has(date);
}

/**
 * `from` 다음 날부터 `to` 까지(포함) 가운데 방학 날이 아닌 날 수.
 * 같은 날이면 0, `to` 가 앞이면 0.
 */
export function daysBetweenExcludingVacation(
  from: string,
  to: string,
  cal: SchoolCalendarDays,
): number {
  const a = parseLocal(from);
  const b = parseLocal(to);
  if (a === null || b === null) return 0;
  const total = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (total <= 0) return 0;
  if (cal.vacationDays.size === 0) return total;
  let count = 0;
  const cursor = new Date(a);
  for (let i = 0; i < total; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (!cal.vacationDays.has(formatLocal(cursor))) count++;
  }
  return count;
}

/**
 * `start` 에서 방학 날이 아닌 날을 `n` 개 지난 날짜. 방학 날은 건너뛴다.
 * (끝없는 방학 표시에 갇히지 않도록 최대 2년치만 본다.)
 */
export function addDaysExcludingVacation(
  start: string,
  n: number,
  cal: SchoolCalendarDays,
): string {
  if (n <= 0) return start;
  if (cal.vacationDays.size === 0) return addDaysIso(start, n);
  let remaining = n;
  let cursor = start;
  for (let i = 0; i < 730 && remaining > 0; i++) {
    cursor = addDaysIso(cursor, 1);
    if (!cal.vacationDays.has(cursor)) remaining--;
  }
  return cursor;
}

/** 그 날짜가 속한 주의 월요일 'YYYY-MM-DD'. */
export function weekStartOf(date: string): string {
  const d = parseLocal(date);
  if (d === null) return date;
  const dow = d.getDay(); // 0=일
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return formatLocal(d);
}

/** 쉬는 주인가 — weekStart 는 월요일. */
export function isRestWeek(weekStart: string, cal: SchoolCalendarDays): boolean {
  let allWeekdaysHoliday = true;
  for (let i = 0; i < 7; i++) {
    const day = addDaysIso(weekStart, i);
    if (cal.vacationDays.has(day) || cal.examDays.has(day)) return true;
    if (i < 5 && !cal.holidayDays.has(day)) allWeekdaysHoliday = false;
  }
  return allWeekdaysHoliday;
}
