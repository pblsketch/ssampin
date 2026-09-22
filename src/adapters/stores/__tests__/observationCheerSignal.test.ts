// @vitest-environment jsdom
/**
 * ADR-135 — 응원은 두 가지뿐이고 같은 응원은 이 컴퓨터에서 한 번만 한다.
 * - 첫 기록 응원: 오늘 이 컴퓨터에서 처음 저장한 관찰 기록 — 하루 한 번.
 * - 한 바퀴 응원: (카드, 학기, 끝낸 바퀴 수)마다 한 번. 저장한 창이 아니면 토스트 없이 핀 줄만.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CHEER_EVENT,
  isLocalObservationAdd,
  isSessionObservationAdd,
  readTodayCheerLine,
  recordLapCheer,
  recordLocalObservationAdd,
  resetObservationCheerForTest,
  type CheerLineState,
} from '../observationCheerSignal';
import { useSettingsStore } from '../useSettingsStore';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';

const toasts: CheerLineState[] = [];
let lineOnly = 0;
const onCheer = (e: Event): void => {
  toasts.push((e as CustomEvent<CheerLineState>).detail);
};
const onLine = (): void => {
  lineOnly++;
};

function setCheer(enabled: boolean): void {
  useSettingsStore.setState({
    settings: {
      ...useSettingsStore.getState().settings,
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: enabled },
    },
  });
}

const MON = new Date(2026, 8, 21, 9, 0);
const MON_LATER = new Date(2026, 8, 21, 15, 0);
const TUE = new Date(2026, 8, 22, 9, 0);

beforeEach(() => {
  window.localStorage.clear();
  resetObservationCheerForTest();
  toasts.length = 0;
  lineOnly = 0;
  setCheer(true);
  window.addEventListener(CHEER_EVENT, onCheer);
  window.addEventListener(`${CHEER_EVENT}:line`, onLine);
});

afterEach(() => {
  window.removeEventListener(CHEER_EVENT, onCheer);
  window.removeEventListener(`${CHEER_EVENT}:line`, onLine);
});

describe('첫 기록 응원', () => {
  it('하루에 한 번만 — 다음 날 다시', () => {
    recordLocalObservationAdd('r1', MON);
    recordLocalObservationAdd('r2', MON_LATER);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.pinState).toBe('wave');
    recordLocalObservationAdd('r3', TUE);
    expect(toasts).toHaveLength(2);
  });

  it('핀 줄은 그날만 남는다', () => {
    recordLocalObservationAdd('r1', MON);
    expect(readTodayCheerLine(MON_LATER)?.pinState).toBe('wave');
    expect(readTodayCheerLine(TUE)).toBeNull();
  });

  it('응원·잔디를 끄면 응원하지 않지만 이 컴퓨터 기록 표시는 남긴다', () => {
    setCheer(false);
    recordLocalObservationAdd('r1', MON);
    expect(toasts).toHaveLength(0);
    expect(isLocalObservationAdd('r1')).toBe(true);
  });

  it('이 창에서 추가한 기록과 다른 창에서 추가한 기록을 가른다', () => {
    recordLocalObservationAdd('r1', MON);
    resetObservationCheerForTest(); // 다른 창을 흉내 낸다 — localStorage 는 함께 쓴다
    expect(isLocalObservationAdd('r1')).toBe(true);
    expect(isSessionObservationAdd('r1')).toBe(false);
  });
});

describe('한 바퀴 응원', () => {
  it('같은 (카드, 학기, 바퀴 수)는 한 번만, 반 이름을 넣어 만세', () => {
    expect(recordLapCheer('subject:c1|2026-2|1', '2-3 국어', true, MON)).toBe(true);
    expect(recordLapCheer('subject:c1|2026-2|1', '2-3 국어', true, MON_LATER)).toBe(false);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.pinState).toBe('celebrate');
    expect(toasts[0]?.message).toContain('2-3 국어');
    expect(recordLapCheer('subject:c1|2026-2|2', '2-3 국어', true, MON_LATER)).toBe(true);
  });

  it('저장한 창이 아니면 토스트 없이 핀 줄만 바꾼다', () => {
    recordLapCheer('homeroom|2026-2|1', '담임반', false, MON);
    expect(toasts).toHaveLength(0);
    expect(lineOnly).toBe(1);
    expect(readTodayCheerLine(MON)?.pinState).toBe('celebrate');
  });

  it('응원·잔디를 끄면 하지 않는다', () => {
    setCheer(false);
    expect(recordLapCheer('homeroom|2026-2|1', '담임반', true, MON)).toBe(false);
  });
});
