/**
 * 설정의 투명도·흐림을 현재 창에 실제로 적용한다.
 *
 * 배경(2026-08-14): 설정에 `배경 투명도`·`카드 투명도` 슬라이더가 있는데도 대시보드는
 * **그 값을 아예 읽지 않았다.** 값을 쓰는 곳이 위젯 모드(`Widget.tsx`) 한 곳뿐이었는데
 * 슬라이더는 `설정 → 화면` 탭에 있어서, 조절해도 뒤의 대시보드가 안 바뀌었다.
 * 고장이 아니라 배선이 빠져 있던 것이다.
 *
 * 계산은 `domain/rules/glassSurface.ts` 가 한다. 이 훅은 그 결과를 CSS 변수로 옮기는
 * 역할만 맡는다.
 *
 * 반드시 `useThemeApplier()` **다음에** 부를 것. 그쪽이 `--sp-card-base` 를 먼저 정하고
 * 이 훅이 그 위에 투명도를 얹기 때문이다. 순서가 뒤집히면 한 박자 늦은 색이 적용된다.
 */
import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  resolveGlassSurface,
  type GlassContext,
  type GlassInput,
} from '@domain/rules/glassSurface';

/** 설정에 값이 없을 때 — 지금 모습 그대로(불투명·흐림 없음) */
const FALLBACK: GlassInput = { bgOpacity: 1, cardOpacity: 1, blur: 0 };

export function useGlassSurface(context: GlassContext): void {
  const opacity = useSettingsStore((s) => s.settings.widget?.opacity);
  const cardOpacity = useSettingsStore((s) => s.settings.widget?.cardOpacity);
  const blur = useSettingsStore((s) => s.settings.widget?.blur);

  useLayoutEffect(() => {
    const input: GlassInput = {
      bgOpacity: typeof opacity === 'number' ? opacity : FALLBACK.bgOpacity,
      cardOpacity: typeof cardOpacity === 'number' ? cardOpacity : FALLBACK.cardOpacity,
      blur: typeof blur === 'number' ? blur : FALLBACK.blur,
    };
    const surface = resolveGlassSurface(input, context);
    const root = document.documentElement;

    // 카드가 완전 불투명하면 토큰을 건드리지 않는다. color-mix 로 100% 를 써도 같은
    // 색이 나오지만, 굳이 계산식을 끼워 넣으면 나중에 이 값을 읽는 쪽이 헷갈린다.
    if (surface.cardAlpha >= 1) {
      root.style.setProperty('--sp-card', 'var(--sp-card-base)');
    } else {
      root.style.setProperty(
        '--sp-card',
        `color-mix(in srgb, var(--sp-card-base) ${surface.cardAlpha * 100}%, transparent)`,
      );
    }

    root.style.setProperty('--sp-glass-blur', `${surface.blurPx}px`);
    // 유리가 켜졌는지 CSS 에서 알 수 있게 표시한다. 흐림 레이어를 아예 만들지 않기 위해
    // 클래스로 둔다 — 변수만으로는 "0px 흐림"도 합성 레이어를 만들어 성능을 깎는다.
    root.classList.toggle('sp-glass-on', surface.blurPx > 0 || surface.cardAlpha < 1);
  }, [opacity, cardOpacity, blur, context]);
}
