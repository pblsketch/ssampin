/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

afterEach(cleanup);

function stubPreference(initialMatches: boolean): (matches: boolean) => void {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockReturnValue({
    get matches() {
      return matches;
    },
    addEventListener: (_type: 'change', listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: () => void) => listeners.delete(listener),
  }) as unknown as typeof window.matchMedia;

  return (nextMatches) => {
    matches = nextMatches;
    listeners.forEach((listener) => listener());
  };
}

describe('useReducedMotion', () => {
  test('초기 시스템 설정과 실행 중 변경을 함께 반영한다', () => {
    const changePreference = stubPreference(false);
    const view = renderHook(() => useReducedMotion());

    expect(view.result.current).toBe(false);
    act(() => changePreference(true));
    expect(view.result.current).toBe(true);
  });
});
