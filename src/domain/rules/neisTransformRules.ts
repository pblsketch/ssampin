/**
 * 나이스(NEIS) API 응답 → 쌤핀 시간표 데이터 변환 규칙
 * 순수 함수만 포함 (외부 의존 없음)
 */
import { DAYS_OF_WEEK, getActiveDays } from '../valueObjects/DayOfWeek';
import type { DayOfWeekWithSat } from '../valueObjects/DayOfWeek';
import type { ClassScheduleData, TeacherScheduleData, ClassPeriod, TeacherPeriod } from '../entities/Timetable';
import type { NeisTimetableRow } from '../entities/NeisTimetable';

/** YYYYMMDD → 요일 (월~금, enableSaturday면 토 포함) */
function dateToDayOfWeek(yyyymmdd: string, enableSaturday: boolean = false): DayOfWeekWithSat | null {
  const y = parseInt(yyyymmdd.substring(0, 4), 10);
  const m = parseInt(yyyymmdd.substring(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8), 10);
  const date = new Date(y, m, d);

  if (isNaN(date.getTime())) return null;

  const jsDay = date.getDay(); // 0=일, 1=월, ..., 6=토
  if (jsDay === 0) return null; // 일요일은 항상 제외
  if (jsDay === 6) return enableSaturday ? '토' : null;
  return (DAYS_OF_WEEK[jsDay - 1] as DayOfWeekWithSat) ?? null;
}

/** 유효한 교시 번호인지 확인 (1~12) */
function isValidPeriod(perio: string): boolean {
  const n = parseInt(perio, 10);
  return !isNaN(n) && n >= 1 && n <= 12;
}

/** 응답 데이터에서 최대 교시 수 계산 */
export function getMaxPeriod(rows: readonly NeisTimetableRow[]): number {
  let max = 0;
  for (const row of rows) {
    const n = parseInt(row.PERIO, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

/**
 * 나이스 API 응답 → ClassScheduleData 변환
 *
 * ClassScheduleData = { 월: ClassPeriod[], 화: ClassPeriod[], ... }
 * ClassPeriod = { subject: string, teacher: string }
 */
export function transformToClassSchedule(
  rows: readonly NeisTimetableRow[],
  maxPeriods?: number,
  enableSaturday: boolean = false,
): ClassScheduleData {
  const effectiveMax = maxPeriods ?? getMaxPeriod(rows);
  if (effectiveMax === 0) return createEmpty(effectiveMax, enableSaturday);

  // 초기화: 빈 ClassPeriod 배열
  const activeDays = getActiveDays(enableSaturday);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: effectiveMax }, () => ({ subject: '', teacher: '' }));
  }

  // 데이터 채우기
  for (const row of rows) {
    if (!isValidPeriod(row.PERIO)) continue;
    const dayOfWeek = dateToDayOfWeek(row.ALL_TI_YMD, enableSaturday);
    if (!dayOfWeek) continue;

    const periodIdx = parseInt(row.PERIO, 10) - 1;
    if (periodIdx >= effectiveMax) continue;

    const subject = row.ITRT_CNTNT.trim() || '(미정)';
    const arr = data[dayOfWeek];
    if (arr) {
      arr[periodIdx] = { subject, teacher: '' };
    }
  }

  return data as ClassScheduleData;
}

/**
 * 나이스 API 응답 → TeacherScheduleData 변환 (단일 반)
 *
 * TeacherScheduleData = { 월: (TeacherPeriod | null)[], ... }
 * TeacherPeriod = { subject: string, classroom: string }
 */
export function transformToTeacherSchedule(
  rows: readonly NeisTimetableRow[],
  grade: string,
  className: string,
  maxPeriods?: number,
  enableSaturday: boolean = false,
): TeacherScheduleData {
  const effectiveMax = maxPeriods ?? getMaxPeriod(rows);
  if (effectiveMax === 0) return createEmptyTeacher(effectiveMax, enableSaturday);

  const classroom = `${grade}-${className}`;

  const activeDays = getActiveDays(enableSaturday);
  const data: Record<string, (TeacherPeriod | null)[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: effectiveMax }, () => null);
  }

  for (const row of rows) {
    if (!isValidPeriod(row.PERIO)) continue;
    const dayOfWeek = dateToDayOfWeek(row.ALL_TI_YMD, enableSaturday);
    if (!dayOfWeek) continue;

    const periodIdx = parseInt(row.PERIO, 10) - 1;
    if (periodIdx >= effectiveMax) continue;

    const subject = row.ITRT_CNTNT.trim() || '(미정)';
    const arr = data[dayOfWeek];
    if (arr) {
      arr[periodIdx] = { subject, classroom };
    }
  }

  return data as TeacherScheduleData;
}

/**
 * 여러 반의 시간표를 하나의 교사 시간표로 병합
 * 같은 요일/교시에 여러 반의 수업이 있으면 첫 번째만 사용
 */
export function mergeClassTimetablesToTeacher(
  classResults: readonly { grade: string; className: string; rows: readonly NeisTimetableRow[] }[],
  maxPeriods?: number,
  enableSaturday: boolean = false,
): TeacherScheduleData {
  // 전체 데이터에서 최대 교시 계산
  const allRows = classResults.flatMap((r) => r.rows);
  const effectiveMax = maxPeriods ?? getMaxPeriod(allRows);
  if (effectiveMax === 0) return createEmptyTeacher(effectiveMax, enableSaturday);

  const activeDays = getActiveDays(enableSaturday);
  const data: Record<string, (TeacherPeriod | null)[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: effectiveMax }, () => null);
  }

  for (const { grade, className, rows } of classResults) {
    const classroom = `${grade}-${className}`;

    for (const row of rows) {
      if (!isValidPeriod(row.PERIO)) continue;
      const dayOfWeek = dateToDayOfWeek(row.ALL_TI_YMD, enableSaturday);
      if (!dayOfWeek) continue;

      const periodIdx = parseInt(row.PERIO, 10) - 1;
      if (periodIdx >= effectiveMax) continue;

      const arr = data[dayOfWeek];
      if (arr && arr[periodIdx] === null) {
        const subject = row.ITRT_CNTNT.trim() || '(미정)';
        arr[periodIdx] = { subject, classroom };
      }
    }
  }

  return data as TeacherScheduleData;
}

/* ── 헬퍼 ── */

function createEmpty(maxPeriods: number, enableSaturday: boolean = false): ClassScheduleData {
  const activeDays = getActiveDays(enableSaturday);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => ({ subject: '', teacher: '' }));
  }
  return data as ClassScheduleData;
}

function createEmptyTeacher(maxPeriods: number, enableSaturday: boolean = false): TeacherScheduleData {
  const activeDays = getActiveDays(enableSaturday);
  const data: Record<string, (null)[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => null);
  }
  return data as TeacherScheduleData;
}
