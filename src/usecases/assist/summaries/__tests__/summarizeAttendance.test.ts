import { describe, expect, it } from 'vitest';
import { summarizeAttendance } from '../summarizeAttendance';
import type { AttendanceRecordLike } from '../summarizeAttendance';

describe('summarizeAttendance', () => {
  it('같은 학급·날짜의 여러 교시 레코드를 상태별로 합산한다', () => {
    const records: AttendanceRecordLike[] = [
      {
        classId: 'c1',
        date: '2026-08-21',
        students: [{ status: 'present' }, { status: 'absent' }, { status: 'late' }],
      },
      {
        classId: 'c1',
        date: '2026-08-21',
        students: [{ status: 'present' }, { status: 'earlyLeave' }],
      },
      // 다른 학급/날짜는 집계 대상 아님
      { classId: 'c2', date: '2026-08-21', students: [{ status: 'absent' }] },
      { classId: 'c1', date: '2026-08-20', students: [{ status: 'absent' }] },
    ];

    const result = summarizeAttendance(records, {
      classId: 'c1',
      className: '1학년 2반',
      date: '2026-08-21',
    });

    expect(result).toEqual({
      date: '2026-08-21',
      className: '1학년 2반',
      present: 2,
      absent: 1,
      late: 1,
      early: 1,
      classAbsence: 0,
    });
  });

  it('빈 배열이면 예외 없이 전부 0을 반환한다', () => {
    const result = summarizeAttendance([], {
      classId: 'c1',
      className: '1학년 2반',
      date: '2026-08-21',
    });

    expect(result).toEqual({
      date: '2026-08-21',
      className: '1학년 2반',
      present: 0,
      absent: 0,
      late: 0,
      early: 0,
      classAbsence: 0,
    });
  });

  it('반환 객체에 스키마 밖 키가 없다', () => {
    const result = summarizeAttendance([], {
      classId: 'c1',
      className: '1학년 2반',
      date: '2026-08-21',
    });

    expect(Object.keys(result).sort()).toEqual(
      ['absent', 'classAbsence', 'className', 'date', 'early', 'late', 'present'].sort(),
    );
  });
});
