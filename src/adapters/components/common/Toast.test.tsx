// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * ADR-137 — 누를 수 있는 응원 토스트(먼저 거는 말): 핀과 문구가 한 단추이고 닫기 단추와 겹치지 않는다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ToastContainer, useToastStore } from './Toast';

afterEach(() => {
  cleanup();
  act(() => {
    for (const t of useToastStore.getState().toasts) useToastStore.getState().dismiss(t.id);
  });
});

describe('응원 토스트', () => {
  it('누르면 할 일을 하고 닫힌다 — 닫기 단추는 따로다', () => {
    const open = vi.fn();
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showCheer('이번 주 정리가 왔어요', 'idle', open);
    });
    const main = screen.getByRole('button', { name: '이번 주 정리가 왔어요' });
    const close = screen.getByRole('button', { name: '닫기' });
    expect(main).not.toContainElement(close);
    fireEvent.click(main);
    expect(open).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('닫기만 누르면 할 일은 하지 않는다', () => {
    const open = vi.fn();
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showCheer('이번 학기 돌아보기가 왔어요', 'idle', open);
    });
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(open).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('할 일이 없는 응원 토스트는 단추가 아니다', () => {
    render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showCheer('오늘 첫 기록을 남겼어요', 'wave');
    });
    expect(screen.getByText('오늘 첫 기록을 남겼어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '오늘 첫 기록을 남겼어요' })).toBeNull();
  });
});
