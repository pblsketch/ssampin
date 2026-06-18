import { describe, it, expect } from 'vitest';
import { mean, stdev, summarizeScores, achievementDistribution } from './gradeAnalysisSummary';
import { FIXED_CUT5 } from '@domain/rules/gradeStandardRules';

describe('mean / stdev', () => {
  it('평균(소수 1자리)', () => {
    expect(mean([90, 80, 70])).toBe(80);
    expect(mean([])).toBe(0);
    expect(mean([1, 2])).toBe(1.5);
  });

  it('모표준편차(소수 1자리)', () => {
    // [90,80,70] → 분산 200/3=66.67 → √=8.16 → 8.2
    expect(stdev([90, 80, 70])).toBe(8.2);
    expect(stdev([50, 50, 50])).toBe(0);
    expect(stdev([])).toBe(0);
  });
});

describe('summarizeScores', () => {
  it('빈 배열이면 모두 0', () => {
    expect(summarizeScores([])).toEqual({ count: 0, mean: 0, stdev: 0, min: 0, max: 0 });
  });

  it('기초 통계', () => {
    expect(summarizeScores([90, 80, 70])).toEqual({
      count: 3,
      mean: 80,
      stdev: 8.2,
      min: 70,
      max: 90,
    });
  });
});

describe('achievementDistribution', () => {
  it('고정분할 5단계 분포', () => {
    expect(achievementDistribution([95, 85, 75, 65, 55], FIXED_CUT5)).toEqual({
      A: 1,
      B: 1,
      C: 1,
      D: 1,
      E: 1,
    });
  });

  it('경계값(90→A, 89.9→B)', () => {
    expect(achievementDistribution([90, 90, 89.9], FIXED_CUT5)).toEqual({
      A: 2,
      B: 1,
      C: 0,
      D: 0,
      E: 0,
    });
  });

  it('빈 배열', () => {
    expect(achievementDistribution([], FIXED_CUT5)).toEqual({ A: 0, B: 0, C: 0, D: 0, E: 0 });
  });
});
