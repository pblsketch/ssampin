import { create } from 'zustand';
import type { Settings, SchoolLevel } from '@domain/entities/Settings';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';
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
  /**
   * 학기별 개학일 · 마무리가 기록한 학기 — **읽기 전용 투영**(데스크톱에서만 편집한다).
   * "이번 학기" 통계가 PC와 폰에서 다른 답을 내지 않게 하려면 여기까지 내려와야 한다.
   */
  termStartDates?: Readonly<Record<string, string>>;
  currentTerm?: string;
  /**
   * 학기 마지막 수업일 — 같은 이유로 내려온다. 이게 없으면 폰에서는 학기 차시를 셀 수 없어
   * "학기 마지막 수업일을 알려주세요"만 계속 뜬다(PC에서는 이미 답한 상태인데도).
   */
  termEndDates?: Readonly<Record<string, string>>;
  /**
   * 주말 수업 설정 — 토·일에 수업이 있는 학교에서 이 값이 없으면 폰만 그 날들을 빼고 세어
   * **PC와 차시가 달라진다.**
   */
  enableWeekendDays?: readonly WeekendDay[];
  /**
   * 일정 달력에 할 일 마감일을 함께 표시할지 — **읽기 전용 투영**(데스크톱에서만 끈다).
   *
   * 끄는 스위치를 폰에 두지 않은 이유: 이 설정이 있는 까닭은 "할 일 제목에 학생 이름이
   * 들어가는데 일정 달력이 교무실 큰 모니터에 그대로 뜬다"는 것이다. 폰 화면은 그 상황이
   * 아니라 좁은 화면에 스위치를 하나 더 얹을 이유가 없다. 다만 PC 에서 껐다면 폰도 따라
   * 꺼져야 한다 — 한 스위치가 두 답을 내면 껐다고 믿은 쪽이 배신당한다.
   *
   * 미설정(undefined) = 켬. 데스크톱의 `?? true` 와 같은 판단을 여기서도 해야 한다.
   */
  scheduleShowTodos?: boolean;
  /**
   * 학교급 — **읽기 전용 투영**(데스크톱에서만 편집한다).
   *
   * 담임 출결 화면이 교시를 보여줄지 가른다. 초등 담임은 거의 전 교시의 출결을 관리하지만
   * 중·고 담임은 조회·종례만 보면 된다 — 한 화면으로 둘 다 맞출 수 없어 학교급으로 나눈다.
   * 같은 축의 선례: 시간표 색 구분(초등은 교실이 아니라 과목), 수업반 추가 마법사.
   */
  schoolLevel?: SchoolLevel;
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
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
  reload: () => Promise<void>;
  setAutoSyncInterval: (interval: number) => Promise<void>;
  /** 모바일에서 설정 일부를 편집·저장. 로컬(IndexedDB) 반영 + Drive 동기화 트리거(인증 시). */
  updateSettings: (patch: EditableSettings) => Promise<void>;
}

export const useMobileSettingsStore = create<MobileSettingsState>((set, get) => ({
  settings: DEFAULT_MOBILE_SETTINGS,
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const saved = await settingsRepository.getSettings();
      if (saved) {
        const s = saved as Settings;
        // 모바일 동기화 ID는 useMobileDriveSyncStore의 localStorage 전용 키가 정본이다.
        // 클라우드에서 받은 settings.sync.deviceId를 load 중 다시 저장하면 로컬 장부의
        // 체크섬과 실제 설정이 갈라져 다음 새로고침에서 같은 충돌이 재생성된다.
        const syncDeviceId =
          (s as unknown as { sync?: { deviceId?: string } }).sync?.deviceId ?? '';
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
            termStartDates: s.termStartDates,
            currentTerm: s.currentTerm,
            termEndDates: s.termEndDates,
            enableWeekendDays: s.enableWeekendDays,
            scheduleShowTodos: s.scheduleShowTodos,
            schoolLevel: s.schoolLevel,
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
    await get().load(true);
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
