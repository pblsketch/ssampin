import { describe, it, expect } from 'vitest';
import { EMPTY_SCHOOL_CALENDAR, buildSchoolCalendarDays } from './schoolCalendarDays';
import {
  calendarDaysBetween,
  isSchoolDay,
  lastSchoolDayOfWeek,
  nextSchoolDayAfter,
  schoolDaysOfWeek,
} from './schoolDays';

// 2026-09-21 이 월요일
describe('등교일', () => {
  it('학사일정이 없으면 월~금', () => {
    expect(isSchoolDay('2026-09-21', EMPTY_SCHOOL_CALENDAR)).toBe(true);
    expect(isSchoolDay('2026-09-25', EMPTY_SCHOOL_CALENDAR)).toBe(true);
    expect(isSchoolDay('2026-09-26', EMPTY_SCHOOL_CALENDAR)).toBe(false);
    expect(isSchoolDay('2026-09-27', EMPTY_SCHOOL_CALENDAR)).toBe(false);
    expect(lastSchoolDayOfWeek('2026-09-21', EMPTY_SCHOOL_CALENDAR)).toBe('2026-09-25');
  });

  it('금요일이 공휴일이면 목요일이 그 주 마지막 등교일', () => {
    const cal = buildSchoolCalendarDays([], ['2026-09-25']);
    expect(isSchoolDay('2026-09-25', cal)).toBe(false);
    expect(lastSchoolDayOfWeek('2026-09-21', cal)).toBe('2026-09-24');
  });

  it('방학 날은 등교일이 아니고 시험 날은 등교일이다', () => {
    const cal = buildSchoolCalendarDays(
      [
        { title: '여름방학', date: '2026-07-20', endDate: '2026-08-14', group: 'vacation' },
        { title: '중간고사', date: '2026-10-05', endDate: '2026-10-07', group: 'exam' },
      ],
      [],
    );
    expect(isSchoolDay('2026-07-22', cal)).toBe(false);
    expect(isSchoolDay('2026-10-06', cal)).toBe(true);
    expect(schoolDaysOfWeek('2026-07-20', cal)).toEqual([]);
    expect(lastSchoolDayOfWeek('2026-07-20', cal)).toBeNull();
  });

  it('다음 등교일은 주말·공휴일을 건너뛴다', () => {
    const cal = buildSchoolCalendarDays([], ['2026-09-28']);
    expect(nextSchoolDayAfter('2026-09-25', cal)).toBe('2026-09-29');
    expect(nextSchoolDayAfter('2026-09-25', cal, 2)).toBeNull();
  });

  it('달력 일수', () => {
    expect(calendarDaysBetween('2026-09-25', '2026-10-02')).toBe(7);
    expect(Number.isNaN(calendarDaysBetween('x', '2026-10-02'))).toBe(true);
  });
});
