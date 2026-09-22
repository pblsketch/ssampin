// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-135 — 반 카드: 칸을 누르면 바로 쓰기, '⋯'로 빼기·다시 넣기(누르는 즉시 저장), Esc 는 메뉴만 닫는다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const openQuickRecordDirect = vi.fn();
vi.mock('../studentRecordNavigation', () => ({
  openQuickRecordDirect: (t: unknown) => openQuickRecordDirect(t),
}));

import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import { closeTopOverlayMenu } from '@adapters/utils/overlayMenuStack';
import type { LapCardViewModel, LapCellViewModel } from '@adapters/hooks/observationLapCards';
import { ClassLapCard } from './ClassLapCard';

function cell(over: Partial<LapCellViewModel>): LapCellViewModel {
  return {
    ref: '1',
    label: '1',
    displayName: '김가람',
    state: 'empty',
    bell: false,
    exclusionKey: 'subject:c1:1',
    excludedUntil: null,
    ...over,
  };
}

function card(cells: LapCellViewModel[], over: Partial<LapCardViewModel> = {}): LapCardViewModel {
  return {
    card: 'subject:c1',
    contextKind: 'teaching',
    contextId: 'c1',
    title: '2-3 국어',
    mixed: false,
    cells,
    memberCount: cells.filter((c) => c.state !== 'excluded').length,
    remaining: cells.filter((c) => c.state === 'empty').length,
    justFinished: false,
    newMark: null,
    newBoundaryRecordId: null,
    ...over,
  };
}

const setReminderExclusion = vi.fn(async () => {});
const removeReminderExclusion = vi.fn(async () => {});

beforeEach(() => {
  openQuickRecordDirect.mockClear();
  setReminderExclusion.mockClear();
  removeReminderExclusion.mockClear();
  useSettingsStore.setState({ setReminderExclusion, removeReminderExclusion });
});

afterEach(cleanup);

function renderCard(vm: LapCardViewModel) {
  return render(<ClassLapCard card={vm} today="2026-09-23" termEnd="2027-02-28" />);
}

describe('칸 누르기', () => {
  it('그 학생·그 반으로 바로 쓰기를 연다', () => {
    renderCard(card([cell({})]));
    fireEvent.click(screen.getByRole('button', { name: '1번 김가람, 아직 기록 전' }));
    expect(openQuickRecordDirect).toHaveBeenCalledWith({
      contextKind: 'teaching',
      contextId: 'c1',
      studentRef: '1',
    });
  });

  it('빠른 기록 창이 닫히면 누른 칸으로 초점이 돌아온다', async () => {
    renderCard(card([cell({})]));
    const btn = screen.getByRole('button', { name: '1번 김가람, 아직 기록 전' });
    fireEvent.click(btn);
    act(() => useQuickAddStore.setState({ isOpen: true }));
    (document.body as HTMLElement).focus();
    expect(document.activeElement).not.toBe(btn);
    act(() => useQuickAddStore.setState({ isOpen: false }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(document.activeElement).toBe(btn);
  });

  it('빠진 칸도 누르면 쓰기가 열린다', () => {
    renderCard(card([cell({ state: 'excluded' })]));
    const btn = screen.getByRole('button', { name: '1번 김가람, 지금 빠져 있음' });
    expect(btn).toHaveTextContent('–');
    fireEvent.click(btn);
    expect(openQuickRecordDirect).toHaveBeenCalledTimes(1);
  });

  it('종은 읽어 주는 이름에 담고, 머리글은 남은 수만 말한다', () => {
    renderCard(card([cell({ bell: true }), cell({ ref: '2', label: '2', state: 'filled' })]));
    expect(
      screen.getByRole('button', { name: '1번 김가람, 아직 기록 전 · 한동안 비어 있어요' }),
    ).toBeInTheDocument();
    expect(screen.getByText('한 바퀴까지 1명')).toBeInTheDocument();
  });

  it("막 끝나면 '한 바퀴 완료', 구성원이 없으면 머리글 문구가 없다", () => {
    const { unmount } = renderCard(
      card([cell({ state: 'filled' })], { justFinished: true, remaining: 0 }),
    );
    expect(screen.getByText('한 바퀴 완료')).toBeInTheDocument();
    unmount();
    renderCard(card([cell({ state: 'excluded' })], { memberCount: 0 }));
    expect(screen.queryByText(/한 바퀴/)).not.toBeInTheDocument();
  });

  it("이름 표시 '표시 안 함'이면 이름표도 읽는 이름도 번호뿐", () => {
    renderCard(card([cell({ displayName: '' })]));
    expect(screen.getByRole('button', { name: '1번 학생, 아직 기록 전' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('칸 메뉴', () => {
  it("'⋯'로 열고 기간을 고르면 그 반 key 로 바로 저장한다", async () => {
    renderCard(card([cell({})]));
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 메뉴 열기' }));
    const menu = screen.getByRole('menu');
    expect(menu).toBeInTheDocument();
    // 칸 누르기(쓰기)는 일어나지 않는다
    expect(openQuickRecordDirect).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '2주' }));
    });
    expect(setReminderExclusion).toHaveBeenCalledWith('subject:c1:1', '2026-10-06');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('이번 학기 끝까지는 학기 마지막 날', async () => {
    renderCard(card([cell({})]));
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 메뉴 열기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '이번 학기 끝까지' }));
    });
    expect(setReminderExclusion).toHaveBeenCalledWith('subject:c1:1', '2027-02-28');
  });

  it('빠진 칸은 [다시 넣기]만 보이고 바로 저장한다', async () => {
    renderCard(card([cell({ state: 'excluded', excludedUntil: '2026-10-06' })]));
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 메뉴 열기' }));
    expect(screen.getByText('10월 6일까지 빠져 있어요')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '2주' })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '다시 넣기' }));
    });
    expect(removeReminderExclusion).toHaveBeenCalledWith('subject:c1:1');
  });

  it('확장 창의 Esc 는 메뉴만 닫는다(맨 위 메뉴부터)', () => {
    renderCard(card([cell({})]));
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 메뉴 열기' }));
    let closed = false;
    act(() => {
      closed = closeTopOverlayMenu();
    });
    expect(closed).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // 닫을 메뉴가 없으면 false — 그때는 확장 창이 스스로 닫는다
    expect(closeTopOverlayMenu()).toBe(false);
  });

  it('바깥을 누르면 닫히고, 여는 단추를 다시 누르면 닫힌다', () => {
    renderCard(card([cell({})]));
    const trigger = screen.getByRole('button', { name: '1번 칸 메뉴 열기' });
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('저장에 실패하면 알린다', async () => {
    setReminderExclusion.mockRejectedValueOnce(new Error('disk'));
    const { useToastStore } = await import('@adapters/components/common/Toast');
    const show = vi.fn();
    useToastStore.setState({ show });
    renderCard(card([cell({})]));
    fireEvent.click(screen.getByRole('button', { name: '1번 칸 메뉴 열기' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '한 달' }));
    });
    expect(show).toHaveBeenCalledWith('저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'error');
  });
});
