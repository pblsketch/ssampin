import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { DayOfWeekWithSat } from '../valueObjects/DayOfWeek';
import type { SchoolLevel } from '../entities/Settings';

/**
 * "HH:mm" 형식 시간 문자열을 분(minute) 단위 숫자로 변환
 * @example parseMinutes("08:50") → 530
 */
export function parseMinutes(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/**
 * Date 객체에서 한국어 요일 반환
 * enableSaturday가 true면 토요일도 반환, 아니면 토/일 = null
 */
export function getDayOfWeek(
  date: Date,
  enableSaturday: boolean = false,
): DayOfWeekWithSat | null {
  const jsDay = date.getDay(); // 0=일, 1=월, ..., 6=토
  if (jsDay === 0) return null; // 일요일
  if (jsDay === 6) return enableSaturday ? '토' : null; // 토요일
  const weekdays: DayOfWeekWithSat[] = ['월', '화', '수', '목', '금'];
  return weekdays[jsDay - 1] ?? null;
}

/**
 * 현재 시각이 몇 교시인지 반환 (수업 시간 외이면 null)
 */
export function getCurrentPeriod(
  periodTimes: readonly PeriodTime[],
  now: Date,
): number | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const pt of periodTimes) {
    const start = parseMinutes(pt.start);
    const end = parseMinutes(pt.end);
    if (nowMinutes >= start && nowMinutes < end) {
      return pt.period;
    }
  }

  return null;
}

/* ─── 학교급별 프리셋 ─── */

/** 학교급별 기본 수업 시간(분) */
export const PERIOD_DURATION: Record<SchoolLevel, number> = {
  elementary: 40,
  middle: 45,
  high: 50,
  custom: 50,
};

/** 학교급별 기본 교시 수 */
const DEFAULT_TOTAL_PERIODS: Record<SchoolLevel, number> = {
  elementary: 6,
  middle: 7,
  high: 7,
  custom: 6,
};

/** 학교급별 기본 1교시 시작 시간(분) */
const DEFAULT_FIRST_START: Record<SchoolLevel, number> = {
  elementary: 9 * 60,       // 09:00
  middle: 8 * 60 + 50,      // 08:50
  high: 8 * 60 + 50,        // 08:50
  custom: 9 * 60,            // 09:00
};

/** 학교급별 기본 점심 시간(분) */
const DEFAULT_LUNCH_DURATION: Record<SchoolLevel, number> = {
  elementary: 50,
  middle: 50,
  high: 60,
  custom: 60,
};

export function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface PeriodPreset {
  schoolLevel: SchoolLevel;
  firstPeriodStart: string; // "HH:mm"
  breakDuration: number;    // 분
  lunchAfterPeriod: number; // 점심 시작 교시 (이 교시 직후 점심)
  lunchDuration: number;    // 분
  totalPeriods: number;
  customPeriodDuration?: number;
}

/** 학교급별 기본 프리셋 값 */
export function getDefaultPreset(level: SchoolLevel): PeriodPreset {
  return {
    schoolLevel: level,
    firstPeriodStart: formatTime(DEFAULT_FIRST_START[level]),
    breakDuration: 10,
    lunchAfterPeriod: 4,
    lunchDuration: DEFAULT_LUNCH_DURATION[level],
    totalPeriods: DEFAULT_TOTAL_PERIODS[level],
    customPeriodDuration: level === 'custom' ? 50 : undefined,
  };
}

/**
 * 프리셋 기반으로 교시 시간표 자동 생성
 */
export function generatePeriodTimes(preset: PeriodPreset): PeriodTime[] {
  const classDuration = preset.schoolLevel === 'custom' && preset.customPeriodDuration
    ? preset.customPeriodDuration
    : PERIOD_DURATION[preset.schoolLevel];
  const result: PeriodTime[] = [];
  let cursor = parseMinutes(preset.firstPeriodStart);

  for (let i = 1; i <= preset.totalPeriods; i++) {
    // 점심 시간 삽입
    if (i === preset.lunchAfterPeriod + 1) {
      cursor += preset.lunchDuration;
    }

    const start = cursor;
    const end = start + classDuration;
    result.push({
      period: i,
      start: formatTime(start),
      end: formatTime(end),
    });

    cursor = end + preset.breakDuration;
  }

  return result;
}

/** 학교급별 기본 점심시간 */
export function getDefaultLunchTime(level: SchoolLevel): { start: string; end: string } {
  switch (level) {
    case 'elementary': return { start: '12:00', end: '12:50' };
    case 'middle':     return { start: '12:00', end: '12:50' };
    case 'high':       return { start: '12:50', end: '13:50' };
    default:           return { start: '12:00', end: '13:00' };
  }
}

/** 기존 교시 시간표에서 점심시간 추정 (마이그레이션용) */
export function detectLunchFromPeriods(periodTimes: readonly PeriodTime[]): { start: string; end: string } | null {
  for (let i = 1; i < periodTimes.length; i++) {
    const prevEnd = parseMinutes(periodTimes[i - 1]!.end);
    const currStart = parseMinutes(periodTimes[i]!.start);
    if (currStart - prevEnd >= 30) {
      return {
        start: periodTimes[i - 1]!.end,
        end: periodTimes[i]!.start,
      };
    }
  }
  return null;
}
