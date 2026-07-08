import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { DayOfWeekFull, WeekendDay } from '../valueObjects/DayOfWeek';
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
 * weekendDays에 포함된 주말 요일만 반환, 나머지 주말은 null
 */
export function getDayOfWeek(
  date: Date,
  weekendDays?: readonly WeekendDay[],
): DayOfWeekFull | null {
  const jsDay = date.getDay(); // 0=일, 1=월, ..., 6=토
  if (jsDay === 0) return weekendDays?.includes('일') ? '일' : null;
  if (jsDay === 6) return weekendDays?.includes('토') ? '토' : null;
  const weekdays: DayOfWeekFull[] = ['월', '화', '수', '목', '금'];
  return weekdays[jsDay - 1] ?? null;
}

/**
 * 현재 시각이 몇 교시인지 반환 (수업 시간 외이면 null)
 */
export function getCurrentPeriod(periodTimes: readonly PeriodTime[], now: Date): number | null {
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

/**
 * '방금 끝난 교시'를 반환한다 — now 직전에 종료된 교시 중 가장 최근 것.
 * '수업 직후' 관찰 알림 트리거([D1])용.
 *
 * - 수업 중(교시 진행 중)에는 null (아직 끝나지 않음).
 * - graceMinutes(기본 10분) 이내에 끝난 교시만 유효 — 오래 전에 끝난 교시를 잡아
 *   엉뚱한 시점에 알리는 오탐을 막는다.
 */
export function getJustFinishedPeriod(
  periodTimes: readonly PeriodTime[],
  now: Date,
  graceMinutes = 10,
): number | null {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let best: { period: number; end: number } | null = null;
  for (const pt of periodTimes) {
    const end = parseMinutes(pt.end);
    if (end <= nowMinutes && nowMinutes - end <= graceMinutes) {
      if (!best || end > best.end) best = { period: pt.period, end };
    }
  }
  return best ? best.period : null;
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
  elementary: 9 * 60, // 09:00
  middle: 8 * 60 + 50, // 08:50
  high: 8 * 60 + 50, // 08:50
  custom: 9 * 60, // 09:00
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
  breakDuration: number; // 분
  lunchAfterPeriod: number; // 점심 시작 교시 (이 교시 직후 점심)
  lunchDuration: number; // 분
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
  const classDuration =
    preset.schoolLevel === 'custom' && preset.customPeriodDuration
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
    case 'elementary':
      return { start: '12:00', end: '12:50' };
    case 'middle':
      return { start: '12:00', end: '12:50' };
    case 'high':
      return { start: '12:50', end: '13:50' };
    default:
      return { start: '12:00', end: '13:00' };
  }
}

