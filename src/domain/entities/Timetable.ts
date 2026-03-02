import type { DayOfWeek } from '../valueObjects/DayOfWeek';

/** 교사가 해당 교시에 가르치는 정보 */
export interface TeacherPeriod {
  readonly subject: string;
  readonly classroom: string;
}

/** 학급 시간표의 한 교시 정보 (과목 + 담당 교사) */
export interface ClassPeriod {
  readonly subject: string;
  readonly teacher: string;
}

/** 우리 반 시간표 데이터 (요일 × 교시 → 과목+교사) */
export interface ClassScheduleData {
  readonly [day: string]: readonly ClassPeriod[]; // day = DayOfWeek, index = 교시(0-based)
}

/** 교사 개인 시간표 데이터 (요일 × 교시 → TeacherPeriod) */
export interface TeacherScheduleData {
  readonly [day: string]: readonly (TeacherPeriod | null)[]; // day = DayOfWeek
}

/** 기존 string[] 포맷 (마이그레이션용) */
export type LegacyClassScheduleData = {
  readonly [day: string]: readonly string[];
};

export type { DayOfWeek };
