import type { GoogleCalendarInfo } from '../entities/GoogleCalendarInfo';

/** 구글 캘린더 이벤트 (API 응답 형태) */
export interface GoogleCalendarEvent {
  readonly id: string;
  readonly summary: string;
  readonly description?: string;
  readonly location?: string;
  readonly start: { date?: string; dateTime?: string; timeZone?: string };
  readonly end: { date?: string; dateTime?: string; timeZone?: string };
  readonly updated: string;       // RFC3339
  readonly etag: string;
  readonly status: 'confirmed' | 'tentative' | 'cancelled';
  readonly htmlLink?: string;
  readonly created?: string;
  readonly colorId?: string;
}

/** 동기화 결과 */
export interface SyncResult {
  readonly events: readonly GoogleCalendarEvent[];
  readonly nextSyncToken?: string;
  readonly deletedEventIds: readonly string[];
}

/** 구글 캘린더 API 포트 */
export interface IGoogleCalendarPort {
  /** 사용자의 캘린더 목록 조회 */
  listCalendars(accessToken: string): Promise<readonly GoogleCalendarInfo[]>;
  /** 새 캘린더 생성 */
  createCalendar(accessToken: string, summary: string): Promise<GoogleCalendarInfo>;
  /** 이벤트 생성 */
  createEvent(accessToken: string, calendarId: string, event: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  /** 이벤트 수정 */
  updateEvent(accessToken: string, calendarId: string, eventId: string, event: Partial<GoogleCalendarEvent>): Promise<GoogleCalendarEvent>;
  /** 이벤트 삭제 */
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;
  /** syncToken 기반 증분 동기화 */
  incrementalSync(accessToken: string, calendarId: string, syncToken: string): Promise<SyncResult>;
  /** 전체 동기화 (6개월 전부터) */
  fullSync(accessToken: string, calendarId: string): Promise<SyncResult>;
}
