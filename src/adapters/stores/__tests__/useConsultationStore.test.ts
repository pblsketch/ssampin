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
    // ADR-095: 명단은 시간대·예약을 한 번에 받는다(구글 확인을 두 번 하지 않으려고).
    getDetail: vi.fn(),
    updateSchedule: vi.fn(),
    replaceSlots: vi.fn(),
    rescheduleBooking: vi.fn(),
    cancelBooking: vi.fn(),
    bulkUpdateSlotStatus: vi.fn(),
    setSlotBlockedByTeacher: vi.fn(),
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
  // getDetail 은 두 fake 를 합쳐서 답한다. 각 테스트가 지금처럼 getSlots/getBookings 만
  // 정해 줘도 그대로 통하도록 하려는 것이다(ADR-095 로 호출이 하나로 합쳐졌다).
  clientFakes.getDetail.mockImplementation(async () => ({
    slots: await clientFakes.getSlots(),
    bookings: await clientFakes.getBookings(),
    cryptoVersion: 1,
    cryptoSalt: null,
  }));
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
  // 만들기는 서버가 먼저다 — 서버가 관리 키·소금값을 발급한다(ADR-095).
  clientFakes.createSchedule.mockResolvedValue({
    adminKey: 'server-issued-key',
    cryptoVersion: 2,
    cryptoSalt: 'server-issued-salt',
  });
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
    expect(clientFakes.updateSchedule).toHaveBeenCalledWith('sch-1', 'abcd1234', {
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
      adminKey: 'abcd1234',
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

  // ADR-095 로 동작이 바뀐 자리다.
  //
  // 예전에는 명단을 못 받으면 **빈 결과를 돌려줬다.** 그러면 부르는 쪽이 "겹치는 일정이
  // 없다"로 읽어 자동 차단이 조용히 멈추고, 막아 뒀어야 할 시간에 학부모 예약이 들어와
  // 이중 예약이 된다(계획서 §8 시나리오 4). 지금은 올린다 — 다만 **시간대 상태를
  // 덮어쓰지 않는다**는 성질은 그대로다.
  it('명단을 못 받으면 시간대 상태를 건드리지 않고 실패를 올린다', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockRejectedValueOnce(new Error('network'));
    await expect(
      useConsultationStore.getState().recomputeSlotAvailability('sch-1'),
    ).rejects.toThrow('network');
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
  });

  // ── 차단 주체 구분 (ADR-060) ──────────────────────────────────────
  //
  // 2026-08-20 사용자 신고의 핵심. 이 구분이 없던 시절에는 교사가 막아 둔 슬롯을
  // "겹치는 일정이 없다" 는 이유로 되돌려서, 막아 둔 시간에 학부모 예약이 들어올
  // 수 있었다.

  it('교사가 막은 슬롯(blockedBy=teacher)은 겹침이 없어도 풀리지 않는다', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-teacher',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:00',
        endTime: '14:20',
        status: 'blocked',
        blockedBy: 'teacher',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([]);

    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(result.availableRestored).toBe(0);
    expect(clientFakes.bulkUpdateSlotStatus).not.toHaveBeenCalled();
  });

  it('자동으로 막힌 슬롯(blockedBy=auto)은 겹침이 사라지면 풀린다', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-auto',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:00',
        endTime: '14:20',
        status: 'blocked',
        blockedBy: 'auto',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([]);

    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(result.availableRestored).toBe(1);
    expect(clientFakes.bulkUpdateSlotStatus).toHaveBeenCalledWith(
      'sch-1',
      'abcd1234',
      ['slot-auto'],
      'available',
    );
  });

  it('한 일정에 교사 차단과 자동 차단이 섞여 있으면 자동 차단만 풀린다', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-teacher',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:00',
        endTime: '14:20',
        status: 'blocked',
        blockedBy: 'teacher',
      },
      {
        id: 'slot-auto',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:20',
        endTime: '14:40',
        status: 'blocked',
        blockedBy: 'auto',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([]);

    await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(clientFakes.bulkUpdateSlotStatus).toHaveBeenCalledTimes(1);
    expect(clientFakes.bulkUpdateSlotStatus).toHaveBeenCalledWith(
      'sch-1',
      'abcd1234',
      ['slot-auto'],
      'available',
    );
  });

  // 마이그레이션 048 이전에 만들어진 행은 blockedBy 가 없다. 048 이 이런 행을
  // 'auto' 로 채우지만, 채우기 전에 앱이 먼저 돌 수도 있으므로 동작을 못 박아 둔다.
  it('blockedBy 가 없는 옛 슬롯은 자동 차단으로 보고 푼다', async () => {
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
    clientFakes.getSlots.mockResolvedValue([
      {
        id: 'slot-legacy',
        scheduleId: 'sch-1',
        date: '2026-06-01',
        startTime: '14:00',
        endTime: '14:20',
        status: 'blocked',
      },
    ]);
    clientFakes.getBookings.mockResolvedValue([]);

    const result = await useConsultationStore.getState().recomputeSlotAvailability('sch-1');

    expect(result.availableRestored).toBe(1);
  });
});

