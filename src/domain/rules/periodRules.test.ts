import { describe, it, expect } from 'vitest';
import {
  parseMinutes,
  getDayOfWeek,
  getCurrentPeriod,
  formatTime,
  getDefaultPreset,
  generatePeriodTimes,
  getDefaultLunchTime,
  detectLunchFromPeriods,
  PERIOD_DURATION,
} from './periodRules';
import type { PeriodTime } from '../valueObjects/PeriodTime';

describe('parseMinutes', () => {
  it('"HH:mm" → 분 단위 정수', () => {
    expect(parseMinutes('08:50')).toBe(530);
    expect(parseMinutes('00:00')).toBe(0);
    expect(parseMinutes('23:59')).toBe(1439);
    expect(parseMinutes('9:5')).toBe(545);
  });
});

describe('getDayOfWeek', () => {
  // 2026-03-09 = 월요일 (앵커: 2024-01-01 = 월요일)
  it('평일은 한국어 요일 반환', () => {
    expect(getDayOfWeek(new Date(2026, 2, 9))).toBe('월');
    expect(getDayOfWeek(new Date(2026, 2, 10))).toBe('화');
    expect(getDayOfWeek(new Date(2026, 2, 13))).toBe('금');
  });

  it('주말은 weekendDays 에 포함될 때만 반환, 아니면 null', () => {
    const sunday = new Date(2026, 2, 8);
    const saturday = new Date(2026, 2, 14);
    expect(getDayOfWeek(sunday)).toBeNull();
    expect(getDayOfWeek(saturday)).toBeNull();
    expect(getDayOfWeek(sunday, ['일'])).toBe('일');
    expect(getDayOfWeek(saturday, ['토'])).toBe('토');
    expect(getDayOfWeek(sunday, ['토'])).toBeNull();
  });
});

describe('getCurrentPeriod', () => {
  const periods: PeriodTime[] = [
    { period: 1, start: '09:00', end: '09:50' },
    { period: 2, start: '10:00', end: '10:50' },
  ];

  function at(h: number, m: number): Date {
    return new Date(2026, 2, 9, h, m);
  }

  it('교시 시간 안이면 해당 교시, 끝 시각은 제외(exclusive)', () => {
    expect(getCurrentPeriod(periods, at(9, 30))).toBe(1);
    expect(getCurrentPeriod(periods, at(9, 0))).toBe(1);
    expect(getCurrentPeriod(periods, at(9, 50))).toBeNull(); // end 는 포함 안 함
    expect(getCurrentPeriod(periods, at(10, 0))).toBe(2);
    expect(getCurrentPeriod(periods, at(10, 49))).toBe(2);
  });

  it('수업 시간 외(쉬는 시간·등교 전·하교 후)면 null', () => {
    expect(getCurrentPeriod(periods, at(9, 55))).toBeNull(); // 1-2교시 쉬는 시간
    expect(getCurrentPeriod(periods, at(8, 0))).toBeNull();
    expect(getCurrentPeriod(periods, at(23, 0))).toBeNull();
    expect(getCurrentPeriod([], at(9, 30))).toBeNull();
  });
});

describe('formatTime', () => {
  it('총 분 → "HH:mm" (0 패딩)', () => {
    expect(formatTime(530)).toBe('08:50');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(545)).toBe('09:05');
    expect(formatTime(13 * 60 + 5)).toBe('13:05');
  });
});

describe('getDefaultPreset', () => {
  it('중학교 기본 프리셋', () => {
    expect(getDefaultPreset('middle')).toEqual({
      schoolLevel: 'middle',
      firstPeriodStart: '08:50',
      breakDuration: 10,
      lunchAfterPeriod: 4,
      lunchDuration: 50,
      totalPeriods: 7,
      customPeriodDuration: undefined,
    });
  });

  it('학교급별 차이: 초등은 09:00 시작·6교시, 고등은 점심 60분', () => {
    expect(getDefaultPreset('elementary').firstPeriodStart).toBe('09:00');
    expect(getDefaultPreset('elementary').totalPeriods).toBe(6);
    expect(getDefaultPreset('high').lunchDuration).toBe(60);
  });

  it('custom 은 customPeriodDuration 50 으로 채워진다', () => {
    expect(getDefaultPreset('custom').customPeriodDuration).toBe(50);
  });
});

describe('generatePeriodTimes', () => {
  it('중학교 프리셋: 7교시 생성, 1교시 08:50 시작, 4교시 직후 점심 삽입', () => {
    const times = generatePeriodTimes(getDefaultPreset('middle'));
    expect(times).toHaveLength(7);
    expect(times[0]).toEqual({ period: 1, start: '08:50', end: '09:35' }); // 45분 수업
    // 4교시 종료(12:20) 직후 점심(50분) + 쉬는시간(10분) → 5교시 13:20 시작
    expect(times[3]!.end).toBe('12:20');
    expect(times[4]!.start).toBe('13:20');
    expect(times[6]!.period).toBe(7);
  });

  it('점심 전 교시 사이 간격은 쉬는 시간(10분)과 같다', () => {
    const times = generatePeriodTimes(getDefaultPreset('middle'));
    const gap = parseMinutes(times[1]!.start) - parseMinutes(times[0]!.end);
    expect(gap).toBe(10);
  });

  it('custom 프리셋은 customPeriodDuration 으로 수업 길이를 정한다', () => {
    const preset = { ...getDefaultPreset('custom'), customPeriodDuration: 30, totalPeriods: 2 };
    const times = generatePeriodTimes(preset);
    expect(parseMinutes(times[0]!.end) - parseMinutes(times[0]!.start)).toBe(30);
  });

  it('PERIOD_DURATION 상수: 초 40 / 중 45 / 고 50', () => {
    expect(PERIOD_DURATION.elementary).toBe(40);
    expect(PERIOD_DURATION.middle).toBe(45);
    expect(PERIOD_DURATION.high).toBe(50);
  });
});

describe('getDefaultLunchTime', () => {
  it('학교급별 기본 점심시간', () => {
    expect(getDefaultLunchTime('elementary')).toEqual({ start: '12:00', end: '12:50' });
    expect(getDefaultLunchTime('middle')).toEqual({ start: '12:00', end: '12:50' });
    expect(getDefaultLunchTime('high')).toEqual({ start: '12:50', end: '13:50' });
    expect(getDefaultLunchTime('custom')).toEqual({ start: '12:00', end: '13:00' });
  });
});

describe('detectLunchFromPeriods', () => {
  it('연속 교시 사이 30분 이상 간격을 점심으로 추정', () => {
    const times: PeriodTime[] = [
      { period: 1, start: '09:00', end: '09:45' },
      { period: 2, start: '09:55', end: '10:40' },
      { period: 3, start: '11:30', end: '12:15' }, // 2교시 종료 후 50분 간격
    ];
    expect(detectLunchFromPeriods(times)).toEqual({ start: '10:40', end: '11:30' });
  });

  it('30분 이상 간격이 없으면 null', () => {
    const times: PeriodTime[] = [
      { period: 1, start: '09:00', end: '09:50' },
      { period: 2, start: '10:00', end: '10:50' },
    ];
    expect(detectLunchFromPeriods(times)).toBeNull();
    expect(detectLunchFromPeriods([])).toBeNull();
  });
});
