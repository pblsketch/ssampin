import { useCallback, useEffect, useState } from 'react';
import { isDualToolId, type DualToolId } from '@adapters/components/Tools/toolRegistry';

export interface DualToolSession {
  leftTool: DualToolId | null;
  rightTool: DualToolId | null;
  splitRatio: number;
}

const SESSION_KEY = 'ssampin:dual-tool-session';
export const MIN_RATIO = 20;
export const MAX_RATIO = 80;
export const DEFAULT_RATIO = 50;

const DEFAULT_SESSION: DualToolSession = {
  leftTool: null,
  rightTool: null,
  splitRatio: DEFAULT_RATIO,
};

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RATIO;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, Math.round(value)));
}

function readSession(): DualToolSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return DEFAULT_SESSION;
    const parsed = JSON.parse(raw) as Partial<DualToolSession> | null;
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_SESSION;
    const leftTool = isDualToolId(parsed.leftTool) ? parsed.leftTool : null;
    const rightTool = isDualToolId(parsed.rightTool) ? parsed.rightTool : null;
    const splitRatio = typeof parsed.splitRatio === 'number' ? clampRatio(parsed.splitRatio) : DEFAULT_RATIO;
    // 동일 도구 2개 금지 — 우측을 제거
    const normalizedRight = leftTool !== null && leftTool === rightTool ? null : rightTool;
    return { leftTool, rightTool: normalizedRight, splitRatio };
  } catch {
    return DEFAULT_SESSION;
  }
}

function writeSession(value: DualToolSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    /* sessionStorage 접근 실패는 무시 (시크릿 모드 등) */
  }
}

export interface UseDualToolSessionOptions {
  /** 최초 마운트 시 세션이 비어있을 때 사용할 초기 좌측 도구 */
  initialLeftTool?: DualToolId | null;
}

/**
 * 듀얼 모드 구성(좌측/우측 도구·분할 비율)을 sessionStorage에 영속화하는 훅.
 * - F5 새로고침: 동일 구성 복원
 * - 앱 재시작: 리셋 (sessionStorage 특성)
 *
 * 설계 근거: docs/02-design/features/dual-tool-view.design.md §5.8
 */
export function useDualToolSession(options: UseDualToolSessionOptions = {}): [
  DualToolSession,
  (patch: Partial<DualToolSession>) => void,
  { wasRestored: boolean },
] {
  const [initialState] = useState<{ session: DualToolSession; restored: boolean }>(() => {
    const stored = readSession();
    const hasStoredData = stored.leftTool !== null || stored.rightTool !== null;
    if (hasStoredData) return { session: stored, restored: true };
    return {
      session: {
        ...DEFAULT_SESSION,
        leftTool: options.initialLeftTool ?? null,
      },
      restored: false,
    };
  });

  const [session, setSession] = useState<DualToolSession>(initialState.session);

  useEffect(() => {
    writeSession(session);
  }, [session]);

  const update = useCallback((patch: Partial<DualToolSession>) => {
    setSession((prev) => {
      const next: DualToolSession = {
        leftTool: patch.leftTool !== undefined ? patch.leftTool : prev.leftTool,
        rightTool: patch.rightTool !== undefined ? patch.rightTool : prev.rightTool,
        splitRatio: patch.splitRatio !== undefined ? clampRatio(patch.splitRatio) : prev.splitRatio,
      };
      // 동일 도구 2개 금지 invariant
      if (next.leftTool !== null && next.leftTool === next.rightTool) {
        next.rightTool = null;
      }
      return next;
    });
  }, []);

  return [session, update, { wasRestored: initialState.restored }];
}

export function clearDualToolSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}
