import type { DayOfWeek } from '../valueObjects/DayOfWeek';

/** 교사가 해당 교시에 가르치는 정보 */
export interface TeacherPeriod {
  readonly subject: string;
  readonly classroom: string;
}

/** 우리 반 시간표 데이터 (요일 × 교시 → 과목명) */
export interface ClassScheduleData {
  readonly [day: string]: readonly string[]; // day = DayOfWeek, index = 교시(0-based)
}

/** 교사 개인 시간표 데이터 (요일 × 교시 → TeacherPeriod) */
export interface TeacherScheduleData {
  readonly [day: string]: readonly (TeacherPeriod | null)[]; // day = DayOfWeek
}

export type { DayOfWeek };
