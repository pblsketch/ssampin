import { describe, it, expect } from 'vitest';
import {
  convertedScore,
  sumConverted,
  semesterConvertedTotal,
  totalWeightPercent,
  isWeightComplete,
} from './gradeCalculationRules';

describe('convertedScore — 환산점', () => {
  it('받은점수/만점×반영비율', () => {
    expect(convertedScore(80, 100, 30)).toBe(24);
    expect(convertedScore(35, 50, 40)).toBe(28);
    expect(convertedScore(1, 3, 30)).toBe(10); // 1/3×30 = 10 정확
  });

  it('만점 0 이하이면 0', () => {
    expect(convertedScore(50, 0, 30)).toBe(0);
  });

  it('0점은 0', () => {
    expect(convertedScore(0, 100, 30)).toBe(0);
  });
});

describe('센티포인트 — 부동소수점 드리프트 0', () => {
  it('0.1을 10번 더해도 정확히 1.0', () => {
    expect(sumConverted([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(1);
  });

  it('학기 합 = 지필 + 수행', () => {
    expect(semesterConvertedTotal([49], [21])).toBe(70);
    expect(semesterConvertedTotal([24, 25.5], [20.5])).toBe(70);
  });
});

describe('반영비율 검증', () => {
  it('합계 산출', () => {
    expect(totalWeightPercent([70, 30])).toBe(100);
    expect(totalWeightPercent([40, 30, 30])).toBe(100);
  });

  it('합계 100% 일치 여부', () => {
    expect(isWeightComplete([70, 30])).toBe(true);
    expect(isWeightComplete([70, 20])).toBe(false);
    expect(isWeightComplete([33.3, 33.3, 33.4])).toBe(true);
  });
});
