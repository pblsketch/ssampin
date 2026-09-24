import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * 타이머가 도는 동안·교실 화면 동안 화면 꺼짐·절전을 막는다(ADR-139, spec 5-6).
 * 막을 수 없는 환경이면 조용히 넘어간다 — 타이머 동작에는 영향이 없다.
 * 창을 다시 볼 때(visibilitychange) 브라우저가 풀어 둔 잠금을 다시 건다.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (wakeLock === undefined) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = (): void => {
      if (cancelled || document.visibilityState !== 'visible') return;
      wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) {
            void s.release().catch(() => undefined);
            return;
          }
          sentinel = s;
        })
        .catch(() => undefined);
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel !== null) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}
