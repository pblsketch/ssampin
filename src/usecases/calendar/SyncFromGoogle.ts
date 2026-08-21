import type { IGoogleCalendarPort } from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import {
  fromGoogleEvent,
  detectConflict,
  resolveConflictByLatest,
} from '@domain/rules/calendarSyncRules';

/** NEIS 학사일정이 주인인 일정인가 — 쌤핀이 구글로 올려 보낸 것. */
function isNeisOwned(event: SchoolEvent): boolean {
  return event.source === 'neis' || !!event.neis?.eventId;
}

/**
 * 구글이 준 내용은 받아들이되 **정체성은 로컬이 지킨다** (2026-08-21).
 *
 * 쌤핀에서 만들어 구글로 올린 일정이 되돌아왔을 때, 카테고리가 `학교` 에서 `구글 캘린더` 로
 * 바뀌고 출처가 `google` 로 뒤집히면 선생님이 만든 일정이 남의 것처럼 보인다. 제목·날짜·
 * 장소 같은 **내용**은 구글 쪽 수정을 반영해야 하지만, 어느 카테고리에 속하고 누가 만들었나는
 * 로컬이 계속 쥐고 있어야 한다.
 */
function mergeKeepingIdentity(existing: SchoolEvent, incoming: SchoolEvent): SchoolEvent {
  const locallyOwned = !!existing.source && existing.source !== 'google';
  return {
    ...incoming,
    id: existing.id,
    isHidden: existing.isHidden,
    isModified: existing.isModified,
    sortOrder: existing.sortOrder,
    category: locallyOwned ? existing.category : incoming.category,
    source: locallyOwned ? existing.source : incoming.source,
    ...(existing.neis ? { neis: existing.neis } : {}),
  };
}

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
    /*
      `toGoogle`(올리기 전용) 매핑은 내려받지 않는다 (2026-08-21).

      NEIS 학사일정 매핑이 바로 이 방향인데, 지금까지 `syncDirection` 을 아무도 읽지 않아
      올려 보낸 학사일정을 그대로 다시 내려받았다. 그러면서 "구글이 준 새 일정"으로 취급돼
      같은 일정이 계속 불어났다.
    */
    const enabledMappings = mappings.filter(
      (m) => m.syncEnabled && m.googleCalendarId && m.syncDirection !== 'toGoogle',
    );

    const errors: string[] = [];
    for (const mapping of enabledMappings) {
      try {
        await this.syncCalendar(mapping.googleCalendarId!, mapping.categoryId);
      } catch (err) {
        const msg = `${mapping.googleCalendarName ?? mapping.googleCalendarId}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        console.error(`[SyncFromGoogle] Failed to sync calendar ${mapping.googleCalendarId}:`, err);
      }
    }

    const syncTokens = await this.getAllSyncTokens();
    const hasErrors = errors.length > 0;
    await this.syncRepo.saveSyncState({
      status: hasErrors ? 'error' : 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: hasErrors ? errors.join('; ') : undefined,
      pendingChanges: 0,
      syncTokens,
    });

    if (hasErrors) {
      throw new Error(`일부 캘린더 동기화 실패: ${errors.join('; ')}`);
    }
  }

  private async syncCalendar(calendarId: string, categoryId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const syncState = await this.syncRepo.getSyncState();
    let existingSyncToken = syncState.syncTokens[calendarId];

    // syncToken이 있지만 해당 캘린더의 로컬 이벤트가 없으면 → full sync 강제
    if (existingSyncToken) {
      const evData = await this.eventsRepo.getEvents();
      const hasEventsForCalendar = (evData?.events ?? []).some(
        (e) => e.googleCalendarId === calendarId,
      );
      if (!hasEventsForCalendar) {
        console.warn(
          `[SyncFromGoogle] syncToken exists but no local events for ${calendarId}, forcing full sync`,
        );
        existingSyncToken = undefined;
      }
    }

    // eslint-disable-next-line no-useless-catch -- execute() 가 캘린더별 에러를 수집하므로 의도적 re-throw 래퍼
    try {
      let result;
      if (existingSyncToken) {
        try {
          result = await this.calendarPort.incrementalSync(
            accessToken,
            calendarId,
            existingSyncToken,
          );
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
        const idx = events.findIndex((e) => e.googleEventId === deletedId);
        if (idx !== -1) events.splice(idx, 1);
      }

      // 생성/업데이트 처리
      for (const gEvent of result.events) {
        if (gEvent.status === 'cancelled') continue;
        const existingIdx = events.findIndex((e) => e.googleEventId === gEvent.id);
        const newEvent = fromGoogleEvent(gEvent, calendarId, categoryId);

        if (existingIdx !== -1) {
          const existing = events[existingIdx]!;

          // 사용자가 숨긴 일정은 구글 동기화로 복원하지 않음
          if (existing.isHidden) continue;

          /*
            NEIS 학사일정은 쌤핀이 구글로 **올려 보낸** 것이라, 되돌아온 사본에는
            구글이 새로 알려 줄 내용이 없다 (2026-08-21). 예전에는 이걸 그대로 덮어써서
            카테고리·출처·NEIS 메타가 통째로 날아갔고, 신분증을 잃은 학사일정은 다음
            NEIS 동기화 때 "없는 일정"으로 판정돼 하나 더 만들어졌다. 같은 일정이 2개,
            3개로 불어난 원인이다. 여기서는 동기화 흔적만 갱신하고 내용은 지킨다.
          */
          if (isNeisOwned(existing)) {
            events[existingIdx] = {
              ...existing,
              googleEventId: gEvent.id,
              googleCalendarId: existing.googleCalendarId ?? calendarId,
              syncStatus: 'synced',
              lastSyncedAt: new Date().toISOString(),
              googleUpdatedAt: gEvent.updated,
              etag: gEvent.etag,
            };
            continue;
          }

          if (detectConflict(existing, gEvent)) {
            // 자동 해결: 최근 수정 우선
            const resolution = resolveConflictByLatest(existing, gEvent);
            if (resolution === 'remote') {
              events[existingIdx] = mergeKeepingIdentity(existing, newEvent);
            }
            // 'local' → 로컬 유지, 다음 push에서 구글에 반영
          } else {
            events[existingIdx] = mergeKeepingIdentity(existing, newEvent);
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
      // execute()에서 개별 캘린더 에러를 수집하므로 re-throw
      throw err;
    }
  }

  private async getAllSyncTokens(): Promise<Record<string, string>> {
    const state = await this.syncRepo.getSyncState();
    return state.syncTokens;
  }
}
