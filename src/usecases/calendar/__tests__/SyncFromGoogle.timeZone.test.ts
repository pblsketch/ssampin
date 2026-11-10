/**
 * 구글 일정 시각이 9시간 어긋나던 문제 (2026-09-15 신고).
 *
 * "구글에서 오전 8시 일정이 쌤핀에서는 전날 오후 11시로, 오전 11시 일정은 오전 2시로 보인다."
 * 구글은 캘린더에 설정된 시간대로 시각을 돌려주는데, 쌤핀은 그 글자를 그대로 잘라 썼다.
 * 캘린더 시간대가 한국이 아니면(UTC 등) 9시간 어긋난다. 이제 한국 시각으로 맞추고,
 * 이미 어긋나게 저장된 일정이 고쳐지도록 캘린더마다 한 번 전체를 다시 받는다.
 */
import { describe, it, expect } from 'vitest';
import { fromGoogleEvent } from '@domain/rules/calendarSyncRules';
import { SyncFromGoogle } from '../SyncFromGoogle';
import type {
  IGoogleCalendarPort,
  GoogleCalendarEvent,
  SyncResult,
} from '@domain/ports/IGoogleCalendarPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { CalendarMapping } from '@domain/entities/CalendarMapping';
import type { SchoolEvent, SchoolEventsData } from '@domain/entities/SchoolEvent';
import type { SyncState } from '@domain/entities/SyncState';

const CAL_ID = 'teacher@gmail.com';

function timed(start: string, end: string, extra: Partial<GoogleCalendarEvent> = {}) {
  return {
    id: 'g1',
    summary: '교직원 회의',
    start: { dateTime: start },
    end: { dateTime: end },
    updated: '2026-11-10T00:00:00.000Z',
    etag: '"e1"',
    status: 'confirmed',
    ...extra,
  } as GoogleCalendarEvent;
}

