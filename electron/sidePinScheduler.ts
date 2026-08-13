/**
 * 옆핀의 지연 동작을 실제 타이머로 처리한다.
 *
 * 예약은 한 번에 하나만 살아 있다. 새로 걸면 이전 것은 반드시 취소한다 —
 * 이 규칙이 깨지면 이미 취소한 접힘이 나중에 되살아나 패널이 혼자 닫힌다.
 */
import type { SidePinScheduler } from '../src/usecases/sidePin/SidePinScheduler';

export function createSidePinScheduler(): SidePinScheduler & { dispose(): void } {
  let timer: NodeJS.Timeout | null = null;

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    now(): number {
      return Date.now();
    },

    schedule(dueAtMs: number, callback: () => void): void {
      cancel();
      // 이미 지난 시각이면 0으로 — 음수를 넘기면 Node가 1ms로 바꿔 놓아
      // 의도보다 늦게 도는 것처럼 보인다.
      const delay = Math.max(0, dueAtMs - Date.now());
      timer = setTimeout(() => {
        timer = null;
        callback();
      }, delay);
    },

    cancel,

    dispose(): void {
      cancel();
    },
  };
}