/** 기존 교시 시간표에서 점심시간 추정 (마이그레이션용) */
export function detectLunchFromPeriods(
  periodTimes: readonly PeriodTime[],
): { start: string; end: string } | null {
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

/**
 * [fromIndex, end) 구간의 모든 교시 시작·종료 시각을 deltaMinutes(음수 가능)만큼 평행 이동.
 * 입력 배열은 변경하지 않고 새 배열을 반환한다.
 */
export function shiftPeriodsFrom(
  periodTimes: readonly PeriodTime[],
  fromIndex: number,
  deltaMinutes: number,
): PeriodTime[] {
  return periodTimes.map((pt, i) => {
    if (i < fromIndex) return pt;
    return {
      period: pt.period,
      start: formatTime(parseMinutes(pt.start) + deltaMinutes),
      end: formatTime(parseMinutes(pt.end) + deltaMinutes),
    };
  });
}

/**
 * 모든 교시 시작·종료 시각이 00:00~23:59 범위에 들어가는지 검사.
 */
export function validatePeriodTimes(periodTimes: readonly PeriodTime[]): boolean {
  return periodTimes.every((pt) => {
    const s = parseMinutes(pt.start);
    const e = parseMinutes(pt.end);
    return s >= 0 && s <= 1439 && e >= 0 && e <= 1439;
  });
}

/**
 * 점심을 targetAfter 직후로 옮길 때 평행 이동된 교시 배열을 반환한다.
 * canMoveLunch와 moveLunchToAfterPeriod가 공통으로 사용하는 핵심 산식.
 */
function shiftPeriodsForLunchTarget(
  periodTimes: readonly PeriodTime[],
  targetAfter: number,
  lunchDurationMinutes: number,
): PeriodTime[] {
  const oldNextStart = parseMinutes(periodTimes[targetAfter]!.start);
  const newPrevEnd = parseMinutes(periodTimes[targetAfter - 1]!.end);
  const delta = newPrevEnd + lunchDurationMinutes - oldNextStart;
  return shiftPeriodsFrom(periodTimes, targetAfter, delta);
}

/**
 * 점심을 N교시 후로 이동 가능한지 검사. 결과만 반환(부작용 없음).
 *
 * reason:
 * - 'noop': targetAfter === currentAfter
 * - 'boundary': targetAfter < 1 또는 targetAfter >= periodTimes.length
 * - 'invalid-duration': lunchDurationMinutes <= 0
 * - 'overflow': 결과 교시가 23:59를 초과
 */
export function canMoveLunch(
  periodTimes: readonly PeriodTime[],
  currentAfter: number,
  targetAfter: number,
  lunchDurationMinutes: number,
): { allowed: boolean; reason?: 'noop' | 'boundary' | 'overflow' | 'invalid-duration' } {
  if (lunchDurationMinutes <= 0) return { allowed: false, reason: 'invalid-duration' };
  if (targetAfter === currentAfter) return { allowed: false, reason: 'noop' };
  if (targetAfter < 1 || targetAfter >= periodTimes.length)
    return { allowed: false, reason: 'boundary' };

  const moved = shiftPeriodsForLunchTarget(periodTimes, targetAfter, lunchDurationMinutes);
  if (!validatePeriodTimes(moved)) return { allowed: false, reason: 'overflow' };
  return { allowed: true };
}

/**
 * 점심 위치를 targetAfter 직후로 이동.
 * - 이전 교시는 보존, 점심 이후 교시는 평행 이동.
 * - 실패 시 입력 그대로 반환, status로 결과 구분.
 */
export function moveLunchToAfterPeriod(
  periodTimes: readonly PeriodTime[],
  currentAfter: number,
  targetAfter: number,
  lunchDurationMinutes: number,
): {
  periodTimes: PeriodTime[];
  lunchStart: string;
  lunchEnd: string;
  lunchAfterPeriod: number;
  status: 'moved' | 'noop' | 'boundary' | 'overflow' | 'invalid-duration';
} {
  const check = canMoveLunch(periodTimes, currentAfter, targetAfter, lunchDurationMinutes);
  if (!check.allowed) {
    const inRange = currentAfter >= 1 && currentAfter < periodTimes.length;
    return {
      periodTimes: [...periodTimes],
      lunchStart: inRange ? periodTimes[currentAfter - 1]!.end : '',
      lunchEnd: inRange ? periodTimes[currentAfter]!.start : '',
      lunchAfterPeriod: currentAfter,
      status: check.reason ?? 'noop',
    };
  }

  const shifted = shiftPeriodsForLunchTarget(periodTimes, targetAfter, lunchDurationMinutes);
  return {
    periodTimes: shifted,
    lunchStart: shifted[targetAfter - 1]!.end,
    lunchEnd: shifted[targetAfter]!.start,
    lunchAfterPeriod: targetAfter,
    status: 'moved',
  };
}

/**
 * 교시 시간 배열에서 점심 위치를 추정 (마이그레이션/폴백용).
 * detectLunchFromPeriods의 결과를 1-based 위치로 변환.
 * 추정 실패 시 null.
 */
export function inferLunchAfterPeriod(periodTimes: readonly PeriodTime[]): number | null {
  const lunchRange = detectLunchFromPeriods(periodTimes);
  if (!lunchRange) return null;
  // detectLunchFromPeriods는 prevEnd == periodTimes[i-1].end 인 i를 찾는다
  for (let i = 1; i < periodTimes.length; i++) {
    if (periodTimes[i - 1]!.end === lunchRange.start && periodTimes[i]!.start === lunchRange.end) {
      return i; // i는 0-based 인덱스이자 1-based "i교시 후" 위치 (i교시가 끝나고 i+1교시 시작 사이)
    }
  }
  return null;
}
