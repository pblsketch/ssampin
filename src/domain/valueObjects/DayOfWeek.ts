export type DayOfWeek = '월' | '화' | '수' | '목' | '금';

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  '월',
  '화',
  '수',
  '목',
  '금',
] as const;

/** 토요일 포함 요일 타입 (시간표용) */
export type DayOfWeekWithSat = '월' | '화' | '수' | '목' | '금' | '토';

export const DAYS_OF_WEEK_WITH_SAT: readonly DayOfWeekWithSat[] = [
  '월', '화', '수', '목', '금', '토',
] as const;

/**
 * 토요수업 설정에 따라 활성 요일 목록 반환
 */
export function getActiveDays(enableSaturday: boolean): readonly DayOfWeekWithSat[] {
  return enableSaturday ? DAYS_OF_WEEK_WITH_SAT : (DAYS_OF_WEEK as readonly DayOfWeekWithSat[]);
}

/** 주말 포함 요일 타입 (일정/캘린더/대시보드용) */
export type DayOfWeekFull = '월' | '화' | '수' | '목' | '금' | '토' | '일';

export const DAYS_OF_WEEK_FULL: readonly DayOfWeekFull[] = [
  '월', '화', '수', '목', '금', '토', '일',
] as const;

/** 주말인지 확인 */
export function isWeekend(day: DayOfWeekFull): boolean {
  return day === '토' || day === '일';
}

/** Date 객체에서 DayOfWeekFull 추출 */
export function getDayOfWeekFull(date: Date): DayOfWeekFull {
  const days: DayOfWeekFull[] = ['일', '월', '화', '수', '목', '금', '토'];
  return days[date.getDay()]!;
}
