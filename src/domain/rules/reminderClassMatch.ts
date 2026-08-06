import type { TeacherPeriod } from '../entities/Timetable';
import type { TeachingClass } from '../entities/TeachingClass';
import type { PeriodTime } from '../valueObjects/PeriodTime';
import { getJustFinishedPeriod } from './periodRules';
import { findMatchingClass } from './matchingRules';
import { filterActiveClasses } from './teachingClassArchive';

/**
 * '방금 끝난 수업'의 수업반(TeachingClass)을 반환한다 — 수업 직후 관찰 알림(D1).
 *
 * @param daySlots  그 날짜의 교사 시간표(교시별 배열, 0-based). **변동 시간표(override) 적용된
 *                  결과**를 넘긴다(useScheduleStore.getEffectiveTeacherSchedule).
 * 1. `getJustFinishedPeriod`로 방금 종료된 교시를 찾는다(수업 중이거나 유예 초과면 null).
 * 2. 그 교시의 과목/교실을 읽어 `findMatchingClass`로 수업반에 매핑한다.
 *
 * 시간표는 과목/교실 문자열만 담고 `TeachingClass.id`가 없어 매핑이 느슨하므로(이동수업·분반),
 * 방금 끝난 교시가 없거나·공강이거나·매핑이 모호/실패하면 **null을 반환**한다(자동 트리거 skip).
 * 순수함수, `now` 주입으로 결정론.
 */
export function detectJustFinishedClass(
  daySlots: readonly (TeacherPeriod | null)[],
  classes: readonly TeachingClass[],
  periodTimes: readonly PeriodTime[],
  now: Date,
  graceMinutes = 10,
): TeachingClass | null {
  const period = getJustFinishedPeriod(periodTimes, now, graceMinutes);
  if (period === null) return null;

  const slot = daySlots[period - 1]; // period 1-based, 배열 0-based
  if (!slot || !slot.classroom) return null; // 그 교시에 수업 없음(공강)

  // 보관된 반은 새 알림·기록 대상이 아니다 — 활성 반만 후보로 매칭(폴백 없음).
  return findMatchingClass(filterActiveClasses(classes), slot.classroom, slot.subject);
}
