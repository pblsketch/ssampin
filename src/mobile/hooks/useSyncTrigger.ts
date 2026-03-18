import { useEffect, useRef } from 'react';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';

/**
 * 자동 동기화 트리거
 * - visibilitychange: 앱 복귀 시 syncFromCloud
 * - online: 네트워크 복구 시 syncToCloud
 * - 마운트 시: syncFromCloud
 * - autoSyncInterval: 설정된 분 단위로 주기적 syncToCloud
 */
export function useSyncTrigger() {
  const syncFrom = useMobileDriveSyncStore((s) => s.syncFromCloud);
  const syncTo = useMobileDriveSyncStore((s) => s.syncToCloud);
  const isAuthenticated = useMobileDriveSyncStore((s) => s.isAuthenticated);
  const autoSyncInterval = useMobileSettingsStore((s) => s.settings.sync?.autoSyncInterval ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // visibility + online listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    void syncFrom();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncFrom();
      }
    };

    const onOnline = () => {
      void syncTo();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [syncFrom, syncTo, isAuthenticated]);

  // auto-sync interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isAuthenticated || !autoSyncInterval || autoSyncInterval <= 0) return;

    intervalRef.current = setInterval(() => {
      void syncTo();
    }, autoSyncInterval * 60 * 1000); // 분 → 밀리초

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, autoSyncInterval, syncTo]);
}
