import { describe, it, expect } from 'vitest';
import {
  cycleStatus,
  buildAttendanceMatrix,
  summarizeByStudent,
  summarizeByPeriod,
  summarizeTotal,
  pickRepresentativeAttendance,
  validateAttendancePeriods,
} from './attendanceRules';
import type {
  AttendanceRecord,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';

// ── 헬퍼 ────────────────────────────────────────────────────────────
function att(
  number: number,
  status: AttendanceStatus,
  extra: Partial<StudentAttendance> = {},
): StudentAttendance {
  return { number, status, ...extra };
}

function record(
  classId: string,
  date: string,
  period: number,
  students: StudentAttendance[],
): AttendanceRecord {
  return { classId, date, period, students };
}

describe('cycleStatus', () => {
  it('present → absent → late → earlyLeave → classAbsence → present 순환', () => {
    expect(cycleStatus('present')).toBe('absent');
    expect(cycleStatus('absent')).toBe('late');
    expect(cycleStatus('late')).toBe('earlyLeave');
    expect(cycleStatus('earlyLeave')).toBe('classAbsence');
    expect(cycleStatus('classAbsence')).toBe('present');
  });

  it('5번 순환하면 원래 상태로 돌아온다', () => {
    let s: AttendanceStatus = 'present';
    for (let i = 0; i < 5; i++) s = cycleStatus(s);
    expect(s).toBe('present');
  });
});

describe('buildAttendanceMatrix', () => {
  const students = [{ number: 1 }, { number: 2 }, { number: 3 }];

  it('레코드가 전혀 없으면 모든 (학생, 교시) 셀이 undefined', () => {
    const m = buildAttendanceMatrix([], 'c1', '2026-03-02', students, [1, 2]);
    expect(m.size).toBe(3);
    expect(m.get('1')!.get(1)).toBeUndefined();
    expect(m.get('2')!.get(2)).toBeUndefined();
  });

  it('classId / date 가 다른 레코드는 무시한다', () => {
    const recs = [
      record('OTHER', '2026-03-02', 1, [att(1, 'absent')]),
      record('c1', '2026-03-03', 1, [att(1, 'late')]),
      record('c1', '2026-03-02', 1, [att(1, 'absent'), att(2, 'late')]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1]);
    expect(m.get('1')!.get(1)!.status).toBe('absent');
    expect(m.get('2')!.get(1)!.status).toBe('late');
    expect(m.get('3')!.get(1)).toBeUndefined();
  });

  it('같은 교시 레코드가 중복이면 마지막 값을 사용한다', () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'absent')]),
      record('c1', '2026-03-02', 1, [att(1, 'late')]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1]);
    expect(m.get('1')!.get(1)!.status).toBe('late');
  });

  it('학년/반이 명시된 학생은 같은 학년·반·번호만 매칭한다', () => {
    const gradedStudents = [
      { number: 1, grade: 1, classNum: 3 },
      { number: 1, grade: 2, classNum: 5 },
    ];
    const recs = [
      record('c1', '2026-03-02', 1, [
        att(1, 'absent', { grade: 1, classNum: 3 }),
        att(1, 'late', { grade: 2, classNum: 5 }),
      ]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', gradedStudents, [1]);
    expect(m.get('1-3-1')!.get(1)!.status).toBe('absent');
    expect(m.get('2-5-1')!.get(1)!.status).toBe('late');
  });
});

