import { create } from 'zustand';
import type { Settings, WorkSymbolItem, FeedbackConfig, WidgetVisibleSections, DashboardThemeSettings, WidgetStyleSettings } from '@domain/entities/Settings';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { settingsRepository } from '@adapters/di/container';
import { detectLunchFromPeriods, getDefaultLunchTime } from '@domain/rules/periodRules';
import { generateUUID } from '@infrastructure/utils/uuid';

export const DEFAULT_WORK_SYMBOLS: readonly WorkSymbolItem[] = [
  { id: 'silence', emoji: '🤫', name: '조용히', description: '소리 내지 않고 혼자 활동합니다', bgGradient: 'from-blue-950/30 to-transparent' },
  { id: 'raise-hand', emoji: '🙋', name: '손들고 질문', description: '질문이 있으면 손을 들어주세요', bgGradient: 'from-green-950/30 to-transparent' },
  { id: 'pair-talk', emoji: '💬', name: '짝과 상의', description: '짝꿍과 작은 소리로 이야기하세요', bgGradient: 'from-yellow-950/30 to-transparent' },
  { id: 'group-work', emoji: '👥', name: '모둠 활동', description: '모둠원과 함께 활동합니다', bgGradient: 'from-purple-950/30 to-transparent' },
  { id: 'individual', emoji: '📝', name: '개인 활동', description: '스스로 생각하고 작성합니다', bgGradient: 'from-slate-950/30 to-transparent' },
];

const DEFAULT_PERIOD_TIMES: readonly PeriodTime[] = [
  { period: 1, start: '08:50', end: '09:30' },
  { period: 2, start: '09:40', end: '10:20' },
  { period: 3, start: '10:30', end: '11:10' },
  { period: 4, start: '11:20', end: '12:00' },
  { period: 5, start: '13:00', end: '13:40' },
  { period: 6, start: '13:50', end: '14:30' },
  { period: 7, start: '14:40', end: '15:20' },
];

