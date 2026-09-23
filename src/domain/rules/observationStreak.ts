/**
 * 관찰 기록 응원(ADR-135) — 선생님 자신의 셈: 내 잔디·연속 주·이번 학기 기록한 주.
 *
 * - 카드가 있든 없든 **모든 관찰 기록**을 센다(보관한 반·전출 학생·명렬 없는 담임 기록 포함).
 *   선생님이 꾸준히 기록했는지를 보는 셈이다. 빼기도 영향이 없다.
 * - 오늘보다 뒤 날짜 기록은 그날이 올 때까지 세지 않는다.
 * - 연속 주(월~일):
 *   · 이번 주는 기록이 있으면 세고, 아직 없으면 판단하지 않는다.
 *   · 기록 없는 쉬는 주는 건너뛴다(세지도 끊지도 않는다).
 *   · 기록 없는 보통 주 한 주는 괜찮다. 달력상 **바로 이어진** 두 주가 모두 기록 없는 보통 주면
 *     끊긴다. 사이에 쉬는 주가 끼면 이어진 것으로 보지 않는다(너그러운 쪽).
 *   · 학기 경계를 넘어 이어질 수 있다.
 * - 끊겼다고 벌주지 않는다(ADR-134) — 문구 종류만 고르고, "끊겼어요"는 없다.
 */
import type { ObservationEntry } from './observationEntries';
import { addDaysIso, isRestWeek, weekStartOf, type SchoolCalendarDays } from './schoolCalendarDays';

/** 그날 관찰 기록이 있는 (카드, 학생) 수 — 이번 학기, 오늘까지. */
export function grassDayCounts(
  entries: readonly ObservationEntry[],
  termStart: string,
  today: string,
): Map<string, number> {
  const perDay = new Map<string, Set<string>>();
  for (const e of entries) {
    if (e.date < termStart || e.date > today) continue;
    let set = perDay.get(e.date);
    if (set === undefined) {
      set = new Set<string>();
      perDay.set(e.date, set);
    }
    set.add(`${e.card}\u0000${e.ref}`);
  }
  const out = new Map<string, number>();
  for (const [date, set] of perDay) out.set(date, set.size);
  return out;
}

/** 진하기 단계 0~3. 구간은 조정 가능한 기본값: 0 / 1~2 / 3~5 / 6명 이상. */
export function grassLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

/** 학기 시작 주부터 끝 주까지의 주 목록. 각 주는 월~금 날짜 5개. */
export function termWeekdayColumns(
  termStart: string,
  termEnd: string,
): { readonly weekStart: string; readonly days: readonly string[] }[] {
  const cols: { weekStart: string; days: string[] }[] = [];
  const last = weekStartOf(termEnd);
  let week = weekStartOf(termStart);
  for (let i = 0; i < 60 && week <= last; i++) {
    const days: string[] = [];
    for (let d = 0; d < 5; d++) days.push(addDaysIso(week, d));
    cols.push({ weekStart: week, days });
    week = addDaysIso(week, 7);
  }
  return cols;
}

/**
 * 위젯 카드 주 줄 한 칸(ADR-137 결정 16) — 한 칸이 한 주다.
 * - `level`: 기록이 있거나, 기록 없는 보통 주(0).
 * - `rest`: 기록 없는 쉬는 주 — 비었다가 아니라 쉬었다로 그린다.
 * - `pending`: 이번 주에 아직 기록이 없다 — 판단하지 않는다(연속 주와 같다).
 */
export type WeekStripCell =
  | {
      readonly weekStart: string;
      readonly kind: 'level';
      readonly level: 0 | 1 | 2 | 3;
      /** 그 주 기록한 날 수(주말 포함) */
      readonly recordedDays: number;
    }
  | { readonly weekStart: string; readonly kind: 'rest' }
  | { readonly weekStart: string; readonly kind: 'pending' };

/**
 * 그 주 진하기 — 기록한 **날 수**가 등교일 가운데 얼마인가(학생 수가 아니다). 오너 결정 2026-09-24.
 * 구간은 조정 가능한 기본값: 0 / 절반 미만 / 80% 미만 / 그 이상. 주말 기록으로 등교일보다 많아도 1로 본다.
 */
export function weekPresenceLevel(recordedDays: number, schoolDays: number): 0 | 1 | 2 | 3 {
  if (recordedDays <= 0) return 0;
  const ratio = recordedDays / Math.max(schoolDays, recordedDays);
  if (ratio < 0.5) return 1;
  if (ratio < 0.8) return 2;
  return 3;
}