describe('summarize* 집계 함수', () => {
  // 학생1: [absent, late], 학생2: [present, undefined], 학생3: [undefined, classAbsence]
  const recs = [
    record('c1', '2026-03-02', 1, [att(1, 'absent'), att(2, 'present')]),
    record('c1', '2026-03-02', 2, [att(1, 'late'), att(3, 'classAbsence')]),
  ];
  const students = [{ number: 1 }, { number: 2 }, { number: 3 }];
  const matrix = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1, 2]);

  it('summarizeByStudent — 학생별 상태 카운트, undefined 는 세지 않는다', () => {
    const byStudent = summarizeByStudent(matrix);
    expect(byStudent.get('1')).toEqual({
      present: 0,
      absent: 1,
      late: 1,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byStudent.get('2')).toEqual({
      present: 1,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byStudent.get('3')).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('summarizeByPeriod — 교시별 상태 카운트', () => {
    const byPeriod = summarizeByPeriod(matrix);
    expect(byPeriod.get(1)).toEqual({
      present: 1,
      absent: 1,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byPeriod.get(2)).toEqual({
      present: 0,
      absent: 0,
      late: 1,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('summarizeTotal — 전체 합계', () => {
    expect(summarizeTotal(matrix)).toEqual({
      present: 1,
      absent: 1,
      late: 1,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('빈 매트릭스의 합계는 모두 0', () => {
    const empty = buildAttendanceMatrix([], 'c1', '2026-03-02', students, [1]);
    expect(summarizeTotal(empty)).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
  });
});

describe('pickRepresentativeAttendance', () => {
  function pm(
    entries: Record<number, AttendanceStatus | undefined>,
  ): Map<number, StudentAttendance | undefined> {
    const m = new Map<number, StudentAttendance | undefined>();
    for (const [p, s] of Object.entries(entries)) {
      m.set(Number(p), s ? att(1, s) : undefined);
    }
    return m;
  }

  it('전부 undefined 면 undefined', () => {
    expect(pickRepresentativeAttendance(pm({ 1: undefined, 2: undefined }))).toBeUndefined();
  });

  it('present 만 있으면 undefined', () => {
    expect(pickRepresentativeAttendance(pm({ 1: 'present', 2: 'present' }))).toBeUndefined();
  });

  it('심각도 우선순위: absent > earlyLeave > late > classAbsence', () => {
    expect(
      pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late', 3: 'absent' }))!.status,
    ).toBe('absent');
    expect(
      pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late', 3: 'earlyLeave' }))!.status,
    ).toBe('earlyLeave');
    expect(pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late' }))!.status).toBe('late');
    expect(pickRepresentativeAttendance(pm({ 1: 'classAbsence' }))!.status).toBe('classAbsence');
  });

  it('동률(같은 status)이면 가장 이른 교시의 엔트리를 쓴다', () => {
    const m = new Map<number, StudentAttendance | undefined>();
    m.set(5, att(1, 'absent', { memo: '5교시' }));
    m.set(2, att(1, 'absent', { memo: '2교시' }));
    expect(pickRepresentativeAttendance(m)!.memo).toBe('2교시');
  });

  it('present 가 섞여 있어도 무시하고 더 심각한 상태를 고른다', () => {
    expect(
      pickRepresentativeAttendance(pm({ 1: 'present', 2: 'late', 3: 'present' }))!.status,
    ).toBe('late');
  });
});

describe('validateAttendancePeriods', () => {
  const entry = (
    period: number,
    status: AttendancePeriodEntry['status'] = 'absent',
  ): AttendancePeriodEntry => ({
    period,
    status,
  });
  const opts = { regularPeriodCount: 7 };

  it('빈 배열 → EMPTY', () => {
    expect(validateAttendancePeriods([], opts)).toEqual({ code: 'EMPTY' });
  });

  it('정상 입력 → null', () => {
    expect(validateAttendancePeriods([entry(1), entry(3), entry(7)], opts)).toBeNull();
  });

  it('조회(0)·종례(9)는 정규 교시 수와 무관하게 허용', () => {
    expect(
      validateAttendancePeriods([entry(PERIOD_MORNING), entry(PERIOD_CLOSING)], opts),
    ).toBeNull();
  });

  it('정규 교시 범위를 벗어나면 OUT_OF_RANGE', () => {
    expect(validateAttendancePeriods([entry(8)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: 8,
    });
    expect(validateAttendancePeriods([entry(-1)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: -1,
    });
  });

  it('regularPeriodCount 가 더 작으면 그만큼만 허용', () => {
    expect(validateAttendancePeriods([entry(5)], { regularPeriodCount: 4 })).toEqual({
      code: 'OUT_OF_RANGE',
      period: 5,
    });
    expect(validateAttendancePeriods([entry(4)], { regularPeriodCount: 4 })).toBeNull();
  });

  it('status 가 비어 있으면 MISSING_STATUS', () => {
    const bad = { period: 2, status: '' } as unknown as AttendancePeriodEntry;
    expect(validateAttendancePeriods([bad], opts)).toEqual({ code: 'MISSING_STATUS', period: 2 });
  });

  it('교시가 중복되면 DUPLICATE_PERIOD', () => {
    expect(validateAttendancePeriods([entry(1), entry(2), entry(1)], opts)).toEqual({
      code: 'DUPLICATE_PERIOD',
      period: 1,
    });
  });

  it('OUT_OF_RANGE 가 DUPLICATE_PERIOD 보다 먼저 검출된다(앞 엔트리 우선)', () => {
    expect(validateAttendancePeriods([entry(99), entry(99)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: 99,
    });
  });
});
