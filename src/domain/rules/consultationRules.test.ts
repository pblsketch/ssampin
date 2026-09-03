import { describe, expect, it } from 'vitest';
import {
  analyzeScheduleUpdateImpact,
  buildBusyPeriods,
  buildStudentNumberIndex,
  computeDefaultConsultationExpiry,
  expandEventDates,
  expiryIsoToKstDateString,
  getConsultationLinkStatus,
  isSlotBlockedByTimetable,
  kstDateStringToExpiryIso,
  listUnbookedStudents,
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

  // 종일 일정은 busy 로 잡지 않는다.
  // 예전에는 00:00~23:59 로 잡아서, 캘린더에 '학부모 상담 주간' 같은 종일 일정을
  // 하나 적어두면 바로 그 날 상담 슬롯이 전부 '차단된 슬롯' 이 되던 실제 결함이 있었다.
  it('period=allDay → null (종일은 시각 정보가 아니므로 차단하지 않는다)', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      period: 'allDay',
    });
    expect(resolveEventTimeRange(ev, r)).toBeNull();
  });

  it('allDay 라도 startTime/endTime 이 있으면 그 시각을 쓴다', () => {
    const ev = event({
      id: 'e1',
      date: '2026-06-01',
      title: '',
      category: 'etc',
      period: 'allDay',
      startTime: '13:00',
      endTime: '14:00',
    });
    expect(resolveEventTimeRange(ev, r)).toEqual({ start: '13:00', end: '14:00' });
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

  // 실제 사용자 신고 재현: "예약도 안 됐는데 왜 차단된 슬롯인가요?"
  // 원인은 상담 날짜에 걸쳐 있던 종일 일정이었다.
  it('종일 일정은 그날 상담 슬롯을 차단하지 않는다', () => {
    const result = buildBusyPeriods({
      events: [
        event({
          id: 'e1',
          date: '2026-06-01',
          title: '학부모 상담 주간',
          category: 'school',
          period: 'allDay',
        }),
      ],
      overrides: [],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result).toHaveLength(0);

    const slots = [
      { date: '2026-06-01', startTime: '14:00', endTime: '14:30' },
      { date: '2026-06-01', startTime: '14:30', endTime: '15:00' },
    ];
    expect(slots.every((sl) => !isSlotBlockedByTimetable(sl, result))).toBe(true);
  });

  it('여러 날에 걸친 종일 일정도 어느 날도 차단하지 않는다', () => {
    const result = buildBusyPeriods({
      events: [
        event({
          id: 'e1',
          date: '2026-06-01',
          endDate: '2026-06-02',
          title: '체육대회',
          category: 'school',
          period: 'allDay',
        }),
      ],
      overrides: [],
      targetDates,
      resolvePeriodTime: r,
    });
    expect(result).toHaveLength(0);
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

// ── 링크 만료: 기본 만료일 계산 ──────────────────────────────────────

describe('computeDefaultConsultationExpiry', () => {
  it('가장 마지막 상담일 다음날 00:00(KST)을 반환', () => {
    const iso = computeDefaultConsultationExpiry([
      { date: '2026-06-01', startTime: '14:00', endTime: '15:00' },
      { date: '2026-06-03', startTime: '14:00', endTime: '15:00' },
    ]);
    // 2026-06-03 다음날 00:00 KST = 2026-06-03T15:00:00.000Z
    expect(iso).toBe('2026-06-03T15:00:00.000Z');
  });

  it('날짜가 없으면 undefined', () => {
    expect(computeDefaultConsultationExpiry([])).toBeUndefined();
  });
});

// ── 링크 만료: 상태 판정 ──────────────────────────────────────────────

describe('getConsultationLinkStatus', () => {
  const NOW = Date.parse('2026-06-15T00:00:00.000Z');

  it('아무 상태도 없으면 open', () => {
    expect(getConsultationLinkStatus({ isArchived: false }, NOW)).toBe('open');
  });

  it('isArchived 면 archived (최우선)', () => {
    expect(
      getConsultationLinkStatus({ isArchived: true, closedAt: '2026-06-10T00:00:00.000Z' }, NOW),
    ).toBe('archived');
  });

  it('closedAt 이 있으면 closed', () => {
    expect(
      getConsultationLinkStatus({ isArchived: false, closedAt: '2026-06-10T00:00:00.000Z' }, NOW),
    ).toBe('closed');
  });

  it('expiresAt 이 now 이전이면 expired', () => {
    expect(
      getConsultationLinkStatus({ isArchived: false, expiresAt: '2026-06-14T00:00:00.000Z' }, NOW),
    ).toBe('expired');
  });

  it('expiresAt 이 미래면 open', () => {
    expect(
      getConsultationLinkStatus({ isArchived: false, expiresAt: '2026-06-20T00:00:00.000Z' }, NOW),
    ).toBe('open');
  });
});

// ── 링크 만료: 만료일 ISO ↔ KST 날짜 변환 ────────────────────────────

describe('expiryIsoToKstDateString / kstDateStringToExpiryIso', () => {
  it('ISO → KST 날짜 문자열', () => {
    // 2026-06-04 00:00 KST = 2026-06-03T15:00:00Z
    expect(expiryIsoToKstDateString('2026-06-03T15:00:00.000Z')).toBe('2026-06-04');
  });

  it('KST 날짜 문자열 → ISO (해당일 00:00 KST)', () => {
    expect(kstDateStringToExpiryIso('2026-06-04')).toBe('2026-06-03T15:00:00.000Z');
  });

  it('왕복 변환이 일치한다', () => {
    const iso = '2026-06-03T15:00:00.000Z';
    expect(kstDateStringToExpiryIso(expiryIsoToKstDateString(iso))).toBe(iso);
    const date = '2026-07-01';
    expect(expiryIsoToKstDateString(kstDateStringToExpiryIso(date))).toBe(date);
  });
});

// ── 예약 번호 ↔ 학생 매핑 (중간 번호 결번) ───────────────────────────

describe('buildStudentNumberIndex / listUnbookedStudents', () => {
  /** 32명 중 16번이 자퇴로 빠진 명렬표 (활성 31명). */
  const roster = Array.from({ length: 32 }, (_, i) => ({
    studentNumber: i + 1,
    name: `학생${i + 1}`,
    status: i + 1 === 16 ? ('withdrawn' as const) : ('active' as const),
  }));
  const active = roster.filter((s) => s.status === 'active');

  it('빈 번호 뒤 학생을 번호 그대로 찾는다 (위치로 밀리지 않음)', () => {
    const index = buildStudentNumberIndex(active);
    expect(index.get(17)?.name).toBe('학생17');
    expect(index.get(32)?.name).toBe('학생32');
    // 위치 기반(active[16])이었다면 '학생18'이 나왔다.
    expect(active[16]?.name).toBe('학생18');
  });

  it('결번은 조회되지 않는다', () => {
    expect(buildStudentNumberIndex(active).get(16)).toBeUndefined();
  });

  it('앞선 항목이 우선한다 — 활성 학생을 먼저 넘기면 활성이 이긴다', () => {
    const index = buildStudentNumberIndex([...active, ...roster]);
    expect(index.get(17)?.name).toBe('학생17');
    // 예약 후 자퇴한 학생 이름도 남는다.
    expect(index.get(16)?.name).toBe('학생16');
  });

  it('번호가 없거나 0 이하면 조회표에서 제외한다', () => {
    const index = buildStudentNumberIndex([
      { studentNumber: undefined, name: '무번호' },
      { studentNumber: 0, name: '영번' },
      { studentNumber: 3, name: '학생3' },
    ]);
    expect(index.size).toBe(1);
    expect(index.get(3)?.name).toBe('학생3');
  });

  it('미신청 목록이 실제 출석번호를 쓴다 — 16번 결번이어도 17번은 17번', () => {
    const unbooked = listUnbookedStudents(active, new Set([1, 2, 17]));
    expect(unbooked).toHaveLength(28);
    expect(unbooked.some((s) => s.number === 16)).toBe(false);
    expect(unbooked.find((s) => s.number === 18)?.name).toBe('학생18');
    expect(unbooked[unbooked.length - 1]).toEqual({ number: 32, name: '학생32' });
  });

  it('미신청 목록은 번호 오름차순이며 번호 없는 학생은 뺀다', () => {
    const unbooked = listUnbookedStudents(
      [
        { studentNumber: 5, name: '다섯' },
        { studentNumber: undefined, name: '무번호' },
        { studentNumber: 2, name: '둘' },
      ],
      new Set<number>(),
    );
    expect(unbooked).toEqual([
      { number: 2, name: '둘' },
      { number: 5, name: '다섯' },
    ]);
  });
});
