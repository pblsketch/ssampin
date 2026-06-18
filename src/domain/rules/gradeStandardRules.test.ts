import { describe, it, expect } from 'vitest';
import {
  scaleFor,
  achievementOf,
  achievement3Of,
  rankGradeOf,
  cumulativeRatio,
  FIXED_CUT5,
  FIXED_CUT3,
} from './gradeStandardRules';

describe('scaleFor — 2026 학교급/학년/과목 분기', () => {
  it('초등학교는 정량 산출 없음(none)', () => {
    expect(scaleFor('elem', 1)).toBe('none');
    expect(scaleFor('elem', 6)).toBe('none');
  });

  it('중학교는 성취도 5단계, 자유학기는 none', () => {
    expect(scaleFor('mid', 1)).toBe('achieve5');
    expect(scaleFor('mid', 1, { freeSemester: true })).toBe('none');
  });

  it('고1·고2(2022개정)는 석차 5등급', () => {
    expect(scaleFor('high', 1)).toBe('rank5');
    expect(scaleFor('high', 2)).toBe('rank5');
  });

  it('고1·고2 석차 미산출 과목(noRank: 융합선택 사회/과학·체육·예술 등)은 성취도만', () => {
    expect(scaleFor('high', 1, { noRank: true })).toBe('achieve5');
    expect(scaleFor('high', 2, { track: 'fusion', noRank: true })).toBe('achieve5');
  });

  it('고3(2015개정) 공통·일반선택은 9등급, 진로선택은 3단계 성취도', () => {
    expect(scaleFor('high', 3, { track: 'general' })).toBe('rank9');
    expect(scaleFor('high', 3, { track: 'common' })).toBe('rank9');
    expect(scaleFor('high', 3, { track: 'career' })).toBe('achieve3');
  });
});

describe('achievementOf — 5단계 성취도(분할점수 주입)', () => {
  it('고정분할(90/80/70/60) 경계', () => {
    expect(achievementOf(90, FIXED_CUT5)).toBe('A');
    expect(achievementOf(89.9, FIXED_CUT5)).toBe('B');
    expect(achievementOf(80, FIXED_CUT5)).toBe('B');
    expect(achievementOf(70, FIXED_CUT5)).toBe('C');
    expect(achievementOf(60, FIXED_CUT5)).toBe('D');
    expect(achievementOf(59.9, FIXED_CUT5)).toBe('E');
  });

  it('추정분할(단위학교 산출 컷)도 동일 로직', () => {
    const cut = { A: 82, B: 71, C: 58, D: 45 };
    expect(achievementOf(82, cut)).toBe('A');
    expect(achievementOf(81.9, cut)).toBe('B');
    expect(achievementOf(45, cut)).toBe('D');
    expect(achievementOf(44.9, cut)).toBe('E');
  });
});

describe('achievement3Of — 진로선택 3단계', () => {
  it('고정분할(80/60) 경계', () => {
    expect(achievement3Of(80, FIXED_CUT3)).toBe('A');
    expect(achievement3Of(79.9, FIXED_CUT3)).toBe('B');
    expect(achievement3Of(60, FIXED_CUT3)).toBe('B');
    expect(achievement3Of(59.9, FIXED_CUT3)).toBe('C');
  });
});

describe('rankGradeOf — 석차등급 누적컷', () => {
  it('5등급 경계', () => {
    expect(rankGradeOf(0.1, 'rank5')).toBe(1);
    expect(rankGradeOf(0.11, 'rank5')).toBe(2);
    expect(rankGradeOf(0.34, 'rank5')).toBe(2);
    expect(rankGradeOf(0.35, 'rank5')).toBe(3);
    expect(rankGradeOf(0.9, 'rank5')).toBe(4);
    expect(rankGradeOf(0.91, 'rank5')).toBe(5);
    expect(rankGradeOf(1, 'rank5')).toBe(5);
  });

  it('9등급 경계', () => {
    expect(rankGradeOf(0.04, 'rank9')).toBe(1);
    expect(rankGradeOf(0.05, 'rank9')).toBe(2);
    expect(rankGradeOf(0.96, 'rank9')).toBe(8);
    expect(rankGradeOf(0.97, 'rank9')).toBe(9);
  });
});

describe('cumulativeRatio — 석차 누적 비율', () => {
  it('동석차 반영', () => {
    expect(cumulativeRatio(1, 1, 100)).toBeCloseTo(0.01, 5);
    expect(cumulativeRatio(10, 3, 100)).toBeCloseTo(0.12, 5);
  });

  it('전체 인원 0이면 0', () => {
    expect(cumulativeRatio(1, 1, 0)).toBe(0);
  });
});
