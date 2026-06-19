import { describe, it, expect } from 'vitest';
import {
  detectTranscriptLayout,
  parseTranscriptRows,
  parseAchievementCell,
  parseScoreCell,
  parseRankCell,
  fieldOf,
  type TranscriptGrid,
} from './neisTranscriptImportRules';

/** 매트릭스형(2행 병합 헤더) — 과목명이 블록 전 칸에 채워진 형태(NEIS/exceljs 실측). */
function matrixGrid(): TranscriptGrid {
  const fields = ['원점수', '과목평균', '표준편차', '성취도', '수강자수', '석차', '석차등급'];
  const subjects = ['국어', '수학'];
  const top: unknown[] = ['', ''];
  const sub: unknown[] = ['번호', '성명'];
  for (const s of subjects) {
    for (let i = 0; i < fields.length; i += 1) {
      top.push(s);
      sub.push(fields[i]);
    }
  }
  return [
    ['2026학년도 1학기 성적 일람표 (1학년 3반)'],
    top,
    sub,
    // 강민준: 국어 92/A/석차18/1등급, 수학 64/D/석차150/4등급
    [1, '강민준', 92, 71.2, 14.3, 'A', 250, 18, 1, 64, 68.4, 15.1, 'D', 250, 150, 4],
    [2, '김서윤', 78, 71.2, 14.3, 'C', 250, 95, 3, 88, 68.4, 15.1, 'B', 250, 40, 2],
    [], // 빈 행
  ];
}

describe('fieldOf', () => {
  it('석차등급과 석차를 구분한다', () => {
    expect(fieldOf('석차등급')).toBe('석차등급');
    expect(fieldOf('석차')).toBe('석차');
    expect(fieldOf('석차(동석차수)')).toBe('석차');
  });
  it('성취도와 성취도별 분포비율을 구분한다', () => {
    expect(fieldOf('성취도')).toBe('성취도');
    expect(fieldOf('성취도(수강자수)')).toBe('성취도');
    expect(fieldOf('성취도별 분포비율')).toBeNull();
  });
  it('원점수/과목평균/표준편차/수강자수', () => {
    expect(fieldOf('원점수')).toBe('원점수');
    expect(fieldOf('과목평균')).toBe('과목평균');
    expect(fieldOf('표준편차')).toBe('표준편차');
    expect(fieldOf('수강자수')).toBe('수강자수');
  });
});

describe('결합 셀 분해', () => {
  it('성취도(수강자수): "B(250)"', () => {
    expect(parseAchievementCell('B(250)')).toEqual({ achievement: 'B', totalStudents: 250 });
    expect(parseAchievementCell('A')).toEqual({ achievement: 'A', totalStudents: undefined });
    expect(parseAchievementCell('')).toEqual({});
  });
  it('원점수/과목평균(표준편차): "85/72.3(12.1)"', () => {
    expect(parseScoreCell('85/72.3(12.1)')).toEqual({
      rawScore: 85,
      subjectMean: 72.3,
      stdDev: 12.1,
    });
    expect(parseScoreCell('90')).toEqual({ rawScore: 90 });
    expect(parseScoreCell(88)).toEqual({ rawScore: 88 });
  });
  it('석차(동석차수): "10/1"', () => {
    expect(parseRankCell('10/1')).toEqual({ rank: 10, tieCount: 1 });
    expect(parseRankCell('7')).toEqual({ rank: 7 });
  });
});

describe('detectTranscriptLayout', () => {
  it('헤더 행/식별 열/과목 블록을 인식한다', () => {
    const layout = detectTranscriptLayout(matrixGrid());
    expect(layout).not.toBeNull();
    expect(layout!.headerRow).toBe(2);
    expect(layout!.numCol).toBe(0);
    expect(layout!.nameCol).toBe(1);
    expect(layout!.subjects.map((s) => s.subject)).toEqual(['국어', '수학']);
    expect(layout!.subjects[0]!.cols['원점수']).toBe(2);
    expect(layout!.subjects[0]!.cols['석차등급']).toBe(8);
    expect(layout!.subjects[1]!.cols['원점수']).toBe(9);
  });

  it('헤더가 없으면 null', () => {
    expect(
      detectTranscriptLayout([
        ['그냥', '텍스트'],
        [1, 2],
      ]),
    ).toBeNull();
  });
});

describe('parseTranscriptRows', () => {
  it('학생별 전과목 행을 만든다(기관 산출값 보존)', () => {
    const grid = matrixGrid();
    const layout = detectTranscriptLayout(grid)!;
    const students = parseTranscriptRows(grid, layout, { term: '2026 1학기' });

    expect(students).toHaveLength(2);
    const a = students[0]!;
    expect(a.studentKey).toBe('1');
    expect(a.studentName).toBe('강민준');
    expect(a.term).toBe('2026 1학기');
    expect(a.subjects).toHaveLength(2);

    const kor = a.subjects.find((s) => s.subject === '국어')!;
    expect(kor.category).toBe('국어');
    expect(kor.rawScore).toBe(92);
    expect(kor.subjectMean).toBe(71.2);
    expect(kor.stdDev).toBe(14.3);
    expect(kor.achievement).toBe('A');
    expect(kor.totalStudents).toBe(250);
    expect(kor.rank).toBe(18);
    expect(kor.tieCount).toBeUndefined(); // 분리형 석차 컬럼은 동석차수 없음
    expect(kor.rankGrade).toBe(1);

    const math = a.subjects.find((s) => s.subject === '수학')!;
    expect(math.rankGrade).toBe(4);
    expect(math.achievement).toBe('D');
  });

  it('번호·성명이 모두 빈 행은 건너뛴다', () => {
    const grid = matrixGrid();
    const layout = detectTranscriptLayout(grid)!;
    const students = parseTranscriptRows(grid, layout);
    expect(students.every((s) => s.studentName !== '')).toBe(true);
  });

  it('결합 셀 형태(성취도(수강자수)·석차/동석차)도 분해한다', () => {
    const grid: TranscriptGrid = [
      ['', '국어', '국어', '국어'],
      ['번호', '성명', '성취도', '석차'],
      [1, '홍길동', 'B(240)', '10/2'],
    ];
    const layout = detectTranscriptLayout(grid)!;
    // 과목명은 상단 헤더에서 carry-forward(국어)
    const students = parseTranscriptRows(grid, layout, { term: '2026 1학기' });
    expect(students).toHaveLength(1);
    const row = students[0]!.subjects[0]!;
    expect(row.subject).toBe('국어');
    expect(row.achievement).toBe('B');
    expect(row.totalStudents).toBe(240);
    expect(row.rank).toBe(10);
    expect(row.tieCount).toBe(2);
  });
});
