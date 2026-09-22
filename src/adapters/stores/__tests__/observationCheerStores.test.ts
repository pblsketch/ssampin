/**
 * ADR-135 — '당분간 빼기'는 누르는 즉시 저장되고, '한 바퀴' 끝 지점은 더 뒤로만 저장된다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Settings } from '@domain/entities/Settings';
import type { LapMark, LapMarkData } from '@domain/entities/ObservationLap';

const saved: { settings: Settings | null; laps: LapMarkData | null } = {
  settings: null,
  laps: null,
};

vi.mock('@adapters/di/container', () => ({
  settingsRepository: {
    getSettings: vi.fn(async () => saved.settings),
    saveSettings: vi.fn(async (s: Settings) => {
      saved.settings = s;
    }),
  },
  lapMarkRepository: {
    load: vi.fn(async () => saved.laps),
    save: vi.fn(async (d: LapMarkData) => {
      saved.laps = d;
    }),
  },
}));

const { useSettingsStore } = await import('../useSettingsStore');
const { useLapMarkStore } = await import('../useLapMarkStore');
const { DEFAULT_REMINDER_SETTINGS, isObservationCheerEnabled } =
  await import('@domain/entities/RecordReminder');

function mark(date: string, completed: number): LapMark {
  return {
    card: 'homeroom',
    term: '2026-2',
    completed,
    boundary: { date, createdAt: 1, recordId: date },
  };
}

describe('당분간 빼기 — 즉시 저장', () => {
  beforeEach(() => {
    saved.settings = null;
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: DEFAULT_REMINDER_SETTINGS,
      },
    });
  });

  it('빼면 설정 파일에 바로 저장되고, 같은 학생은 기간만 바뀐다', async () => {
    await useSettingsStore.getState().setReminderExclusion('stu-1', '2099-10-01');
    await useSettingsStore.getState().setReminderExclusion('stu-1', '2099-12-01');
    expect(saved.settings?.recordReminder?.exclusions).toEqual([
      { key: 'stu-1', until: '2099-12-01' },
    ]);
  });

  it('다시 넣으면 목록과 옛 excludedStudentIds 에서 함께 빠진다', async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, excludedStudentIds: ['stu-1', 'stu-2'] },
      },
    });
    await useSettingsStore.getState().setReminderExclusion('stu-3', '2099-10-01');
    await useSettingsStore.getState().removeReminderExclusion('stu-1');
    await useSettingsStore.getState().removeReminderExclusion('stu-3');
    const rr = saved.settings?.recordReminder;
    expect(rr?.excludedStudentIds).toEqual(['stu-2']);
    expect(rr?.exclusions).toEqual([]);
  });

  it('빼기가 알림의 다른 설정을 건드리지 않는다', async () => {
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, enabled: true, staleDays: 10 },
      },
    });
    await useSettingsStore.getState().setReminderExclusion('stu-1', '2099-10-01');
    expect(saved.settings?.recordReminder?.enabled).toBe(true);
    expect(saved.settings?.recordReminder?.staleDays).toBe(10);
  });
});

describe('응원·잔디 켜기 기본값', () => {
  it('값이 없는 옛 설정도 켜짐으로 본다', () => {
    expect(isObservationCheerEnabled(undefined)).toBe(true);
    expect(isObservationCheerEnabled({})).toBe(true);
    expect(isObservationCheerEnabled({ cheerEnabled: false })).toBe(false);
    expect(DEFAULT_REMINDER_SETTINGS.cheerEnabled).toBe(true);
  });
});

describe('한 바퀴 끝 지점 저장', () => {
  beforeEach(() => {
    saved.laps = null;
    useLapMarkStore.setState({ marks: [], loaded: false });
  });

  it('처음 끝 지점은 저장한다', async () => {
    expect(await useLapMarkStore.getState().recordMark(mark('2026-09-10', 1))).toBe(true);
    expect(saved.laps?.records).toHaveLength(1);
  });

  it('더 앞의 끝 지점은 저장하지 않는다 — 뒤로 가지 않는다', async () => {
    await useLapMarkStore.getState().recordMark(mark('2026-09-10', 2));
    expect(await useLapMarkStore.getState().recordMark(mark('2026-09-05', 2))).toBe(false);
    expect(saved.laps?.records[0]?.boundary.date).toBe('2026-09-10');
  });

  it('그 사이 동기화로 파일에 들어온 더 뒤 끝 지점을 덮지 않는다', async () => {
    await useLapMarkStore.getState().recordMark(mark('2026-09-10', 1));
    saved.laps = { records: [mark('2026-09-20', 3)] }; // 다른 컴퓨터에서 온 값
    await useLapMarkStore.getState().recordMark(mark('2026-09-12', 2));
    expect(saved.laps?.records[0]?.boundary.date).toBe('2026-09-20');
    expect(saved.laps?.records[0]?.completed).toBe(3);
  });
});
