import { describe, it, expect } from 'vitest';
import { mergeAttendance } from '../SyncFromCloud';
import { stampChangedRecords } from '@usecases/classManagement/ManageAttendance';
import type { AttendanceData, AttendanceRecord } from '@domain/entities/Attendance';

function rec(
  partial: Partial<AttendanceRecord> & Pick<AttendanceRecord, 'classId' | 'date'>,
): AttendanceRecord {
  return {
    period: 0,
    students: [{ number: 1, status: 'present' }],
    ...partial,
  };
}

describe('mergeAttendance — 출결 레코드 단위 병합', () => {
  it('서로 다른 반/날짜 레코드는 양쪽 모두 보존된다 (통째 덮어쓰기 유실 제거)', () => {
    const local: AttendanceData = {
      records: [rec({ classId: 'A반', date: '2026-07-06', updatedAt: '2026-07-06T08:00:00Z' })],
    };
    const remote: AttendanceData = {
      records: [rec({ classId: 'B반', date: '2026-07-06', updatedAt: '2026-07-06T09:00:00Z' })],
    };
    const merged = mergeAttendance(local, remote, true);
    expect(merged.records).toHaveLength(2);
    expect(merged.records.map((r) => r.classId).sort()).toEqual(['A반', 'B반']);
  });

  it('같은 키(반+날짜+교시)는 updatedAt이 최신인 쪽이 이긴다 — remote 최신', () => {
    const local: AttendanceData = {
      records: [
        rec({
          classId: 'A반',
          date: '2026-07-06',
          students: [{ number: 1, status: 'present' }],
          updatedAt: '2026-07-06T08:00:00Z',
        }),
      ],
    };
    const remote: AttendanceData = {
      records: [
        rec({
          classId: 'A반',
          date: '2026-07-06',
          students: [{ number: 1, status: 'late' }],
          updatedAt: '2026-07-06T09:00:00Z',
        }),
      ],
    };
    const merged = mergeAttendance(local, remote, false);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]!.students[0]!.status).toBe('late');
  });

  it('같은 키에서 local이 최신이면 preferRemote=true여도 local이 이긴다', () => {
    const local: AttendanceData = {
      records: [
        rec({
          classId: 'A반',
          date: '2026-07-06',
          students: [{ number: 1, status: 'absent' }],
          updatedAt: '2026-07-06T10:00:00Z',
        }),
      ],
    };
    const remote: AttendanceData = {
      records: [
        rec({
          classId: 'A반',
          date: '2026-07-06',
          students: [{ number: 1, status: 'present' }],
          updatedAt: '2026-07-06T09:00:00Z',
        }),
      ],
    };
    const merged = mergeAttendance(local, remote, true);
    expect(merged.records[0]!.students[0]!.status).toBe('absent');
  });

  it('양쪽 모두 updatedAt이 없으면(과거 데이터) preferRemote가 판정한다', () => {
    const local: AttendanceData = {
      records: [
        rec({ classId: 'A반', date: '2026-07-06', students: [{ number: 1, status: 'absent' }] }),
      ],
    };
    const remote: AttendanceData = {
      records: [
        rec({ classId: 'A반', date: '2026-07-06', students: [{ number: 1, status: 'late' }] }),
      ],
    };
    expect(mergeAttendance(local, remote, true).records[0]!.students[0]!.status).toBe('late');
    expect(mergeAttendance(local, remote, false).records[0]!.students[0]!.status).toBe('absent');
  });

  it('updatedAt이 있는 쪽이 없는 쪽(과거 데이터)을 이긴다', () => {
    const local: AttendanceData = {
      records: [
        rec({ classId: 'A반', date: '2026-07-06', students: [{ number: 1, status: 'absent' }] }),
      ],
    };
    const remote: AttendanceData = {
      records: [
        rec({
          classId: 'A반',
          date: '2026-07-06',
          students: [{ number: 1, status: 'late' }],
          updatedAt: '2026-07-06T09:00:00Z',
        }),
      ],
    };
    // preferRemote=false여도 스탬프 있는 remote가 승리
    expect(mergeAttendance(local, remote, false).records[0]!.students[0]!.status).toBe('late');
  });

  it('groupId가 다른 레코드는 같은 반/날짜/교시여도 별개 키로 보존된다', () => {
    const local: AttendanceData = {
      records: [rec({ classId: 'A반', date: '2026-07-06', groupId: 'g1' })],
    };
    const remote: AttendanceData = {
      records: [rec({ classId: 'A반', date: '2026-07-06', groupId: 'g2' })],
    };
    const merged = mergeAttendance(local, remote, true);
    expect(merged.records).toHaveLength(2);
  });

  it('로컬이 null(첫 다운로드)이면 리모트 레코드가 전부 채택된다', () => {
    const remote: AttendanceData = {
      records: [
        rec({ classId: 'A반', date: '2026-07-06' }),
        rec({ classId: 'B반', date: '2026-07-05', period: 3 }),
      ],
    };
    expect(mergeAttendance(null, remote, true).records).toHaveLength(2);
  });

  it('리모트가 비어 있으면 로컬 레코드가 전부 보존된다', () => {
    const local: AttendanceData = {
      records: [rec({ classId: 'A반', date: '2026-07-06', updatedAt: '2026-07-06T08:00:00Z' })],
    };
    expect(mergeAttendance(local, { records: [] }, true).records).toHaveLength(1);
  });
});

