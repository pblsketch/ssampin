/**
 * useShareSnapshot 단위 테스트.
 *
 * @vitest-environment jsdom
 *
 * electronAPI.onMultiSurveyShareSnapshot 모킹으로
 * 훅이 구독/수신/정리를 올바르게 수행하는지 검증.
 */

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShareSnapshot } from '../useShareSnapshot';
import type { ShareSnapshot } from '../shareSnapshot';

/** 최소 스냅샷 픽스처 */
function makeSnapshot(phase: ShareSnapshot['phase'] = 'lobby'): ShareSnapshot {
  return {
    phase,
    currentQuestion: null,
    questionNumber: 1,
    totalQuestions: 3,
    responsesForCurrent: [],
    allResponses: [],
    students: [],
    revealExplanation: false,
    allowReentry: false,
    entryUrl: 'http://192.168.0.1:3000',
  };
}

afterEach(() => {
  // window.electronAPI 초기화
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = undefined;
});

describe('useShareSnapshot', () => {
  it('electronAPI가 없으면 null을 반환한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = undefined;
    const { result } = renderHook(() => useShareSnapshot());
    expect(result.current).toBeNull();
  });

  it('onMultiSurveyShareSnapshot이 없으면 null을 반환한다', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = {};
    const { result } = renderHook(() => useShareSnapshot());
    expect(result.current).toBeNull();
  });

  it('마운트 시 onMultiSurveyShareSnapshot을 구독한다', () => {
    const onSnapshot = vi.fn(() => vi.fn());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    renderHook(() => useShareSnapshot());

    expect(onSnapshot).toHaveBeenCalledOnce();
  });

  it('스냅샷 수신 전에는 null이다', () => {
    const onSnapshot = vi.fn((_cb: unknown) => vi.fn());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    const { result } = renderHook(() => useShareSnapshot());
    expect(result.current).toBeNull();
  });

  it('콜백이 호출되면 스냅샷을 반환한다', () => {
    let capturedCallback: ((s: ShareSnapshot) => void) | null = null;
    const onSnapshot = vi.fn((cb: (s: ShareSnapshot) => void) => {
      capturedCallback = cb;
      return vi.fn();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    const { result } = renderHook(() => useShareSnapshot());
    expect(result.current).toBeNull();

    const snap = makeSnapshot('open');
    act(() => {
      capturedCallback?.(snap);
    });

    expect(result.current).toEqual(snap);
  });

  it('스냅샷이 여러 번 수신되면 최신 값으로 갱신된다', () => {
    let capturedCallback: ((s: ShareSnapshot) => void) | null = null;
    const onSnapshot = vi.fn((cb: (s: ShareSnapshot) => void) => {
      capturedCallback = cb;
      return vi.fn();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    const { result } = renderHook(() => useShareSnapshot());

    act(() => {
      capturedCallback?.(makeSnapshot('lobby'));
    });
    expect(result.current?.phase).toBe('lobby');

    act(() => {
      capturedCallback?.(makeSnapshot('open'));
    });
    expect(result.current?.phase).toBe('open');

    act(() => {
      capturedCallback?.(makeSnapshot('revealed'));
    });
    expect(result.current?.phase).toBe('revealed');
  });

  it('언마운트 시 구독 해제 함수를 호출한다', () => {
    const unsub = vi.fn();
    const onSnapshot = vi.fn((_cb: unknown) => unsub);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    const { unmount } = renderHook(() => useShareSnapshot());
    expect(unsub).not.toHaveBeenCalled();

    unmount();
    expect(unsub).toHaveBeenCalledOnce();
  });

  it('phase=podium 스냅샷도 올바르게 수신된다', () => {
    let capturedCallback: ((s: ShareSnapshot) => void) | null = null;
    const onSnapshot = vi.fn((cb: (s: ShareSnapshot) => void) => {
      capturedCallback = cb;
      return vi.fn();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).electronAPI = { onMultiSurveyShareSnapshot: onSnapshot };

    const { result } = renderHook(() => useShareSnapshot());
    act(() => {
      capturedCallback?.(makeSnapshot('podium'));
    });
    expect(result.current?.phase).toBe('podium');
  });
});
