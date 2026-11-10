import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  findStudentAttendance,
  mergeSingleStudentAttendance,
} from '../../shared/inlineAttendanceEdit';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';

/**
 * Phase D2 (record-viewing-unification) — 수업 조회 출결 인라인 편집.
 * 데이터 안전 hard gate: 한 학생만 편집해도 같은 교시 다른 학생이 절대 유실되지 않는다.
 */
const base: AttendanceRecord = {
  classId: 'c1',
  date: '2026-06-20',
  period: 3,
  students: [
    { number: 1, status: 'absent', reason: '질병', memo: '병결' },
    { number: 5, status: 'late' },
    { number: 9, status: 'earlyLeave', reason: '인정' },
  ],
};

describe('mergeSingleStudentAttendance — 단일 학생 안전 갱신 (D2 hard gate)', () => {
  it('대상 학생만 status/reason/memo가 바뀐다', () => {
    const next = mergeSingleStudentAttendance(base, '5', {
      status: 'absent',
      reason: '미인정',
      memo: '무단',
    });
    const five = next.students.find((s) => s.number === 5)!;
    expect(five.status).toBe('absent');
    expect(five.reason).toBe('미인정');
    expect(five.memo).toBe('무단');
  });

  it('같은 교시 다른 학생 객체는 참조(===)가 불변이다 (통째 교체 저장에서 유실 방지)', () => {
    const next = mergeSingleStudentAttendance(base, '5', { status: 'absent', reason: '질병' });
    // 1번·9번은 원본 객체 그대로(참조 동일)
    expect(next.students[0]).toBe(base.students[0]);
    expect(next.students[2]).toBe(base.students[2]);
    // 대상 5번만 새 객체
    expect(next.students[1]).not.toBe(base.students[1]);
  });

  it('students 배열 길이·순서가 보존된다', () => {
    const next = mergeSingleStudentAttendance(base, '1', { status: 'late' });
    expect(next.students).toHaveLength(3);
    expect(next.students.map((s) => s.number)).toEqual([1, 5, 9]);
  });

  it('classId/groupId/date/period 식별 필드가 보존된다', () => {
    const grouped: AttendanceRecord = { ...base, groupId: 'g1' };
    const next = mergeSingleStudentAttendance(grouped, '1', { status: 'late' });
    expect(next.classId).toBe('c1');
    expect(next.groupId).toBe('g1');
    expect(next.date).toBe('2026-06-20');
    expect(next.period).toBe(3);
  });

  it('present 전환 시 reason/memo가 제거된다 (비출결만 사유·메모)', () => {
    const next = mergeSingleStudentAttendance(base, '1', { status: 'present' });
    const one = next.students.find((s) => s.number === 1)!;
    expect(one.status).toBe('present');
    expect(one.reason).toBeUndefined();
    expect(one.memo).toBeUndefined();
  });

  it('대상 학생이 없으면 원본 students를 그대로 보존한다', () => {
    const next = mergeSingleStudentAttendance(base, '99', { status: 'absent' });
    expect(next.students[0]).toBe(base.students[0]);
    expect(next.students[1]).toBe(base.students[1]);
    expect(next.students[2]).toBe(base.students[2]);
  });
});

/**
 * 번호만 저장된 옛 항목(AI 연결로 넣은 것) — 조회 화면은 그 항목을 명단 학생의 키로 띄운다.
 * 편집도 같은 규칙으로 찾아야 한다. 저장된 키 문자열("7")만 비교하면 화면 키("2-3-7")와
 * 어긋나 편집이 아무 일도 안 하고 "저장했습니다"가 뜬다.
 */
