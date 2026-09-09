/**
 * 수업반 하나가 **주중 언제(무슨 요일 몇 교시)** 수업하는지 뽑아내는 규칙.
 *
 * ## 왜 도메인인가
 *
 * 판정 재료(`isSubjectMatch`·요일 목록)가 전부 도메인이라 외부 의존 없이 순수 함수로 둘 수 있다.
 * 학급 목록 화면은 스토어에서 시간표를 꺼내 넘기기만 한다.
 *
 * ## 하루 단위 매칭(`getMatchingPeriodsDetailed`)과 무엇이 다른가
 *
 * 하루짜리 매칭은 그날 하루만 보고 1 → 2 → 3단계를 내려간다. 주간 요약에서 그걸 요일마다
 * 따로 돌리면 **월요일은 1단계, 금요일은 3단계**처럼 근거가 뒤섞인 목록이 나온다. 목록에는
 * 근거를 적을 자리가 없으니 사용자는 어느 쪽이 느슨한 추정인지 알 수 없다.
 *
 * 그래서 여기서는 **주 전체를 한 단계로 판정**한다. 1단계로 한 칸이라도 걸리면 그 주는 1단계만
 * 쓰고, 0건일 때만 2단계로 내려간다. 결과 전체가 같은 근거를 갖는다.
 *
 * ## 이 값은 "기본 시간표" 기준이다
 *
 * 변동(결·보강·교체)은 특정 날짜에만 걸리는 정보라 주간 요약에 넣지 않는다. 화면은 이걸
 * "평소 수업 요일"로 읽히게 표시해야 한다.
 *
 * Clean Architecture: 외부 의존 0 — `@domain/*`만 참조한다.
 */

import { isSubjectMatch } from './matchingRules';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import type { DayOfWeekFull, WeekendDay } from '@domain/valueObjects/DayOfWeek';
import type { ProgressMatchStage } from './progressMatching';

/** 주간 수업 한 칸. `period`는 1-based(1 = 1교시). */
export interface WeeklyLessonSlot {
  readonly day: DayOfWeekFull;
  readonly period: number;
}

/** 같은 요일 칸을 묶은 것. `periods`는 오름차순. */
export interface WeeklyLessonDayGroup {
  readonly day: DayOfWeekFull;
  readonly periods: readonly number[];
}

export interface WeeklyLessonSlotsInput {
  /** 학급명 (TeachingClass.name) */
  readonly className: string;
  /** 학급 과목명 (TeachingClass.subject) */
  readonly classSubject: string;
  /** 교사 주간 기본 시간표(요일 → 교시별 슬롯). 변동은 반영하지 않는다. */
  readonly teacherSchedule: TeacherScheduleData;
  /** 담임반 시간표 — 교사 시간표 매칭이 0건일 때의 폴백. */
  readonly classSchedule: ClassScheduleData;
  /** 주말 수업 설정(settings.enableWeekendDays). */
  readonly weekendDays?: readonly WeekendDay[];
}

export interface WeeklyLessonSlotsResult {
  /** 요일(월→일) → 교시 오름차순으로 정렬된 칸 목록. 매칭 0건이면 빈 배열. */
  readonly slots: readonly WeeklyLessonSlot[];
  /**
   * 어느 근거로 찾았는지. 주 전체에 하나의 값만 쓴다.
   *  - 1 = 교실명 + 과목 동시 일치 (정확)
   *  - 2 = 교실명만 일치 (과목명이 조금 달라도 걸린다)
   *  - 3 = 담임반 시간표에서 과목으로만 추정
   *  - null = 매칭 0건 (시간표 미등록이거나 이 반 수업이 없다)
   */
  readonly matchStage: ProgressMatchStage | null;
}

const EMPTY_RESULT: WeeklyLessonSlotsResult = { slots: [], matchStage: null };

/** 교실명 비교 — `getMatchingPeriodsDetailed`와 같은 판정을 쓴다(두 화면이 갈리면 안 된다). */
function isClassroomMatch(slotClassroom: string, className: string): boolean {
  if (!slotClassroom || !className) return false;
  return (
    slotClassroom === className ||
    slotClassroom.includes(className) ||
    className.includes(slotClassroom)
  );
}

/**
 * 이 반의 주간 수업 칸을 찾는다. 예외를 던지지 않는다 — 못 찾으면 빈 배열 + `matchStage: null`.
 */
export function getWeeklyLessonSlots(input: WeeklyLessonSlotsInput): WeeklyLessonSlotsResult {
  const { className, classSubject } = input;
  if (!className && !classSubject) return EMPTY_RESULT;

  const days = getActiveDays(input.weekendDays);

  // 1단계 — 교실명 + 과목 동시 일치
  const exact: WeeklyLessonSlot[] = [];
  // 2단계 — 교실명만 일치 (1단계가 0건일 때만 쓴다)
  const byClassroom: WeeklyLessonSlot[] = [];

  for (const day of days) {
    const daySlots = input.teacherSchedule[day];
    if (!daySlots) continue;
    daySlots.forEach((slot, idx) => {
      if (!slot) return;
      if (!isClassroomMatch(slot.classroom, className)) return;
      const period = idx + 1;
      byClassroom.push({ day, period });
      if (isSubjectMatch(slot.subject, classSubject)) exact.push({ day, period });
    });
  }

  if (exact.length > 0) return { slots: exact, matchStage: 1 };
  if (byClassroom.length > 0) return { slots: byClassroom, matchStage: 2 };

  // 3단계 — 담임반 시간표 폴백. 과목만 보므로 담임이 자기 반을 볼 때만 의미가 있다.
  const fallback: WeeklyLessonSlot[] = [];
  for (const day of days) {
    const daySlots = input.classSchedule[day];
    if (!daySlots) continue;
    daySlots.forEach((slot, idx) => {
      if (!slot?.subject) return;
      if (isSubjectMatch(slot.subject, classSubject)) fallback.push({ day, period: idx + 1 });
    });
  }

  return fallback.length > 0 ? { slots: fallback, matchStage: 3 } : EMPTY_RESULT;
}

/**
 * 같은 요일 칸을 하나로 묶는다. 요일 순서는 입력 순서(월→일)를 그대로 따르고,
 * 한 요일 안의 교시는 오름차순 + 중복 제거.
 */
export function groupWeeklyLessonSlotsByDay(
  slots: readonly WeeklyLessonSlot[],
): readonly WeeklyLessonDayGroup[] {
  const order: DayOfWeekFull[] = [];
  const byDay = new Map<DayOfWeekFull, number[]>();

  for (const slot of slots) {
    const existing = byDay.get(slot.day);
    if (existing === undefined) {
      order.push(slot.day);
      byDay.set(slot.day, [slot.period]);
    } else if (!existing.includes(slot.period)) {
      existing.push(slot.period);
    }
  }

  return order.map((day) => ({
    day,
    periods: [...(byDay.get(day) ?? [])].sort((a, b) => a - b),
  }));
}
