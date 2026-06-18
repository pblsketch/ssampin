import { describe, it, expect } from 'vitest';
import { autoDetectColumns, parseScoreRows } from './gradeImportRules';

describe('autoDetectColumns', () => {
  it('헤더 0행: 번호/성명/원점수 감지', () => {
    const rows = [
      ['번호', '성명', '원점수'],
      [1, '홍길동', 90],
    ];
    expect(autoDetectColumns(rows)).toEqual({ num: 0, name: 1, score: 2, headerRow: 0 });
  });

  it('제목 행이 위에 있어도 헤더 행을 찾는다', () => {
    const rows = [['2학년 3반 성적'], [], ['연번', '이름', '점수', '비고'], [1, '김철수', 80, '']];
    expect(autoDetectColumns(rows)).toEqual({ num: 0, name: 1, score: 2, headerRow: 2 });
  });

  it('점수는 부분일치(취득점수)', () => {
    const rows = [['성명', '취득점수']];
    expect(autoDetectColumns(rows)).toEqual({ num: -1, name: 0, score: 1, headerRow: 0 });
  });

  it('점수 열이 없으면 null', () => {
    const rows = [['번호', '성명', '비고']];
    expect(autoDetectColumns(rows)).toBeNull();
  });
});

describe('parseScoreRows', () => {
  const cols = { num: 0, name: 1, score: 2, headerRow: 0 };

  it('데이터행 파싱 + 숫자 변환', () => {
    const rows = [
      ['번호', '성명', '원점수'],
      [1, '홍길동', 90],
      ['2', '김철수', '85'],
    ];
    expect(parseScoreRows(rows, cols)).toEqual([
      { number: 1, name: '홍길동', score: 90 },
      { number: 2, name: '김철수', score: 85 },
    ]);
  });

  it('빈 점수는 null, 빈 행은 건너뜀', () => {
    const rows = [
      ['번호', '성명', '원점수'],
      [3, '이영희', ''],
      ['', '', ''],
      [4, '박민수', 70],
    ];
    expect(parseScoreRows(rows, cols)).toEqual([
      { number: 3, name: '이영희', score: null },
      { number: 4, name: '박민수', score: 70 },
    ]);
  });
});
