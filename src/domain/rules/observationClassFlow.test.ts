import { describe, it, expect } from 'vitest';
import type { ObservationEntry } from './observationEntries';
import { buildClassFlowGrid } from './observationClassFlow';
import { EMPTY_SCHOOL_CALENDAR, buildSchoolCalendarDays } from './schoolCalendarDays';

function e(date: string, ref: string): ObservationEntry {
  return { card: 'homeroom', ref, date, createdAt: 0, id: `${ref}-${date}` };
}

describe('반 흐름', () => {
  it('학기 주마다 있음/없음 — 건수 없이, 쉬는 주·아직은 옅게, 쉬는 주 기록은 칠한다', () => {
    const cal = buildSchoolCalendarDays(
      [{ title: '중간고사', date: '2026-09-09', endDate: '2026-09-10', group: 'exam' }],
      [],
    );
    const grid = buildClassFlowGrid({
      refs: ['a', 'b'],
      entries: [
        e('2026-09-01', 'a'),
        e('2026-09-02', 'a'),
        e('2026-09-09', 'b'),
        e('2026-09-30', 'a'), // 오늘 뒤 — 세지 않는다
      ],
      termStart: '2026-08-31',
      termEnd: '2026-09-27',
      today: '2026-09-16',
      cal,
    });
    expect(grid.weeks.map((w) => w.weekStart)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ]);
    expect(grid.weeks.map((w) => w.rest)).toEqual([false, true, false, false]);
    expect(grid.weeks.map((w) => w.future)).toEqual([false, false, false, true]);
    expect(grid.rows.get('a')).toEqual(['recorded', 'rest', 'empty', 'future']);
    expect(grid.rows.get('b')).toEqual(['empty', 'recorded', 'empty', 'future']);
  });

  it('기록 없는 학생도 줄이 있다', () => {
    const grid = buildClassFlowGrid({
      refs: ['z'],
      entries: [],
      termStart: '2026-09-14',
      termEnd: '2026-09-20',
      today: '2026-09-16',
      cal: EMPTY_SCHOOL_CALENDAR,
    });
    expect(grid.rows.get('z')).toEqual(['empty']);
  });
});
