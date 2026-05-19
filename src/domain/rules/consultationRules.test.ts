import { describe, expect, it } from 'vitest';
import { analyzeScheduleUpdateImpact, isSlotBlockedByTimetable } from './consultationRules';
import type {
  ConsultationBooking,
  ConsultationSchedule,
  ConsultationSlot,
  ScheduleUpdatePatch,
} from '@domain/entities/Consultation';

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
