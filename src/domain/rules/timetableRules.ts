import { DAYS_OF_WEEK } from '../valueObjects/DayOfWeek';
import type { ClassScheduleData, TeacherScheduleData } from '../entities/Timetable';

/**
 * 비어있는 학급 시간표 생성 (순수 함수)
 */
export function createEmptyClassSchedule(maxPeriods: number): ClassScheduleData {
  const data: Record<string, string[]> = {};
  for (const day of DAYS_OF_WEEK) {
    data[day] = Array.from({ length: maxPeriods }, () => '');
  }
  return data as ClassScheduleData;
}

/**
 * 비어있는 교사 시간표 생성 (순수 함수)
 */
export function createEmptyTeacherSchedule(maxPeriods: number): TeacherScheduleData {
  const data: Record<string, (null)[]> = {};
  for (const day of DAYS_OF_WEEK) {
    data[day] = Array.from({ length: maxPeriods }, () => null);
  }
  return data as TeacherScheduleData;
}