describe('mergeSingleStudentAttendance — 번호만 저장된 옛 항목 편집', () => {
  const roster = [
    { number: 2, grade: 2, classNum: 1 },
    { number: 2, grade: 2, classNum: 3 },
    { number: 7, grade: 2, classNum: 3 },
  ];
  const legacy: AttendanceRecord = {
    classId: 'tc-1',
    date: '2026-11-02',
    period: 3,
    students: [
      { number: 7, status: 'absent' },
      { number: 2, status: 'late', grade: 2, classNum: 1 },
    ],
  };

  it('화면이 띄운 키(학년-반-번호)로 옛 항목을 찾아 그 자리에서 고친다', () => {
    const next = mergeSingleStudentAttendance(
      legacy,
      '2-3-7',
      { status: 'late', reason: '질병' },
      roster,
    );

    // 새 줄을 만들지 않는다 — 길이·순서 그대로, 한 학생이 두 줄이 되지 않는다.
    expect(next.students).toHaveLength(2);
    expect(next.students[0]).toEqual({
      number: 7,
      grade: 2,
      classNum: 3,
      status: 'late',
      reason: '질병',
      memo: undefined,
    });
    // 고친 뒤에는 명단 키로 저장된다.
    expect(studentKey(next.students[0]!)).toBe('2-3-7');
    // 다른 학생은 참조 그대로.
    expect(next.students[1]).toBe(legacy.students[1]);
  });

  it('되돌리기 스냅샷도 같은 규칙으로 찾는다', () => {
    expect(findStudentAttendance(legacy, '2-3-7', roster)?.status).toBe('absent');
    // 명단을 안 넘기면 저장된 키로만 찾는다(예전 동작).
    expect(findStudentAttendance(legacy, '2-3-7')).toBeUndefined();
    expect(findStudentAttendance(legacy, '7')?.status).toBe('absent');
  });

  it('고친 뒤 되돌려도 같은 항목에 적용된다 — 줄이 늘지 않는다', () => {
    const edited = mergeSingleStudentAttendance(legacy, '2-3-7', { status: 'late' }, roster);
    const undone = mergeSingleStudentAttendance(edited, '2-3-7', { status: 'absent' }, roster);

    expect(undone.students).toHaveLength(2);
    expect(undone.students[0]?.status).toBe('absent');
    expect(studentKey(undone.students[0]!)).toBe('2-3-7');
  });

  it('번호가 겹쳐 누구인지 못 정한 항목은 저장된 키("2")로만 고칠 수 있다', () => {
    const ambiguous: AttendanceRecord = {
      ...legacy,
      students: [{ number: 2, status: 'absent' }],
    };

    // 두 2번 학생 어느 쪽 키로도 이 항목을 건드리지 않는다.
    expect(
      mergeSingleStudentAttendance(ambiguous, '2-1-2', { status: 'late' }, roster).students[0],
    ).toBe(ambiguous.students[0]);
    expect(
      mergeSingleStudentAttendance(ambiguous, '2-3-2', { status: 'late' }, roster).students[0],
    ).toBe(ambiguous.students[0]);
    // 조회 화면은 이 항목을 저장된 키("2")로 띄운다 — 그 키로는 고쳐진다.
    const next = mergeSingleStudentAttendance(ambiguous, '2', { status: 'late' }, roster);
    expect(next.students[0]?.status).toBe('late');
    expect(next.students[0]?.grade).toBeUndefined();
  });
});

describe('class record phase 6 — 출결 인라인 편집 배선 (D2 소스 핀)', () => {
  const searchSource = () =>
    readFileSync('src/adapters/components/ClassManagement/ClassRecordSearchView.tsx', 'utf8');

  it('출결 편집이 안전 머지 유틸 + store 원본 재조회 + saveAttendanceRecord 경유로 배선된다', () => {
    const source = searchSource();
    expect(source).toContain('editingAttKey');
    expect(source).toContain('mergeSingleStudentAttendance');
    // 부분 뷰모델이 아니라 store 원본을 그룹반 우선조회로 재조회
    expect(source).toContain('getAttendanceRecord');
    expect(source).toContain('saveAttendanceRecord');
  });

  it('저장 성공 시 되돌리기(undo)를 제공한다', () => {
    expect(searchSource()).toContain('되돌리기');
  });

  it('회귀 가드 — 유니온·filtered 의존성·sub-12px 금지 보존', () => {
    const source = searchSource();
    expect(source).toContain('type MixedRecord = AttendanceMixedRecord | ObservationMixedRecord');
    expect(source).toContain(
      '[mixedRecords, studentFilter, tagFilter, debouncedKeyword, dateRange.start, dateRange.end]',
    );
    expect(source).not.toContain('text-[9px]');
    expect(source).not.toContain('text-[8px]');
    expect(source).not.toContain('text-caption');
  });
});
