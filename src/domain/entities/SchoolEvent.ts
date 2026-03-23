/** @deprecated 커스텀 카테고리 시스템으로 대체됨. CategoryItem 사용 권장 */
export type EventCategory =
  | 'school'
  | 'class'
  | 'exam'
  | 'holiday'
  | 'etc';

/** 알림 타이밍 프리셋 */
export type AlertTimingPreset =
  | 'onTime'
  | '5min'
  | '30min'
  | '1hour'
  | '1day'
  | '3day';

/** 알림 타이밍 (프리셋 또는 커스텀 분 단위: "custom:{totalMinutes}") */
export type AlertTiming = AlertTimingPreset | `custom:${number}`;

/** 커스텀 알림인지 확인 */
export function isCustomAlert(timing: AlertTiming): timing is `custom:${number}` {
  return typeof timing === 'string' && timing.startsWith('custom:');
}

/** 커스텀 알림의 분 값 추출 */
export function getCustomAlertMinutes(timing: AlertTiming): number | null {
  if (!isCustomAlert(timing)) return null;
  return parseInt(timing.replace('custom:', ''), 10);
}

/** AlertTiming을 표시 문자열로 변환 */
export function alertTimingToLabel(timing: AlertTiming): string {
  switch (timing) {
    case 'onTime': return '정시';
    case '5min': return '5분 전';
    case '30min': return '30분 전';
    case '1hour': return '1시간 전';
    case '1day': return '1일 전';
    case '3day': return '3일 전';
    default: {
      const minutes = getCustomAlertMinutes(timing);
      if (minutes == null) return timing;
      if (minutes < 60) return `${minutes}분 전`;
      if (minutes < 1440) {
        const hours = minutes / 60;
        return Number.isInteger(hours) ? `${hours}시간 전` : `${minutes}분 전`;
      }
      const days = minutes / 1440;
      return Number.isInteger(days) ? `${days}일 전` : `${minutes}분 전`;
    }
  }
}

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
  { id: 'treeSchool', name: '교사학습공동체', color: 'purple' },
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
  /** 반복 일정에서 제외할 날짜 목록 (YYYY-MM-DD) */
  readonly excludeDates?: readonly string[];
  readonly period?: string;  // "1"~"7", "afterSchool", "allDay" 또는 undefined

  // 구글 캘린더 동기화 필드 (모두 optional, 하위 호환성 유지)
  readonly googleEventId?: string;
  readonly googleCalendarId?: string;
  readonly syncStatus?: 'synced' | 'pending' | 'error';
  readonly lastSyncedAt?: string;       // ISO 8601
  readonly googleUpdatedAt?: string;    // ISO 8601
  readonly etag?: string;
  readonly source?: 'ssampin' | 'google' | 'neis' | 'birthday';
  readonly startTime?: string;          // "HH:mm"
  readonly endTime?: string;            // "HH:mm"

  // NEIS 학사일정 전용 필드 (모두 optional, 하위 호환성 유지)
  readonly neis?: {
    readonly eventId: string;        // `${AA_YMD}_${hash(EVENT_NM)}` 고유 키
    readonly eventName: string;      // 원본 행사명
    readonly schoolYear: string;     // 학년도
    readonly gradeYn: {
      readonly grade1: boolean;
      readonly grade2: boolean;
      readonly grade3: boolean;
    };
    readonly subtractDayType: string; // 수업공제일 구분 (공휴일/해당없음)
    readonly loadDate: string;        // 데이터 적재일
    readonly lastSyncAt: string;      // 마지막 동기화 시간
  };
  readonly isModified?: boolean;     // 사용자가 편집했으면 true → 동기화 시 보호
  readonly isHidden?: boolean;       // 숨기기 처리
}

export interface SchoolEventsData {
  readonly events: readonly SchoolEvent[];
  readonly categories?: readonly CategoryItem[];
}
