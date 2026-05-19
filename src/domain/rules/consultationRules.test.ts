import { describe, expect, it } from 'vitest';
import {
  analyzeScheduleUpdateImpact,
  buildBusyPeriods,
  expandEventDates,
  isSlotBlockedByTimetable,
  makePeriodResolver,
  resolveEventTimeRange,
} from './consultationRules';
import type {
  ConsultationBooking,
  ConsultationSchedule,
  ConsultationSlot,
  ScheduleUpdatePatch,
} from '@domain/entities/Consultation';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { TimetableOverride } from '@domain/entities/Timetable';

// ── 헬퍼 ─────────────────────────────────────────────────────────────

function schedule(overrides: Partial<ConsultationSchedule> = {}): ConsultationSchedule {
  return {
    id: 'sch-1',
    title: '1학기 학부모 상담',
    type: 'parent',
    methods: ['face', 'phone', 'video'],
    slotMinutes: 20,
    dates: [{ date: '2026-06-01', startTime: '14:00', endTime: '15:00' }],
    targetClassName: '3-2',
    targetStudents: [{ number: 1 }, { number: 2 }, { number: 3 }],
    message: '',
    shareUrl: 'https://example/booking/sch-1',
    shortUrl: undefined,
    adminKey: 'abcd1234',
    isArchived: false,
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

function slot(
  overrides: Partial<ConsultationSlot> & Pick<ConsultationSlot, 'id' | 'startTime'>,
): ConsultationSlot {
  return {
    scheduleId: 'sch-1',
    date: '2026-06-01',
    endTime: addMinutes(overrides.startTime, 20),
    status: 'available',
    ...overrides,
  };
}

function booking(
  overrides: Partial<ConsultationBooking> & Pick<ConsultationBooking, 'id' | 'slotId'>,
): ConsultationBooking {
  return {
    scheduleId: 'sch-1',
    studentNumber: 1,
    method: 'face',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map((s) => Number(s));
  const total = (h ?? 0) * 60 + (m ?? 0) + delta;
  const hh = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const mm = (total % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── analyzeScheduleUpdateImpact ──────────────────────────────────────

describe('analyzeScheduleUpdateImpact', () => {
  const baseSlots: ConsultationSlot[] = [
    slot({ id: 'slot-1400', startTime: '14:00', status: 'booked' }),
    slot({ id: 'slot-1420', startTime: '14:20', status: 'booked' }),
    slot({ id: 'slot-1440', startTime: '14:40', status: 'available' }),
  ];
  const baseBookings: ConsultationBooking[] = [
    booking({ id: 'bk-1', slotId: 'slot-1400', studentNumber: 1, method: 'face' }),
    booking({ id: 'bk-2', slotId: 'slot-1420', studentNumber: 2, method: 'video' }),
  ];

  it('변경 없으면 모든 예약 preserved', () => {
    const result = analyzeScheduleUpdateImpact(schedule(), {}, baseSlots, baseBookings);

    expect(result.preserved).toHaveLength(2);
    expect(result.affected).toHaveLength(0);
  });

  it('dates에서 한 날짜 제거 → 해당 예약 slot_removed', () => {
    const patch: ScheduleUpdatePatch = {
      dates: [{ date: '2026-06-02', startTime: '14:00', endTime: '15:00' }],
    };

    const result = analyzeScheduleUpdateImpact(schedule(), patch, baseSlots, baseBookings);

    expect(result.preserved).toHaveLength(0);
    expect(result.affected).toHaveLength(2);
    expect(result.affected.every((a) => a.reason === 'slot_removed')).toBe(true);
  });

  it('slotMinutes 20→30 → 기존 슬롯 경계 어긋남 → slot_removed', () => {
    const patch: ScheduleUpdatePatch = { slotMinutes: 30 };

    const result = analyzeScheduleUpdateImpact(schedule(), patch, baseSlots, baseBookings);

    // 30분 단위: 14:00, 14:30 만 valid. 14:20 booking 은 sliced.
    const removed = result.affected.filter((a) => a.reason === 'slot_removed');
    expect(removed.map((a) => a.booking.id)).toContain('bk-2');
  });

  it('blockedSlots에 추가 → 해당 슬롯 예약 slot_blocked', () => {
    const patch: ScheduleUpdatePatch = {
      blockedSlots: [{ date: '2026-06-01', startTime: '14:00' }],
    };

    const result = analyzeScheduleUpdateImpact(schedule(), patch, baseSlots, baseBookings);

    const blocked = result.affected.filter((a) => a.reason === 'slot_blocked');
    expect(blocked.map((a) => a.booking.id)).toEqual(['bk-1']);
    expect(result.preserved.map((b) => b.id)).toEqual(['bk-2']);
  });

  it('methods에서 video 제거 → video 예약 method_unsupported', () => {
    const patch: ScheduleUpdatePatch = { methods: ['face', 'phone'] };

    const result = analyzeScheduleUpdateImpact(schedule(), patch, baseSlots, baseBookings);

    const unsupported = result.affected.filter((a) => a.reason === 'method_unsupported');
    expect(unsupported.map((a) => a.booking.id)).toEqual(['bk-2']);
    expect(result.preserved.map((b) => b.id)).toEqual(['bk-1']);
  });

  it('slot 메타 자체가 없으면 보수적으로 slot_removed', () => {
    const orphan = booking({
      id: 'bk-orphan',
      slotId: 'slot-nonexistent',
      studentNumber: 99,
    });
    const result = analyzeScheduleUpdateImpact(schedule(), {}, baseSlots, [orphan]);
    expect(result.affected).toHaveLength(1);
    expect(result.affected[0]?.reason).toBe('slot_removed');
  });
});

// ── isSlotBlockedByTimetable ────────────────────────────────────────

describe('isSlotBlockedByTimetable', () => {
  it('완전 포함 → true', () => {
    expect(
      isSlotBlockedByTimetable({ date: '2026-06-01', startTime: '14:00', endTime: '14:20' }, [
        { date: '2026-06-01', startTime: '13:00', endTime: '15:00' },
      ]),
    ).toBe(true);
  });

  it('1분 겹침 → true', () => {
    expect(
      isSlotBlockedByTimetable({ date: '2026-06-01', startTime: '14:00', endTime: '14:20' }, [
        { date: '2026-06-01', startTime: '14:19', endTime: '14:30' },
      ]),
    ).toBe(true);
  });

  it('인접만 하면 (14:00~14:20 vs 14:20~14:40) → false', () => {
    expect(
      isSlotBlockedByTimetable({ date: '2026-06-01', startTime: '14:00', endTime: '14:20' }, [
        { date: '2026-06-01', startTime: '14:20', endTime: '14:40' },
      ]),
    ).toBe(false);
  });

  it('날짜 다르면 → false', () => {
    expect(
      isSlotBlockedByTimetable({ date: '2026-06-01', startTime: '14:00', endTime: '14:20' }, [
        { date: '2026-06-02', startTime: '14:00', endTime: '15:00' },
      ]),
    ).toBe(false);
  });
});

// ── Phase 2: buildBusyPeriods + 보조 함수 ───────────────────────────

function event(
  o: Partial<SchoolEvent> & Pick<SchoolEvent, 'id' | 'date' | 'title' | 'category'>,
): SchoolEvent {
  return { ...o } as SchoolEvent;
}

function override_(
  o: Partial<TimetableOverride> & Pick<TimetableOverride, 'id' | 'date' | 'period'>,
): TimetableOverride {
  return {
    subject: '',
    createdAt: '2026-05-20T00:00:00.000Z',
    ...o,
  } as TimetableOverride;
}

const PERIOD_TIMES = [
  { period: 1, start: '09:00', end: '09:45' },
  { period: 2, start: '09:55', end: '10:40' },
  { period: 3, start: '10:50', end: '11:35' },
  { period: 4, start: '11:45', end: '12:30' },
];

describe('makePeriodResolver', () => {
  it('숫자 키 → 시간 범위', () => {
    const r = makePeriodResolver(PERIOD_TIMES);
    expect(r('1')).toEqual({ start: '09:00', end: '09:45' });
    expect(r('3')).toEqual({ start: '10:50', end: '11:35' });
    expect(r('99')).toBeNull();
  });
});

describe('resolveEventTimeRange', () => {
  const r = makePeriodResolver(PERIOD_TIMES);

  it('startTime + endTime 우선', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      startTime: '13:00',
      endTime: '14:00',
      time: '15:00 - 16:00',
      period: '2',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '13:00', end: '14:00' });
  });

  it('time(HH:mm - HH:mm) 차선', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      time: '15:30 - 16:45',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '15:30', end: '16:45' });
  });

  it('period 사용', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      period: '2',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '09:55', end: '10:40' });
  });

  it('period + periodEnd', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      period: '1',
      periodEnd: '3',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '09:00', end: '11:35' });
  });

  it('period=allDay → 00:00 ~ 23:59', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      period: 'allDay',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '00:00', end: '23:59' });
  });

  it('아무 시간 정보 없으면 null', () => {
    const ev = event({ id: 'e1', date: '2026-06-01', title: '', category: 'etc' });
    expect(resolveEventTimeRange(ev, r)).toBeNull();
  });
});

