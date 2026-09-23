/**
 * 관찰 기록 응원 2·3차(ADR-137) — '한 주 정리'.
 *
 * 대상 주는 월~일. 알리는 날은 그 주 **마지막 등교일**(보통 금요일, 금요일이 쉬는 날이면 목요일)의
 * 그날 처음 화면이다. 그날 못 알렸으면 **다음 등교일**에 그 지난주 정리를 한 번 — 원래 알릴 날에서
 * 7일 이내일 때만. 한 날에 둘이면(놓친 지난주·이번 주) 더 최근 주 하나만.
 * 등교일이 없는 주, 알릴 때 그 주 관찰 기록이 하나도 없는 주는 알리지 않는다("0일·0명"은 벌주기다).
 *
 * 관찰 조각: 월~금 5칸과 "이번 주 만난 학생 N명". 학생 이름·학생별 건수는 넣지 않는다.
 */
import type { ObservationEntry } from './observationEntries';
import { addDaysIso, weekStartOf, type SchoolCalendarDays } from './schoolCalendarDays';
import { calendarDaysBetween, lastSchoolDayOfWeek, nextSchoolDayAfter } from './schoolDays';

/** 놓친 정리를 다음 등교일에 알릴 수 있는 최대 날 수(조정 가능). */
export const WEEKLY_CATCH_UP_DAYS = 7;

export type WeekDayCellState = 'recorded' | 'empty' | 'rest' | 'future';

export interface WeekDayCell {
  readonly date: string;
  readonly state: WeekDayCellState;
}

function recordedDates(entries: readonly ObservationEntry[], today: string): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (e.date <= today) out.add(e.date);
  return out;
}

/**
 * 월~금 5칸. 기록이 있으면 칠한다(쉬는 날이어도 — 기록이 이긴다).
 * 오늘과 그 뒤 날은 '아직', 공휴일·방학 날은 '쉬는 날', 나머지 기록 없는 날은 빈칸.
 */
export function weekDayCells(
  weekStart: string,
  today: string,
  entries: readonly ObservationEntry[],
  cal: SchoolCalendarDays,
): WeekDayCell[] {
  const recorded = recordedDates(entries, today);
  const cells: WeekDayCell[] = [];
  for (let i = 0; i < 5; i++) {
    const date = addDaysIso(weekStart, i);
    let state: WeekDayCellState;
    // 기록이 이긴다 → 쉬는 날(앞으로 올 공휴일도 '쉬는 날'이라 부른다) → 아직 → 빈칸
    if (recorded.has(date)) state = 'recorded';
    else if (cal.holidayDays.has(date) || cal.vacationDays.has(date)) state = 'rest';
    else if (date >= today) state = 'future';
    else state = 'empty';
    cells.push({ date, state });
  }
  return cells;
}

/** 그 주(월~일)에 기록이 있는 (카드, 학생) 쌍의 수 — 출결 제외, 오늘 뒤 날짜 제외. */
export function weekMetStudents(
  entries: readonly ObservationEntry[],
  weekStart: string,
  today: string,
): number {
  const end = addDaysIso(weekStart, 6);
  const pairs = new Set<string>();
  for (const e of entries) {
    if (e.date < weekStart || e.date > end || e.date > today) continue;
    pairs.add(`${e.card}\u0000${e.ref}`);
  }
  return pairs.size;
}

export function weekHasRecords(
  entries: readonly ObservationEntry[],
  weekStart: string,
  today: string,
): boolean {
  return weekMetStudents(entries, weekStart, today) > 0;
}

/**
 * 그 주 정리에 보여 줄 것이 있는가(주의 월요일 → 참/거짓). 틀의 판단이다 — 관찰 조각만이 아니라
 * 다른 작업이 더한 조각까지 본다(spec §8). 관찰만 볼 때는 `weekHasRecords` 로 만든다.
 */
export type WeekHasContent = (weekStart: string) => boolean;

/**
 * 알릴 날(그 주 마지막 등교일) 처음 화면에서 그 주에 보여 줄 것이 없어 **넘기는** 주. 없으면 null.
 * 처리한 것으로 적어 두면, 그 뒤 기록이 생겨도 다음 등교일에 다시 알리지 않는다 — 다시 알리기는
 * 못 알린 날(안 열었거나 쉰 날)만이다.
 */
export function weeklySkippedWeek(
  today: string,
  cal: SchoolCalendarDays,
  hasContent: WeekHasContent,
): string | null {
  const thisWeek = weekStartOf(today);
  if (lastSchoolDayOfWeek(thisWeek, cal) !== today) return null;
  return hasContent(thisWeek) ? null : thisWeek;
}

/**
 * 오늘 알릴 한 주 정리의 주(월요일). 없으면 null.
 * - 오늘이 이번 주 마지막 등교일이면 이번 주.
 * - 오늘이 지난주 마지막 등교일 다음 첫 등교일이고 7일 이내이며 지난주를 아직 안 알렸으면 지난주.
 * - 둘 다면 더 최근 주(이번 주).
 * - 이미 알린 주, 알릴 때 보여 줄 것이 없는 주는 뺀다.
 */
export function weeklyNoticeWeek(
  today: string,
  cal: SchoolCalendarDays,
  notifiedWeeks: ReadonlySet<string>,
  hasContent: WeekHasContent,
): string | null {
  const thisWeek = weekStartOf(today);
  const candidates: string[] = [];
  if (lastSchoolDayOfWeek(thisWeek, cal) === today) candidates.push(thisWeek);

  const lastWeek = addDaysIso(thisWeek, -7);
  const lastPrimary = lastSchoolDayOfWeek(lastWeek, cal);
  if (lastPrimary !== null) {
    const next = nextSchoolDayAfter(lastPrimary, cal, WEEKLY_CATCH_UP_DAYS);
    if (next === today && calendarDaysBetween(lastPrimary, today) <= WEEKLY_CATCH_UP_DAYS) {
      candidates.push(lastWeek);
    }
  }

  for (const week of candidates) {
    if (notifiedWeeks.has(week)) continue;
    if (!hasContent(week)) continue;
    return week;
  }
  return null;
}
