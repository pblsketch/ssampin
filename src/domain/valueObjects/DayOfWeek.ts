export type DayOfWeek = '월' | '화' | '수' | '목' | '금';

export const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  '월',
  '화',
  '수',
  '목',
  '금',
] as const;

/** 주말 수업 요일 타입 */
export type WeekendDay = '토' | '일';

/**
 * 주말 수업 설정에 따라 활성 요일 목록 반환
 * weekendDays가 비어있거나 미지정이면 월~금만 반환
 */
export function getActiveDays(weekendDays?: readonly WeekendDay[]): readonly DayOfWeekFull[] {
  if (!weekendDays || weekendDays.length === 0) {
    return DAYS_OF_WEEK as readonly DayOfWeekFull[];
  }
  const days: DayOfWeekFull[] = ['월', '화', '수', '목', '금'];
  if (weekendDays.includes('토')) days.push('토');
  if (weekendDays.includes('일')) days.push('일');
  return days;
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
