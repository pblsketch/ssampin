import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { PinSettings } from './PinSettings';

export type SchoolLevel = 'elementary' | 'middle' | 'high';

export type AlarmSoundId = 'beep' | 'school-bell' | 'alarm-clock' | 'gentle-chime' | 'buzzer' | 'custom';

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
}

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
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean;
  readonly visibleSections: WidgetVisibleSections;
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
  readonly menuOrder?: readonly string[];
  readonly feedback?: FeedbackConfig;
}
