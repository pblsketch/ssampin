import { useEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';

/**
 * Phase 7-E (v2.1.0~) — 바탕화면 아이콘 아래 모드 첫 활성화 시 1회 사전 안내 토스트.
 *
 * 배경: native-desktop 모드는 WH_MOUSE_LL hook을 설치해 위젯 위 마우스 클릭/스크롤을
 * 라우팅한다. 일부 보안 프로그램(Windows Defender, 일부 AV)이 이 hook을 차단할 수 있다.
 * 차단 시 enable() 실패 → useDesktopModeFallback이 일반 모드로 자동 전환 + 토스트 안내.
 *
 * 본 hook은 그 전 단계 — **사전 안내**:
 *   - 사용자가 native-desktop 모드를 처음 켤 때 1회 토스트로 가능성 안내
 *   - settings.widget.nativeDesktopAvWarningShown 플래그로 1회 제한
 *   - 활성화 시점에만 발사(라디오를 native-desktop으로 클릭한 직후)
 *
 * 일반/topmost 모드일 때는 무영향. 이미 봤던 사용자에게도 다시 안 노출.
 *
 * App 진입점(MainApp/WidgetApp)에서 마운트. 양쪽 모두 마운트해도 settings store가 같은
 * 파일을 공유하므로 플래그 동기화는 첫 토스트 직후 즉시 영속(electron 측 IStoragePort 통해).
 * 다만 zustand store는 process별 독립이라 양 App에 모두 마운트해야 사용자가 어느 쪽에서
 * 라디오를 클릭하든 토스트를 보장받는다.
 */
export function useNativeDesktopAvWarning(): void {
  const desktopMode = useSettingsStore((s) => s.settings.widget.desktopMode);
  const seen = useSettingsStore((s) => s.settings.widget.nativeDesktopAvWarningShown);
  const update = useSettingsStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    // 활성화 시점이 아니거나 이미 본 사용자는 skip.
    if (desktopMode !== 'native-desktop') return;
    if (seen) return;

    showToast(
      '바탕화면 아이콘 아래 모드를 활성화했습니다. 일부 보안 프로그램이 마우스 hook을 차단할 수 있으며, 차단되면 자동으로 일반 모드로 돌아갑니다.',
      'info',
    );

    // 영속 저장 — 다음 활성화에는 안 노출.
    const current = useSettingsStore.getState().settings;
    void update({
      widget: { ...current.widget, nativeDesktopAvWarningShown: true },
    });
  }, [desktopMode, seen, update, showToast]);
}
