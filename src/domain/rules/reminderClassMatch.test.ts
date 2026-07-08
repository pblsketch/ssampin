import { describe, it, expect } from 'vitest';
import { detectJustFinishedClass } from './reminderClassMatch';
import type { TeachingClass } from '../entities/TeachingClass';
import type { TeacherScheduleData } from '../entities/Timetable';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { WeekendDay } from '../valueObjects/DayOfWeek';

const periods: PeriodTime[] = [
  { period: 1, start: '09:00', end: '09:50' },
  { period: 2, start: '10:00', end: '10:50' },
  { period: 3, start: '11:00', end: '11:50' },
];

function tc(name: string, subject: string): TeachingClass {
  return {
    id: `tc-${name}`,
    name,
    subject,
    students: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };
}

const classes: TeachingClass[] = [tc('3-2', '국어'), tc('3-5', '국어')];

// 요일 독립 테스트: weekendDays로 토/일도 매핑되게 해 now의 요일과 무관하게 검증.
const WEEKEND: readonly WeekendDay[] = ['토', '일'];
const DAY_KEYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const dayKeyOf = (d: Date): string => DAY_KEYS[d.getDay()]!;

describe('detectJustFinishedClass', () => {
  const now = new Date(2026, 6, 7, 10, 55); // 2교시(10:00~10:50) 방금 끝남
  const dayKey = dayKeyOf(now);

  it('방금 끝난 교시의 수업반을 매핑해 반환', () => {
    const schedule: TeacherScheduleData = {
      [dayKey]: [null, { subject: '국어', classroom: '3-2' }, null],
    };
    expect(detectJustFinishedClass(schedule, classes, periods, now, WEEKEND)?.name).toBe('3-2');
  });

  it('수업 중에는 null (방금 끝난 교시 없음)', () => {
    const during = new Date(2026, 6, 7, 10, 30); // 2교시 진행 중
    const schedule: TeacherScheduleData = {
      [dayKeyOf(during)]: [null, { subject: '국어', classroom: '3-2' }, null],
    };
    expect(detectJustFinishedClass(schedule, classes, periods, during, WEEKEND)).toBeNull();
  });

  it('그 교시가 공강(null 슬롯)이면 null', () => {
    const schedule: TeacherScheduleData = { [dayKey]: [null, null, null] };
    expect(detectJustFinishedClass(schedule, classes, periods, now, WEEKEND)).toBeNull();
  });

  it('교실이 어떤 수업반과도 매핑 안 되면 null (오알림 방지)', () => {
    const schedule: TeacherScheduleData = {
      [dayKey]: [null, { subject: '체육', classroom: '운동장' }, null],
    };
    expect(detectJustFinishedClass(schedule, classes, periods, now, WEEKEND)).toBeNull();
  });

  it('그 요일에 시간표가 없으면 null', () => {
    expect(detectJustFinishedClass({}, classes, periods, now, WEEKEND)).toBeNull();
  });
});
