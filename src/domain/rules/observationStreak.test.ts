import { describe, it, expect } from 'vitest';
import type { ObservationEntry } from './observationEntries';
import { EMPTY_SCHOOL_CALENDAR, buildSchoolCalendarDays } from './schoolCalendarDays';
import {
  computeStreak,
  grassDayCounts,
  grassLevel,
  pickCheerLine,
  termWeekdayColumns,
} from './observationStreak';

function e(date: string, ref = 's1', card = 'homeroom'): ObservationEntry {
  return { card, ref, date, createdAt: 0, id: `${card}-${ref}-${date}` };
}

// 2026-09-21(월) 주가 '이번 주', 오늘은 9/23(수)
const TODAY = '2026-09-23';
const TERM_START = '2026-08-18';

describe('내 잔디 칸 값', () => {
  it('그날 기록이 있는 (카드, 학생) 수 — 같은 학생 두 번은 한 번, 다른 카드는 따로', () => {
    const counts = grassDayCounts(
      [
        e('2026-09-01', 's1'),
        e('2026-09-01', 's1'),
        e('2026-09-01', 's2'),
        e('2026-09-01', '1', 'subject:c'),
      ],
      TERM_START,
      TODAY,
    );
    expect(counts.get('2026-09-01')).toBe(3);
  });

  it('학기 밖·오늘 뒤 날짜는 세지 않는다', () => {
    const counts = grassDayCounts([e('2026-07-01'), e('2026-12-01')], TERM_START, TODAY);
    expect(counts.size).toBe(0);
  });

  it('진하기 기본 구간 0 / 1~2 / 3~5 / 6+', () => {
    expect([0, 1, 2, 3, 5, 6, 30].map(grassLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('학기 주 목록은 월~금 5칸씩', () => {
    const cols = termWeekdayColumns('2026-08-18', '2026-09-04');
    expect(cols.map((c) => c.weekStart)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
    expect(cols[0]?.days).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ]);
  });
});

describe('연속 주', () => {
  it('이번 주 기록이 있으면 센다', () => {
    const s = computeStreak(
      [e('2026-09-22'), e('2026-09-15'), e('2026-09-08')],
      TODAY,
      TERM_START,
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.streakWeeks).toBe(3);
  });

  it('이번 주에 아직 기록이 없어도 판단하지 않는다 — 지난주까지로 센다', () => {
    const s = computeStreak(
      [e('2026-09-15'), e('2026-09-08')],
      TODAY,
      TERM_START,
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.streakWeeks).toBe(2);
  });

  it('기록 없는 보통 주 한 주는 괜찮다', () => {
    // 9/14 주 비고, 9/7 주·8/31 주 기록
    const s = computeStreak(
      [e('2026-09-22'), e('2026-09-08'), e('2026-09-01')],
      TODAY,
      TERM_START,
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.streakWeeks).toBe(3);
  });

  it('바로 이어진 두 주가 비면 거기서 끊긴다', () => {
    // 9/14·9/7 주 비고 8/31 주 기록 → 이번 주만
    const s = computeStreak(
      [e('2026-09-22'), e('2026-09-01')],
      TODAY,
      TERM_START,
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.streakWeeks).toBe(1);
  });

  it('기록 없는 쉬는 주는 건너뛴다 — 세지도 끊지도 않는다', () => {
    const cal = buildSchoolCalendarDays([
      { title: '중간고사', date: '2026-09-15', group: 'exam' },
      { title: '재량휴업일', date: '2026-09-08', group: 'vacation' },
    ]);
    // 9/14 주(시험)·9/7 주(휴업) 비었지만 쉬는 주 → 8/31 주까지 이어짐
    const s = computeStreak([e('2026-09-22'), e('2026-09-01')], TODAY, TERM_START, cal);
    expect(s.streakWeeks).toBe(2);
  });

  it('쉬는 주를 사이에 둔 두 빈 주는 이어진 것으로 보지 않는다', () => {
    const cal = buildSchoolCalendarDays([{ title: '중간고사', date: '2026-09-08', group: 'exam' }]);
    // 9/14 주 빈 보통 주, 9/7 주 시험(쉬는 주), 8/31 주 빈 보통 주, 8/24 주 기록
    const s = computeStreak([e('2026-09-22'), e('2026-08-25')], TODAY, TERM_START, cal);
    expect(s.streakWeeks).toBe(2);
  });

  it('방학 주를 건너뛰어 학기를 넘어 이어진다', () => {
    const cal = buildSchoolCalendarDays([
      { title: '여름방학', date: '2026-07-25', endDate: '2026-08-16', group: 'vacation' },
    ]);
    const s = computeStreak(
      [e('2026-08-18'), e('2026-07-21'), e('2026-07-14')],
      '2026-08-19',
      '2026-08-18',
      cal,
    );
    expect(s.streakWeeks).toBe(3);
  });

  it('학사일정이 없으면 방학 주도 빈 주로 본다(보정하지 않는다)', () => {
    const s = computeStreak(
      [e('2026-08-18'), e('2026-07-21')],
      '2026-08-19',
      '2026-08-18',
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.streakWeeks).toBe(1);
  });

  it('이번 학기 기록한 주 수를 따로 센다', () => {
    const s = computeStreak(
      [e('2026-07-10'), e('2026-09-01'), e('2026-09-02'), e('2026-09-15')],
      TODAY,
      TERM_START,
      EMPTY_SCHOOL_CALENDAR,
    );
    expect(s.termRecordedWeeks).toBe(2);
    expect(s.termHasRecords).toBe(true);
  });

  it('오늘 뒤 날짜 기록은 세지 않는다', () => {
    const s = computeStreak([e('2026-12-01')], TODAY, TERM_START, EMPTY_SCHOOL_CALENDAR);
    expect(s).toEqual({ streakWeeks: 0, termRecordedWeeks: 0, termHasRecords: false });
  });
});

describe('핀 줄 문구 종류 — 우선순위', () => {
  it('이번 학기 기록이 없으면 지난 학기에서 이어진 연속이 있어도 숫자 없는 한마디', () => {
    expect(pickCheerLine({ streakWeeks: 5, termRecordedWeeks: 0, termHasRecords: false })).toEqual({
      kind: 'firstRecord',
    });
  });

  it('연속이 1주 이상이면 N주째', () => {
    expect(pickCheerLine({ streakWeeks: 1, termRecordedWeeks: 3, termHasRecords: true })).toEqual({
      kind: 'streak',
      weeks: 1,
    });
  });

  it('끊겼으면 이번 학기 기록한 주 — "끊겼어요"는 없다', () => {
    expect(pickCheerLine({ streakWeeks: 0, termRecordedWeeks: 3, termHasRecords: true })).toEqual({
      kind: 'termWeeks',
      weeks: 3,
    });
  });
});
