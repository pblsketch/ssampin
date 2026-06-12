/**
 * useQuestionCountdown 단위 테스트.
 *
 * @vitest-environment jsdom
 *
 * - vi.useFakeTimers + renderHook 패턴
 * - 카운트다운 진행 / 0초 onExpire 1회 / questionIndex 변경 리셋 / phase 변경 정지
 */

// React 18 act 환경 플래그
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestionCountdown } from '../useQuestionCountdown';

/** Promise.resolve().then() 체인을 모두 flush */
async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useQuestionCountdown', () => {
  it('phase=open + enabled=true이면 1초마다 감소한다', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex: 0,
        timerSeconds: 10,
        enabled: true,
        onExpire,
      }),
    );

    expect(result.current.remainingSeconds).toBe(10);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.remainingSeconds).toBe(7);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('0초 도달 시 onExpire를 정확히 1회 호출한다', async () => {
    const onExpire = vi.fn();
    renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex: 0,
        timerSeconds: 3,
        enabled: true,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // Promise.resolve().then() 체인 flush — onExpire 실행 대기
    await flushPromises();

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('0초 이후 추가 틱이 있어도 onExpire는 1회만 호출된다', async () => {
    const onExpire = vi.fn();
    renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex: 0,
        timerSeconds: 2,
        enabled: true,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await flushPromises();

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('questionIndex 변경 시 카운트가 timerSeconds로 리셋된다', () => {
    const onExpire = vi.fn();
    let questionIndex = 0;
    const { result, rerender } = renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex,
        timerSeconds: 10,
        enabled: true,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.remainingSeconds).toBe(6);

    // 문항 인덱스 변경 → 리셋
    questionIndex = 1;
    rerender();

    // 리셋 후 값 확인 (effect 재실행 대기)
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current.remainingSeconds).toBe(10);
  });

  it('phase가 open에서 revealed로 바뀌면 interval이 정지하고 남은 시간이 리셋된다', () => {
    const onExpire = vi.fn();
    let phase: 'open' | 'revealed' = 'open';
    const { result, rerender } = renderHook(() =>
      useQuestionCountdown({
        phase,
        questionIndex: 0,
        timerSeconds: 10,
        enabled: true,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.remainingSeconds).toBe(7);

    phase = 'revealed';
    rerender();

    act(() => {
      // 추가 시간이 흘러도 interval이 멈춰야 함
      vi.advanceTimersByTime(3000);
    });

    // phase !== 'open' → timerSeconds로 리셋
    expect(result.current.remainingSeconds).toBe(10);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('enabled=false이면 카운트다운이 실행되지 않는다', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex: 0,
        timerSeconds: 10,
        enabled: false,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(10000);
      vi.runAllTimers();
    });

    expect(onExpire).not.toHaveBeenCalled();
    // enabled=false면 초기값 유지
    expect(result.current.remainingSeconds).toBe(10);
  });

  it('timerSeconds=0이면 interval이 실행되지 않는다', () => {
    const onExpire = vi.fn();
    renderHook(() =>
      useQuestionCountdown({
        phase: 'open',
        questionIndex: 0,
        timerSeconds: 0,
        enabled: true,
        onExpire,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
      vi.runAllTimers();
    });

    expect(onExpire).not.toHaveBeenCalled();
  });
});
