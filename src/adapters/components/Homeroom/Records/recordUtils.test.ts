/**
 * recordUtils 회귀 메타테스트.
 *
 * 본 테스트는 `createDateRange` 가 `enumerateRange` 로 위임된 후에도
 * 기존 호출 시그니처와 결과가 동일함을 보장한다 (Plan FR-13 회귀 방지).
 */
import { describe, expect, it } from 'vitest';
import {
  createDateRange,
  formatDateKR,
  formatDateRangeKR,
  sortRecordsInDateGroup,
} from './recordUtils';
import { enumerateRange } from '@adapters/components/common/calendarUtils';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';

describe('createDateRange (compat alias)', () => {
  it('enumerateRange 와 동일한 결과 — inclusive 범위', () => {
    expect(createDateRange('2026-05-01', '2026-05-05')).toEqual(
      enumerateRange('2026-05-01', '2026-05-05'),
    );
  });

  it('start === end → 1일 배열', () => {
    expect(createDateRange('2026-05-05', '2026-05-05')).toEqual(['2026-05-05']);
  });

  it('start > end → 빈 배열 (기존 동작 호환)', () => {
    // 기존 createDateRange 는 d <= endDate 조건이 시작부터 거짓이라 [] 반환했음.
    expect(createDateRange('2026-05-10', '2026-05-05')).toEqual([]);
  });

  it('월 경계 건너뛰기', () => {
    expect(createDateRange('2026-04-29', '2026-05-02')).toEqual([
      '2026-04-29',
      '2026-04-30',
      '2026-05-01',
      '2026-05-02',
    ]);
  });

  it('30일 범위 정확 길이', () => {
    expect(createDateRange('2026-05-01', '2026-05-30')).toHaveLength(30);
  });
});

describe('recordUtils date labels', () => {
  it('keeps current-year dates short', () => {
    expect(formatDateKR('2026-06-22', new Date('2026-06-23T00:00:00'))).toBe('6월 22일');
  });

  it('shows the year for non-current-year records', () => {
    expect(formatDateKR('2025-06-22', new Date('2026-06-23T00:00:00'))).toBe('2025년 6월 22일');
  });

  it('shows both years when a range crosses years', () => {
    expect(formatDateRangeKR('2025-06-01', '2026-05-23')).toBe('2025년 6월 1일 ~ 2026년 5월 23일');
  });
});

describe('sortRecordsInDateGroup', () => {
  const students: readonly Student[] = [
    { id: 's1', name: '김민지', studentNumber: 1 },
    { id: 's2', name: '이서연', studentNumber: 2 },
    { id: 's5', name: '정수빈', studentNumber: 5 },
  ];
  const studentMap = new Map(students.map((student) => [student.id, student]));

  const record = (
    id: string,
    studentId: string,
    subcategory: string,
    createdAt: string,
    attendancePeriods?: StudentRecord['attendancePeriods'],
  ): StudentRecord => ({
    id,
    studentId,
    category: attendancePeriods ? 'attendance' : 'life',
    subcategory,
    content: '',
    date: '2026-06-22',
    createdAt,
    ...(attendancePeriods ? { attendancePeriods } : {}),
  });

  it('최근 일시는 입력 시간이 아니라 같은 날짜 안의 늦은 교시를 먼저 둔다', () => {
    const records = [
      record('early-saved-late-event', 's5', '지각 (질병)', '2026-06-22T01:00:00.000Z', [
        { period: 7, status: 'late', reason: '질병' },
      ]),
      record('late-saved-early-event', 's2', '지각 (질병)', '2026-06-22T09:00:00.000Z', [
        { period: 1, status: 'late', reason: '질병' },
      ]),
    ];

    expect(sortRecordsInDateGroup(records, 'occurredAt', studentMap).map((r) => r.id)).toEqual([
      'early-saved-late-event',
      'late-saved-early-event',
    ]);
  });

  it('같은 날짜에 실제 시간 단서가 없으면 학번순으로 안정 정렬한다', () => {
    const records = [
      record('student-5', 's5', '칭찬', '2026-06-22T01:00:00.000Z'),
      record('student-1', 's1', '칭찬', '2026-06-22T09:00:00.000Z'),
    ];

    expect(sortRecordsInDateGroup(records, 'occurredAt', studentMap).map((r) => r.id)).toEqual([
      'student-1',
      'student-5',
    ]);
  });

  it('유형별은 결석, 지각 순서로 묶고 같은 유형은 학번순으로 둔다', () => {
    const records = [
      record('late', 's1', '지각 (질병)', '2026-06-22T01:00:00.000Z', [
        { period: 1, status: 'late', reason: '질병' },
      ]),
      record('absent-5', 's5', '결석 (질병)', '2026-06-22T02:00:00.000Z', [
        { period: 1, status: 'absent', reason: '질병' },
      ]),
      record('absent-2', 's2', '결석 (질병)', '2026-06-22T03:00:00.000Z', [
        { period: 1, status: 'absent', reason: '질병' },
      ]),
    ];

    expect(sortRecordsInDateGroup(records, 'type', studentMap).map((r) => r.id)).toEqual([
      'absent-2',
      'absent-5',
      'late',
    ]);
  });
});
