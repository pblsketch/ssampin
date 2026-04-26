/**
 * Google Calendar REST API 클라이언트
 *
 * IGoogleCalendarPort 구현체. 네이티브 fetch 사용.
 * 증분 동기화(syncToken), 전체 동기화(fullSync) 지원.
 */
import type {
  IGoogleCalendarPort,
  GoogleCalendarEvent,
  SyncResult,
} from '@domain/ports/IGoogleCalendarPort';
import type { GoogleCalendarInfo } from '@domain/entities/GoogleCalendarInfo';
import { GOOGLE_AUTH_BLOCKED_MESSAGE } from '@domain/rules/calendarSyncRules';

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

/** Calendar List API 응답 */
interface CalendarListResponse {
  items?: GoogleCalendarInfo[];
}

/** Events List API 응답 */
interface EventsListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/** API 에러 타입 (status code 포함) */
interface ApiError extends Error {
  code: number;
}

export class GoogleCalendarApiClient implements IGoogleCalendarPort {
  /** 토큰 갱신 콜백 (DI로 주입, 401 재시도 시 사용) */
  private onTokenRefresh: (() => Promise<string>) | null = null;

  /** 401 재시도를 위한 토큰 갱신 콜백 등록 */
  setTokenRefreshCallback(callback: () => Promise<string>): void {
    this.onTokenRefresh = callback;
  }

  /**
   * Google Calendar API 요청 헬퍼
   * @param accessToken OAuth 액세스 토큰
   * @param path API 경로 (/calendars/... 등)
   * @param options fetch 옵션
   * @param isRetry 재시도 여부 (무한 재시도 방지)
   */
  private async request<T>(
    accessToken: string,
    path: string,
    options?: RequestInit,
    isRetry = false,
  ): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      // 401 Unauthorized: 토큰 갱신 후 1회 재시도
      if (res.status === 401 && !isRetry && this.onTokenRefresh) {
        try {
          const newToken = await this.onTokenRefresh();
          return this.request<T>(newToken, path, options, true);
        } catch {
          // 갱신 실패 시 원래 에러 throw
        }
      }

      const err = await res.text();
      // 재시도 후에도 401이거나 첫 401에서 갱신 실패: 학교 Workspace 정책 차단 가능성 안내
      const message =
        res.status === 401
          ? GOOGLE_AUTH_BLOCKED_MESSAGE
          : `Google Calendar API error: ${res.status} ${err}`;
      const error = new Error(message) as ApiError;
      error.code = res.status;
      throw error;
    }

    // 204 No Content (DELETE 응답 등)
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  /**
   * 사용자의 캘린더 목록 조회
   * @param accessToken OAuth 액세스 토큰
   */
  async listCalendars(accessToken: string): Promise<readonly GoogleCalendarInfo[]> {
    const data = await this.request<CalendarListResponse>(
      accessToken,
      '/users/me/calendarList',
    );

    return (data.items ?? []).map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      backgroundColor: cal.backgroundColor,
      primary: cal.primary,
      accessRole: cal.accessRole,
    }));
  }

  /**
   * 새 캘린더 생성
   * @param accessToken OAuth 액세스 토큰
   * @param summary 캘린더 이름
   */
  async createCalendar(
    accessToken: string,
    summary: string,
  ): Promise<GoogleCalendarInfo> {
    const data = await this.request<GoogleCalendarInfo>(accessToken, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary }),
    });

    return {
      id: data.id,
      summary: data.summary,
      backgroundColor: data.backgroundColor,
      primary: false,
      accessRole: 'owner',
    };
  }

  /**
   * 이벤트 생성
   * @param accessToken OAuth 액세스 토큰
   * @param calendarId 캘린더 ID
   * @param event 이벤트 데이터
   */
  async createEvent(
    accessToken: string,
    calendarId: string,
    event: Partial<GoogleCalendarEvent>,
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify(event),
      },
    );
  }

  /**
   * 이벤트 수정 (PATCH)
   * @param accessToken OAuth 액세스 토큰
   * @param calendarId 캘린더 ID
   * @param eventId 이벤트 ID
   * @param event 변경할 이벤트 데이터
   */
  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleCalendarEvent>,
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(event),
      },
    );
  }

  /**
   * 이벤트 삭제
   * @param accessToken OAuth 액세스 토큰
   * @param calendarId 캘린더 ID
   * @param eventId 이벤트 ID
   */
  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    await this.request<void>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' },
    );
  }

  /**
   * syncToken 기반 증분 동기화
   * @param accessToken OAuth 액세스 토큰
   * @param calendarId 캘린더 ID
   * @param syncToken 이전 동기화 토큰
   */
  async incrementalSync(
    accessToken: string,
    calendarId: string,
    syncToken: string,
  ): Promise<SyncResult> {
    const events: GoogleCalendarEvent[] = [];
    const deletedEventIds: string[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      const params = new URLSearchParams({ syncToken });
      if (pageToken) params.set('pageToken', pageToken);

      const data = await this.request<EventsListResponse>(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      );

      for (const item of data.items ?? []) {
        if (item.status === 'cancelled') {
          deletedEventIds.push(item.id);
        } else {
          events.push(item);
        }
      }

      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken;
    } while (pageToken);

    return { events, nextSyncToken, deletedEventIds };
  }

  /**
   * 전체 동기화 (6개월 전부터)
   * @param accessToken OAuth 액세스 토큰
   * @param calendarId 캘린더 ID
   */
  async fullSync(accessToken: string, calendarId: string): Promise<SyncResult> {
    const events: GoogleCalendarEvent[] = [];
    const deletedEventIds: string[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    // 6개월 전부터 조회
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 6);

    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        singleEvents: 'true',
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const data = await this.request<EventsListResponse>(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      );

      for (const item of data.items ?? []) {
        if (item.status === 'cancelled') {
          deletedEventIds.push(item.id);
        } else {
          events.push(item);
        }
      }

      pageToken = data.nextPageToken;
      nextSyncToken = data.nextSyncToken;
    } while (pageToken);

    return { events, nextSyncToken, deletedEventIds };
  }
}
