import { useCallback, useEffect, useRef } from 'react';
import { analyticsPort } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { AnalyticsEventName, AnalyticsEventProperties } from '@domain/valueObjects/AnalyticsEvent';
import { generateUUID } from '@infrastructure/utils/uuid';

const DEVICE_ID_KEY = 'ssampin_device_id';

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Analytics 라이프사이클 훅.
 * App.tsx에서만 1회 호출 — device_id/app_version 초기화 + 앱 종료 시 flush.
 */
export function useAnalyticsLifecycle() {
  const startTimeRef = useRef(Date.now());

  // 초기화 (최초 1회)
  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    analyticsPort.setDeviceId(deviceId);
    analyticsPort.setAppVersion(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');

    // session_start 이벤트 추가
    const LAUNCH_COUNT_KEY = 'ssampin_launch_count';
    const launchCount = parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(LAUNCH_COUNT_KEY, launchCount.toString());
    analyticsPort.track('session_start', { isReturning: launchCount > 1, launchCount });
  }, []);

  // 앱 종료 시 flush (여기서만 등록!)
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
}

/**
 * Analytics 추적 훅.
 * 모든 컴포넌트에서 사용 — track 함수만 반환.
 */
export function useAnalytics() {
  const analyticsEnabled = useSettingsStore((s) => s.settings.analytics?.enabled ?? true);

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
