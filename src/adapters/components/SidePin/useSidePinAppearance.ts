/**
 * 옆핀 창의 겉모습(주제 색·투명도)을 설정에서 가져와 적용한다.
 *
 * 옆핀은 메인 창과 **다른 창**이라 설정을 스스로 불러와야 한다. 이 훅이 없으면
 * 선생님이 어두운 주제를 써도 **옆핀만 밝은 색으로 뜬다** — 실제로 그런 상태였다.
 *
 * 다른 창에서 설정을 바꾸면 그 즉시 따라간다. 그러지 않으면 "주제를 바꿨는데
 * 옆핀만 그대로"가 된다. (메모 목록·위젯 목록과 같은 이유)
 */
import { useEffect } from 'react';
import type { SidePinModeOptions } from '@domain/entities/Settings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';

/** 설정이 담긴 데이터 파일 이름 — 이 파일이 바뀔 때만 다시 읽는다 */
const SETTINGS_DATA_FILE = 'settings';

/** 설정이 없을 때의 배경 투명도 — 지금 모습 그대로(불투명) */
export const SIDE_PIN_DEFAULT_OPACITY = 1;

export interface SidePinAppearance {
  /**
   * 손잡이·패널 배경에 쓸 색.
   *
   * 위젯 모드와 같은 방식이다. `--sp-widget-rgb`는 주제의 바탕색이라, 투명도를 낮추면
   * 뒤가 비쳐 보이면서도 글자는 또렷하게 남는다.
   */
  readonly backgroundColor: string;
  readonly opacity: number;
  /**
   * 안쪽 면 투명도를 얹은 스타일.
   *
   * 요소를 하나하나 고치지 않고 **토큰 자체를 덮어쓴다.** 이러면 그 아래 모든
   * `bg-sp-surface`가 한 번에 따라온다 — 위젯 모드가 카드에 쓰는 방식과 같다.
   */
  readonly surfaceStyle: Record<string, string>;
  readonly cardOpacity: number;
}

export function useSidePinAppearance(): SidePinAppearance {
  const load = useSettingsStore((state) => state.load);
  const opacityRaw = useSettingsStore((state) => state.settings.widget?.sidePin?.opacity);
  const cardOpacityRaw = useSettingsStore((state) => state.settings.widget?.sidePin?.cardOpacity);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;
    return api.onDataChanged((filename: string) => {
      if (filename !== SETTINGS_DATA_FILE) return;
      // force로 읽어야 한다. 이미 불러왔다는 이유로 건너뛰면 다른 창의 변경이
      // 영원히 반영되지 않는다.
      void load(true);
    });
  }, [load]);

  // 주제 색을 이 창에도 입힌다. 이게 없으면 index.css 의 기본값(밝은 색)만 적용된다.
  useThemeApplier();

  const opacity = normalizeOpacity(opacityRaw);
  const cardOpacity = normalizeOpacity(cardOpacityRaw);

  return {
    backgroundColor: `rgba(var(--sp-widget-rgb), ${opacity})`,
    opacity,
    surfaceStyle: {
      '--sp-surface': `color-mix(in srgb, var(--sp-surface-base) ${cardOpacity * 100}%, transparent)`,
    },
    cardOpacity,
  };
}

/**
 * 옆핀 안에서 바꾼 모양을 저장한다.
 *
 * 기존 값을 펼쳐서 얹는다. 그러지 않으면 배경을 바꿀 때 카드 값이 지워진다 —
 * 이 저장소에서 여러 번 겪은 실수라 한 곳에 모아 둔다.
 */
export function useSaveSidePinAppearance(): (patch: SidePinModeOptions) => Promise<void> {
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);

  return (patch) =>
    update({
      widget: {
        ...settings.widget,
        sidePin: { ...settings.widget?.sidePin, ...patch },
      },
    });
}

/**
 * 저장값이 이상해도 화면이 사라지지 않게 한다.
 *
 * 0~1 밖의 값이나 숫자가 아닌 값이 들어오면 기본값으로 되돌린다 — 손잡이가 통째로
 * 안 보이면 사용자는 옆핀을 다시 켤 방법조차 찾기 어렵다.
 */
export function normalizeOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SIDE_PIN_DEFAULT_OPACITY;
  if (value < 0 || value > 1) return SIDE_PIN_DEFAULT_OPACITY;
  return value;
}