describe('stampChangedRecords — 저장 시 변경 레코드만 updatedAt 스탬프', () => {
  it('새 레코드에는 updatedAt이 찍힌다', () => {
    const stamped = stampChangedRecords([], [rec({ classId: 'A반', date: '2026-07-06' })]);
    expect(stamped[0]!.updatedAt).toBeDefined();
    expect(new Date(stamped[0]!.updatedAt!).getTime()).not.toBeNaN();
  });

  it('내용이 같은 레코드는 기존 updatedAt을 승계한다 (스탬프 유실 방지)', () => {
    const existing = [
      rec({ classId: 'A반', date: '2026-07-06', updatedAt: '2026-07-01T00:00:00Z' }),
    ];
    // 호출자가 같은 내용으로 새 객체를 만들어 저장하는 상황
    const next = [rec({ classId: 'A반', date: '2026-07-06' })];
    const stamped = stampChangedRecords(existing, next);
    expect(stamped[0]!.updatedAt).toBe('2026-07-01T00:00:00Z');
  });

  it('students 내용이 바뀐 레코드는 새 스탬프를 받는다', () => {
    const existing = [
      rec({ classId: 'A반', date: '2026-07-06', updatedAt: '2026-07-01T00:00:00Z' }),
    ];
    const next = [
      rec({ classId: 'A반', date: '2026-07-06', students: [{ number: 1, status: 'late' }] }),
    ];
    const stamped = stampChangedRecords(existing, next);
    expect(stamped[0]!.updatedAt).not.toBe('2026-07-01T00:00:00Z');
  });

  it('students 순서만 바뀐 저장은 기존 스탬프를 유지한다', () => {
    const existing: AttendanceRecord[] = [
      rec({
        classId: 'A반',
        date: '2026-07-06',
        students: [
          { number: 1, status: 'present' },
          { number: 2, status: 'late' },
        ],
        updatedAt: '2026-07-01T00:00:00Z',
      }),
    ];
    const next: AttendanceRecord[] = [
      rec({
        classId: 'A반',
        date: '2026-07-06',
        students: [
          { number: 2, status: 'late' },
          { number: 1, status: 'present' },
        ],
      }),
    ];
    const stamped = stampChangedRecords(existing, next);
    expect(stamped[0]!.updatedAt).toBe('2026-07-01T00:00:00Z');
  });
});
