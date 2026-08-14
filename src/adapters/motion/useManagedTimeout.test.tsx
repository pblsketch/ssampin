/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useManagedTimeout } from './useManagedTimeout';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useManagedTimeout', () => {
  test('컴포넌트가 사라지면 남은 콜백을 실행하지 않는다', () => {
    const callback = vi.fn();
    const view = renderHook(() => useManagedTimeout());

    act(() => view.result.current(callback, 100));
    view.unmount();
    act(() => vi.runAllTimers());

    expect(callback).not.toHaveBeenCalled();
  });

  test('개별 예약도 취소할 수 있다', () => {
    const callback = vi.fn();
    const view = renderHook(() => useManagedTimeout());

    let cancel: () => void = () => undefined;
    act(() => {
      cancel = view.result.current(callback, 100);
    });
    cancel();
    act(() => vi.runAllTimers());

    expect(callback).not.toHaveBeenCalled();
  });
});
