import { create } from 'zustand';
import type { Settings } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { settingsRepository } from '@mobile/di/container';

const DEFAULT_PERIOD_TIMES: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:30' },
  { period: 2, start: '09:40', end: '10:20' },
  { period: 3, start: '10:30', end: '11:10' },
  { period: 4, start: '11:20', end: '12:00' },
  { period: 5, start: '13:00', end: '13:40' },
  { period: 6, start: '13:50', end: '14:30' },
  { period: 7, start: '14:40', end: '15:20' },
];

interface MobileSettings {
  schoolName: string;
  teacherName: string;
  className: string;
  periodTimes: readonly PeriodTime[];
  teacherRoles: readonly string[];
  neis: { atptCode: string; schoolCode: string };
  sync: { deviceId: string; autoSyncInterval: number };
}

const DEFAULT_MOBILE_SETTINGS: MobileSettings = {
  schoolName: '',
  teacherName: '',
  className: '',
  periodTimes: DEFAULT_PERIOD_TIMES,
  teacherRoles: [],
  neis: { atptCode: '', schoolCode: '' },
  sync: { deviceId: '', autoSyncInterval: 0 },
};

interface MobileSettingsState {
  settings: MobileSettings;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  setAutoSyncInterval: (interval: number) => Promise<void>;
}

export const useMobileSettingsStore = create<MobileSettingsState>((set, get) => ({
  settings: DEFAULT_MOBILE_SETTINGS,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const saved = await settingsRepository.getSettings();
      if (saved) {
        const s = saved as Settings;
        let syncDeviceId = (s as unknown as { sync?: { deviceId?: string } }).sync?.deviceId ?? '';
        // 모바일은 항상 mobile- 접두사 deviceId를 사용 (PC settings 다운로드로 인한 오염 방지)
        if (!syncDeviceId || !syncDeviceId.startsWith('mobile-')) {
          syncDeviceId = `mobile-${crypto.randomUUID()}`;
          const patched = { ...s, sync: { ...(s as unknown as { sync?: Record<string, unknown> }).sync, deviceId: syncDeviceId } };
          await settingsRepository.saveSettings(patched as Settings);
        }
        const savedSync = (s as unknown as { sync?: Record<string, unknown> }).sync;
        set({
          settings: {
            schoolName: s.schoolName ?? '',
            teacherName: s.teacherName ?? '',
            className: s.className ?? '',
            periodTimes: s.periodTimes ?? DEFAULT_PERIOD_TIMES,
            teacherRoles: (s as unknown as { teacherRoles?: readonly string[] }).teacherRoles ?? [],
            neis: {
              atptCode: (s.neis as { atptCode?: string })?.atptCode ?? '',
              schoolCode: (s.neis as { schoolCode?: string })?.schoolCode ?? '',
            },
            sync: {
              deviceId: syncDeviceId,
              autoSyncInterval: typeof savedSync?.autoSyncInterval === 'number' ? savedSync.autoSyncInterval : 0,
            },
          },
          loaded: true,
        });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  setAutoSyncInterval: async (interval: number) => {
    const current = get().settings;
    const updated: MobileSettings = {
      ...current,
      sync: { ...current.sync, autoSyncInterval: interval },
    };
    set({ settings: updated });
    try {
      const saved = await settingsRepository.getSettings();
      const base = (saved ?? {}) as Record<string, unknown>;
      const patched = {
        ...base,
        sync: { ...(base.sync as Record<string, unknown> | undefined), autoSyncInterval: interval },
      };
      await settingsRepository.saveSettings(patched as unknown as Settings);
    } catch {
      // 저장 실패 시 무시
    }
  },
}));
