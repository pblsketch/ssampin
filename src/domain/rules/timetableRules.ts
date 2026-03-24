import { getActiveDays } from '../valueObjects/DayOfWeek';
import type { WeekendDay } from '../valueObjects/DayOfWeek';
import type { ClassScheduleData, TeacherScheduleData, ClassPeriod } from '../entities/Timetable';

/**
 * 비어있는 학급 시간표 생성 (순수 함수)
 */
export function createEmptyClassSchedule(maxPeriods: number, weekendDays?: readonly WeekendDay[]): ClassScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => ({ subject: '', teacher: '' }));
  }
  return data as ClassScheduleData;
}

/**
 * 기존 string[] 포맷의 학급 시간표를 ClassPeriod[] 포맷으로 마이그레이션
 */
export function migrateClassScheduleData(
  raw: Record<string, readonly (string | ClassPeriod)[]>,
  weekendDays?: readonly WeekendDay[],
): ClassScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, ClassPeriod[]> = {};
  for (const day of activeDays) {
    const dayArr = raw[day] ?? [];
    data[day] = dayArr.map((item) => {
      if (typeof item === 'string') {
        return { subject: item, teacher: '' };
      }
      return { subject: item.subject ?? '', teacher: item.teacher ?? '' };
    });
  }
  return data as ClassScheduleData;
}

/**
 * 비어있는 교사 시간표 생성 (순수 함수)
 */
export function createEmptyTeacherSchedule(maxPeriods: number, weekendDays?: readonly WeekendDay[]): TeacherScheduleData {
  const activeDays = getActiveDays(weekendDays);
  const data: Record<string, (null)[]> = {};
  for (const day of activeDays) {
    data[day] = Array.from({ length: maxPeriods }, () => null);
  }
  return data as TeacherScheduleData;
}
