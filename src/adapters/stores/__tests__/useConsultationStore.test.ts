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
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-1', 'sch-1');
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-2', 'sch-1');
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
    expect(clientFakes.cancelBooking).toHaveBeenCalledWith('bk-1', 'sch-1');
  });

  it('인프라 에러 → ok:false + 한국어 메시지', async () => {
    clientFakes.cancelBooking.mockRejectedValueOnce(new Error('network error'));
    const result = await useConsultationStore.getState().cancelBooking('sch-1', 'bk-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/취소 실패/);
  });
});
