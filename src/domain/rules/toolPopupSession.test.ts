import { describe, it, expect } from 'vitest';
import { advanceCountdown, advanceStopwatch } from './toolPopupSession';

const T0 = 1_700_000_000_000;

describe('advanceCountdown — 옮기는 동안 흐른 시간', () => {
  it('돌고 있던 타이머는 흐른 초만큼 줄어든다', () => {
    const result = advanceCountdown(
      { state: 'running', remaining: 300, capturedAt: T0 },
      T0 + 3_400,
    );
    expect(result).toEqual({ state: 'running', remaining: 297, alarmDueDuringTransfer: false });
  });

  it('멈춰 있던 타이머는 시간이 흐르지 않는다', () => {
    for (const state of ['idle', 'paused', 'finished'] as const) {
      const result = advanceCountdown({ state, remaining: 120, capturedAt: T0 }, T0 + 60_000);
      expect(result.remaining).toBe(120);
      expect(result.state).toBe(state);
      expect(result.alarmDueDuringTransfer).toBe(false);
    }
  });

  it('옮기는 사이 0 에 닿으면 finished 로 오고 알람이 한 번 예약된다', () => {
    const result = advanceCountdown({ state: 'running', remaining: 2, capturedAt: T0 }, T0 + 5_000);
    expect(result).toEqual({ state: 'finished', remaining: 0, alarmDueDuringTransfer: true });
  });

  it('시계가 되감겨도 남은 시간이 늘어나지 않는다', () => {
    const result = advanceCountdown(
      { state: 'running', remaining: 100, capturedAt: T0 },
      T0 - 60_000,
    );
    expect(result.remaining).toBe(100);
  });

  it('시각이 숫자가 아니면 흐른 시간을 0 으로 본다', () => {
    const result = advanceCountdown(
      { state: 'running', remaining: 100, capturedAt: Number.NaN },
      T0,
    );
    expect(result.remaining).toBe(100);
  });
});

describe('advanceStopwatch — 옮기는 동안 흐른 시간', () => {
  it('돌고 있던 스톱워치는 흐른 시간을 더한다', () => {
    expect(
      advanceStopwatch({ state: 'running', elapsedMs: 12_000, capturedAt: T0 }, T0 + 850),
    ).toEqual({ state: 'running', elapsedMs: 12_850 });
  });

  it('멈춘 스톱워치는 경과가 그대로다', () => {
    expect(
      advanceStopwatch({ state: 'paused', elapsedMs: 12_000, capturedAt: T0 }, T0 + 9_000),
    ).toEqual({ state: 'paused', elapsedMs: 12_000 });
  });

  it('음수 경과는 0 으로 바로잡는다', () => {
    expect(advanceStopwatch({ state: 'idle', elapsedMs: -5, capturedAt: T0 }, T0).elapsedMs).toBe(
      0,
    );
  });
});
