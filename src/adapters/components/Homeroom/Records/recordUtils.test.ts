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
  getRecordChipLabel,
  docCompletionCellView,
} from './recordUtils';
import { enumerateRange } from '@adapters/components/common/calendarUtils';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';

describe('getRecordChipLabel (Q2 표시 칩 라벨)', () => {
  const cats = DEFAULT_RECORD_CATEGORIES;
  it('출결은 subcategory 그대로', () => {
    expect(getRecordChipLabel({ category: 'attendance', subcategory: '결석 (질병)' }, cats)).toBe(
      '결석 (질병)',
    );
  });
  it('비출결 + 태그 → 가운뎃점 결합', () => {
    expect(
      getRecordChipLabel({ category: 'life', subcategory: '일반', tags: ['칭찬', '성실'] }, cats),
    ).toBe('칭찬 · 성실');
  });
  it('비출결 + 태그 없음 → 카테고리명 fallback(subcategory 미노출)', () => {
    expect(getRecordChipLabel({ category: 'counseling', subcategory: '일반' }, cats)).toBe(
      '상담 / 관계',
    );
  });
});

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

describe('docCompletionCellView (M4+N1 — 서류 열 분모·색·빈 가드 세트)', () => {
  it('요구 서류 전부 제출한 학생은 주황이 아닌 완료 톤(녹색)', () => {
    // 전체 출결 10건이어도 요구 3건 전부 제출이면 완료 — 분모가 attendanceTotal이면 생기던 오표시 방지
    const v = docCompletionCellView(3, 3);
    expect(v.text).toBe('3/3');
    expect(v.toneClass).toContain('text-green-400');
    expect(v.toneClass).not.toContain('orange');
  });

  it("요구 0건인 학생은 '0/0'이 아니라 '-'", () => {
    expect(docCompletionCellView(0, 0).text).toBe('-');
  });

  it('요구 대비 미제출이 남아 있으면 미완료 톤(주황)', () => {
    const v = docCompletionCellView(1, 3);
    expect(v.text).toBe('1/3');
    expect(v.toneClass).toContain('text-orange-400');
  });
});
