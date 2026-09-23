/**
 * 관찰 기록 응원 2·3차(ADR-137) — 통계 화면의 '반 흐름'.
 *
 * 줄 = 그 카드의 학생 칸(1차 칸 규칙), 열 = 이번 학기 주(월요일 시작).
 * 칸 = 그 주에 그 학생의 관찰 기록(그 카드, 출결 제외, 오늘 뒤 날짜 제외)이 있으면 칠함.
 * **건수는 보여 주지 않는다.** 쉬는 주·아직 오지 않은 주는 옅게 그리되, 쉬는 주라도 기록이
 * 있으면 칠한다(기록이 이긴다).
 */
import type { ObservationEntry } from './observationEntries';
import { addDaysIso, isRestWeek, weekStartOf, type SchoolCalendarDays } from './schoolCalendarDays';

export type ClassFlowCellState = 'recorded' | 'empty' | 'rest' | 'future';

export interface ClassFlowWeek {
  readonly weekStart: string;
  readonly weekEnd: string;
  readonly rest: boolean;
  readonly future: boolean;
}

export interface ClassFlowGrid {
  readonly weeks: readonly ClassFlowWeek[];
  /** ref → 주마다 칸 상태(weeks 와 같은 순서) */
  readonly rows: ReadonlyMap<string, readonly ClassFlowCellState[]>;
}

export function buildClassFlowGrid(input: {
  readonly refs: readonly string[];
  /** 이 카드의 기록 */
  readonly entries: readonly ObservationEntry[];
  readonly termStart: string;
  readonly termEnd: string;
  readonly today: string;
  readonly cal: SchoolCalendarDays;
}): ClassFlowGrid {
  const weeks: ClassFlowWeek[] = [];
  const thisWeek = weekStartOf(input.today);
  const last = weekStartOf(input.termEnd);
  let week = weekStartOf(input.termStart);
  for (let i = 0; i < 60 && week <= last; i++) {
    weeks.push({
      weekStart: week,
      weekEnd: addDaysIso(week, 6),
      rest: isRestWeek(week, input.cal),
      future: week > thisWeek,
    });
    week = addDaysIso(week, 7);
  }

  const recorded = new Map<string, Set<string>>();
  for (const e of input.entries) {
    if (e.date > input.today || e.date < input.termStart || e.date > input.termEnd) continue;
    let set = recorded.get(e.ref);
    if (set === undefined) {
      set = new Set<string>();
      recorded.set(e.ref, set);
    }
    set.add(weekStartOf(e.date));
  }

  const rows = new Map<string, ClassFlowCellState[]>();
  for (const ref of input.refs) {
    const mine = recorded.get(ref);
    rows.set(
      ref,
      weeks.map((w): ClassFlowCellState => {
        if (mine?.has(w.weekStart) === true) return 'recorded';
        if (w.future) return 'future';
        if (w.rest) return 'rest';
        return 'empty';
      }),
    );
  }
  return { weeks, rows };
}
