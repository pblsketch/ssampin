import type { IGoogleCalendarPort, GoogleCalendarEvent } from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { toGoogleEvent } from '@domain/rules/calendarSyncRules';

/** 쌤핀 → 구글 동기화 유스케이스 */
export class SyncToGoogle {
  constructor(
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly syncRepo: ICalendarSyncRepository,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  /** 이벤트를 구글 캘린더에 생성 또는 업데이트 */
  async syncEvent(event: SchoolEvent): Promise<SchoolEvent> {
    const mappings = await this.syncRepo.getMappings();
    const mapping = mappings.find(m => m.categoryId === event.category && m.syncEnabled);
    if (!mapping?.googleCalendarId) return event;

    const accessToken = await this.getAccessToken();
    const googleEvent = toGoogleEvent(event);

    let result: GoogleCalendarEvent;
    if (event.googleEventId) {
      // 업데이트
      result = await this.calendarPort.updateEvent(
        accessToken,
        mapping.googleCalendarId,
        event.googleEventId,
        googleEvent,
      );
    } else {
      // 생성
      result = await this.calendarPort.createEvent(
        accessToken,
        mapping.googleCalendarId,
        googleEvent,
      );
    }

    return {
      ...event,
      googleEventId: result.id,
      googleCalendarId: mapping.googleCalendarId,
      syncStatus: 'synced' as const,
      lastSyncedAt: new Date().toISOString(),
      googleUpdatedAt: result.updated,
      etag: result.etag,
      source: event.source || 'ssampin' as const,
    };
  }

  /** 구글 캘린더에서 이벤트 삭제 */
  async deleteEvent(event: SchoolEvent): Promise<void> {
    if (!event.googleEventId || !event.googleCalendarId) return;

    const accessToken = await this.getAccessToken();
    try {
      await this.calendarPort.deleteEvent(
        accessToken,
        event.googleCalendarId,
        event.googleEventId,
      );
    } catch (err) {
      // 이미 삭제된 경우 무시 (404/410)
      const code = (err as Error & { code?: number }).code;
      if (code !== 404 && code !== 410) throw err;
    }
  }
}