const DEFAULT_SETTINGS: Settings = {
  schoolName: '',
  className: '',
  teacherName: '',
  subject: '',
  schoolLevel: 'middle',
  maxPeriods: 7,
  periodTimes: DEFAULT_PERIOD_TIMES,
  seatingRows: 6,
  seatingCols: 6,
  widget: {
    width: 380,
    height: 650,
    transparent: false,
    opacity: 0.8,
    cardOpacity: 1.0,
    alwaysOnTop: true,
    closeToWidget: true,
    layoutMode: 'full',
    desktopMode: 'normal',
    visibleSections: {
      dateTime: true,
      weather: true,
      message: true,
      teacherTimetable: true,
      classTimetable: false,
      events: true,
      periodBar: true,
      todayClass: false,
      seating: false,
      studentRecords: false,
      meal: false,
      memo: false,
      todo: false,
    },
  },
  system: {
    autoLaunch: false,
    notificationSound: true,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '07:00',
  },
  theme: 'system',
  fontSize: 'medium',
  neis: {
    schoolCode: '',
    atptCode: '',
    schoolName: '',
    autoSync: {
      enabled: false,
      grade: '',
      className: '',
      lastSyncDate: '',
      lastSyncWeek: '',
      syncTarget: 'class',
    },
  },
  pin: {
    enabled: false,
    pinHash: null,
    protectedFeatures: {
      timetable: false,
      seating: false,
      schedule: false,
      studentRecords: false,
      meal: false,
      memo: false,
      todo: false,
      classManagement: false,
      bookmarks: false,
    },
    autoLockMinutes: 5,
  },
  alarmSound: {
    selectedSound: 'beep',
    customAudioName: null,
    volume: 0.8,
    boost: 1,
    preWarning: {
      enabled: true,
      secondsBefore: 60,
      sound: 'gentle-chime',
    },
  },
  workSymbols: {
    symbols: DEFAULT_WORK_SYMBOLS,
  },
  weather: {
    location: null,
    refreshIntervalMin: 30,
  },
  dashboardTheme: { presetId: 'notion-light' },
  widgetStyle: {
    borderRadius: 4,
    cardColor: null,
    bgColor: null,
    accentColor: null,
    textColor: null,
    cardGap: 12,
    showBorder: false,
    borderWidth: 1,
    borderColor: null,
    shadow: 'none',
    backgroundImage: null,
    backgroundImageOpacity: 0.15,
    fontFamily: 'pretendard',
    gridRowHeight: 80,
  },
  seatingDefaultView: 'teacher',
  eventAlertEnabled: true,
  showChatbot: true,
  analytics: {
    enabled: true,
  },
  feedback: {
    // TODO: Google Forms 연동 시 formUrl에 입력 (비어있으면 클립보드 폴백 방식 사용)
    formUrl: '',
    email: 'pblsketch@gmail.com',
  },
  sync: {
    enabled: false,
    autoSyncOnStart: true,
    autoSyncOnSave: false,
    autoSyncIntervalMin: 0,
    conflictPolicy: 'latest' as const,
    lastSyncedAt: null,
    deviceId: '',  // 런타임에 generateUUID()로 초기화
  },
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
          widget: {
            ...DEFAULT_SETTINGS.widget,
            ...(saved.widget ?? {}),
            visibleSections: (() => {
              const savedVis = (saved.widget as unknown as { visibleSections?: Record<string, unknown> })?.visibleSections ?? {};
              // 기존 timetable 키 → teacherTimetable/classTimetable 마이그레이션
              const migrated: Record<string, unknown> = { ...savedVis };
              if ('timetable' in savedVis && !('teacherTimetable' in savedVis)) {
                migrated.teacherTimetable = savedVis.timetable;
                migrated.classTimetable = savedVis.timetable;
                delete migrated.timetable;
              }
              return { ...DEFAULT_SETTINGS.widget.visibleSections, ...migrated } as WidgetVisibleSections;
            })(),
            desktopMode: (() => {
              // Migrate old values → 'normal' | 'topmost'
              const rawMode = (saved.widget as unknown as { desktopMode?: string })?.desktopMode;
              if (rawMode === 'floating') return 'topmost' as const;
              if (rawMode === 'auto' || rawMode === 'desktop' || rawMode === 'behind' || rawMode === 'above') return 'normal' as const;
              return (saved.widget?.desktopMode ?? DEFAULT_SETTINGS.widget.desktopMode);
            })(),
          },
          system: { ...DEFAULT_SETTINGS.system, ...((saved as unknown as { system?: Partial<Settings['system']> }).system ?? {}) },
          neis: (() => {
            const savedNeis = (saved as unknown as { neis?: Partial<Settings['neis']> }).neis ?? {};
            const savedAutoSync = (savedNeis as unknown as { autoSync?: Partial<NonNullable<Settings['neis']['autoSync']>> }).autoSync;
            return {
              ...DEFAULT_SETTINGS.neis,
              ...savedNeis,
              autoSync: { ...DEFAULT_SETTINGS.neis.autoSync!, ...(savedAutoSync ?? {}) },
            };
          })(),
          pin: { ...DEFAULT_SETTINGS.pin, ...((saved as unknown as { pin?: Partial<Settings['pin']> }).pin ?? {}) },
          alarmSound: {
            ...DEFAULT_SETTINGS.alarmSound,
            ...((saved as unknown as { alarmSound?: Partial<Settings['alarmSound']> }).alarmSound ?? {}),
            preWarning: {
              ...DEFAULT_SETTINGS.alarmSound.preWarning,
              ...((saved as unknown as { alarmSound?: { preWarning?: Partial<Settings['alarmSound']['preWarning']> } }).alarmSound?.preWarning ?? {}),
            },
          },
          workSymbols: { ...DEFAULT_SETTINGS.workSymbols, ...((saved as unknown as { workSymbols?: Partial<Settings['workSymbols']> }).workSymbols ?? {}) },
          weather: { ...DEFAULT_SETTINGS.weather, ...((saved as unknown as { weather?: Partial<Settings['weather']> }).weather ?? {}) },
          feedback: { ...DEFAULT_SETTINGS.feedback, ...((saved as unknown as { feedback?: Partial<FeedbackConfig> }).feedback ?? {}) } as FeedbackConfig,
          sync: (() => {
            const savedSync = (saved as unknown as { sync?: Record<string, unknown> }).sync ?? {};
            const defaults = DEFAULT_SETTINGS.sync!;
            return { ...defaults, ...savedSync };
          })(),
          dashboardTheme: (saved as unknown as { dashboardTheme?: DashboardThemeSettings }).dashboardTheme,
          widgetStyle: (saved as unknown as { widgetStyle?: WidgetStyleSettings }).widgetStyle,
          subjectColors: (saved as unknown as { subjectColors?: Settings['subjectColors'] }).subjectColors,
          timetableColorBy: (saved as unknown as { timetableColorBy?: Settings['timetableColorBy'] }).timetableColorBy,
          classroomColors: (saved as unknown as { classroomColors?: Settings['classroomColors'] }).classroomColors,
          favoriteTools: (saved as unknown as { favoriteTools?: Settings['favoriteTools'] }).favoriteTools,
          bookmarkWidgetHiddenGroups: (saved as unknown as { bookmarkWidgetHiddenGroups?: Settings['bookmarkWidgetHiddenGroups'] }).bookmarkWidgetHiddenGroups,
          bookmarkWidgetHiddenBookmarks: (saved as unknown as { bookmarkWidgetHiddenBookmarks?: Settings['bookmarkWidgetHiddenBookmarks'] }).bookmarkWidgetHiddenBookmarks,
          lunchStart: (saved as unknown as { lunchStart?: string }).lunchStart,
          lunchEnd: (saved as unknown as { lunchEnd?: string }).lunchEnd,
        };
        // maxPeriods가 periodTimes 개수보다 작으면 보정 (온보딩 버그 마이그레이션)
        let corrected = merged.periodTimes && merged.maxPeriods < merged.periodTimes.length
          ? { ...merged, maxPeriods: merged.periodTimes.length }
          : merged;

        // lunchStart/lunchEnd 마이그레이션 (기존 사용자)
        if (!corrected.lunchStart) {
          const detected = detectLunchFromPeriods(corrected.periodTimes);
          if (detected) {
            corrected = { ...corrected, lunchStart: detected.start, lunchEnd: detected.end };
          } else {
            const defaults = getDefaultLunchTime(corrected.schoolLevel);
            corrected = { ...corrected, lunchStart: defaults.start, lunchEnd: defaults.end };
          }
          void settingsRepository.saveSettings(corrected);
        }

        // sync.deviceId 자동 초기화
        if (!corrected.sync?.deviceId) {
          const syncWithId = {
            ...(corrected.sync ?? DEFAULT_SETTINGS.sync!),
            deviceId: generateUUID(),
          };
          corrected = { ...corrected, sync: syncWithId } as Settings;
          // deviceId 생성 즉시 저장
          void settingsRepository.saveSettings(corrected);
        }

        set({ settings: corrected, loaded: true, isFirstRun: false });
      } else {
        set({ loaded: true, isFirstRun: true });
      }
    } catch {
      set({ loaded: true, isFirstRun: true });
    }
  },

  update: async (patch) => {
    const current = get().settings;
    const next = {
      ...current,
      ...patch,
      // 중첩 객체는 명시적 딥 머지 (부분 업데이트 시 기존 값 보존)
      weather: patch.weather
        ? { ...current.weather, ...patch.weather }
        : current.weather,
      neis: patch.neis
        ? { ...current.neis, ...patch.neis }
        : current.neis,
      widget: patch.widget
        ? { ...current.widget, ...patch.widget }
        : current.widget,
      system: patch.system
        ? { ...current.system, ...patch.system }
        : current.system,
    };
    set({ settings: next });
    await settingsRepository.saveSettings(next);
  },

  completeOnboarding: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next, isFirstRun: false });
    await settingsRepository.saveSettings(next);
  },
}));
