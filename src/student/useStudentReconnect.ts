import { useEffect, useRef } from 'react';

/**
 * v2.1 신규 (Phase A-A6 / Plan NFR / Design v2.1 §6.3 / §10.6.2).
 *
 * iOS Safari 백그라운드 30초+ 시 WebSocket 자동 재연결 훅.
 *
 * 정책:
 * - **visibilitychange='visible'** 이벤트 트리거
 * - 활성 socket이 OPEN이 아닐 때만 재연결 (불필요한 재연결 X)
 * - **지수 백오프**: 1s → 2s → 4s → 8s → 16s → **30s cap** (Plan §13 / Design §6.3)
 * - 재연결 성공 시 retryCount 자동 리셋 (호출자 책임 — useRealtimeWallSyncStore)
 * - unmount/cleanup 시 timer 정리
 *
 * 호출자가 socket 상태 ref + reconnect callback을 주입.
 *
 * Plan FR-A8 / Design v2.1 §13 Phase A 수용 기준 #1.
 */

const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export interface UseStudentReconnectOptions {
  /** 활성 WebSocket 인스턴스 ref (또는 getter). null/undefined면 unconnected로 판정 */
  readonly getSocket: () => WebSocket | null | undefined;
  /** 재연결 시 호출되는 콜백. 호출자가 useRealtimeWallSyncStore.connect를 부르거나 마지막 URL로 재시도 */
  readonly reconnect: () => void;
  /** 활성 여부 — false면 hook이 noop */
  readonly enabled?: boolean;
  /**
   * 재연결 시도 직전 호출되는 옵션 콜백. UI 토스트 ("연결 중...") 등 용도.
   */
  readonly onReconnectAttempt?: (delayMs: number, attempt: number) => void;
}

/**
 * 재연결이 필요한지 판정.
 * - socket이 null/undefined → 재연결 필요 (탭 진입 시 idle 상태일 수 있음)
 * - socket.readyState !== OPEN → 재연결 필요 (CLOSED/CLOSING)
 * - socket.readyState === OPEN → 재연결 불필요
 * - socket.readyState === CONNECTING → 재연결 불필요 (이미 시도 중)
 */
function shouldReconnect(socket: WebSocket | null | undefined): boolean {
  if (!socket) return true;
  if (socket.readyState === WebSocket.OPEN) return false;
  if (socket.readyState === WebSocket.CONNECTING) return false;
  return true;
}

export function useStudentReconnect(options: UseStudentReconnectOptions): void {
  const { getSocket, reconnect, enabled = true, onReconnectAttempt } = options;

  const retryCountRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectRef = useRef(reconnect);
  const onAttemptRef = useRef(onReconnectAttempt);
  const getSocketRef = useRef(getSocket);

  useEffect(() => {
    reconnectRef.current = reconnect;
    onAttemptRef.current = onReconnectAttempt;
    getSocketRef.current = getSocket;
  }, [reconnect, onReconnectAttempt, getSocket]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      const socket = getSocketRef.current();
      if (!shouldReconnect(socket)) {
        // 이미 OPEN → retryCount만 리셋 (다음 background 시 빠르게 재시도)
        retryCountRef.current = 0;
        return;
      }

      // 이미 timer가 걸려있으면 재시도 X (중복 방지)
      if (timerRef.current !== null) return;

      const attempt = retryCountRef.current;
      const idx = Math.min(attempt, BACKOFF_DELAYS_MS.length - 1);
      const delayMs = BACKOFF_DELAYS_MS[idx] ?? 30000;

      try {
        onAttemptRef.current?.(delayMs, attempt);
      } catch {
        // noop
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        retryCountRef.current = attempt + 1;
        // 재연결 직전 한번 더 socket 상태 확인 (race condition)
        const currentSocket = getSocketRef.current();
        if (!shouldReconnect(currentSocket)) {
          retryCountRef.current = 0;
          return;
        }
        try {
          reconnectRef.current();
        } catch {
          // noop — connect 실패는 store가 처리
        }
      }, delayMs);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled]);
}

// 테스트 / 외부 헬퍼용 export
export const RECONNECT_BACKOFF_DELAYS_MS = BACKOFF_DELAYS_MS;
