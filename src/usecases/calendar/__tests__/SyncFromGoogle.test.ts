import { describe, it, expect, beforeEach } from 'vitest';
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
import type { GradeYn } from '@domain/entities/NeisSchedule';

const ALL_GRADES: GradeYn = {
  grade1: true,
  grade2: true,
  grade3: true,
  grade4: false,
  grade5: false,
  grade6: false,
};

const CAL_ID = 'teacher@gmail.com';

function gEvent(extra: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent {
  return {
    id: 'g1',
    summary: '대체휴일',
    start: { date: '2026-10-05' },
    end: { date: '2026-10-06' },
    updated: '2026-08-21T00:00:00.000Z',
    etag: '"etag-1"',
    status: 'confirmed',
    ...extra,
  };
}

/** 쌤핀이 구글로 올려 보낸 NEIS 학사일정 — googleEventId 가 이미 붙어 있다. */
function pushedNeisEvent(): SchoolEvent {
  return {
    id: 'neis-1',
    title: '대체휴일',
    date: '2026-10-05',
    category: 'neis-schedule',
    source: 'neis',
    googleEventId: 'g1',
    googleCalendarId: CAL_ID,
    lastSyncedAt: '2026-08-20T00:00:00.000Z',
    neis: {
      eventId: '20261005_abc',
      eventName: '대체휴일',
      schoolYear: '2026',
      gradeYn: ALL_GRADES,
      subtractDayType: '공휴일',
      loadDate: '20260101',
      lastSyncAt: '2026-08-20T00:00:00.000Z',
    },
  };
}

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
  fullSyncCalls: string[] = [];
  constructor(private readonly result: SyncResult) {}
  async fullSync(_token: string, calendarId: string) {
    this.fullSyncCalls.push(calendarId);
    return this.result;
  }
  async incrementalSync(_token: string, calendarId: string) {
    this.fullSyncCalls.push(calendarId);
    return this.result;
  }
}

function build(events: SchoolEvent[], mappings: CalendarMapping[], remote: GoogleCalendarEvent[]) {
  const syncRepo = new FakeSyncRepo();
  syncRepo.mappings = mappings;
  const eventsRepo = new FakeEventsRepo({ events, categories: [] });
  const port = new FakeCalendarPort({ events: remote, deletedEventIds: [], nextSyncToken: 't1' });
  const useCase = new SyncFromGoogle(
    port as unknown as IGoogleCalendarPort,
    syncRepo as unknown as ICalendarSyncRepository,
    eventsRepo,
    async () => 'access-token',
  );
  return { useCase, eventsRepo, port };
}

const googleMapping: CalendarMapping = {
  categoryId: CAL_ID,
  categoryName: CAL_ID,
  googleCalendarId: CAL_ID,
  googleCalendarName: CAL_ID,
  syncEnabled: true,
  syncDirection: 'bidirectional',
};

const neisMapping: CalendarMapping = {
  categoryId: 'neis-schedule',
  categoryName: '학사일정(NEIS)',
  googleCalendarId: CAL_ID,
  googleCalendarName: CAL_ID,
  syncEnabled: true,
  syncDirection: 'toGoogle',
};

describe('SyncFromGoogle — 되돌아온 사본이 원본을 덮어쓰지 않는다', () => {
  let neis: SchoolEvent;
  beforeEach(() => {
    neis = pushedNeisEvent();
  });

  it('올려 보낸 NEIS 학사일정이 내려와도 카테고리·출처·NEIS 메타가 유지된다', async () => {
    const { useCase, eventsRepo } = build([neis], [googleMapping], [gEvent()]);

    await useCase.execute();

    expect(eventsRepo.data.events).toHaveLength(1);
    const saved = eventsRepo.data.events[0]!;
    expect(saved.category).toBe('neis-schedule');
    expect(saved.source).toBe('neis');
    expect(saved.neis?.eventId).toBe('20261005_abc');
    // 동기화 흔적은 갱신된다
    expect(saved.etag).toBe('"etag-1"');
    expect(saved.googleUpdatedAt).toBe('2026-08-21T00:00:00.000Z');
  });

  it('구글 쪽이 더 최근에 수정돼도(충돌) NEIS 정체성은 지킨다', async () => {
    const modified = { ...neis, isModified: true };
    const { useCase, eventsRepo } = build(
      [modified],
      [googleMapping],
      [gEvent({ summary: '구글에서 바꾼 이름', updated: '2026-08-21T10:00:00.000Z' })],
    );

    await useCase.execute();

    const saved = eventsRepo.data.events[0]!;
    expect(saved.category).toBe('neis-schedule');
    expect(saved.title).toBe('대체휴일');
  });

  it('올리기 전용(toGoogle) 매핑은 내려받지 않는다', async () => {
    const { useCase, port } = build([neis], [neisMapping], [gEvent()]);

    await useCase.execute();

    expect(port.fullSyncCalls).toEqual([]);
  });

  it('쌤핀에서 만든 일정은 구글에서 내려와도 원래 카테고리에 남는다', async () => {
    const mine: SchoolEvent = {
      id: 'mine-1',
      title: '교직원 회의',
      date: '2026-10-05',
      category: 'school',
      source: 'ssampin',
      googleEventId: 'g1',
      googleCalendarId: CAL_ID,
      lastSyncedAt: '2026-08-20T00:00:00.000Z',
    };
    const { useCase, eventsRepo } = build(
      [mine],
      [googleMapping],
      [gEvent({ summary: '교직원 회의(장소 변경)' })],
    );

    await useCase.execute();

    const saved = eventsRepo.data.events[0]!;
    expect(saved.category).toBe('school');
    expect(saved.source).toBe('ssampin');
    // 내용은 구글 쪽 수정을 따라간다
    expect(saved.title).toBe('교직원 회의(장소 변경)');
  });

  it('구글에만 있던 새 일정은 그대로 구글 카테고리로 들어온다', async () => {
    const { useCase, eventsRepo } = build([], [googleMapping], [gEvent({ id: 'g-new' })]);

    await useCase.execute();

    const saved = eventsRepo.data.events[0]!;
    expect(saved.category).toBe(CAL_ID);
    expect(saved.source).toBe('google');
  });
});
