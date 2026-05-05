import { useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';

/**
 * 바탕화면 아이콘 아래 모드(native-desktop) fallback 수신 hook (v2.1.0~).
 *
 * Main process가 manager.enable() 실패를 감지하면 `desktopMode:fallback` IPC를
 * 발사한다. 이 hook은 그 신호를 받아:
 *   1) settings.widget.desktopMode를 fallbackMode로 정정 (영속 저장)
 *   2) 사용자에게 토스트로 안내
 *
 * App 진입점(MainApp/WidgetApp)에서 한 번만 마운트하면 된다.
 * 비Electron 환경(`window.electronAPI` 부재) 또는 hook이 노출되지 않은 구버전
 * preload 환경에서는 안전하게 no-op한다.
 */
export function useDesktopModeFallback(): void {
  const update = useSettingsStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);

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

      // 사용자 안내 토스트 (info reason은 영문이므로 사용자 표시 X)
      showToast(
        '바탕화면 아이콘 아래 모드를 사용할 수 없어 일반 모드로 전환했습니다.',
        'info',
      );
    });

    return unsubscribe;
  }, [update, showToast]);
}
