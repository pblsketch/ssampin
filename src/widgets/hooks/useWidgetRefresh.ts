import { useEffect, useCallback, useRef } from 'react';

const REFRESH_ALL_EVENT = 'ssampin:refresh-all-widgets';

interface UseWidgetRefreshOptions {
  /** 자동 새로고침 간격 (ms). 기본 5분. */
  intervalMs?: number;
  /** 탭 활성화 시 새로고침 여부. 기본 true. */
  refreshOnVisible?: boolean;
}

/**
 * 위젯 자동 새로고침 훅
 * - 일정 간격마다 자동 새로고침
 * - 탭이 비활성→활성으로 전환될 때 새로고침 (1분 이상 경과 시)
 * - triggerRefreshAll() 전역 이벤트 수신
 */
export function useWidgetRefresh(
  onRefresh: () => void | Promise<void>,
  options: UseWidgetRefreshOptions = {},
): void {
  const { intervalMs = 5 * 60 * 1000, refreshOnVisible = true } = options;
  const lastRefreshRef = useRef(Date.now());

  const refresh = useCallback(() => {
    lastRefreshRef.current = Date.now();
    void onRefresh();
  }, [onRefresh]);

  // 주기적 새로고침
  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  // 탭 활성화 시 새로고침
  useEffect(() => {
    if (!refreshOnVisible) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastRefreshRef.current;
        if (elapsed > 60_000) {
          refresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh, refreshOnVisible]);

  // 전역 새로고침 이벤트 수신
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(REFRESH_ALL_EVENT, handler);
    return () => window.removeEventListener(REFRESH_ALL_EVENT, handler);
  }, [refresh]);
}

/** 모든 위젯에 새로고침 이벤트 발송 */
export function triggerRefreshAll(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_ALL_EVENT));
}
