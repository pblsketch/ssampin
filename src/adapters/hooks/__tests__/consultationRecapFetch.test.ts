/**
 * 돌아보기 상담 수 가져오기(spec 2-3) — 창 하나가 열려 있는 동안 같은 일정은 한 번만 묻고,
 * 하나라도 실패하면 상담 항목 전체를 뺀다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CONSULTATION_CONCURRENCY,
  createConsultationFetchCache,
  fetchConsultationCount,
} from '@adapters/hooks/consultationRecapFetch';

const getDetail = vi.fn();
const schedules: { id: string; adminKey: string; dates: { date: string }[] }[] = [
  { id: 'a', adminKey: 'ka', dates: [{ date: '2026-12-28' }] },
  { id: 'b', adminKey: 'kb', dates: [{ date: '2026-09-10' }, { date: '2026-12-29' }] },
];

vi.mock('@adapters/stores/useConsultationStore', () => ({
  useConsultationStore: {
    getState: () => ({ loaded: true, load: async () => {}, schedules }),
  },
}));

vi.mock('@adapters/di/container', () => ({
  consultationSupabaseClient: { getDetail: (...args: unknown[]) => getDetail(...args) },
}));

function detail(date: string, booked: number) {
  const slots = Array.from({ length: booked }, (_, i) => ({
    id: `${date}-${i}`,
    date,
    status: 'booked' as const,
  }));
  return { slots, bookings: slots.map((s) => ({ slotId: s.id })) };
}

beforeEach(() => {
  getDetail.mockReset();
  getDetail.mockImplementation(async (id: string) =>
    id === 'a' ? detail('2026-12-28', 2) : detail('2026-12-29', 1),
  );
});

describe('상담 수 가져오기', () => {
  it('같은 창에서는 학기·이번 주가 같은 일정을 한 번만 묻는다', async () => {
    const cache = createConsultationFetchCache();
    const term = await fetchConsultationCount({ start: '2026-08-18', end: '2026-12-30' }, cache);
    const week = await fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' }, cache);
    expect(term).toBe(3);
    expect(week).toBe(3);
    expect(getDetail).toHaveBeenCalledTimes(2); // a·b 한 번씩
  });

  it('창을 새로 열면(새 묶음) 다시 묻는다', async () => {
    await fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' });
    await fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' });
    expect(getDetail).toHaveBeenCalledTimes(4);
  });

  it('일정 하나라도 실패하면 상담 항목 전체를 뺀다(null) — 실패한 일정도 그 창에서는 다시 묻지 않는다', async () => {
    getDetail.mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('refused');
      return detail('2026-12-28', 2);
    });
    const cache = createConsultationFetchCache();
    expect(
      await fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' }, cache),
    ).toBeNull();
    expect(
      await fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' }, cache),
    ).toBeNull();
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it('기간 안 날짜가 있는 일정이 없으면 묻지 않고 0', async () => {
    expect(await fetchConsultationCount({ start: '2026-11-01', end: '2026-11-07' })).toBe(0);
    expect(getDetail).not.toHaveBeenCalled();
  });
});

describe('학기와 접힌 이번 주가 동시에 물을 때', () => {
  it('같은 일정은 한 번만 묻고, 창 하나에서 동시에 묻는 수는 제한을 넘지 않는다', async () => {
    const extra = ['c', 'd', 'e', 'f'].map((id) => ({
      id,
      adminKey: `k${id}`,
      dates: [{ date: '2026-12-28' }],
    }));
    schedules.push(...extra);
    let inFlight = 0;
    let peak = 0;
    getDetail.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return detail('2026-12-28', 1);
    });
    try {
      const cache = createConsultationFetchCache();
      const [term, week] = await Promise.all([
        fetchConsultationCount({ start: '2026-08-18', end: '2026-12-30' }, cache),
        fetchConsultationCount({ start: '2026-12-28', end: '2026-12-30' }, cache),
      ]);
      expect(term).toBe(6);
      expect(week).toBe(6);
      expect(getDetail).toHaveBeenCalledTimes(6);
      expect(peak).toBeLessThanOrEqual(CONSULTATION_CONCURRENCY);
    } finally {
      schedules.splice(2);
    }
  });
});
