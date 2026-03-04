/**
 * 외부 캘린더 소스 (예: 구글 캘린더 iCal 구독)
 */
export interface ExternalCalendarSource {
  readonly id: string;
  readonly name: string;           // "내 구글 캘린더"
  readonly url: string;            // iCal URL
  readonly type: 'google-ical';    // 추후 다른 타입 확장 가능
  readonly categoryId: string;     // 가져온 일정의 기본 카테고리
  readonly lastSyncAt?: string;    // ISO 8601
  readonly enabled: boolean;
}

/**
 * 외부 캘린더 저장 데이터
 */
export interface ExternalCalendarsData {
  readonly sources: readonly ExternalCalendarSource[];
}
