/**
 * @vitest-environment jsdom
 *
 * 변동 시간표 서랍 — 짝이 지워진 교체 표시와 짝 삭제.
 *
 * 한쪽만 지워진 교체("반쪽")는 서랍에서 그냥 교체처럼 보여, 왜 한 칸만 바뀌어 있는지
 * 알 수 없었다. pairId 는 있는데 짝이 없는 항목에 「짝이 지워진 교체」 표시를 붙인다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TimetableOverride } from '@domain/entities/Timetable';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { scheduleRepository } from '@adapters/di/container';
import { toLocalDateString } from '@shared/utils/localDate';
import { TimetableOverridesPanel } from './TimetableOverridesPanel';
import { SWAP_PAIR_DELETE_CONFIRM_MESSAGE } from './swapPairDeletion';

// 서랍 기본 필터가 "이번 달"이라 오늘 날짜로 만든다
const TODAY = toLocalDateString(new Date());

const mk = (partial: Partial<TimetableOverride> & { id: string }): TimetableOverride => ({
  date: TODAY,
  period: 1,
  subject: '국어',
  createdAt: '2026-11-09T09:00:00.000Z',
  ...partial,
});

const A = mk({ id: 'a', period: 1, subject: '짝있음A', kind: 'swap', pairId: 'pair-1' });
const B = mk({ id: 'b', period: 2, subject: '짝있음B', kind: 'swap', pairId: 'pair-1' });
const ORPHAN = mk({ id: 'orphan', period: 3, subject: '반쪽', kind: 'swap', pairId: 'pair-gone' });
const COMCIGAN = mk({ id: 'cmc', period: 4, subject: '컴시간', kind: 'swap', source: 'comcigan' });
const PLAIN = mk({ id: 'plain', period: 5, subject: '일반', kind: 'custom' });

const rowOf = (subject: string): HTMLElement => {
  const row = screen.getAllByText(subject)[0]?.closest('li');
  if (!row) throw new Error(`행을 찾지 못함: ${subject}`);
  return row;
};

const renderPanel = (onEdit = vi.fn()) =>
  render(<TimetableOverridesPanel open onClose={vi.fn()} onAddNew={vi.fn()} onEdit={onEdit} />);

describe('TimetableOverridesPanel — 수업 교체 짝', () => {
  beforeEach(() => {
    localStorage.clear();
    useScheduleStore.setState({
      overrides: [A, B, ORPHAN, COMCIGAN, PLAIN],
      loaded: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('짝이 없는 교체 항목에 표시가 붙는다 — 짝이 있는 교체·컴시간·일반 변동에는 없다', () => {
    renderPanel();

    expect(screen.getAllByText('짝이 지워진 교체')).toHaveLength(1);
    expect(within(rowOf('반쪽')).getByText('짝이 지워진 교체')).toBeTruthy();
    for (const subject of ['짝있음A', '짝있음B', '컴시간', '일반']) {
      expect(within(rowOf(subject)).queryByText('짝이 지워진 교체')).toBeNull();
    }
  });

  it('반쪽 항목의 삭제는 일반 변동처럼 그 1건만 지운다(짝 확인 문구가 아니다)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPanel();

    fireEvent.click(within(rowOf('반쪽')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(useScheduleStore.getState().overrides.map((o) => o.id)).toEqual([
        'a',
        'b',
        'cmc',
        'plain',
      ]);
    });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith('이 변동을 삭제하시겠습니까?');
  });

  it('반쪽 항목의 수정은 일반 변동처럼 그 항목을 그대로 넘긴다', () => {
    const onEdit = vi.fn();
    renderPanel(onEdit);

    fireEvent.click(within(rowOf('반쪽')).getByRole('button', { name: '수정' }));

    expect(onEdit).toHaveBeenCalledWith(ORPHAN);
  });

  it('짝이 있는 교체를 서랍에서 지우면 확인 뒤 짝까지 한 번의 저장으로 지운다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const saveSpy = vi.spyOn(scheduleRepository, 'saveTimetableOverrides');
    renderPanel();

    fireEvent.click(within(rowOf('짝있음A')).getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(useScheduleStore.getState().overrides.map((o) => o.id)).toEqual([
        'orphan',
        'cmc',
        'plain',
      ]);
    });
    expect(confirmSpy).toHaveBeenCalledWith(SWAP_PAIR_DELETE_CONFIRM_MESSAGE);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});
