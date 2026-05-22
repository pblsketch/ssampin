import { useCallback, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/**
 * widget-mode-discovery (v2.1.x~) — 위젯 모드 첫 진입 시 1회성 모드 코치 투어 트리거.
 *
 * 발견성 문제 해소를 위한 PDCA의 핵심 훅. `settings.widget.modeTour.shown` 플래그를
 * 단일 진실 원천으로 사용한다. undefined도 "아직 안 봄"으로 취급(기존 사용자 마이그레이션 X).
 *
 * 사용 패턴:
 *   const { shouldShow, markShown, reset } = useFirstRunModeCoachTour();
 *   useEffect(() => {
 *     if (shouldShow) openCoachTour();
 *   }, [shouldShow]);
 *
 * "다시 보기"는 reset() 호출 후 컴포넌트가 즉시 노출. shown 플래그는 사용자가 마지막
 * slide까지 보거나 Skip을 누른 시점에 markShown()으로 true 저장.
 */
export interface UseFirstRunModeCoachTour {
  /** 코치 투어를 지금 표시해야 하는지 여부. settings 로드 전에는 false. */
  readonly shouldShow: boolean;
  /** 사용자가 투어를 끝마치거나 Skip 시 호출. settings.widget.modeTour.shown=true 저장. */
  readonly markShown: () => Promise<void>;
  /** "모드 가이드 다시 보기" 트리거 시 호출. shown=false로 reset → 다음 마운트에서 표시. */
  readonly reset: () => Promise<void>;
}

export function useFirstRunModeCoachTour(): UseFirstRunModeCoachTour {
  const widget = useSettingsStore((s) => s.settings.widget);
  const loaded = useSettingsStore((s) => s.loaded);
  const update = useSettingsStore((s) => s.update);

  const shouldShow = useMemo(() => {
    if (!loaded) return false;
    // modeTour 미정의(레거시 사용자) 또는 shown=false → 표시
    return widget.modeTour?.shown !== true;
  }, [loaded, widget.modeTour?.shown]);

  const markShown = useCallback(async () => {
    await update({
      widget: {
        ...widget,
        modeTour: { shown: true },
      },
    });
  }, [widget, update]);

  const reset = useCallback(async () => {
    await update({
      widget: {
        ...widget,
        modeTour: { shown: false },
      },
    });
  }, [widget, update]);

  return { shouldShow, markShown, reset };
}
