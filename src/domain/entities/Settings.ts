import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { PinSettings } from './PinSettings';
import type { NeisScheduleSettings } from './NeisSchedule';
import type { PresetThemeId, ThemeColors } from './DashboardTheme';
import type { SubjectColorMap } from '../valueObjects/SubjectColor';

export interface DashboardThemeSettings {
  readonly presetId: PresetThemeId | 'custom';
  readonly customColors?: ThemeColors;
}

export type SchoolLevel = 'elementary' | 'middle' | 'high';

export type AlarmSoundId = 'beep' | 'school-bell' | 'alarm-clock' | 'gentle-chime' | 'buzzer' | 'custom';

export type PreWarningSoundId = 'gentle-chime' | 'soft-bell' | 'tick-tock';

export interface PreWarningSettings {
  readonly enabled: boolean;
  readonly secondsBefore: number;
  readonly sound: PreWarningSoundId;
}

export interface WorkSymbolItem {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
  readonly description: string;
  readonly bgGradient: string;
}

export interface WorkSymbolsSettings {
  readonly symbols: readonly WorkSymbolItem[];
}

export interface AlarmSoundSettings {
  readonly selectedSound: AlarmSoundId;
  readonly customAudioName: string | null;
  readonly volume: number; // 0.0 ~ 1.0
  readonly boost: number;  // 1 | 2 | 3 | 4 — 볼륨 증폭 배수
  readonly preWarning: PreWarningSettings;
}

export type WidgetLayoutMode = 'full' | 'split-h' | 'split-v' | 'quad';

// 바탕화면 고정 모드
// - 'auto': WorkerW 연결 시도 + 입력 검증 + 실패 시 플로팅 폴백
// - 'desktop': WorkerW 강제 연결 (검증 없음, 고급 사용자용)
// - 'floating': WorkerW 연결 안 함, 항상 플로팅 모드
export type WidgetDesktopMode = 'auto' | 'desktop' | 'floating';

export interface WidgetVisibleSections {
  readonly dateTime: boolean;
  readonly weather: boolean;
  readonly message: boolean;
  readonly teacherTimetable: boolean;
  readonly classTimetable: boolean;
  readonly events: boolean;
  readonly periodBar: boolean;
  readonly todayClass: boolean;
  readonly seating: boolean;
  readonly studentRecords: boolean;
  readonly meal: boolean;
  readonly memo: boolean;
  readonly todo: boolean;
}

export interface WidgetSettings {
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly cardOpacity: number;
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean;
  readonly visibleSections: WidgetVisibleSections;
  readonly layoutMode: WidgetLayoutMode;
  readonly desktopMode: WidgetDesktopMode;
}

export interface SystemSettings {
  readonly autoLaunch: boolean;
  readonly notificationSound: boolean;
  readonly doNotDisturbStart: string; // "HH:mm"
  readonly doNotDisturbEnd: string;   // "HH:mm"
}

export interface NeisSettings {
  readonly schoolCode: string;      // SD_SCHUL_CODE
  readonly atptCode: string;        // ATPT_OFCDC_SC_CODE
  readonly schoolName: string;      // 선택된 학교명
}

export interface WeatherLocation {
  readonly lat: number;
  readonly lon: number;
  readonly name: string;            // 표시용 지역명 (예: "서울 강남구")
}

export interface WeatherSettings {
  readonly location: WeatherLocation | null;
  readonly refreshIntervalMin: number;  // 갱신 주기 (분)
}

export interface FeedbackConfig {
  readonly formUrl: string;  // Google Forms URL (비어있으면 클립보드 폴백)
  readonly email: string;
}

export interface Settings {
  readonly schoolName: string;
  readonly className: string;
  readonly teacherName: string;
  readonly subject: string;
  readonly schoolLevel: SchoolLevel;
  readonly maxPeriods: number;
  readonly periodTimes: readonly PeriodTime[];
  readonly seatingRows: number;
  readonly seatingCols: number;
  readonly widget: WidgetSettings;
  readonly system: SystemSettings;
  readonly theme: 'light' | 'dark' | 'system';
  readonly fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  readonly neis: NeisSettings;
  readonly pin: PinSettings;
  readonly alarmSound: AlarmSoundSettings;
  readonly workSymbols: WorkSymbolsSettings;
  readonly weather: WeatherSettings;
  readonly analytics?: {
    readonly enabled: boolean;
  };
  readonly menuOrder?: readonly string[];
  readonly hiddenMenus?: readonly string[];
  readonly feedback?: FeedbackConfig;
  readonly neisSchedule?: NeisScheduleSettings;
  readonly dashboardTheme?: DashboardThemeSettings;
  readonly subjectColors?: SubjectColorMap;
}
