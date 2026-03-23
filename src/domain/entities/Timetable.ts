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

/** 시간표 임시 변경 (특정 날짜의 특정 교시를 오버라이드) */
export interface TimetableOverride {
  readonly id: string;
  readonly date: string;           // "YYYY-MM-DD"
  readonly period: number;         // 교시 (1-based)
  readonly subject: string;        // 변경된 과목 (빈 문자열 = 자습/공강)
  readonly classroom?: string;     // 변경된 교실 (교사 시간표용)
  readonly reason?: string;        // 변경 사유 ("수업 교환", "시험", "행사" 등)
  readonly createdAt: string;
}

export interface TimetableOverridesData {
  readonly overrides: readonly TimetableOverride[];
}

export type { DayOfWeek };
