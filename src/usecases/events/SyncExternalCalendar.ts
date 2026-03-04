import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { ExternalCalendarSource } from '@domain/entities/ExternalCalendar';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { parseICal } from '@infrastructure/calendar/ICalParser';

export interface SyncResult {
  readonly added: number;
  readonly updated: number;
  readonly removed: number;
}

/**
 * 외부 캘린더(iCal) 동기화 유스케이스
 *
 * 외부 이벤트는 id에 "ext:{sourceId}:{uid}" prefix를 부여하여 내부 이벤트와 구분.
 * 동기화 시 해당 소스의 기존 외부 이벤트를 교체하고, 내부 이벤트는 보존.
 */
export class SyncExternalCalendar {
  constructor(
    private readonly eventsRepo: IEventsRepository,
  ) {}

  async syncFromICal(
    source: ExternalCalendarSource,
    icalText: string,
  ): Promise<SyncResult> {
    const parsed = parseICal(icalText);
    const existing = await this.eventsRepo.getEvents();
    const currentEvents = existing?.events ?? [];

    const prefix = `ext:${source.id}:`;
    const existingExternal = currentEvents.filter((e) => e.id.startsWith(prefix));
    const existingMap = new Map(existingExternal.map((e) => [e.id, e]));

    let added = 0;
    let updated = 0;
    let removed = 0;
    const newExternalIds = new Set<string>();

    // 파싱된 이벤트를 SchoolEvent로 변환
    const newExternalEvents: SchoolEvent[] = [];
    for (const pe of parsed) {
      const eventId = `${prefix}${pe.uid}`;
      newExternalIds.add(eventId);

      const converted: SchoolEvent = {
        id: eventId,
        title: pe.summary,
        date: pe.dtstart,
        ...(pe.dtend && pe.dtend !== pe.dtstart ? { endDate: pe.dtend } : {}),
        category: source.categoryId,
        ...(pe.description ? { description: pe.description } : {}),
        ...(pe.location ? { location: pe.location } : {}),
      };

      if (existingMap.has(eventId)) {
        const old = existingMap.get(eventId)!;
        if (old.title !== converted.title || old.date !== converted.date) {
          updated++;
        }
      } else {
        added++;
      }

      newExternalEvents.push(converted);
    }

    // 삭제된 이벤트 (외부에서 없어진 것)
    for (const ext of existingExternal) {
      if (!newExternalIds.has(ext.id)) {
        removed++;
      }
    }

    // 병합: 내부 이벤트 + 새 외부 이벤트
    const internalEvents = currentEvents.filter((e) => !e.id.startsWith(prefix));

    await this.eventsRepo.saveEvents({
      events: [...internalEvents, ...newExternalEvents],
      categories: existing?.categories,
    });

    return { added, updated, removed };
  }
}
