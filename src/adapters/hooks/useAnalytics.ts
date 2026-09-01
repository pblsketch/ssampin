import { useCallback, useEffect, useRef } from 'react';
import { analyticsPort } from '@adapters/di/container';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@domain/valueObjects/AnalyticsEvent';
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

let identityInstalled = false;

/**
 * 기기 번호·앱 버전을 **이 창의** 수집기에 붙인다.
 *
 * ★반드시 화면이 그려지기 전(진입 파일의 module 최상단)에 불러야 한다.
 *   effect 안에서 부르면 늦는다 — React 는 자식 effect 를 먼저 돌리므로, 자식이 먼저
 *   보낸 기록에는 번호가 안 붙는다. 실제로 이것 때문에 위젯·아이콘 창의 기록이
 *   전부 번호 없이(익명으로) 쌓여, 관리자 화면에 "1명"으로 뭉쳐 보였다.
 *   (2026-09-01 실측: widget_close·icon_mode_enter 의 번호 보유 기기 수 0대)
 *
 * ★창마다 렌더러 프로세스가 따로라 수집기도 창마다 따로다. 그래서 창마다 불러야 한다.
 *   번호 자체는 localStorage 에 있어 창들이 같은 값을 공유한다.
 *
 * 두 번 불러도 손해가 없다(멱등).
 */
export function initAnalyticsIdentity(): void {
  analyticsPort.setDeviceId(getOrCreateDeviceId());
  analyticsPort.setAppVersion(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');

  if (identityInstalled) return;
  identityInstalled = true;
  // 창이 닫힐 때 아직 안 보낸 기록을 흘려보낸다. 위젯·옆핀처럼 금방 닫히는 창은
  // 30초 주기 전송을 못 기다리고 닫히는 일이 잦다.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      void analyticsPort.flush();
    });
  }
}

/**
 * 화면(React) 밖에서 기록을 남길 때 쓴다 — 스토어·유즈케이스처럼 훅을 못 쓰는 자리.
 *
 * ★수집 거부 설정을 여기서도 확인한다. 포트를 직접 부르면 거부가 무시된다.
 */
export function trackAnalytics<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsEventProperties[E],
): void {
  if (useSettingsStore.getState().settings.analytics?.enabled === false) return;
  analyticsPort.track(event, properties as Record<string, unknown>);
}

/**
 * Analytics 라이프사이클 훅.
 * 메인 창(App.tsx)에서만 1회 호출 — session_start 기록 + 앱 종료 시 flush.
 *
 * ★위젯·아이콘·옆핀 같은 곁창은 이 훅을 쓰지 않는다. 여기서 세는 실행 횟수·세션은
 *   "앱을 한 번 켰다"는 뜻이라, 곁창이 뜰 때마다 같이 세면 숫자가 부풀려진다.
 *   곁창은 진입 파일에서 `initAnalyticsIdentity()` 만 부른다.
 */
export function useAnalyticsLifecycle() {
  const startTimeRef = useRef(Date.now());

  // 초기화 (최초 1회)
  useEffect(() => {
    // 진입 파일에서 이미 불렀지만, 이 훅만 보고도 동작을 알 수 있게 한 번 더 부른다(멱등).
    initAnalyticsIdentity();

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
      unsubscribe = (api as { onAnalyticsFlush: (cb: () => void) => () => void }).onAnalyticsFlush(
        () => {
          const sessionDuration = Math.round((Date.now() - startTimeRef.current) / 1000);
          analyticsPort.track('app_close', { sessionDuration });
          void analyticsPort.flush();
        },
      );
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
