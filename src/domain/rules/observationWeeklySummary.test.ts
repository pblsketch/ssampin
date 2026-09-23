import { describe, it, expect } from 'vitest';
import type { ObservationEntry } from './observationEntries';
import { EMPTY_SCHOOL_CALENDAR, buildSchoolCalendarDays } from './schoolCalendarDays';
import {
  weekDayCells,
  weekHasRecords,
  weekMetStudents,
  weeklyNoticeWeek,
  weeklySkippedWeek,
  type WeekHasContent,
} from './observationWeeklySummary';

function e(date: string, ref = 's1', card = 'homeroom'): ObservationEntry {
  return { card, ref, date, createdAt: 0, id: `${card}-${ref}-${date}` };
}

/** 관찰 조각만 있을 때의 '보여 줄 것이 있는가' */
function has(entries: readonly ObservationEntry[], today: string): WeekHasContent {
  return (week) => weekHasRecords(entries, week, today);
}

// 2026-09-21 이 월요일
const WEEK = '2026-09-21';

describe('한 주 정리 5칸', () => {
  it('기록·빈칸·쉬는 날·아직, 쉬는 날이라도 기록이 있으면 칠한다', () => {
    const cal = buildSchoolCalendarDays([], ['2026-09-22', '2026-09-23']);
    const cells = weekDayCells(
      WEEK,
      '2026-09-24',
      [e('2026-09-23'), e('2026-09-24'), e('2026-09-25')],
      cal,
    );
    expect(cells.map((c) => c.state)).toEqual(['empty', 'rest', 'recorded', 'recorded', 'future']);
  });

  it('오늘 기록이 아직 없으면 오늘은 아직', () => {
    const cells = weekDayCells(WEEK, '2026-09-23', [], EMPTY_SCHOOL_CALENDAR);
    expect(cells.map((c) => c.state)).toEqual(['empty', 'empty', 'future', 'future', 'future']);
  });

  it('앞으로 올 공휴일도 쉬는 날이라 부른다(모양은 아직과 같다)', () => {
    const cal = buildSchoolCalendarDays([], ['2026-09-24', '2026-09-25']);
    const cells = weekDayCells(WEEK, '2026-09-23', [], cal);
    expect(cells.map((c) => c.state)).toEqual(['empty', 'empty', 'future', 'rest', 'rest']);
  });

  it('만난 학생은 (카드, 학생) 쌍 — 담임·수업반의 같은 아이는 두 번, 오늘 뒤·다른 주는 뺀다', () => {
    const n = weekMetStudents(
      [
        e('2026-09-21', 'a'),
        e('2026-09-22', 'a'),
        e('2026-09-22', 'a', 'subject:c1'),
        e('2026-09-26', 'b'), // 토요일도 그 주
        e('2026-09-27', 'd'), // 오늘 뒤
        e('2026-09-28', 'c'), // 다음 주
      ],
      WEEK,
      '2026-09-26',
    );
    expect(n).toBe(3);
  });
});

describe('알리는 날', () => {
  const entries = [e('2026-09-22')];

  it('그 주 마지막 등교일에 알린다', () => {
    expect(
      weeklyNoticeWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, new Set(), has(entries, '2026-09-25')),
    ).toBe(WEEK);
    expect(
      weeklyNoticeWeek('2026-09-24', EMPTY_SCHOOL_CALENDAR, new Set(), has(entries, '2026-09-24')),
    ).toBeNull();
  });

  it('금요일이 공휴일이면 목요일', () => {
    const cal = buildSchoolCalendarDays([], ['2026-09-25']);
    expect(weeklyNoticeWeek('2026-09-24', cal, new Set(), has(entries, '2026-09-24'))).toBe(WEEK);
  });

  it('놓치면 다음 등교일에 지난주 정리를 — 7일 안에서만', () => {
    expect(
      weeklyNoticeWeek('2026-09-28', EMPTY_SCHOOL_CALENDAR, new Set(), has(entries, '2026-09-28')),
    ).toBe(WEEK);
    expect(
      weeklyNoticeWeek('2026-09-29', EMPTY_SCHOOL_CALENDAR, new Set(), has(entries, '2026-09-29')),
    ).toBeNull();
    // 다음 주 월~목이 쉬는 날 — 다음 등교일(금)이 딱 7일째라 알린다
    const sevenDays = buildSchoolCalendarDays(
      [],
      ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'],
    );
    expect(weeklyNoticeWeek('2026-10-02', sevenDays, new Set(), has(entries, '2026-10-02'))).toBe(
      WEEK,
    );
    // 다음 주 월~금이 모두 쉬는 날 — 다음 등교일이 7일을 넘어 넘긴다
    const tooLate = buildSchoolCalendarDays(
      [],
      ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
    );
    expect(
      weeklyNoticeWeek('2026-10-05', tooLate, new Set(), has(entries, '2026-10-05')),
    ).toBeNull();
    // 지난주 마지막 등교일이 월요일이고 다음 등교일이 11일 뒤 금요일 — 7일을 넘어 넘긴다
    const monOnly = buildSchoolCalendarDays(
      [],
      ['22', '23', '24', '25', '28', '29', '30'].map((d) => `2026-09-${d}`).concat('2026-10-01'),
    );
    expect(
      weeklyNoticeWeek('2026-10-02', monOnly, new Set(), has([e('2026-09-21')], '2026-10-02')),
    ).toBeNull();
  });

  it('이미 알린 주, 기록이 없는 주, 등교일이 없는 주는 알리지 않는다', () => {
    expect(
      weeklyNoticeWeek(
        '2026-09-25',
        EMPTY_SCHOOL_CALENDAR,
        new Set([WEEK]),
        has(entries, '2026-09-25'),
      ),
    ).toBeNull();
    expect(
      weeklyNoticeWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, new Set(), has([], '2026-09-25')),
    ).toBeNull();
    const cal = buildSchoolCalendarDays(
      [{ title: '방학', date: '2026-09-21', endDate: '2026-09-25', group: 'vacation' }],
      [],
    );
    expect(weeklyNoticeWeek('2026-09-25', cal, new Set(), has(entries, '2026-09-25'))).toBeNull();
  });

  it('알릴 날 기록이 0건이면 넘긴 주로 적는다(다음 등교일에 다시 알리지 않게)', () => {
    expect(weeklySkippedWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, has([], '2026-09-25'))).toBe(
      WEEK,
    );
    expect(
      weeklySkippedWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, has(entries, '2026-09-25')),
    ).toBeNull();
    expect(
      weeklySkippedWeek('2026-09-24', EMPTY_SCHOOL_CALENDAR, has([], '2026-09-24')),
    ).toBeNull();
    // 틀의 판단 — 관찰 기록이 없어도 다른 조각이 보여 줄 것이 있으면 알린다
    expect(weeklyNoticeWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, new Set(), () => true)).toBe(WEEK);
    expect(weeklySkippedWeek('2026-09-25', EMPTY_SCHOOL_CALENDAR, () => true)).toBeNull();
  });

  it('한 날에 둘이면 최근 주만', () => {
    // 다음 주는 월요일만 등교일 — 지난주 정리를 놓친 다음 등교일이면서 이번 주 마지막 등교일
    const cal = buildSchoolCalendarDays(
      [{ title: '방학', date: '2026-09-29', endDate: '2026-10-02', group: 'vacation' }],
      [],
    );
    const both = [e('2026-09-22'), e('2026-09-28')];
    expect(weeklyNoticeWeek('2026-09-28', cal, new Set(), has(both, '2026-09-28'))).toBe(
      '2026-09-28',
    );
  });
});
