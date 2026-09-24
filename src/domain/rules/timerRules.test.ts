import { describe, it, expect } from 'vitest';
import {
  canAdjustSeconds,
  clampTimerSeconds,
  endClockTime,
  formatClockTime,
  formatOvertime,
  formatShortDuration,
  formatTime,
  getTimerColorLevel,
  isPreWarningArmed,
  overtimeSeconds,
  warningThresholdSeconds,
} from './timerRules';

describe('warningThresholdSeconds — 경고색 기준', () => {
  it('예고 알림이 켜져 있으면 그 시점을 쓴다', () => {
    expect(warningThresholdSeconds({ enabled: true, secondsBefore: 180 })).toBe(180);
  });

  it('예고 알림이 꺼져 있으면 60초', () => {
    expect(warningThresholdSeconds({ enabled: false, secondsBefore: 180 })).toBe(60);
  });
});

describe('getTimerColorLevel — 원 색 단계', () => {
  it('5분 타이머: 기준 전은 평소, 기준 이하 경고, 10초 이하 임박', () => {
    expect(getTimerColorLevel(300, 300, 60)).toBe('normal');
    expect(getTimerColorLevel(61, 300, 60)).toBe('normal');
    expect(getTimerColorLevel(60, 300, 60)).toBe('warning');
    expect(getTimerColorLevel(11, 300, 60)).toBe('warning');
    expect(getTimerColorLevel(10, 300, 60)).toBe('critical');
    expect(getTimerColorLevel(0, 300, 60)).toBe('critical');
  });

  it('전체 시간이 경고 기준 이하인 짧은 타이머는 주황을 건너뛰고 마지막 10초만 빨강', () => {
    // 1분 프리셋 + 기준 60초 → 처음부터 경고색이면 뜻이 없다.
    expect(getTimerColorLevel(60, 60, 60)).toBe('normal');
    expect(getTimerColorLevel(30, 60, 60)).toBe('normal');
    expect(getTimerColorLevel(10, 60, 60)).toBe('critical');
    // 3분 전 예고로 맞춘 3분 타이머도 같다.
    expect(getTimerColorLevel(120, 180, 180)).toBe('normal');
  });

  it('10초 이하 타이머는 임박 단계도 없다', () => {
    expect(getTimerColorLevel(5, 10, 60)).toBe('normal');
    expect(getTimerColorLevel(3, 8, 60)).toBe('normal');
  });
});

describe('isPreWarningArmed — 예고 알림을 울릴 수 있는 시작인가', () => {
  it('보통의 시작은 울릴 수 있다', () => {
    expect(isPreWarningArmed(300, 300, 60)).toBe(true);
  });

  it('전체 시간이 예고 시점 이하면 울리지 않는다', () => {
    expect(isPreWarningArmed(60, 60, 60)).toBe(false);
    expect(isPreWarningArmed(120, 120, 180)).toBe(false);
  });

  it('이미 예고 시점 안에서 재개하면 울리지 않는다', () => {
    expect(isPreWarningArmed(45, 300, 60)).toBe(false);
    expect(isPreWarningArmed(60, 300, 60)).toBe(false);
  });
});

describe('시간 조정 범위', () => {
  it('설정 시간은 1초~99:59', () => {
    expect(clampTimerSeconds(0)).toBe(1);
    expect(clampTimerSeconds(-30)).toBe(1);
    expect(clampTimerSeconds(9000)).toBe(5999);
    expect(clampTimerSeconds(Number.NaN)).toBe(1);
    expect(clampTimerSeconds(90.4)).toBe(90);
  });

  it('결과가 범위를 벗어나는 단추만 막는다', () => {
    expect(canAdjustSeconds(300, 60)).toBe(true);
    expect(canAdjustSeconds(300, -300)).toBe(false);
    expect(canAdjustSeconds(301, -300)).toBe(true);
    expect(canAdjustSeconds(5990, 10)).toBe(false);
    expect(canAdjustSeconds(5989, 10)).toBe(true);
  });
});

describe('초과 시간', () => {
  const T0 = 1_700_000_000_000;

  it('끝난 시각부터 흐른 초를 센다', () => {
    expect(overtimeSeconds(T0, T0 + 32_900)).toBe(32);
  });

  it('99:59 에서 멈추고, 시계가 되감기면 0', () => {
    expect(overtimeSeconds(T0, T0 + 10_000_000)).toBe(5999);
    expect(overtimeSeconds(T0, T0 - 5_000)).toBe(0);
    expect(overtimeSeconds(Number.NaN, T0)).toBe(0);
  });

  it('"+MM:SS" 로 보인다', () => {
    expect(formatOvertime(32)).toBe('+00:32');
    expect(formatOvertime(125)).toBe('+02:05');
    expect(formatOvertime(9999)).toBe('+99:59');
  });

  it('기록용 짧은 형식', () => {
    expect(formatShortDuration(155)).toBe('2:35');
    expect(formatShortDuration(35)).toBe('0:35');
  });
});

describe('끝나는 시각', () => {
  it('오전·오후 12시간제', () => {
    expect(formatClockTime(new Date(2026, 8, 24, 14, 35).getTime())).toBe('오후 2:35');
    expect(formatClockTime(new Date(2026, 8, 24, 9, 5).getTime())).toBe('오전 9:05');
    expect(formatClockTime(new Date(2026, 8, 24, 0, 0).getTime())).toBe('오전 12:00');
    expect(formatClockTime(new Date(2026, 8, 24, 12, 0).getTime())).toBe('오후 12:00');
  });

  it('지금 + 남은 시간', () => {
    const now = new Date(2026, 8, 24, 14, 30, 10).getTime();
    expect(endClockTime(now, 300)).toBe('오후 2:35');
  });
});

describe('formatTime', () => {
  it('음수는 00:00', () => {
    expect(formatTime(-3)).toBe('00:00');
    expect(formatTime(5999)).toBe('99:59');
  });
});
