import type { IGoogleCalendarPort } from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { fromGoogleEvent, detectConflict, resolveConflictByLatest } from '@domain/rules/calendarSyncRules';

/** 구글 → 쌤핀 역방향 동기화 유스케이스 */
export class SyncFromGoogle {
  constructor(
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly syncRepo: ICalendarSyncRepository,
    private readonly eventsRepo: IEventsRepository,
    private readonly getAccessToken: () => Promise<string>,
  ) {}

  /** 활성화된 모든 매핑 캘린더를 동기화 */
  async execute(): Promise<void> {
    const mappings = await this.syncRepo.getMappings();
    const enabledMappings = mappings.filter(m => m.syncEnabled && m.googleCalendarId);

    for (const mapping of enabledMappings) {
      await this.syncCalendar(mapping.googleCalendarId!, mapping.categoryId);
    }

    const syncTokens = await this.getAllSyncTokens();
    await this.syncRepo.saveSyncState({
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
      pendingChanges: 0,
      syncTokens,
    });
  }

  private async syncCalendar(calendarId: string, categoryId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const syncState = await this.syncRepo.getSyncState();
    const existingSyncToken = syncState.syncTokens[calendarId];

    try {
      let result;
      if (existingSyncToken) {
        try {
          result = await this.calendarPort.incrementalSync(accessToken, calendarId, existingSyncToken);
        } catch (err) {
          const code = (err as Error & { code?: number }).code;
          if (code === 410) {
            // syncToken 만료 → full sync 폴백
            result = await this.calendarPort.fullSync(accessToken, calendarId);
          } else {
            throw err;
          }
        }
      } else {
        result = await this.calendarPort.fullSync(accessToken, calendarId);
      }

      // 이벤트 처리
      const evData = await this.eventsRepo.getEvents();
      const events: SchoolEvent[] = [...(evData?.events ?? [])];
      const categories = [...(evData?.categories ?? [])];

      // categoryId가 기존 카테고리에 없으면 자동 생성
      if (!categories.some((c) => c.id === categoryId)) {
        const mappings = await this.syncRepo.getMappings();
        const mapping = mappings.find((m) => m.googleCalendarId === calendarId);
        const calendarName = mapping?.googleCalendarName ?? '구글 캘린더';

        categories.push({
          id: categoryId,
          name: calendarName,
          color: 'blue',
        });
      }

      // 삭제 처리
      for (const deletedId of result.deletedEventIds) {
        const idx = events.findIndex(e => e.googleEventId === deletedId);
        if (idx !== -1) events.splice(idx, 1);
      }

      // 생성/업데이트 처리
      for (const gEvent of result.events) {
        if (gEvent.status === 'cancelled') continue;
        const existingIdx = events.findIndex(e => e.googleEventId === gEvent.id);
        const newEvent = fromGoogleEvent(gEvent, calendarId, categoryId);

        if (existingIdx !== -1) {
          const existing = events[existingIdx]!;

          // 사용자가 숨긴 일정은 구글 동기화로 복원하지 않음
          if (existing.isHidden) continue;

          if (detectConflict(existing, gEvent)) {
            // 자동 해결: 최근 수정 우선
            const resolution = resolveConflictByLatest(existing, gEvent);
            if (resolution === 'remote') {
              events[existingIdx] = {
                ...newEvent,
                id: existing.id,
                isHidden: existing.isHidden,
                isModified: existing.isModified,
              };
            }
            // 'local' → 로컬 유지, 다음 push에서 구글에 반영
          } else {
            events[existingIdx] = {
              ...newEvent,
              id: existing.id,
              isHidden: existing.isHidden,
              isModified: existing.isModified,
            };
          }
        } else {
          events.push(newEvent);
        }
      }

      await this.eventsRepo.saveEvents({ events, categories });

      // syncToken 저장
      if (result.nextSyncToken) {
        const state = await this.syncRepo.getSyncState();
        await this.syncRepo.saveSyncState({
          ...state,
          syncTokens: { ...state.syncTokens, [calendarId]: result.nextSyncToken },
        });
      }
    } catch (err) {
      console.error(`[SyncFromGoogle] Failed to sync calendar ${calendarId}:`, err);
    }
  }

  private async getAllSyncTokens(): Promise<Record<string, string>> {
    const state = await this.syncRepo.getSyncState();
    return state.syncTokens;
  }
}
