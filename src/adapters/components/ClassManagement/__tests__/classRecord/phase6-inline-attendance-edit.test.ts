import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeSingleStudentAttendance } from '../../shared/inlineAttendanceEdit';
import type { AttendanceRecord } from '@domain/entities/Attendance';

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
