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

export interface WidgetSettings {
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly alwaysOnTop: boolean;
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
  readonly menuOrder?: readonly string[];
}
