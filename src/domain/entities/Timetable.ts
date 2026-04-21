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

/**
 * 변동 시간표 유형
 * - swap: 수업 교체 (두 슬롯이 짝을 이룸. pairId로 연결)
 * - substitute: 보강 (다른 교사/과목이 들어옴)
 * - cancel: 자습/공강 (수업 취소)
 * - custom: 기타 (자유 입력)
 */
export type TimetableOverrideKind = 'swap' | 'substitute' | 'cancel' | 'custom';

/**
 * 변동 적용 범위
 * - teacher: 교사 시간표에만 적용 (내가 다른 반에 가거나, 보강으로 다른 수업을 대신)
 * - class:   학급 시간표에만 적용 (우리 반에 다른 교사가 들어오거나 자습)
 * - both:    양쪽 모두 적용 (수업 교체, 시험 등 양쪽에 동일하게 반영)
 * 기존 데이터(undefined)는 'both'로 해석한다.
 */
export type TimetableOverrideScope = 'teacher' | 'class' | 'both';

/** 시간표 임시 변경 (특정 날짜의 특정 교시를 오버라이드) */
export interface TimetableOverride {
  readonly id: string;
  readonly date: string;           // "YYYY-MM-DD"
  readonly period: number;         // 교시 (1-based)
  readonly subject: string;        // 변경된 과목 (빈 문자열 = 자습/공강)
  readonly classroom?: string;     // 변경된 교실 (교사 시간표용)
  readonly reason?: string;        // 변경 사유 ("수업 교환", "시험", "행사" 등)
  readonly createdAt: string;
  readonly updatedAt?: string;     // 마지막 수정 시각 (optional — 기존 데이터 호환)

  // --- 변동 유형 확장 (optional, backward compatible) ---
  readonly kind?: TimetableOverrideKind;
  /** swap일 때 짝이 되는 두 override를 잇는 식별자 (예: "pair-{timestamp}") */
  readonly pairId?: string;
  /** substitute일 때 대신 수업하는 교사 이름 */
  readonly substituteTeacher?: string;
  /** 변동이 적용되는 뷰 범위. undefined → 'both' (기존 데이터 호환) */
  readonly scope?: TimetableOverrideScope;
}

export interface TimetableOverridesData {
  readonly overrides: readonly TimetableOverride[];
}

export type { DayOfWeek };
