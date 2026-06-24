/**
 * mapExcelEvidenceRows — 엑셀 행 → 근거 매핑 검증.
 */
import { describe, it, expect } from 'vitest';
import {
  mapExcelEvidenceRows,
  type ImportRosterStudent,
  type ParsedEvidenceRow,
} from './importEvidenceFromExcel';

const STUDENTS: ImportRosterStudent[] = [
  { studentRef: 's1', number: 1, name: '김민지' },
  { studentRef: 's2', number: 2, name: '이서연' },
  { studentRef: 's3', number: 3, name: '박지민' },
  // 동명이인(성명 폴백 모호성 테스트용)
  { studentRef: 's4', number: 4, name: '박지민' },
];

function row(
  p: Partial<ParsedEvidenceRow> & Pick<ParsedEvidenceRow, 'rowNumber' | 'content'>,
): ParsedEvidenceRow {
  return p;
}

describe('mapExcelEvidenceRows', () => {
  it('식별키로 정확히 매칭하고 줄바꿈을 줄마다 별도 근거로 분리한다', () => {
    const res = mapExcelEvidenceRows(
      [
        row({
          rowNumber: 2,
          studentRef: 's1',
          content: '첫째 줄 관찰\n둘째 줄 관찰',
          date: '2026-06-24',
        }),
      ],
      STUDENTS,
    );
    expect(res.errors).toHaveLength(0);
    expect(res.matchedRows).toBe(1);
    expect(res.items).toHaveLength(2);
    expect(res.items.map((i) => i.content)).toEqual(['첫째 줄 관찰', '둘째 줄 관찰']);
    expect(res.items.every((i) => i.studentRef === 's1')).toBe(true);
    expect(res.items[0]!.date).toBe('2026-06-24');
  });

  it('식별키가 없으면 번호로 매칭한다', () => {
    const res = mapExcelEvidenceRows(
      [row({ rowNumber: 2, studentNumber: 2, content: '관찰' })],
      STUDENTS,
    );
    expect(res.errors).toHaveLength(0);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.studentRef).toBe('s2');
  });

  it('식별키·번호가 없고 성명이 유일하면 성명으로 매칭한다', () => {
    const res = mapExcelEvidenceRows(
      [row({ rowNumber: 2, name: '이서연', content: '관찰' })],
      STUDENTS,
    );
    expect(res.items[0]!.studentRef).toBe('s2');
  });

  it('동명이인은 성명만으로 매칭하지 않고 오류로 보고한다(임의 배정 금지)', () => {
    const res = mapExcelEvidenceRows(
      [row({ rowNumber: 2, name: '박지민', content: '관찰' })],
      STUDENTS,
    );
    expect(res.items).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.rowNumber).toBe(2);
  });

  it('매칭 실패 행은 오류로만 보고하고 다른 행은 정상 처리한다(부분 성공)', () => {
    const res = mapExcelEvidenceRows(
      [
        row({ rowNumber: 2, studentNumber: 99, content: '없는 학생' }),
        row({ rowNumber: 3, studentRef: 's1', content: '정상' }),
      ],
      STUDENTS,
    );
    expect(res.errors).toHaveLength(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.studentRef).toBe('s1');
  });

  it('빈 줄만 있는 내용은 오류로 보고한다', () => {
    const res = mapExcelEvidenceRows(
      [row({ rowNumber: 2, studentRef: 's1', content: '   \n  ' })],
      STUDENTS,
    );
    expect(res.items).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
  });
});
