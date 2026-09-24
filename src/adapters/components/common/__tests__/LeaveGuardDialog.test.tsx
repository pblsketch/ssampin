/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LeaveGuardDialog } from '../LeaveGuardDialog';
import { useLeaveGuardStore, type LeaveGuard } from '@adapters/stores/useLeaveGuardStore';

/** 화면 이동 안내 창(ADR-139, spec 5-3, 설계 12-1). */

function guard(overrides: Partial<LeaveGuard> = {}): LeaveGuard {
  return { id: 'timer', canMoveToPopup: () => true, moveToPopup: async () => true, ...overrides };
}

beforeEach(() => {
  useLeaveGuardStore.setState({ guards: [], pending: null, working: false });
});

afterEach(cleanup);

describe('LeaveGuardDialog', () => {
  it('세 선택지를 보이고, 기본 초점은 가장 안전한 [머무르기]다', async () => {
    // jsdom 에는 레이아웃이 없어 focus-trap 이 모든 단추를 '안 보임'으로 본다 — 보이는 것으로 흉내 낸다.
    const rects = vi
      .spyOn(Element.prototype, 'getClientRects')
      .mockReturnValue([{ width: 10, height: 10 }] as unknown as DOMRectList);
    useLeaveGuardStore.getState().register(guard());
    render(<LeaveGuardDialog />);
    act(() => {
      useLeaveGuardStore.getState().requestLeave('navigate', () => {});
    });
    expect(screen.getByRole('button', { name: '팝업으로 옮기고 이동' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '끄고 이동' })).toBeTruthy();
    const stay = screen.getByRole('button', { name: '머무르기' });
    await waitFor(() => expect(document.activeElement).toBe(stay));
    rects.mockRestore();
  });

  it('팝업으로 옮길 수 없으면 [끄고 이동]·[머무르기]만', () => {
    useLeaveGuardStore.getState().register(guard({ canMoveToPopup: () => false }));
    render(<LeaveGuardDialog />);
    act(() => {
      useLeaveGuardStore.getState().requestLeave('navigate', () => {});
    });
    expect(screen.queryByRole('button', { name: /팝업으로/ })).toBeNull();
    expect(screen.getByText('다른 화면으로 가면 타이머가 꺼져요.')).toBeTruthy();
  });

  it('다른 도구를 본문으로 가져올 때는 가져오기 문구로 묻는다', async () => {
    useLeaveGuardStore.getState().register(guard());
    const proceed = vi.fn();
    const cancel = vi.fn();
    render(<LeaveGuardDialog />);
    act(() => {
      useLeaveGuardStore.getState().requestLeave('returnTool', proceed, { cancel });
    });
    expect(screen.getByRole('button', { name: '타이머를 팝업으로 옮기고 가져오기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '타이머 끄고 가져오기' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '취소' }));
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('[끄고 이동]을 누르면 이동한다', async () => {
    useLeaveGuardStore.getState().register(guard());
    const proceed = vi.fn();
    render(<LeaveGuardDialog />);
    act(() => {
      useLeaveGuardStore.getState().requestLeave('navigate', proceed);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '끄고 이동' }));
    });
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