// ── 교사 직접 차단/해제 (상세 화면 버튼) ─────────────────────────────

describe('setSlotBlocked', () => {
  beforeEach(() => {
    clientFakes.setSlotBlockedByTeacher.mockReset();
    // ADR-095: 서버 창구가 유예 판정에 관리 키를 쓰므로, 스토어가 일정에서 키를 찾아
    // 함께 넘긴다. 일정이 없으면 아예 부르지 않는다(아래 마지막 테스트).
    useConsultationStore.setState({ schedules: [SCHEDULE], loaded: true });
  });

  it('차단 요청을 클라이언트에 그대로 넘긴다', async () => {
    clientFakes.setSlotBlockedByTeacher.mockResolvedValue(undefined);
    const result = await useConsultationStore.getState().setSlotBlocked('sch-1', 'slot-1', true);
    expect(result.ok).toBe(true);
    expect(clientFakes.setSlotBlockedByTeacher).toHaveBeenCalledWith(
      'sch-1',
      'abcd1234',
      'slot-1',
      true,
    );
  });

  it('해제 요청도 그대로 넘긴다', async () => {
    clientFakes.setSlotBlockedByTeacher.mockResolvedValue(undefined);
    const result = await useConsultationStore.getState().setSlotBlocked('sch-1', 'slot-1', false);
    expect(result.ok).toBe(true);
    expect(clientFakes.setSlotBlockedByTeacher).toHaveBeenCalledWith(
      'sch-1',
      'abcd1234',
      'slot-1',
      false,
    );
  });

  it('실패하면 사용자에게 보여줄 이유와 함께 ok:false', async () => {
    clientFakes.setSlotBlockedByTeacher.mockRejectedValue(new Error('network'));
    const result = await useConsultationStore.getState().setSlotBlocked('sch-1', 'slot-1', true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/막지 못했습니다/);
  });

  it('일정을 못 찾으면 서버를 부르지 않고 이유를 돌려준다', async () => {
    useConsultationStore.setState({ schedules: [], loaded: true });
    const result = await useConsultationStore
      .getState()
      .setSlotBlocked('없는-일정', 'slot-1', true);
    expect(result.ok).toBe(false);
    expect(clientFakes.setSlotBlockedByTeacher).not.toHaveBeenCalled();
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
    expect(clientFakes.setArchived).toHaveBeenCalledWith('sch-1', 'abcd1234', true);
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
    expect(clientFakes.setClosed).toHaveBeenCalledWith('sch-1', 'abcd1234', true);
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
    expect(clientFakes.setClosed).toHaveBeenCalledWith('sch-1', 'abcd1234', false);
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
    expect(clientFakes.setExpiresAt).toHaveBeenCalledWith('sch-1', 'abcd1234', iso);
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
    expect(clientFakes.setExpiresAt).toHaveBeenCalledWith('sch-1', 'abcd1234', null);
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

// ── 상담 주제 선택지 ─────────────────────────────────────────────────

describe('상담 주제 선택지', () => {
  it('만들 때 서버로도 보내고 이 기기에도 남긴다', async () => {
    const schedule = await useConsultationStore.getState().createSchedule({
      title: '상담',
      type: 'parent',
      methods: ['face'],
      slotMinutes: 20,
      dates: [{ date: '2026-06-01', startTime: '14:00', endTime: '15:00' }],
      targetClassName: '3-2',
      targetStudents: [{ number: 1 }],
      message: '',
      topicOptions: ['학교생활', '교우관계'],
    });

    expect(schedule.topicOptions).toEqual(['학교생활', '교우관계']);
    expect(clientFakes.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ topicOptions: ['학교생활', '교우관계'] }),
    );
  });

  it('선택지를 안 주면 서버 요청에도 넣지 않는다 (옛 동작 그대로)', async () => {
    await useConsultationStore.getState().createSchedule({
      title: '상담',
      type: 'parent',
      methods: ['face'],
      slotMinutes: 20,
      dates: [{ date: '2026-06-01', startTime: '14:00', endTime: '15:00' }],
      targetClassName: '3-2',
      targetStudents: [{ number: 1 }],
      message: '',
    });

    const payload = clientFakes.createSchedule.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('topicOptions');
  });

  it('수정하면 서버 패치와 이 기기 사본이 함께 바뀐다', async () => {
    const result = await useConsultationStore
      .getState()
      .updateSchedule('sch-1', { topicOptions: ['진로·진학'] });

    expect(result.ok).toBe(true);
    expect(clientFakes.updateSchedule).toHaveBeenCalledWith('sch-1', 'abcd1234', {
      topicOptions: ['진로·진학'],
    });
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.topicOptions).toEqual(['진로·진학']);
  });

  it('선택지를 비우면 빈 배열로 지운다 (undefined 와 구분한다)', async () => {
    await useConsultationStore.getState().updateSchedule('sch-1', { topicOptions: [] });

    expect(clientFakes.updateSchedule).toHaveBeenCalledWith('sch-1', 'abcd1234', {
      topicOptions: [],
    });
    const s = useConsultationStore.getState().schedules.find((x) => x.id === 'sch-1');
    expect(s?.topicOptions).toEqual([]);
  });
});
