/**
 * @vitest-environment jsdom
 *
 * 수업 교체 삭제 — 짝 인식 (제보: "수업 교체를 삭제한 뒤 교시를 고를 수 없다").
 *
 * 시간표 칸 우클릭 삭제는 확인 없이 그 1건만 지워, 짝이 "반쪽 교체"로 남았다.
 * 서랍과 칸 우클릭이 같은 함수(deleteOverrideConfirmingPair)로 지운다 — 실제 store 와
 * 실제 저장소(localStorage)를 통과시켜 "짝까지, 한 번의 저장으로" 를 고정한다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TimetableOverride } from '@domain/entities/Timetable';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { scheduleRepository } from '@adapters/di/container';
import { deleteOverrideConfirmingPair, SWAP_PAIR_DELETE_CONFIRM_MESSAGE } from './swapPairDeletion';

const mk = (partial: Partial<TimetableOverride> & { id: string }): TimetableOverride => ({
  date: '2026-11-10',
  period: 1,
  subject: '국어',
  createdAt: '2026-11-09T09:00:00.000Z',
  ...partial,
});

const A = mk({ id: 'a', period: 2, kind: 'swap', pairId: 'pair-1' });
const B = mk({ id: 'b', date: '2026-11-17', period: 5, kind: 'swap', pairId: 'pair-1' });
const PLAIN = mk({ id: 'plain', period: 3, kind: 'custom' });
const COMCIGAN = mk({ id: 'cmc', period: 4, kind: 'swap', source: 'comcigan' });

const ids = (): string[] => useScheduleStore.getState().overrides.map((o) => o.id);

describe('deleteOverrideConfirmingPair', () => {
  beforeEach(() => {
    localStorage.clear();
    useScheduleStore.setState({ overrides: [A, PLAIN, B, COMCIGAN], loaded: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('교체 칸 우클릭 삭제는 확인 뒤 짝까지 한 번의 저장으로 지운다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const saveSpy = vi.spyOn(scheduleRepository, 'saveTimetableOverrides');

    const outcome = await deleteOverrideConfirmingPair('a');

    expect(outcome).toBe('pair');
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(SWAP_PAIR_DELETE_CONFIRM_MESSAGE);
    expect(ids()).toEqual(['plain', 'cmc']);
    // 두 번 저장하면 그 사이에 반쪽만 든 파일이 한 번 쓰인다 — 한 번이어야 한다
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0]?.[0].overrides.map((o) => o.id)).toEqual(['plain', 'cmc']);
    // 실제 저장소에도 둘 다 없다
    const saved = await scheduleRepository.getTimetableOverrides();
    expect(saved?.overrides.map((o) => o.id)).toEqual(['plain', 'cmc']);
  });

  it('확인 창에서 취소하면 둘 다 남고 저장도 하지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const saveSpy = vi.spyOn(scheduleRepository, 'saveTimetableOverrides');

    const outcome = await deleteOverrideConfirmingPair('a');

    expect(outcome).toBe('cancelled');
    expect(ids()).toEqual(['a', 'plain', 'b', 'cmc']);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('짝이 없는 변동은 확인 없이 그 1건만 지운다 (칸 우클릭의 예전 동작)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(await deleteOverrideConfirmingPair('plain')).toBe('single');
    expect(await deleteOverrideConfirmingPair('cmc')).toBe('single');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(ids()).toEqual(['a', 'b']);
  });

  it('이미 생긴 반쪽(짝이 지워진 교체)은 일반 변동처럼 확인 없이 1건만 지운다', async () => {
    useScheduleStore.setState({ overrides: [A, PLAIN] });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(await deleteOverrideConfirmingPair('a')).toBe('single');

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(ids()).toEqual(['plain']);
  });

  it('서랍처럼 일반 변동 확인 문구를 주면 그 문구로 묻고, 취소하면 남긴다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const outcome = await deleteOverrideConfirmingPair('plain', {
      singleConfirmMessage: '이 변동을 삭제하시겠습니까?',
    });

    expect(outcome).toBe('cancelled');
    expect(confirmSpy).toHaveBeenCalledWith('이 변동을 삭제하시겠습니까?');
    expect(ids()).toEqual(['a', 'plain', 'b', 'cmc']);
  });

  it('이미 지워진 id 면 아무것도 하지 않는다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(await deleteOverrideConfirmingPair('nope')).toBe('missing');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(ids()).toEqual(['a', 'plain', 'b', 'cmc']);
  });
});

describe('useScheduleStore.deleteOverrideWithPair', () => {
  beforeEach(() => {
    localStorage.clear();
    useScheduleStore.setState({ overrides: [A, PLAIN, B, COMCIGAN], loaded: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('교체 한쪽을 지우면 짝도 함께 지워진다', async () => {
    const saveSpy = vi.spyOn(scheduleRepository, 'saveTimetableOverrides');

    const { removedIds } = await useScheduleStore.getState().deleteOverrideWithPair('b');

    expect([...removedIds].sort()).toEqual(['a', 'b']);
    expect(ids()).toEqual(['plain', 'cmc']);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('짝이 없는 변동이면 그 1건만 지운다', async () => {
    await useScheduleStore.getState().deleteOverrideWithPair('plain');
    expect(ids()).toEqual(['a', 'b', 'cmc']);
  });
});
