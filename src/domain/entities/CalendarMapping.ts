/** 동기화 방향 */
export type SyncDirection = 'bidirectional' | 'toGoogle' | 'fromGoogle';

/** 카테고리↔구글 캘린더 매핑 */
export interface CalendarMapping {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly syncEnabled: boolean;
  readonly googleCalendarId?: string;
  readonly googleCalendarName?: string;
  readonly syncDirection: SyncDirection;
}
