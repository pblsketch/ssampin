import { describe, it, expect } from 'vitest';
import { updateAttendancePeriods } from './UpdateAttendancePeriods';
import type { StudentRecord } from '@domain/entities/StudentRecord';

/**
 * M6 불변식 — 인라인 편집(updateAttendancePeriods) 경로에서 서류 종류 체크(documents)와
 * documentSubmitted(boolean)의 정합:
 * - boolean이 실제로 바뀔 때만 documents 전 종류를 같은 상태로 동기화한다.
 * - 값이 그대로면(내용만 편집 등) 부분 체크리스트를 건드리지 않는다.
 * - 그리드 재저장 승계(bridgeHomeroomDayAttendance)와 함께 "체크 상세 조용한 소실" 방지.
 */
const baseRecord = (extra: Partial<StudentRecord> = {}): StudentRecord => ({
  id: 'att-stu-1-2026-07-13',
  studentId: 'stu-1',
  category: 'attendance',
  subcategory: '결석 (인정)',
  content: '',
  date: '2026-07-13',
  createdAt: '2026-07-13T00:00:00.000Z',
  attendancePeriods: [{ period: 1, status: 'absent', reason: '인정' }],
  ...extra,
});

const partialDocs = [
  { kind: '신청서', submitted: true },
  { kind: '보고서', submitted: false },
  { kind: '증빙자료', submitted: false },
];

describe('updateAttendancePeriods × documents 불변식 (M6)', () => {
  it('documentSubmitted가 변하지 않으면 부분 체크리스트를 그대로 보존한다', () => {
    const { record } = updateAttendancePeriods({
      record: baseRecord({ documents: partialDocs, documentSubmitted: false }),
      nextPeriods: [{ period: 2, status: 'absent', reason: '인정' }],
      content: '내용만 수정',
      documentSubmitted: false, // 인라인 편집기가 기존 값을 그대로 넘기는 케이스
      regularPeriodCount: 7,
    });
    expect(record.documents).toEqual(partialDocs);
    expect(record.documentSubmitted).toBe(false);
  });

  it('documentSubmitted를 true로 뒤집으면 documents 전 종류가 제출로 동기화된다', () => {
    const { record } = updateAttendancePeriods({
      record: baseRecord({ documents: partialDocs, documentSubmitted: false }),
      nextPeriods: [{ period: 1, status: 'absent', reason: '인정' }],
      content: '',
      documentSubmitted: true,
      regularPeriodCount: 7,
    });
    expect(record.documentSubmitted).toBe(true);
    expect(record.documents!.every((d) => d.submitted)).toBe(true);
  });

  it('documentSubmitted를 false로 뒤집으면 documents 전 종류가 미제출로 동기화된다', () => {
    const allDone = partialDocs.map((d) => ({ ...d, submitted: true }));
    const { record } = updateAttendancePeriods({
      record: baseRecord({ documents: allDone, documentSubmitted: true }),
      nextPeriods: [{ period: 1, status: 'absent', reason: '인정' }],
      content: '',
      documentSubmitted: false,
      regularPeriodCount: 7,
    });
    expect(record.documentSubmitted).toBe(false);
    expect(record.documents!.every((d) => !d.submitted)).toBe(true);
  });

  it('documents가 없는 구 데이터는 boolean만 갱신되고 documents가 생기지 않는다', () => {
    const { record } = updateAttendancePeriods({
      record: baseRecord({ documentSubmitted: false }),
      nextPeriods: [{ period: 1, status: 'absent', reason: '인정' }],
      content: '',
      documentSubmitted: true,
      regularPeriodCount: 7,
    });
    expect(record.documentSubmitted).toBe(true);
    expect(record.documents).toBeUndefined();
  });
});
