import { describe, it, expect } from 'vitest';
import { getLunchBreakIndex } from './timetablePresenter';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

describe('getLunchBreakIndex — 3단 폴백 우선순위', () => {
  const periods: PeriodTime[] = [
    { period: 1, start: '09:00', end: '09:50' },
    { period: 2, start: '10:00', end: '10:50' },
    { period: 3, start: '11:00', end: '11:50' },
    { period: 4, start: '12:00', end: '12:50' },
    { period: 5, start: '14:00', end: '14:50' }, // 12:50 ~ 14:00 = 70분 갭 (4교시 후)
  ];

  it('B1: lunchAfterPeriod가 있으면 시간·갭 무시하고 우선 사용', () => {
    // lunchAfterPeriod=3을 명시하면 4교시 후 갭이 있어도 인덱스 3 반환
    expect(getLunchBreakIndex(periods, '12:50', '14:00', 3)).toBe(3);
    expect(getLunchBreakIndex(periods, '12:50', '14:00', 2)).toBe(2);
    // lunchAfterPeriod 단독 (시간/갭 미설정)
    expect(getLunchBreakIndex(periods, undefined, undefined, 4)).toBe(4);
  });

  it('B2: lunchAfterPeriod 없을 때 lunchStart/lunchEnd 시간 겹침으로 폴백', () => {
    expect(getLunchBreakIndex(periods, '12:50', '14:00')).toBe(4);
    expect(getLunchBreakIndex(periods, '12:50', '14:00', undefined)).toBe(4);
  });

  it('B3: lunchAfterPeriod·시간 모두 없으면 30분 갭 자동 추정으로 폴백', () => {
    expect(getLunchBreakIndex(periods)).toBe(4);
  });

  it('B4: 모든 폴백 실패 시 -1', () => {
    const tightPeriods: PeriodTime[] = [
      { period: 1, start: '09:00', end: '09:50' },
      { period: 2, start: '10:00', end: '10:50' },
    ];
    expect(getLunchBreakIndex(tightPeriods)).toBe(-1);
    expect(getLunchBreakIndex(tightPeriods, '12:00', '13:00')).toBe(-1);
  });

  it('B5: lunchAfterPeriod 경계값 — 범위 밖이면 폴백으로 떨어진다', () => {
    // lunchAfterPeriod < 1 → 폴백
    expect(getLunchBreakIndex(periods, '12:50', '14:00', 0)).toBe(4); // 시간 폴백
    expect(getLunchBreakIndex(periods, '12:50', '14:00', -1)).toBe(4);
    // lunchAfterPeriod >= periodTimes.length → 폴백 (5개 배열 → 인덱스 5는 불가)
    expect(getLunchBreakIndex(periods, '12:50', '14:00', 5)).toBe(4);
    expect(getLunchBreakIndex(periods, '12:50', '14:00', 99)).toBe(4);
    // 정상 경계값 (1, periodTimes.length-1)
    expect(getLunchBreakIndex(periods, undefined, undefined, 1)).toBe(1);
    expect(getLunchBreakIndex(periods, undefined, undefined, 4)).toBe(4);
  });
});
