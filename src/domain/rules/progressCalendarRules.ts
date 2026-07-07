import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { findMatchingClass } from './matchingRules';

/**
 * 진도 캘린더 — 주간 진도 격자 계산 (순수 도메인 로직)
 *
 * 교사 시간표의 각 슬롯(요일 × 교시)에 진도 기록을 배치한다.
 * 슬롯 → 학급 역매칭은 신규 매처를 만들지 않고 `findMatchingClass`에 위임한다.
 * (오늘 진도 위젯 `TodayProgress`가 이미 하루치로 소비하는 그 매처 — 두 화면이
 *  같은 슬롯을 다른 반으로 매핑하지 않도록 단일 소스로 통일.)
 *
 * Clean Architecture: 외부 의존성 0 — 도메인 엔티티 + `findMatchingClass`(domain/rules)만 사용.
 * store 의존(getEffectiveTeacherSchedule)은 호출자가 미리 머지해 주입한다
 * (progressMatching.ts의 dayTeacherSchedule 주입 패턴과 동일).
 */

/** 주간 격자의 한 칸 */
export interface WeeklyProgressCell {
  /** 0-based 요일 인덱스 (월=0, 화=1 ...) */
  readonly dayIndex: number;
  /** 1-based 교시 */
  readonly period: number;
  /** YYYY-MM-DD */
  readonly date: string;
  /** 그 칸의 유효 교사 시간표 슬롯 (공강/자습이면 null) */
  readonly slot: TeacherPeriod | null;
  /** 슬롯이 매칭된 학급 (매칭 실패 또는 공강이면 null) */
  readonly matchedClass: TeachingClass | null;
  /** 이 칸(반·날짜·교시)에 등록된 진도 기록 */
  readonly entries: readonly ProgressEntry[];
}

export interface WeeklyProgressGridInput {
  /** 이번 주 날짜들 (인덱스 = 요일 인덱스) */
  readonly weekDates: readonly string[];
  /** 표시할 교시들 (1-based) */
  readonly periods: readonly number[];
  /**
   * 날짜별 유효 교사 시간표. `dayTeacherSchedules[dayIndex]`의 인덱스 0 = 1교시.
   * 호출자가 `getEffectiveTeacherSchedule(date, weekendDays)`로 변동(override)을
   * 머지해 전달한다 — base 시간표를 넘기면 자습으로 바뀐 칸이 오표시되므로 주의.
   */
  readonly dayTeacherSchedules: ReadonlyArray<ReadonlyArray<TeacherPeriod | null>>;
  /** 전체 진도 기록 (반 스코프 아님) */
  readonly progressEntries: readonly ProgressEntry[];
  /** 전체 학급 */
  readonly classes: readonly TeachingClass[];
}

/** 격자 Map의 키 */
export function cellKey(dayIndex: number, period: number): string {
  return `${dayIndex}:${period}`;
}

/**
 * 주간 진도 격자를 계산한다.
 * 각 (요일 × 교시) 칸에 대해 유효 교사 시간표 슬롯을 찾고, `findMatchingClass`로 반을
 * 역매칭한 뒤 그 반·날짜·교시에 해당하는 진도 기록을 모은다.
 */
export function buildWeeklyProgressGrid(
  input: WeeklyProgressGridInput,
): Map<string, WeeklyProgressCell> {
  const grid = new Map<string, WeeklyProgressCell>();

  input.weekDates.forEach((date, dayIndex) => {
    const daySchedule = input.dayTeacherSchedules[dayIndex] ?? [];
    input.periods.forEach((period) => {
      const slot = daySchedule[period - 1] ?? null;
      const matchedClass = slot
        ? findMatchingClass(input.classes, slot.classroom, slot.subject)
        : null;
      const entries = matchedClass
        ? input.progressEntries.filter(
            (e) => e.classId === matchedClass.id && e.date === date && e.period === period,
          )
        : [];
      grid.set(cellKey(dayIndex, period), {
        dayIndex,
        period,
        date,
        slot,
        matchedClass,
        entries,
      });
    });
  });

  return grid;
}

/** 반별 진도 요약 (배지·진도율 칩용) */
export interface ClassProgressSummary {
  readonly total: number;
  readonly completed: number;
  readonly planned: number;
  readonly skipped: number;
  /** 완료 / 전체 (%) — 전체 0이면 0 */
  readonly percent: number;
}

/**
 * 한 반의 진도 기록들을 완료/예정/미실시로 요약한다.
 * ProgressTab의 기존 stats 계산과 동치.
 */
export function summarizeClassProgress(entries: readonly ProgressEntry[]): ClassProgressSummary {
  const total = entries.length;
  const byStatus = (status: ProgressStatus) => entries.filter((e) => e.status === status).length;
  const completed = byStatus('completed');
  const planned = byStatus('planned');
  const skipped = byStatus('skipped');
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, planned, skipped, percent };
}