/**
 * 학기 시작 주부터 이번 주까지 주 줄. 아직 오지 않은 주는 없고, 마지막 칸이 늘 이번 주다
 * (학기 시작일을 잘못 넣어 60주를 넘으면 오래된 주를 버린다).
 *
 * `counts` 는 `grassDayCounts` 결과(학기 안·오늘까지). 등교일은 학기 안·오늘까지의 평일 가운데
 * 휴일·방학 날을 뺀 날이다. **오늘은 기록했을 때만 센다** — 아침에 이번 주 칸이 옅어지지 않게.
 * 기록 없는 지난주는 쉬는 주이거나 **등교일이 하루도 없으면**(예: 토요일에 시작한 학기의 첫 주) 쉬는 칸이다.
 */
const STRIP_MAX_WEEKS = 60;

export function weekGrassStrip(
  counts: ReadonlyMap<string, number>,
  termStart: string,
  today: string,
  cal: SchoolCalendarDays,
): WeekStripCell[] {
  if (termStart > today) return [];
  const cells: WeekStripCell[] = [];
  const thisWeek = weekStartOf(today);
  const oldest = addDaysIso(thisWeek, -7 * (STRIP_MAX_WEEKS - 1));
  const first = weekStartOf(termStart);
  let week = first > oldest ? first : oldest;
  for (let i = 0; i < STRIP_MAX_WEEKS && week <= thisWeek; i++) {
    let recordedDays = 0;
    let schoolDays = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDaysIso(week, d);
      if (day < termStart || day > today) continue;
      const recorded = (counts.get(day) ?? 0) > 0;
      if (recorded) recordedDays++;
      if (d >= 5 || cal.holidayDays.has(day) || cal.vacationDays.has(day)) continue;
      if (day === today && !recorded) continue;
      schoolDays++;
    }
    if (recordedDays === 0 && week === thisWeek) {
      cells.push({ weekStart: week, kind: 'pending' });
    } else if (recordedDays === 0 && (schoolDays === 0 || isRestWeek(week, cal))) {
      cells.push({ weekStart: week, kind: 'rest' });
    } else {
      cells.push({
        weekStart: week,
        kind: 'level',
        level: weekPresenceLevel(recordedDays, schoolDays),
        recordedDays,
      });
    }
    week = addDaysIso(week, 7);
  }
  return cells;
}

export interface StreakSummary {
  /** 끊기지 않은 구간 안의 기록한 주 수 */
  readonly streakWeeks: number;
  /** 이번 학기(시작 주부터) 기록한 주 수 */
  readonly termRecordedWeeks: number;
  /** 이번 학기 관찰 기록이 하나라도 있는가 */
  readonly termHasRecords: boolean;
}

export function computeStreak(
  entries: readonly ObservationEntry[],
  today: string,
  termStart: string,
  cal: SchoolCalendarDays,
): StreakSummary {
  const recordedWeeks = new Set<string>();
  const termWeeks = new Set<string>();
  let earliestWeek: string | null = null;
  let termHasRecords = false;
  for (const e of entries) {
    if (e.date > today) continue;
    const w = weekStartOf(e.date);
    recordedWeeks.add(w);
    if (earliestWeek === null || w < earliestWeek) earliestWeek = w;
    if (e.date >= termStart) {
      termHasRecords = true;
      termWeeks.add(w);
    }
  }

  let streak = 0;
  const thisWeek = weekStartOf(today);
  if (recordedWeeks.has(thisWeek)) streak++;
  if (earliestWeek !== null) {
    let previousWasEmptyNormal = false;
    let week = addDaysIso(thisWeek, -7);
    // 가장 이른 기록 주까지만 거슬러 본다.
    for (let i = 0; i < 520 && week >= earliestWeek; i++) {
      if (recordedWeeks.has(week)) {
        streak++;
        previousWasEmptyNormal = false;
      } else if (isRestWeek(week, cal)) {
        previousWasEmptyNormal = false;
      } else if (previousWasEmptyNormal) {
        break;
      } else {
        previousWasEmptyNormal = true;
      }
      week = addDaysIso(week, -7);
    }
  }

  return { streakWeeks: streak, termRecordedWeeks: termWeeks.size, termHasRecords };
}

/** 카드 핀 줄에 보여 줄 문구 종류 — 위에서부터 처음 맞는 것 하나. */
export type CheerLine =
  | { readonly kind: 'firstRecord' }
  | { readonly kind: 'streak'; readonly weeks: number }
  | { readonly kind: 'termWeeks'; readonly weeks: number };

export function pickCheerLine(summary: StreakSummary): CheerLine {
  if (!summary.termHasRecords) return { kind: 'firstRecord' };
  if (summary.streakWeeks >= 1) return { kind: 'streak', weeks: summary.streakWeeks };
  return { kind: 'termWeeks', weeks: summary.termRecordedWeeks };
}
