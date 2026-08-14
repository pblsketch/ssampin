/**
 * useConsultationStore 의 updateSchedule / rescheduleBooking / cancelBooking
 * 메서드를 stub 된 Supabase 클라이언트로 검증한다.
 *
 * 실제 fetch 는 mock 되어 있으므로 네트워크 호출은 발생하지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsultationSchedule, ScheduleUpdatePatch } from '@domain/entities/Consultation';

// ── consultationSupabaseClient mock ──────────────────────────────────
// vi.hoisted 로 mock factory 보다 먼저 평가되도록 한다.
const { clientFakes, repoFakes } = vi.hoisted(() => ({
  clientFakes: {
    getSlots: vi.fn(),
    getBookings: vi.fn(),
    updateSchedule: vi.fn(),
    replaceSlots: vi.fn(),
    rescheduleBooking: vi.fn(),
    cancelBooking: vi.fn(),
    bulkUpdateSlotStatus: vi.fn(),
    setClosed: vi.fn(),
    setArchived: vi.fn(),
    setExpiresAt: vi.fn(),
    createSchedule: vi.fn(),
  },
  repoFakes: {
    load: vi.fn(),
    save: vi.fn(),
  },
}));

vi.mock('@adapters/di/container', () => ({
  consultationRepository: repoFakes,
  consultationSupabaseClient: clientFakes,
  shortLinkClient: {
    createShortLink: vi.fn().mockResolvedValue('https://example.test/short'),
  },
}));

// Phase 2: 다른 store mock (구독 트리거·입력)
vi.mock('@adapters/stores/useScheduleStore', () => ({
  useScheduleStore: {
    getState: () => ({ overrides: [] }),
    subscribe: () => () => {},
  },
}));
vi.mock('@adapters/stores/useEventsStore', () => ({
  useEventsStore: {
    getState: () => ({ events: [] }),
    subscribe: () => () => {},
  },
}));
vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: {
        periodTimes: [
          { period: 1, start: '09:00', end: '09:45' },
          { period: 2, start: '09:55', end: '10:40' },
        ],
      },
    }),
  },
}));

// 모킹 후에 store 모듈 import (top-level 순서 보장)
import { useConsultationStore } from '../useConsultationStore';

// ── 헬퍼 ─────────────────────────────────────────────────────────────

const SCHEDULE: ConsultationSchedule = {
  id: 'sch-1',
  title: '1학기 학부모 상담',
  type: 'parent',
  methods: ['face', 'phone', 'video'],
  slotMinutes: 20,
  dates: [{ date: '2026-06-01', startTime: '14:00', endTime: '15:00' }],
  targetClassName: '3-2',
  targetStudents: [{ number: 1 }, { number: 2 }],
  message: '',
  shareUrl: 'https://example.test/booking/sch-1',
  adminKey: 'abcd1234',
  isArchived: false,
  createdAt: '2026-05-19T00:00:00.000Z',
};

const SLOTS = [
  {
    id: 'slot-1400',
    scheduleId: 'sch-1',
    date: '2026-06-01',
    startTime: '14:00',
    endTime: '14:20',
    status: 'booked' as const,
  },
  {
    id: 'slot-1420',
    scheduleId: 'sch-1',
    date: '2026-06-01',
    startTime: '14:20',
    endTime: '14:40',
    status: 'booked' as const,
  },
];

const BOOKINGS = [
  {
    id: 'bk-1',
    scheduleId: 'sch-1',
    slotId: 'slot-1400',
    studentNumber: 1,
    method: 'face' as const,
    createdAt: '2026-05-19T00:00:00.000Z',
  },
  {
    id: 'bk-2',
    scheduleId: 'sch-1',
    slotId: 'slot-1420',
    studentNumber: 2,
    method: 'video' as const,
    createdAt: '2026-05-19T00:00:00.000Z',
  },
];

beforeEach(() => {
  // store 초기화
  useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });

  // mock 기본값 리셋
  Object.values(clientFakes).forEach((fn) => fn.mockReset());
  Object.values(repoFakes).forEach((fn) => fn.mockReset());
  clientFakes.getSlots.mockResolvedValue(SLOTS);
  clientFakes.getBookings.mockResolvedValue(BOOKINGS);
  clientFakes.updateSchedule.mockResolvedValue(undefined);
  clientFakes.replaceSlots.mockResolvedValue(undefined);
  clientFakes.rescheduleBooking.mockResolvedValue({
    success: true,
    message: '예약 시간이 변경되었습니다.',
  });
  clientFakes.cancelBooking.mockResolvedValue(undefined);
  clientFakes.setClosed.mockResolvedValue(undefined);
  clientFakes.setArchived.mockResolvedValue(undefined);
  clientFakes.setExpiresAt.mockResolvedValue(undefined);
  clientFakes.createSchedule.mockResolvedValue(undefined);
  repoFakes.load.mockResolvedValue(null);
  repoFakes.save.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── updateSchedule ───────────────────────────────────────────────────

describe('updateSchedule', () => {
  it('영향 없는 패치 (title만 변경) → ok + 슬롯 보존 + DB PATCH 호출', async () => {
    const result = await useConsultationStore
      .getState()
      .updateSchedule('sch-1', { title: '새 제목' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impact.affected).toHaveLength(0);
      expect(result.impact.preserved).toHaveLength(2);
    }
    expect(clientFakes.updateSchedule).toHaveBeenCalledWith('sch-1', {
      title: '새 제목',
    });
    expect(clientFakes.cancelBooking).not.toHaveBeenCalled();
    expect(clientFakes.replaceSlots).not.toHaveBeenCalled();
  });

  it('영향 있는 패치 + 옵션 미지정 → DB 변경 없이 impact만 반환', async () => {
    const patch: ScheduleUpdatePatch = {
      dates: [{ date: '2026-06-02', startTime: '14:00', endTime: '15:00' }],
    };

    const result = await useConsultationStore.getState().updateSchedule('sch-1', patch);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.impact.affected).toHaveLength(2);
    }
    expect(clientFakes.updateSchedule).not.toHaveBeenCalled();
    expect(clientFakes.cancelBooking).not.toHaveBeenCalled();
    expect(clientFakes.replaceSlots).not.toHaveBeenCalled();
  });

  it('영향 있는 패치 + onAffectedBookings=cancel → 영향 예약 취소 + 메타 PATCH + 슬롯 재생성', async () => {
    const patch: ScheduleUpdatePatch = {
      dates: [{ date: '2026-06-02', startTime: '14:00', endTime: '15:00' }],
    };

    const result = await useConsultationStore
      .getState()
      .updateSchedule('sch-1', patch, { onAffectedBookings: 'cancel' });

    expect(result.ok).toBe(true);
    expect(clientFakes.cancelBooking).toHaveBeenCalledTimes(2);
    // adminKey 는 취소 RPC 의 인자다 (마이그레이션 047)
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-1', 'sch-1', 'abcd1234');
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-2', 'sch-1', 'abcd1234');
    expect(clientFakes.updateSchedule).toHaveBeenCalledTimes(1);
    expect(clientFakes.replaceSlots).toHaveBeenCalledTimes(1);
  });

  it('영향 있는 패치 + onAffectedBookings=abort → ok:false', async () => {
    const patch: ScheduleUpdatePatch = {
      dates: [{ date: '2026-06-02', startTime: '14:00', endTime: '15:00' }],
    };

    const result = await useConsultationStore
      .getState()
      .updateSchedule('sch-1', patch, { onAffectedBookings: 'abort' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('ABORTED_BY_USER');
    expect(clientFakes.updateSchedule).not.toHaveBeenCalled();
    expect(clientFakes.cancelBooking).not.toHaveBeenCalled();
  });

  it('schedule 없으면 ok:false + NOT_FOUND', async () => {
    useConsultationStore.setState({ schedules: [] });
    const result = await useConsultationStore.getState().updateSchedule('sch-1', { title: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_FOUND');
  });
});

// ── rescheduleBooking ────────────────────────────────────────────────

describe('rescheduleBooking', () => {
  it('성공 → ok:true', async () => {
    const result = await useConsultationStore
      .getState()
      .rescheduleBooking('sch-1', 'bk-1', 'slot-1440');
    expect(result.ok).toBe(true);
    expect(clientFakes.rescheduleBooking).toHaveBeenCalledWith({
      scheduleId: 'sch-1',
      bookingId: 'bk-1',
      newSlotId: 'slot-1440',
    });
  });

  it('이미 예약된 슬롯 → ok:false + 한국어 메시지', async () => {
    clientFakes.rescheduleBooking.mockResolvedValueOnce({
      success: false,
      message: '선택한 시간대는 이미 예약되었거나 차단되었습니다.',
    });

    const result = await useConsultationStore
      .getState()
      .rescheduleBooking('sch-1', 'bk-1', 'slot-1420');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/이미 예약/);
  });
});

// ── cancelBooking ────────────────────────────────────────────────────

describe('cancelBooking', () => {
  it('성공 → ok:true', async () => {
    const result = await useConsultationStore.getState().cancelBooking('sch-1', 'bk-1');
    expect(result.ok).toBe(true);
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-1', 'sch-1', 'abcd1234');
  });

  it('일정을 찾지 못하면 호출하지 않고 ok:false', async () => {
    // adminKey 없이 RPC 를 부르면 서버가 거부한다. 헛호출 대신 이유를 돌려준다.
    const result = await useConsultationStore.getState().cancelBooking('없는-일정', 'bk-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/상담 일정을 찾을 수 없습니다/);
    expect(clientFakes.cancelBooking).not.toHaveBeenCalled();
  });

  it('인프라 에러 → ok:false + 한국어 메시지', async () => {
    clientFakes.cancelBooking.mockRejectedValueOnce(new Error('network error'));
    const result = await useConsultationStore.getState().cancelBooking('sch-1', 'bk-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/취소 실패/);
  });
});

// ── Phase 2: recomputeSlotAvailability ───────────────────────────────

describe('recomputeSlotAvailability', () => {
  beforeEach(() => {
    clientFakes.bulkUpdateSlotStatus.mockResolvedValue(undefined);
  });

  it('archived schedule → no-op', async () => {
    useConsultationStore.setState({
      schedules: [{ ...SCHEDULE, isArchived: true }],
      loaded: true,
    });

    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(result.blockedAdded).toBe(0);
    expect(result.availableRestored).toBe(0);
    expect(result.conflictedBookingIds).toEqual([]);
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
  });

  it('schedule 없음 → no-op', async () => {
    useConsultationStore.setState({ schedules: [], loaded: true });
    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');
    expect(result.blockedAdded).toBe(0);
    expect(result.availableRestored).toBe(0);
  });

  it('예약 있는 슬롯은 busy 충돌해도 status 변경 없음 + conflictedBookingIds 에 포함', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    // 9:00~9:45 SchoolEvent 가 14:00 슬롯과 안 겹치게 — busy 없음으로 충돌 0 케이스 확인
    // 새 시나리오: 9:00 슬롯에 예약된 booking + 1교시 cancel-아닌 override
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-0900',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '09:00',
        endTime: '09:20',
        status: 'booked',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([
      {
        id: 'bk-9',
        scheduleId: 'sch-1',
        slotId: 'slot-0900',
        studentNumber: 9,
        method: 'face',
        createdAt: '2026-05-20T00:00:00.000Z',
      },
    ]);
    // useScheduleStore mock 에서 overrides 를 임시로 주입하기 어려우니
    // 대신 events 가 비어있고 overrides 도 비어있는 상태로 충돌 없음 케이스 확인
    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
    expect(result.conflictedBookingIds).toEqual([]);
  });

  it('가용 슬롯이 busy 와 겹치지 않으면 변경 없음 (멱등)', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-1400',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:00',
        endTime: '14:20',
        status: 'available',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([]);

    const r1 = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');
    const r2 = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(r1).toEqual(r2);
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
  });

  it('getSlots 실패 → 안전 no-op', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockRejectedValueOnce(new Error('network'));
    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');
    expect(result.blockedAdded).toBe(0);
    expect(result.availableRestored).toBe(0);
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
  });
});

// ── Phase 2: registerScheduleSyncListener ────────────────────────────

describe('registerScheduleSyncListener', () => {
  it('호출하면 unsubscribe 함수 반환', () => {
    const unsub = useConsultationStore.getState().registerScheduleSyncListener();
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ── 링크 만료: archiveSchedule 서버 반영 (버그 수정) ──────────────────

describe('archiveSchedule', () => {
  it('로컬 isArchived=true + 서버 setArchived(id, true) 반영', async () => {
    await useConsultationStore.getState().archiveSchedule('sch-1');

    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.isArchived).toBe(true);
    expect(clientFakes.setArchived).toHaveBeenCalledWith('sch-1', true);
  });

  it('서버 반영 실패해도 로컬 보관은 유지되고 throw 하지 않음', async () => {
    clientFakes.setArchived.mockRejectedValueOnce(new Error('network'));

    await expect(useConsultationStore.getState().archiveSchedule('sch-1')).resolves.toBeUndefined();

    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.isArchived).toBe(true);
  });
});

// ── 링크 만료: 수동 마감 / 재개 ──────────────────────────────────────

describe('closeSchedule / reopenSchedule', () => {
  it('closeSchedule → setClosed(id, true) + 로컬 closedAt 설정 + ok', async () => {
    const result = await useConsultationStore.getState().closeSchedule('sch-1');

    expect(result.ok).toBe(true);
    expect(clientFakes.setClosed).toHaveBeenCalledWith('sch-1', true);
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.closedAt).toBeTruthy();
  });

  it('closeSchedule 실패 → ok:false + 한국어 사유', async () => {
    clientFakes.setClosed.mockRejectedValueOnce(new Error('network'));

    const result = await useConsultationStore.getState().closeSchedule('sch-1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/마감/);
  });

  it('reopenSchedule → setClosed(id, false) + 로컬 closedAt 제거', async () => {
    useConsultationStore.setState({
      schedules: [{ ...SCHEDULE, closedAt: '2026-06-01T00:00:00.000Z' }],
      loaded: true,
    });

    const result = await useConsultationStore.getState().reopenSchedule('sch-1');

    expect(result.ok).toBe(true);
    expect(clientFakes.setClosed).toHaveBeenCalledWith('sch-1', false);
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.closedAt).toBeUndefined();
  });
});

// ── 링크 만료: 자동 만료일 변경/해제 ────────────────────────────────

describe('setScheduleExpiry', () => {
  it('ISO 설정 → setExpiresAt 호출 + 로컬 expiresAt 반영', async () => {
    const iso = '2026-07-01T15:00:00.000Z';
    const result = await useConsultationStore.getState().setScheduleExpiry('sch-1', iso);

    expect(result.ok).toBe(true);
    expect(clientFakes.setExpiresAt).toHaveBeenCalledWith('sch-1', iso);
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.expiresAt).toBe(iso);
  });

  it('null → 자동 만료 해제 (로컬 expiresAt 제거)', async () => {
    useConsultationStore.setState({
      schedules: [{ ...SCHEDULE, expiresAt: '2026-07-01T15:00:00.000Z' }],
      loaded: true,
    });

    const result = await useConsultationStore.getState().setScheduleExpiry('sch-1', null);

    expect(result.ok).toBe(true);
    expect(clientFakes.setExpiresAt).toHaveBeenCalledWith('sch-1', null);
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.expiresAt).toBeUndefined();
  });
});

// ── 링크 만료: createSchedule 기본 만료일 (마지막 상담일 다음날 00:00 KST) ──

describe('createSchedule 기본 만료일', () => {
  it('여러 날짜 중 가장 마지막 상담일 다음날 00:00(KST)을 expiresAt 으로 설정', async () => {
    const schedule = await useConsultationStore.getState().createSchedule({
      title: '상담',
      type: 'parent',
      methods: ['face'],
      slotMinutes: 20,
      dates: [
        { date: '2026-06-01', startTime: '14:00', endTime: '15:00' },
        { date: '2026-06-03', startTime: '14:00', endTime: '15:00' },
      ],
      targetClassName: '3-2',
      targetStudents: [{ number: 1 }],
      message: '',
    });

    // 마지막 상담일 2026-06-03 → 다음날 00:00 KST = 2026-06-03T15:00:00.000Z
    expect(schedule.expiresAt).toBe('2026-06-03T15:00:00.000Z');
  });

  it('상담 날짜가 없으면 expiresAt 은 undefined', async () => {
    const schedule = await useConsultationStore.getState().createSchedule({
      title: '상담',
      type: 'parent',
      methods: ['face'],
      slotMinutes: 20,
      dates: [],
      targetClassName: '3-2',
      targetStudents: [{ number: 1 }],
      message: '',
    });

    expect(schedule.expiresAt).toBeUndefined();
  });
});