describe('fromGoogleEvent — 시각은 한국 시각으로 맞춘다', () => {
  it('UTC(Z)로 온 오전 8시 일정이 전날 밤 11시로 찍히지 않는다', () => {
    // 한국 2026-09-15 08:00~09:00 = UTC 2026-09-14 23:00~24:00
    const event = fromGoogleEvent(
      timed('2026-09-14T23:00:00Z', '2026-09-15T00:00:00Z'),
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-09-15');
    expect(event.startTime).toBe('08:00');
    expect(event.endTime).toBe('09:00');
    expect(event.time).toBe('08:00 - 09:00');
    expect(event.endDate).toBeUndefined();
  });

  it('한국 시간대(+09:00)로 온 일정은 그대로다', () => {
    const event = fromGoogleEvent(
      timed('2026-09-15T11:00:00+09:00', '2026-09-15T12:30:00+09:00'),
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-09-15');
    expect(event.time).toBe('11:00 - 12:30');
  });

  it('다른 시간대(-05:00)로 와도 한국 시각으로 바꾼다', () => {
    // 뉴욕 9/14 19:00 = 한국 9/15 09:00
    const event = fromGoogleEvent(
      timed('2026-09-14T19:00:00-05:00', '2026-09-14T20:00:00-05:00'),
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-09-15');
    expect(event.time).toBe('09:00 - 10:00');
  });

  it('자정을 넘기는 일정은 끝 날짜가 다음 날로 잡힌다', () => {
    const event = fromGoogleEvent(
      timed('2026-09-15T13:00:00Z', '2026-09-15T16:00:00Z'), // 한국 22:00 ~ 다음 날 01:00
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-09-15');
    expect(event.startTime).toBe('22:00');
    expect(event.endTime).toBe('01:00');
    expect(event.endDate).toBe('2026-09-16');
  });

  it('시간대 표기가 없는 시각은 적힌 그대로 쓴다', () => {
    const event = fromGoogleEvent(
      timed('2026-09-15T08:00:00', '2026-09-15T09:00:00'),
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-09-15');
    expect(event.time).toBe('08:00 - 09:00');
  });

  it('종일 일정은 바뀌지 않는다', () => {
    const event = fromGoogleEvent(
      {
        id: 'g2',
        summary: '개교기념일',
        start: { date: '2026-10-05' },
        end: { date: '2026-10-06' },
      } as GoogleCalendarEvent,
      CAL_ID,
      'cat',
    );

    expect(event.date).toBe('2026-10-05');
    expect(event.time).toBeUndefined();
    expect(event.endDate).toBeUndefined();
  });
});

class FakeSyncRepo implements Partial<ICalendarSyncRepository> {
  mappings: CalendarMapping[] = [];
  state: SyncState = { status: 'idle', pendingChanges: 0, syncTokens: {} };
  async getMappings() {
    return this.mappings;
  }
  async getSyncState() {
    return this.state;
  }
  async saveSyncState(state: SyncState) {
    this.state = state;
  }
}

class FakeEventsRepo implements IEventsRepository {
  constructor(public data: SchoolEventsData) {}
  async getEvents() {
    return this.data;
  }
  async saveEvents(data: SchoolEventsData) {
    this.data = data;
  }
}

class FakeCalendarPort implements Partial<IGoogleCalendarPort> {
  calls: string[] = [];
  constructor(private readonly result: SyncResult) {}
  async fullSync() {
    this.calls.push('full');
    return this.result;
  }
  async incrementalSync() {
    this.calls.push('incremental');
    return { events: [], deletedEventIds: [], nextSyncToken: 't2' };
  }
}

const mapping = {
  categoryId: 'cat',
  googleCalendarId: CAL_ID,
  googleCalendarName: '내 캘린더',
  syncEnabled: true,
  syncDirection: 'bidirectional',
} as unknown as CalendarMapping;

/** 예전 규칙으로 9시간 어긋나게 저장된 일정 */
function wronglyStored(): SchoolEvent {
  return {
    id: `gcal:${CAL_ID}:g1`,
    title: '교직원 회의',
    date: '2026-09-14',
    category: 'cat',
    time: '23:00 - 00:00',
    startTime: '23:00',
    endTime: '00:00',
    endDate: '2026-09-15',
    googleEventId: 'g1',
    googleCalendarId: CAL_ID,
    syncStatus: 'synced',
    lastSyncedAt: '2026-11-10T01:00:00.000Z',
    googleUpdatedAt: '2026-09-01T00:00:00.000Z',
    source: 'google',
  };
}

function build(state: SyncState) {
  const syncRepo = new FakeSyncRepo();
  syncRepo.mappings = [mapping];
  syncRepo.state = state;
  const eventsRepo = new FakeEventsRepo({ events: [wronglyStored()], categories: [] });
  const port = new FakeCalendarPort({
    events: [
      timed('2026-09-14T23:00:00Z', '2026-09-15T00:00:00Z', {
        updated: '2026-09-01T00:00:00.000Z',
      }),
    ],
    deletedEventIds: [],
    nextSyncToken: 't1',
  });
  const useCase = new SyncFromGoogle(
    port as unknown as IGoogleCalendarPort,
    syncRepo as unknown as ICalendarSyncRepository,
    eventsRepo,
    async () => 'access-token',
  );
  return { useCase, eventsRepo, port, syncRepo };
}

describe('SyncFromGoogle — 이미 어긋나게 저장된 일정 고치기', () => {
  it('동기화 토큰이 있어도 캘린더마다 한 번은 전체를 다시 받아 시각을 바로잡는다', async () => {
    const { useCase, eventsRepo, port, syncRepo } = build({
      status: 'idle',
      pendingChanges: 0,
      syncTokens: { [CAL_ID]: 'old-token' },
    });

    await useCase.execute();

    expect(port.calls).toEqual(['full']);
    const fixed = eventsRepo.data.events.find((e) => e.googleEventId === 'g1');
    expect(fixed?.date).toBe('2026-09-15');
    expect(fixed?.time).toBe('08:00 - 09:00');
    expect(fixed?.endDate).toBeUndefined();
    expect(syncRepo.state.fullResyncVersions?.[CAL_ID]).toBe(1);
  });

  it('한 번 다시 받은 뒤에는 평소처럼 바뀐 것만 받는다', async () => {
    const { useCase, port } = build({
      status: 'idle',
      pendingChanges: 0,
      syncTokens: { [CAL_ID]: 'old-token' },
      fullResyncVersions: { [CAL_ID]: 1 },
    });

    await useCase.execute();

    expect(port.calls).toEqual(['incremental']);
  });
});
