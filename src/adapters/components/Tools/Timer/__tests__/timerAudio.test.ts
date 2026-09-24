import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { DEFAULT_SOUND_SETTINGS } from '@domain/valueObjects/SoundSettings';
import {
  ALARM_REPEAT_INTERVAL_MS,
  ALARM_REPEAT_MAX_MS,
  isToolSoundMuted,
  playAlarmSound,
  playPreWarningSound,
  playStepTransitionSound,
  startAlarmSequence,
  stopAllTimerSounds,
} from '../timerAudio';

/** AudioContext 를 몇 번 만들었는지로 "소리를 냈는가"를 잰다. */
let contextsCreated = 0;
let contextsClosed = 0;

class FakeNode {
  gain = {
    value: 1,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  };
  frequency = { value: 0 };
  type = 'sine';
  threshold = { value: 0 };
  ratio = { value: 0 };
  knee = { value: 0 };
  attack = { value: 0 };
  release = { value: 0 };
  connect(): void {}
  start(): void {}
  stop(): void {}
}

class FakeAudioContext {
  currentTime = 0;
  state: 'running' | 'closed' = 'running';
  destination = new FakeNode();
  constructor() {
    contextsCreated += 1;
  }
  createGain(): FakeNode {
    return new FakeNode();
  }
  createOscillator(): FakeNode {
    return new FakeNode();
  }
  createDynamicsCompressor(): FakeNode {
    return new FakeNode();
  }
  close(): Promise<void> {
    this.state = 'closed';
    contextsClosed += 1;
    return Promise.resolve();
  }
}

function setMuted(muted: boolean): void {
  useSoundStore.setState({
    settings: { ...DEFAULT_SOUND_SETTINGS, enabled: !muted },
    loaded: true,
  });
}

beforeEach(() => {
  // 앞 시험에서 남은 소리를 먼저 치우고 센다.
  stopAllTimerSounds();
  contextsCreated = 0;
  contextsClosed = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  setMuted(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('🔊 음소거는 타이머 소리를 끈다 (spec 5-1)', () => {
  it('소리가 켜져 있으면 알람·예고·전환음이 울린다', () => {
    playAlarmSound('beep', 0.8, 1, null);
    playPreWarningSound('soft-bell', 0.8, 1);
    playStepTransitionSound(0.8, 1);
    expect(contextsCreated).toBe(3);
  });

  it('음소거면 알람·예고·전환음이 울리지 않는다', () => {
    setMuted(true);
    expect(isToolSoundMuted()).toBe(true);
    playAlarmSound('school-bell', 0.8, 1, null);
    playPreWarningSound('gentle-chime', 0.8, 1);
    playStepTransitionSound(0.8, 1);
    expect(contextsCreated).toBe(0);
  });

  it('미리듣기는 음소거와 관계없이 들린다', () => {
    setMuted(true);
    playAlarmSound('beep', 0.8, 1, null, { ignoreMute: true });
    playPreWarningSound('soft-bell', 0.8, 1, { ignoreMute: true });
    expect(contextsCreated).toBe(2);
  });

  it('소리를 끄는 순간 울리던 소리도 멈춘다', () => {
    playAlarmSound('buzzer', 0.8, 1, null);
    expect(contextsCreated).toBe(1);
    setMuted(true);
    expect(contextsClosed).toBe(1);
  });
});

describe('종료 알람 반복 (spec 3-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('한 번', () => {
    const play = vi.fn();
    startAlarmSequence('once', play);
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 5);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('3번', () => {
    const play = vi.fn();
    startAlarmSequence('three', play);
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 10);
    expect(play).toHaveBeenCalledTimes(3);
  });

  it('확인할 때까지 — 멈추면 바로 그친다', () => {
    const play = vi.fn();
    const stop = startAlarmSequence('untilConfirm', play);
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 3);
    expect(play).toHaveBeenCalledTimes(4);
    stop();
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 10);
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('확인할 때까지 — 한도가 지나면 스스로 멈춘다', () => {
    const play = vi.fn();
    startAlarmSequence('untilConfirm', play);
    vi.advanceTimersByTime(ALARM_REPEAT_MAX_MS + ALARM_REPEAT_INTERVAL_MS * 5);
    const calls = play.mock.calls.length;
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 10);
    expect(play.mock.calls.length).toBe(calls);
    expect(calls).toBeLessThanOrEqual(
      Math.floor(ALARM_REPEAT_MAX_MS / ALARM_REPEAT_INTERVAL_MS) + 1,
    );
  });

  it('음소거하면 반복도 멈춘다', () => {
    const play = vi.fn();
    startAlarmSequence('untilConfirm', play);
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS);
    expect(play).toHaveBeenCalledTimes(2);
    setMuted(true);
    vi.advanceTimersByTime(ALARM_REPEAT_INTERVAL_MS * 5);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('여러 번 멈춰도 안전하다', () => {
    const stop = startAlarmSequence('three', vi.fn());
    stop();
    expect(() => stop()).not.toThrow();
  });
});
