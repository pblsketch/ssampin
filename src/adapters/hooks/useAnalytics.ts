import { useCallback, useEffect, useRef } from 'react';
import { analyticsPort } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { AnalyticsEventName, AnalyticsEventProperties } from '@domain/valueObjects/AnalyticsEvent';

const DEVICE_ID_KEY = 'ssampin_device_id';

/** device_id를 로드하거나 최초 생성한다 */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Analytics 훅.
 * 앱 최초 마운트 시 device_id / app_version 초기화,
 * 앱 종료 시 flush + app_close 이벤트 전송을 담당한다.
 */
export function useAnalytics() {
  const startTimeRef = useRef(Date.now());
  const analyticsEnabled = useSettingsStore((s) => s.settings.analytics?.enabled ?? true);

  // 초기화 (최초 1회)
  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    analyticsPort.setDeviceId(deviceId);
    analyticsPort.setAppVersion(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');
  }, []);

  // 앱 종료 시 flush
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
      analyticsPort.track('app_close', { sessionDuration });
      void analyticsPort.flush();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const api = window.electronAPI;
    let unsubscribe: (() => void) | undefined;
    if (api && 'onAnalyticsFlush' in api) {
      unsubscribe = (api as { onAnalyticsFlush: (cb: () => void) => () => void })
        .onAnalyticsFlush(() => {
          const sessionDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
          analyticsPort.track('app_close', { sessionDuration });
          void analyticsPort.flush();
        });
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubscribe?.();
    };
  }, []);

  /** 타입 안전한 track 함수 */
  const track = useCallback(
    <E extends AnalyticsEventName>(
      event: E,
      ...args: AnalyticsEventProperties[E] extends Record<string, never>
        ? [properties?: Record<string, never>]
        : [properties: AnalyticsEventProperties[E]]
    ): void => {
      if (!analyticsEnabled) return;
      analyticsPort.track(event, (args[0] ?? {}) as Record<string, unknown>);
    },
    [analyticsEnabled],
  );

  /** 타입 체크 없이 자유롭게 추적 (확장 이벤트용) */
  const trackRaw = useCallback(
    (event: string, properties?: Record<string, unknown>): void => {
      if (!analyticsEnabled) return;
      analyticsPort.track(event, properties);
    },
    [analyticsEnabled],
  );

  return { track, trackRaw } as const;
}
