import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TIMER_PRESETS,
  DEFAULT_TIMER_TOOL_SETTINGS,
  addPreset,
  canAddPreset,
  normalizePresets,
  normalizeStepSequence,
  normalizeTimerToolSettings,
  removePreset,
  trimTimerName,
} from './timerSettings';

describe('normalizeTimerToolSettings — 옛 저장값·범위 밖 값', () => {
  it('값이 없으면 기본값', () => {
    expect(normalizeTimerToolSettings(undefined)).toEqual(DEFAULT_TIMER_TOOL_SETTINGS);
    expect(normalizeTimerToolSettings(null)).toEqual(DEFAULT_TIMER_TOOL_SETTINGS);
    expect(normalizeTimerToolSettings('x')).toEqual(DEFAULT_TIMER_TOOL_SETTINGS);
  });

  it('일부 칸만 있으면 나머지는 기본값과 합친다', () => {
    const result = normalizeTimerToolSettings({ displayStyle: 'pie' });
    expect(result.displayStyle).toBe('pie');
    expect(result.presets).toEqual(DEFAULT_TIMER_PRESETS);
    expect(result.alarmRepeat).toBe('once');
    expect(result.presentationPreWarning).toEqual({ enabled: true, secondsBefore: 30 });
    expect(result.stepSequences).toEqual([]);
  });

  it('모르는 값은 기본값으로', () => {
    const result = normalizeTimerToolSettings({
      displayStyle: 'square',
      alarmRepeat: 'forever',
      presentationPreWarning: { enabled: 'yes', secondsBefore: 45 },
    });
    expect(result.displayStyle).toBe('ring');
    expect(result.alarmRepeat).toBe('once');
    expect(result.presentationPreWarning).toEqual({ enabled: true, secondsBefore: 30 });
  });

  it('발표 예고는 10·30·60초만', () => {
    const result = normalizeTimerToolSettings({
      presentationPreWarning: { enabled: false, secondsBefore: 10 },
    });
    expect(result.presentationPreWarning).toEqual({ enabled: false, secondsBefore: 10 });
  });

  it('저장한 순서는 최대 20개, 같은 id 는 한 번만', () => {
    const one = (id: string) => ({
      id,
      name: `순서 ${id}`,
      steps: [{ id: 's1', name: '', seconds: 60 }],
      repeat: 1,
      skipLastStepOnFinalRound: false,
    });
    const many = Array.from({ length: 25 }, (_, i) => one(String(i)));
    expect(normalizeTimerToolSettings({ stepSequences: many }).stepSequences).toHaveLength(20);
    const dup = normalizeTimerToolSettings({ stepSequences: [one('a'), one('a')] });
    expect(dup.stepSequences).toHaveLength(1);
  });
});

describe('프리셋', () => {
  it('5초~99:59 정수만, 중복 없이 짧은 순, 최대 8개', () => {
    expect(normalizePresets([300, 60, 60, 2, 9000, 1.5, 'x', 600])).toEqual([60, 300, 600]);
    expect(normalizePresets([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => n * 60))).toHaveLength(
      8,
    );
  });

  it('남는 것이 없으면 기본 목록', () => {
    expect(normalizePresets([])).toEqual(DEFAULT_TIMER_PRESETS);
    expect(normalizePresets([0, -1])).toEqual(DEFAULT_TIMER_PRESETS);
    expect(normalizePresets(undefined)).toEqual(DEFAULT_TIMER_PRESETS);
  });

  it('더하기: 범위·중복·8개 한도', () => {
    expect(canAddPreset([60], 420)).toBe(true);
    expect(canAddPreset([60], 60)).toBe(false);
    expect(canAddPreset([60], 4)).toBe(false);
    expect(canAddPreset([60, 120, 180, 240, 300, 360, 420, 480], 540)).toBe(false);
    expect(addPreset([60, 600], 420)).toEqual([60, 420, 600]);
    expect(addPreset([60], 60)).toEqual([60]);
  });

  it('빼기: 마지막 하나는 남긴다', () => {
    expect(removePreset([60, 300], 60)).toEqual([300]);
    expect(removePreset([60], 60)).toEqual([60]);
  });
});

describe('단계 순서 바로잡기', () => {
  it('이름이 없거나 쓸 수 있는 단계가 없으면 버린다', () => {
    expect(
      normalizeStepSequence({ id: 'a', name: '  ', steps: [{ id: 's', seconds: 60 }] }),
    ).toBeNull();
    expect(
      normalizeStepSequence({ id: 'a', name: '토의', steps: [{ id: 's', seconds: 2 }] }),
    ).toBeNull();
    expect(
      normalizeStepSequence({ id: '', name: '토의', steps: [{ id: 's', seconds: 60 }] }),
    ).toBeNull();
  });

  it('반복은 1~10, 이름은 20자로 자른다', () => {
    const result = normalizeStepSequence({
      id: 'a',
      name: '가'.repeat(30),
      steps: [{ id: 's', name: '나'.repeat(25), seconds: 60 }],
      repeat: 40,
      skipLastStepOnFinalRound: false,
    });
    expect(result?.repeat).toBe(10);
    expect(result?.name).toHaveLength(20);
    expect(result?.steps[0]?.name).toHaveLength(20);
  });

  it('단계가 하나면 마지막 단계 건너뛰기는 저절로 꺼진다', () => {
    const result = normalizeStepSequence({
      id: 'a',
      name: '토의',
      steps: [{ id: 's', name: '', seconds: 60 }],
      repeat: 3,
      skipLastStepOnFinalRound: true,
    });
    expect(result?.skipLastStepOnFinalRound).toBe(false);
  });

  it('반복이 1이면 건너뛰기는 꺼진다', () => {
    const result = normalizeStepSequence({
      id: 'a',
      name: '토의',
      steps: [
        { id: 's1', name: '', seconds: 60 },
        { id: 's2', name: '', seconds: 60 },
      ],
      repeat: 1,
      skipLastStepOnFinalRound: true,
    });
    expect(result?.skipLastStepOnFinalRound).toBe(false);
  });
});

describe('trimTimerName', () => {
  it('앞뒤 공백을 빼고 20자로', () => {
    expect(trimTimerName('  모둠 토의  ')).toBe('모둠 토의');
    expect(trimTimerName('a'.repeat(30))).toHaveLength(20);
  });
});
