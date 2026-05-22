import { useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/**
 * 바탕화면 아이콘 아래 모드(native-desktop) fallback 수신 hook (v2.1.0~).
 *
 * Main process가 manager.enable() 실패를 감지하면 `desktopMode:fallback` IPC를
 * 발사한다. 이 hook은 그 신호를 받아 settings store를 fallbackMode로 영속 정정한다.
 *
 * widget-mode-discovery (v2.1.x~) 이후 사용자 노출 채널은 위젯 헤더 모드 칩의
 * "⚠ 적용 실패" 상태 + WidgetModeFallbackModal 단일 경로로 통합되었다. 본 hook은
 * settings store 정합성 유지만 담당 — 토스트는 발사하지 않는다(이중 노출 회피).
 * Widget.tsx도 동일 IPC를 직접 구독해 UI 노출을 단독으로 처리하며, hook과의
 * 역할 분담은 다음과 같다:
 *   - useDesktopModeFallback (App 전역): settings 영속 정정 (위젯 모드가 아닐 때도 작동)
 *   - Widget.tsx 구독 (위젯 모드 한정): 칩 상태 + 모달 + analytics
 *
 * App 진입점(MainApp/WidgetApp)에서 한 번만 마운트하면 된다.
 * 비Electron 환경(`window.electronAPI` 부재) 또는 hook이 노출되지 않은 구버전
 * preload 환경에서는 안전하게 no-op한다.
 */
export function useDesktopModeFallback(): void {
  const update = useSettingsStore((s) => s.update);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDesktopModeFallback) return;

    const unsubscribe = api.onDesktopModeFallback((info) => {
      // 진단용 콘솔 로그 (사용자에게는 노출하지 않음 — reason은 영문 식별자)
      console.log('[desktop-mode] fallback:', info.reason, '→', info.fallbackMode);

      // settings store 영속 저장 정정
      const current = useSettingsStore.getState().settings;
      void update({
        widget: { ...current.widget, desktopMode: info.fallbackMode },
      });
    });

    return unsubscribe;
  }, [update]);
}
