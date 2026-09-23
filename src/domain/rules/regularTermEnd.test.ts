import { describe, it, expect } from 'vitest';
import type { ObservationEntry } from './observationEntries';
import { computeStreak } from './observationStreak';
import { buildTermTails, resolveRegularTermEnd } from './regularTermEnd';
import { buildSchoolCalendarDays, isRestWeek, type SchoolCalendarDays } from './schoolCalendarDays';

/** 겨울방학이 2월까지 이어지는 학교 */
const TYPE_A = [
  { date: '2027-01-06', title: '겨울방학식' },
  { date: '2027-01-06', title: '종업식' },
];
/** 겨울방학 뒤 잠깐 등교했다가 봄방학하는 학교 */
const TYPE_B = [
  { date: '2026-12-31', title: '겨울방학식' },
  { date: '2027-02-19', title: '종업식' },
  { date: '2027-02-19', title: '봄방학식' },
];

describe('정규 수업 종료일', () => {
  it('등록한 학기 종료일이 먼저다', () => {
    expect(resolveRegularTermEnd('2026-2', { '2026-2': '2026-12-24' }, TYPE_B)).toBe('2026-12-24');
  });

  it('겨울방학이 2월까지 이어지는 학교 — 겨울방학 직전', () => {
    expect(resolveRegularTermEnd('2026-2', undefined, TYPE_A)).toBe('2027-01-06');
  });

  it('겨울방학 뒤 잠깐 등교하는 학교도 겨울방학 직전(종업식이 아니다)', () => {
    expect(resolveRegularTermEnd('2026-2', undefined, TYPE_B)).toBe('2026-12-31');
  });

  it('등록값도 학사일정 후보도 없으면 null', () => {
    expect(resolveRegularTermEnd('2026-2', undefined, [])).toBeNull();
    expect(resolveRegularTermEnd('2026-2', { '2026-2': '잘못' }, [])).toBeNull();
  });

  it('종료일 뒤 구간 — 종료일을 모르거나 학기 끝 이후면 뺀다', () => {
    const tails = buildTermTails(
      [
        { term: '2026-2', lastDay: '2027-03-01' },
        { term: '2026-1', lastDay: '2026-08-17' },
        { term: '2025-2', lastDay: null },
      ],
      { '2026-1': '2026-07-17' },
      TYPE_B,
    );
    expect(tails).toEqual([
      { after: '2026-12-31', until: '2027-03-01' },
      { after: '2026-07-17', until: '2026-08-17' },
    ]);
  });
});

describe('정규 수업 종료일 뒤 등교 주는 쉬는 주', () => {
  // 방학 2027-01-01~01-31, 2월 1~19일 등교, 2/20~3/1 봄방학
  const events = [
    { title: '겨울방학', date: '2027-01-01', endDate: '2027-01-31', group: 'vacation' as const },
    { title: '봄방학', date: '2027-02-20', endDate: '2027-03-01', group: 'vacation' as const },
  ];
  const withTails = (): SchoolCalendarDays => ({
    ...buildSchoolCalendarDays(events, []),
    termTails: buildTermTails([{ term: '2026-2', lastDay: '2027-03-01' }], undefined, TYPE_B),
  });

  it('2월 등교 주가 쉬는 주로 잡힌다 — 종료일이 든 주는 아니다', () => {
    const cal = withTails();
    expect(isRestWeek('2027-02-01', cal)).toBe(true);
    expect(isRestWeek('2027-02-08', cal)).toBe(true);
    expect(isRestWeek('2026-12-28', cal)).toBe(true); // 방학 날이 낀 주(기존 규칙)
    expect(isRestWeek('2026-12-21', cal)).toBe(false);
    expect(isRestWeek('2027-02-01', buildSchoolCalendarDays(events, []))).toBe(false);
  });

  it('2월에 기록이 없어도 연속이 끊기지 않는다', () => {
    const entries: ObservationEntry[] = [
      '2026-12-07',
      '2026-12-14',
      '2026-12-21',
      '2026-12-29',
      '2027-03-03',
    ].map((date) => ({ card: 'homeroom', ref: 's1', date, createdAt: 0, id: date }));
    const without = computeStreak(
      entries,
      '2027-03-04',
      '2027-03-02',
      buildSchoolCalendarDays(events, []),
    );
    const withT = computeStreak(entries, '2027-03-04', '2027-03-02', withTails());
    expect(without.streakWeeks).toBe(1);
    expect(withT.streakWeeks).toBe(5);
  });
});