describe('expandEventDates', () => {
  it('단일 일자 + allowed 포함', () => {
    const ev = event({ id: 'e1', date: '2026-06-01', title: '', category: 'etc' });
    const out = expandEventDates(ev, new Set(['2026-06-01']));
    expect(out).toEqual(['2026-06-01']);
  });

  it('endDate 있으면 inclusive 확장', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      endDate: '2026-06-03',
      title: '',
      category: 'etc',
    });
    const out = expandEventDates(ev, new Set(['2026-06-01', '2026-06-02', '2026-06-03']));
    expect(out).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
  });

  it('allowed 외 일자는 제외', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      endDate: '2026-06-05',
      title: '',
      category: 'etc',
    });
    const out = expandEventDates(ev, new Set(['2026-06-02', '2026-06-04']));
    expect(out).toEqual(['2026-06-02', '2026-06-04']);
  });
});

describe('buildBusyPeriods', () => {
  const r = makePeriodResolver(PERIOD_TIMES);
  const targetDates = ['2026-06-01', '2026-06-02'];

  it('SchoolEvent.startTime/endTime → busy 1건', () => {
    const result = buildBusyPeriods({
      events: [
        event({
          id: 'e1',
          date: '2026-06-01',
          title: 'X',
          category: 'school',
          startTime: '13:00',
          endTime: '14:30',
        }),
      ],
      overrides: [],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2026-06-01',
      startTime: '13:00',
      endTime: '14:30',
      source: 'event',
      sourceId: 'e1',
    });
  });

  it('SchoolEvent.period 만 있어도 변환', () => {
    const result = buildBusyPeriods({
      events: [
        event({
          id: 'e1',
          date: '2026-06-01',
          title: '',
          category: 'etc',
          period: '2',
        }),
      ],
      overrides: [],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result[0]).toMatchObject({
      startTime: '09:55',
      endTime: '10:40',
      source: 'event',
    });
  });

  it("TimetableOverride.kind='cancel' 은 busy 에서 제외 (휴강 → 가용)", () => {
    const result = buildBusyPeriods({
      events: [],
      overrides: [
        override_({ id: 'o1', date: '2026-06-01', period: 2, kind: 'cancel' }),
        override_({ id: 'o2', date: '2026-06-01', period: 3, kind: 'substitute' }),
      ],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.sourceId).toBe('o2');
  });

  it('TimetableOverride.kind=swap/substitute/custom 모두 busy', () => {
    const result = buildBusyPeriods({
      events: [],
      overrides: [
        override_({ id: 'o1', date: '2026-06-01', period: 1, kind: 'swap' }),
        override_({ id: 'o2', date: '2026-06-01', period: 2, kind: 'substitute' }),
        override_({ id: 'o3', date: '2026-06-01', period: 3, kind: 'custom' }),
      ],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result.map((b) => b.sourceId).sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('targetDates 외 일자는 무시 (성능)', () => {
    const result = buildBusyPeriods({
      events: [
        event({
          id: 'e1',
          date: '2099-12-31',
          title: '',
          category: 'etc',
          startTime: '10:00',
          endTime: '11:00',
        }),
      ],
      overrides: [override_({ id: 'o1', date: '2099-12-31', period: 1, kind: 'swap' })],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result).toEqual([]);
  });
});
