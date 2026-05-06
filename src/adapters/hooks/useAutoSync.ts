import { useEffect, useRef } from 'react';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';

/** 앱 시작/포커스/네트워크 복귀 시 자동 동기화 훅 */
export function useAutoSync() {
  const isConnected = useCalendarSyncStore((s) => s.isConnected);
  const syncOnStart = useCalendarSyncStore((s) => s.syncOnStart);
  const syncOnFocus = useCalendarSyncStore((s) => s.syncOnFocus);
  const syncNow = useCalendarSyncStore((s) => s.syncNow);
  const startPeriodicSync = useCalendarSyncStore((s) => s.startPeriodicSync);
  const cleanupRef = useRef<(() => void) | null>(null);

  // 앱 시작 시 동기화 + NEIS 동기화 제안 체크
  useEffect(() => {
    if (isConnected && syncOnStart) {
      void syncNow();
    }
    if (isConnected) {
      // syncNow가 events 스토어를 갱신할 수 있으니 약간 지연 후 체크
      const t = window.setTimeout(() => {
        void useCalendarSyncStore.getState().checkNeisSyncSuggestion();
      }, 300);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [isConnected, syncOnStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // 주기적 동기화
  useEffect(() => {
    if (!isConnected) return;
    cleanupRef.current = startPeriodicSync();
    return () => { cleanupRef.current?.(); };
  }, [isConnected, startPeriodicSync]);

  // 창 포커스 시 동기화
  useEffect(() => {
    if (!isConnected || !syncOnFocus) return;
    const handler = () => { void syncNow(); };
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [isConnected, syncOnFocus, syncNow]);

  // 네트워크 복귀 시 동기화
  useEffect(() => {
    if (!isConnected) return;
    const api = window.electronAPI;
    if (!api?.onNetworkChange) return;
    const unsubscribe = api.onNetworkChange((online) => {
      if (online) void syncNow();
    });
    return unsubscribe;
  }, [isConnected, syncNow]);
}
