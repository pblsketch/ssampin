import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
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
  mealSchool?: { schoolCode: string; atptCode: string; schoolName: string };
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

// autoSyncInterval은 모바일 전용 설정 — Drive sync로 덮어써지지 않도록 localStorage에 독립 저장
const AUTO_SYNC_KEY = 'ssampin-mobile-auto-sync-interval';

function readAutoSyncInterval(): number {
  try {
    const v = localStorage.getItem(AUTO_SYNC_KEY);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}

function writeAutoSyncInterval(interval: number): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY, String(interval));
  } catch {
    /* ignore */
  }
}

/** updateSettings 로 모바일에서 편집 가능한 필드. (sync.deviceId 등은 보존된다) */
type EditableSettings = Partial<
  Pick<MobileSettings, 'schoolName' | 'teacherName' | 'className' | 'periodTimes'>
>;

interface MobileSettingsState {
  settings: MobileSettings;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  setAutoSyncInterval: (interval: number) => Promise<void>;
  /** 모바일에서 설정 일부를 편집·저장. 로컬(IndexedDB) 반영 + Drive 동기화 트리거(인증 시). mobile- 접두사 deviceId 보존. */
  updateSettings: (patch: EditableSettings) => Promise<void>;
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
          syncDeviceId = `mobile-${generateUUID()}`;
          const patched = {
            ...s,
            sync: {
              ...(s as unknown as { sync?: Record<string, unknown> }).sync,
              deviceId: syncDeviceId,
            },
          };
          await settingsRepository.saveSettings(patched as Settings);
        }
        const rawMealSchool = (
          s as unknown as {
            mealSchool?: { schoolCode?: string; atptCode?: string; schoolName?: string };
          }
        ).mealSchool;
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
            mealSchool: rawMealSchool?.schoolCode
              ? {
                  schoolCode: rawMealSchool.schoolCode,
                  atptCode: rawMealSchool.atptCode ?? '',
                  schoolName: rawMealSchool.schoolName ?? '',
                }
              : undefined,
            sync: {
              deviceId: syncDeviceId,
              autoSyncInterval: readAutoSyncInterval(),
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
    writeAutoSyncInterval(interval);
  },

  updateSettings: async (patch: EditableSettings) => {
    const current = get().settings;
    set({ settings: { ...current, ...patch } });
    // IndexedDB 반영 — 기존 Settings 를 읽어 patch 만 덮어쓴다(sync.deviceId 등 모델 안 한 필드 보존)
    try {
      const existing = ((await settingsRepository.getSettings()) ?? {}) as Settings;
      await settingsRepository.saveSettings({ ...existing, ...patch } as Settings);
    } catch {
      /* ignore */
    }
    // Drive 동기화 트리거 (인증된 경우만 동작; 기존 충돌 해결 메커니즘이 그대로 적용된다)
    try {
      const { useMobileDriveSyncStore } = await import('./useMobileDriveSyncStore');
      const trigger = useMobileDriveSyncStore.getState().triggerSaveSync;
      if (typeof trigger === 'function') trigger();
    } catch {
      /* ignore */
    }
  },
}));
