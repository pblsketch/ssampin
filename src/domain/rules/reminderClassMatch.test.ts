import { describe, it, expect } from 'vitest';
import { detectJustFinishedClass } from './reminderClassMatch';
import type { TeachingClass } from '../entities/TeachingClass';
import type { TeacherPeriod } from '../entities/Timetable';
import type { PeriodTime } from '../valueObjects/PeriodTime';

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

// daySlots: 그 날의 교시별 배열(0-based). 2교시에 국어 3-2.
const daySlots: readonly (TeacherPeriod | null)[] = [
  null,
  { subject: '국어', classroom: '3-2' },
  null,
];

describe('detectJustFinishedClass', () => {
  const now = new Date(2026, 6, 7, 10, 55); // 2교시(10:00~10:50) 방금 끝남

  it('방금 끝난 교시의 수업반을 매핑해 반환', () => {
    expect(detectJustFinishedClass(daySlots, classes, periods, now)?.name).toBe('3-2');
  });

  it('수업 중에는 null (방금 끝난 교시 없음)', () => {
    const during = new Date(2026, 6, 7, 10, 30); // 2교시 진행 중
    expect(detectJustFinishedClass(daySlots, classes, periods, during)).toBeNull();
  });

  it('그 교시가 공강(null 슬롯)이면 null', () => {
    expect(detectJustFinishedClass([null, null, null], classes, periods, now)).toBeNull();
  });

  it('교실이 어떤 수업반과도 매핑 안 되면 null (오알림 방지)', () => {
    const other: readonly (TeacherPeriod | null)[] = [
      null,
      { subject: '체육', classroom: '운동장' },
      null,
    ];
    expect(detectJustFinishedClass(other, classes, periods, now)).toBeNull();
  });

  it('빈 배열(그 날 시간표 없음)이면 null', () => {
    expect(detectJustFinishedClass([], classes, periods, now)).toBeNull();
  });
});
