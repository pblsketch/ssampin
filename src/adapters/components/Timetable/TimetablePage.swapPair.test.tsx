/**
 * @vitest-environment jsdom
 *
 * 시간표 화면 — 수업 교체 칸 우클릭 삭제와 수정 창 잠금이 실제로 이어져 있는지.
 *
 * 제보: "수업 교체를 삭제한 뒤 교시를 고를 수 없다". 칸 우클릭 삭제가 확인 없이 그 1건만 지워
 * 짝이 "반쪽 교체"로 남았고, 수정 창에서 날짜·교시를 옮기면 짝이 끊겼다.
 * 규칙 함수만이 아니라 화면의 우클릭·[수정] 단추가 그 규칙에 물려 있는지를 본다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TimetableOverride } from '@domain/entities/Timetable';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { scheduleRepository } from '@adapters/di/container';
import { toLocalDateString } from '@shared/utils/localDate';
import { TimetablePage } from './TimetablePage';
import { SWAP_PAIR_DELETE_CONFIRM_MESSAGE } from './swapPairDeletion';

/** 이번 주 월요일에서 offset 일 뒤의 날짜 */
function dayOfThisWeek(offsetFromMonday: number): string {
  const now = new Date();
  const jsDay = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (jsDay === 0 ? -6 : 1 - jsDay));
  monday.setDate(monday.getDate() + offsetFromMonday);
  return toLocalDateString(monday);
}

const MON = dayOfThisWeek(0);
const TUE = dayOfThisWeek(1);
/** 짝이 다음 주에 있어 화면에는 한쪽만 보이는 교체 */
const NEXT_MON = dayOfThisWeek(7);

const mk = (partial: Partial<TimetableOverride> & { id: string }): TimetableOverride => ({
  date: MON,
  period: 1,
  subject: '국어',
  scope: 'both',
  createdAt: '2026-11-09T09:00:00.000Z',
  ...partial,
});

const A = mk({ id: 'a', date: MON, period: 1, subject: '교체수업가', kind: 'swap', pairId: 'p1' });
const B = mk({
  id: 'b',
  date: NEXT_MON,
  period: 2,
  subject: '교체수업나',
  kind: 'swap',
  pairId: 'p1',
});
const PLAIN = mk({ id: 'plain', date: TUE, period: 1, subject: '일반변동다', kind: 'custom' });

const ids = (): string[] => useScheduleStore.getState().overrides.map((o) => o.id);

const cellOf = (subject: string): HTMLElement => {
  const cell = screen.getAllByText(subject)[0]?.closest('td');
  if (!cell) throw new Error(`칸을 찾지 못함: ${subject}`);
  return cell;
};

describe('TimetablePage — 수업 교체 짝', () => {
  beforeEach(() => {
    localStorage.clear();
    useScheduleStore.setState({ overrides: [A, B, PLAIN], loaded: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('교체 칸 우클릭 삭제는 확인 뒤 짝까지 지운다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const saveSpy = vi.spyOn(scheduleRepository, 'saveTimetableOverrides');
    render(<TimetablePage />);

    fireEvent.contextMenu(cellOf('교체수업가'));

    await waitFor(() => expect(ids()).toEqual(['plain']));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).toHaveBeenCalledWith(SWAP_PAIR_DELETE_CONFIRM_MESSAGE);
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it('교체 칸 우클릭 삭제를 취소하면 둘 다 남는다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TimetablePage />);

    fireEvent.contextMenu(cellOf('교체수업가'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    // 비동기 삭제가 뒤늦게 일어나지 않는지 한 박자 기다린 뒤 본다
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ids()).toEqual(['a', 'b', 'plain']);
  });

  it('짝이 없는 변동의 칸 우클릭은 예전처럼 확인 없이 그 1건만 지운다', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TimetablePage />);

    fireEvent.contextMenu(cellOf('일반변동다'));

    await waitFor(() => expect(ids()).toEqual(['a', 'b']));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('서랍에서 교체 항목을 [수정]하면 짝 교시를 안내하고 날짜·교시가 잠긴다', async () => {
    render(<TimetablePage />);

    fireEvent.click(screen.getByRole('button', { name: /변동 시간표/ }));
    // 서랍 기본 필터는 "이번 달" — 월 경계에 걸려도 항목이 보이게 전체로 바꾼다
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByRole('combobox'), { target: { value: 'all' } });
    const row = within(drawer).getAllByText('교체수업가')[0]?.closest('li');
    if (!row) throw new Error('서랍에서 교체 항목을 찾지 못함');
    fireEvent.click(within(row).getByRole('button', { name: '수정' }));

    const notice = await screen.findByText(/수업과 맞바꾼 교체예요/);
    expect(notice.textContent).toContain('2교시');
    expect(document.querySelector('input[type="date"]')).toBeNull();

    // 과목만 고쳐 저장해도 짝(pairId)이 끊기지 않는다
    fireEvent.change(screen.getByPlaceholderText('비우면 공강/자습'), {
      target: { value: '고친과목' },
    });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      const a = useScheduleStore.getState().overrides.find((o) => o.id === 'a');
      expect(a?.subject).toBe('고친과목');
    });
    const after = useScheduleStore.getState().overrides;
    expect(after.find((o) => o.id === 'a')).toMatchObject({ date: MON, period: 1, pairId: 'p1' });
    expect(after.find((o) => o.id === 'b')).toMatchObject({ pairId: 'p1' });
    expect(after).toHaveLength(3);
  });
});
