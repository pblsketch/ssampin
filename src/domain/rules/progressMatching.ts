import { isSubjectMatch } from './matchingRules';
import { getDayOfWeek } from './periodRules';
import type { ClassScheduleData, TeacherPeriod } from '@domain/entities/Timetable';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';

/**
 * 그날의 교사 시간표 슬롯 (인덱스 = 교시 0-based)
 * - PC: useScheduleStore.getEffectiveTeacherSchedule(date, weekendDays)
 * - 모바일: 동등 호출 결과
 *
 * 호출자가 미리 변동(Override)을 머지한 그날 시간표를 전달한다.
 * 도메인 함수는 store에 의존하지 않는 순수 로직이라 호출자 책임으로 일임.
 */
export type DayTeacherSlot = TeacherPeriod;

/** 매칭 입력 인자 */
export interface MatchingInput {
  /** YYYY-MM-DD */
  readonly date: string;
  /** 학급명 (TeachingClass.name) */
  readonly className: string;
  /** 학급 과목명 (TeachingClass.subject) */
  readonly classSubject: string;
  /**
   * 그날 적용된 교사 시간표 (변동 머지 후).
   * 인덱스 0 = 1교시, 인덱스 1 = 2교시 ...
   */
  readonly dayTeacherSchedule: ReadonlyArray<DayTeacherSlot | null>;
  /** 담임반 시간표 폴백 — 교사 시간표 매칭 0건 시 사용 */
  readonly classSchedule: ClassScheduleData;
  /** 주말 포함 여부 (settings.enableWeekendDays) */
  readonly weekendDays: readonly WeekendDay[] | undefined;
}

/**
 * 특정 날짜에 해당 학급의 수업이 있는 교시 번호(1-indexed) 배열을 반환.
 *
 * 매칭 단계:
 *   (1) 교사 시간표 — 교실+과목 동시 매칭 (가장 정확)
 *   (2) 교사 시간표 — 교실명만 매칭 (과목명이 약간 다른 경우)
 *   (3) 담임반 시간표 폴백 (교사 시간표 매칭 0건 시)
 *
 * 매칭 0건이면 빈 배열을 반환한다 (호출처가 모든 교시를 그대로 표시하거나 폼을 정상 오픈).
 *
 * Clean Architecture: 외부 의존성 0 — `isSubjectMatch`, `getDayOfWeek` (둘 다 domain/rules)만 사용.
 *
 * @see src/adapters/components/ClassManagement/ProgressTab.tsx:136-191 (원본 인라인 함수)
 */
export function getMatchingPeriods(input: MatchingInput): readonly number[] {
  return getMatchingPeriodsDetailed(input).periods;
}

/**
 * 어느 단계에서 매칭됐는지.
 *  - 1 = 교실명 + 과목 동시 일치 (가장 정확)
 *  - 2 = 교실명만 부분 일치 — `'3-1'`이 `'3-10'`에, `'화학'`이 `'화학실'`에 걸릴 수 있다
 *  - 3 = 담임반 시간표 폴백
 */
export type ProgressMatchStage = 1 | 2 | 3;

export interface DetailedMatchResult {
  readonly periods: readonly number[];
  /** 매칭 0건이면 null. */
  readonly matchStage: ProgressMatchStage | null;
}

/**
 * `getMatchingPeriods`와 **완전히 같은 판정**을 하되 어느 단계에서 걸렸는지도 돌려준다.
 *
 * 왜 필요한가: 이 함수를 하루가 아니라 **학기 100일치에 무인 반복 적용**해 하나의 숫자로 접는
 * 화면이 생겼다(학기 총 차시). 지금까지는 사용자가 눈앞에서 보며 써서 2단계 과대 매칭이 나도
 * 즉시 보이고 손으로 고쳤지만, 접어 놓은 숫자에서는 알아챌 방법이 없다. 그래서 **어느 날이
 * 느슨한 근거로 들어갔는지** 화면에 열어 보일 수 있어야 한다.
 *
 * 판정 로직은 한 벌만 유지한다 — `getMatchingPeriods`가 이 함수를 감싸므로 두 결과가 갈릴 수 없다.
 */
export function getMatchingPeriodsDetailed(input: MatchingInput): DetailedMatchResult {
  if (!input.date) return { periods: [], matchStage: null };
  const periods: number[] = [];
  const className = input.className;
  const subjectName = input.classSubject;

  // 1단계: 교사 시간표에서 교실명 + 과목 동시 매칭 (가장 정확)
  input.dayTeacherSchedule.forEach((slot, idx) => {
    if (!slot) return;
    const classroomMatch =
      slot.classroom === className ||
      slot.classroom.includes(className) ||
      className.includes(slot.classroom);
    const subjectMatch = isSubjectMatch(slot.subject, subjectName);
    if (classroomMatch && subjectMatch) {
      periods.push(idx + 1);
    }
  });

  if (periods.length > 0) return { periods, matchStage: 1 };

  // 2단계: 교실명만으로 매칭 (과목명이 약간 다른 경우 커버)
  {
    input.dayTeacherSchedule.forEach((slot, idx) => {
      if (!slot) return;
      const classroomMatch =
        slot.classroom === className ||
        slot.classroom.includes(className) ||
        className.includes(slot.classroom);
      if (classroomMatch) {
        periods.push(idx + 1);
      }
    });
  }

  if (periods.length > 0) return { periods, matchStage: 2 };

  // 3단계: 담임반 시간표 폴백 (교사 시간표가 없는 경우)
  {
    const dayOfWeek = getDayOfWeek(new Date(input.date + 'T00:00:00'), input.weekendDays);
    const dayScheduleClass = dayOfWeek ? input.classSchedule[dayOfWeek] : undefined;
    if (dayScheduleClass && dayScheduleClass.length > 0) {
      dayScheduleClass.forEach((slot, idx) => {
        if (slot.subject && isSubjectMatch(slot.subject, subjectName)) {
          periods.push(idx + 1);
        }
      });
    }
  }

  return periods.length > 0 ? { periods, matchStage: 3 } : { periods: [], matchStage: null };
}
