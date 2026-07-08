import type { TeacherScheduleData } from '../entities/Timetable';
import type { TeachingClass } from '../entities/TeachingClass';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import type { WeekendDay } from '../valueObjects/DayOfWeek';
import { getJustFinishedPeriod, getDayOfWeek } from './periodRules';
import { findMatchingClass } from './matchingRules';

/**
 * '방금 끝난 수업'의 수업반(TeachingClass)을 반환한다 — 수업 직후 관찰 알림(D1).
 *
 * 1. `getJustFinishedPeriod`로 방금 종료된 교시를 찾는다(수업 중이거나 유예 초과면 null).
 * 2. 교사 시간표에서 그 교시의 과목/교실을 읽는다.
 * 3. `findMatchingClass`로 수업반에 매핑한다.
 *
 * 시간표는 과목/교실 문자열만 담고 `TeachingClass.id`가 없어 매핑이 느슨하므로(이동수업·분반),
 * 방금 끝난 교시가 없거나·그 교시가 공강이거나·매핑이 모호/실패하면 **null을 반환**한다
 * (자동 트리거를 조용히 skip → 오알림 방지). 순수함수, `now` 주입으로 결정론.
 */
export function detectJustFinishedClass(
  teacherSchedule: TeacherScheduleData,
  classes: readonly TeachingClass[],
  periodTimes: readonly PeriodTime[],
  now: Date,
  weekendDays?: readonly WeekendDay[],
  graceMinutes = 10,
): TeachingClass | null {
  const period = getJustFinishedPeriod(periodTimes, now, graceMinutes);
  if (period === null) return null;

  const day = getDayOfWeek(now, weekendDays);
  if (day === null) return null;

  const daySlots = teacherSchedule[day];
  if (!daySlots) return null;

  const slot = daySlots[period - 1]; // period 1-based, 배열 0-based
  if (!slot || !slot.classroom) return null; // 그 교시에 수업 없음(공강)

  return findMatchingClass(classes, slot.classroom, slot.subject);
}
