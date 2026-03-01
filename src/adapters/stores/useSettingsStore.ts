import { create } from 'zustand';
import type { Settings } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { settingsRepository } from '@adapters/di/container';

const DEFAULT_PERIOD_TIMES: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:30' },
  { period: 2, start: '09:40', end: '10:20' },
  { period: 3, start: '10:30', end: '11:10' },
  { period: 4, start: '11:20', end: '12:00' },
  { period: 5, start: '13:00', end: '13:40' },
  { period: 6, start: '13:50', end: '14:30' },
];

const DEFAULT_SETTINGS: Settings = {
  schoolName: '',
  className: '',
  teacherName: '',
  subject: '',
  schoolLevel: 'middle',
  maxPeriods: 6,
  periodTimes: DEFAULT_PERIOD_TIMES,
  seatingRows: 6,
  seatingCols: 6,
  widget: {
    width: 380,
    height: 650,
    transparent: false,
    opacity: 0.8,
    alwaysOnTop: true,
  },
  system: {
    autoLaunch: false,
    notificationSound: true,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '07:00',
  },
  theme: 'dark',
  fontSize: 'medium',
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  isFirstRun: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  completeOnboarding: (settings: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  isFirstRun: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const saved = await settingsRepository.getSettings();
      if (saved) {
        // Merge with defaults to handle newly added fields
        const merged: Settings = {
          ...DEFAULT_SETTINGS,
          ...saved,
          widget: { ...DEFAULT_SETTINGS.widget, ...(saved.widget ?? {}) },
          system: { ...DEFAULT_SETTINGS.system, ...((saved as unknown as { system?: Partial<Settings['system']> }).system ?? {}) },
        };
        set({ settings: merged, loaded: true, isFirstRun: false });
      } else {
        set({ loaded: true, isFirstRun: true });
      }
    } catch {
      set({ loaded: true, isFirstRun: true });
    }
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await settingsRepository.saveSettings(next);
  },

  completeOnboarding: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next, isFirstRun: false });
    await settingsRepository.saveSettings(next);
  },
}));
