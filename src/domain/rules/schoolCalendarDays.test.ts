import { describe, it, expect } from 'vitest';
import {
  EMPTY_SCHOOL_CALENDAR,
  addDaysExcludingVacation,
  buildSchoolCalendarDays,
  daysBetweenExcludingVacation,
  isRestWeek,
  isVacationDay,
  weekStartOf,
} from './schoolCalendarDays';

describe('방학 날', () => {
  it('여러 날 방학 일정은 끝날까지 모두 방학 날이다', () => {
    const cal = buildSchoolCalendarDays([
      { title: '여름방학', date: '2026-07-24', endDate: '2026-07-27', group: 'vacation' },
    ]);
    expect(
      ['2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27'].every((d) => isVacationDay(cal, d)),
    ).toBe(true);
    expect(isVacationDay(cal, '2026-07-28')).toBe(false);
  });

  it('방학식·종업식은 등교일이라 방학 날이 아니다(뒤에 글자가 붙어도)', () => {
    const cal = buildSchoolCalendarDays([
      { title: '여름방학식(1~2학년)', date: '2026-07-23', group: 'vacation' },
      { title: '종업식 및 방과후 안내', date: '2027-02-10', group: 'vacation' },
    ]);
    expect(isVacationDay(cal, '2026-07-23')).toBe(false);
    expect(isVacationDay(cal, '2027-02-10')).toBe(false);
  });

  it('끝날이 시작일보다 앞이거나 없으면 하루만 덮는다', () => {
    const cal = buildSchoolCalendarDays([
      { title: '재량휴업일', date: '2026-10-02', endDate: '2026-09-01', group: 'vacation' },
    ]);
    expect([...cal.vacationDays]).toEqual(['2026-10-02']);
  });
});

describe('방학 날을 뺀 날수', () => {
  const cal = buildSchoolCalendarDays([
    { title: '여름방학', date: '2026-07-24', endDate: '2026-08-17', group: 'vacation' },
  ]);

  it('학사일정이 없으면 달력 날짜 그대로다', () => {
    expect(daysBetweenExcludingVacation('2026-07-20', '2026-08-18', EMPTY_SCHOOL_CALENDAR)).toBe(
      29,
    );
  });

  it('방학 25일을 빼고 센다 — 개학 첫날 종이 한꺼번에 붙지 않는다', () => {
    // 7/21~8/18 = 29일 중 7/24~8/17 = 25일이 방학
    expect(daysBetweenExcludingVacation('2026-07-20', '2026-08-18', cal)).toBe(4);
  });

  it('같은 날이거나 앞이면 0', () => {
    expect(daysBetweenExcludingVacation('2026-09-01', '2026-09-01', cal)).toBe(0);
    expect(daysBetweenExcludingVacation('2026-09-05', '2026-09-01', cal)).toBe(0);
  });

  it('방학 날을 건너뛰며 날을 더한다', () => {
    expect(addDaysExcludingVacation('2026-07-22', 3, cal)).toBe('2026-08-19');
    expect(addDaysExcludingVacation('2026-09-01', 14, EMPTY_SCHOOL_CALENDAR)).toBe('2026-09-15');
  });
});

describe('쉬는 주', () => {
  it('월요일을 주의 시작으로 본다', () => {
    expect(weekStartOf('2026-09-23')).toBe('2026-09-21'); // 수
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21'); // 일
    expect(weekStartOf('2026-09-21')).toBe('2026-09-21'); // 월
  });

  it('방학 날이 하루라도 있으면 쉬는 주', () => {
    const cal = buildSchoolCalendarDays([
      { title: '겨울방학', date: '2026-12-31', group: 'vacation' },
    ]);
    expect(isRestWeek(weekStartOf('2026-12-31'), cal)).toBe(true);
  });

  it('시험·평가 일정이 있으면 쉬는 주', () => {
    const cal = buildSchoolCalendarDays([
      { title: '2학기 중간고사', date: '2026-10-14', group: 'exam' },
    ]);
    expect(isRestWeek(weekStartOf('2026-10-14'), cal)).toBe(true);
    expect(isRestWeek(weekStartOf('2026-10-21'), cal)).toBe(false);
  });

  it('평일이 모두 공휴일인 주는 쉬는 주(추석 연휴 등)', () => {
    const holidays = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
    const cal = buildSchoolCalendarDays([], holidays);
    expect(isRestWeek('2026-09-28', cal)).toBe(true);
    const partial = buildSchoolCalendarDays([], holidays.slice(0, 3));
    expect(isRestWeek('2026-09-28', partial)).toBe(false);
  });

  it('학사일정이 없으면 쉬는 주가 없다', () => {
    expect(isRestWeek('2026-08-03', EMPTY_SCHOOL_CALENDAR)).toBe(false);
  });
});
