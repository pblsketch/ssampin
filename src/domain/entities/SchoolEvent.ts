/** @deprecated 커스텀 카테고리 시스템으로 대체됨. CategoryItem 사용 권장 */
export type EventCategory =
  | 'school'
  | 'class'
  | 'exam'
  | 'holiday'
  | 'etc';

/** 알림 타이밍 */
export type AlertTiming =
  | 'onTime'
  | '5min'
  | '30min'
  | '1hour'
  | '1day'
  | '3day';

/** 반복 주기 */
export type Recurrence = 'weekly' | 'monthly' | 'yearly';

/** 카테고리 아이템 */
export interface CategoryItem {
  readonly id: string;
  readonly name: string;
  readonly color: string; // 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'pink' | 'indigo' | 'teal' | 'gray'
}

/** 기본 카테고리 */
export const DEFAULT_CATEGORIES: readonly CategoryItem[] = [
  { id: 'school', name: '학교', color: 'blue' },
  { id: 'class', name: '학급', color: 'green' },
  { id: 'department', name: '부서', color: 'yellow' },
  { id: 'treeSchool', name: '나무학교', color: 'purple' },
  { id: 'etc', name: '기타', color: 'gray' },
];

/** 카테고리 컬러 프리셋 */
export const CATEGORY_COLOR_PRESETS = [
  'blue', 'green', 'yellow', 'purple', 'red', 'pink', 'indigo', 'teal',
] as const;

export interface SchoolEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;          // "YYYY-MM-DD"
  readonly endDate?: string;      // "YYYY-MM-DD" (여러 날짜 걸칠 때)
  readonly category: string;      // 카테고리 ID
  readonly description?: string;
  readonly time?: string;         // "HH:mm" 또는 "HH:mm - HH:mm"
  readonly location?: string;
  readonly isDDay?: boolean;
  readonly alerts?: readonly AlertTiming[];
  readonly recurrence?: Recurrence;
}

export interface SchoolEventsData {
  readonly events: readonly SchoolEvent[];
  readonly categories?: readonly CategoryItem[];
}
