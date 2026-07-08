import { describe, it, expect } from 'vitest';
import { getJustFinishedPeriod } from './periodRules';
import type { PeriodTime } from '../valueObjects/PeriodTime';

const periods: PeriodTime[] = [
  { period: 1, start: '09:00', end: '09:50' },
  { period: 2, start: '10:00', end: '10:50' },
  { period: 3, start: '11:00', end: '11:50' },
];

const at = (h: number, m: number) => new Date(2026, 6, 8, h, m);

describe('getJustFinishedPeriod', () => {
  it('수업 종료 직후(유예 이내)에는 방금 끝난 교시를 반환', () => {
    expect(getJustFinishedPeriod(periods, at(9, 55))).toBe(1);
    expect(getJustFinishedPeriod(periods, at(10, 55))).toBe(2);
  });

  it('수업 진행 중에는 null (아직 끝나지 않음)', () => {
    expect(getJustFinishedPeriod(periods, at(10, 30))).toBeNull();
  });

  it('종료 후 유예(기본 10분)를 넘기면 null (오탐 방지)', () => {
    expect(getJustFinishedPeriod(periods, at(12, 10))).toBeNull(); // 3교시 끝난 지 20분
  });

  it('첫 수업 전에는 null', () => {
    expect(getJustFinishedPeriod(periods, at(8, 0))).toBeNull();
  });

  it('유예 시간(graceMinutes)을 조절할 수 있다', () => {
    expect(getJustFinishedPeriod(periods, at(12, 10), 30)).toBe(3); // 20분 ≤ 30분
  });
});
