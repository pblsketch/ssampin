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
import { useLayoutEffect, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useGlassPerformanceGuard } from './useGlassPerformanceGuard';
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
  const optIn = useSettingsStore((s) => s.settings.widget?.glassDashboardOptIn);

  /*
    `useThemeApplier` 가 반응하는 것과 **같은 값들을 함께 본다.**

    `--sp-card` 를 쓰는 곳이 둘이다 — 테마 훅이 원래 색으로 되돌리고, 이 훅이 그 위에
    투명도를 얹는다. 그런데 테마 훅만 다시 도는 경우(설정 저장·스타일 변경·시스템 테마
    전환 등)에는 이 훅이 감시하는 값이 그대로라 다시 돌지 않아, 배경이 되살아난다.
    "위젯 카드 투명도가 풀렸다가 유리 효과를 다시 누르면 돌아온다"가 이 증상이었다.

    같은 신호를 함께 보게 하면 둘이 항상 짝으로 실행된다. 부르는 쪽에서 이 훅을
    `useThemeApplier()` **다음에** 두므로 순서상 이 훅이 나중에 덮어써 이긴다.
  */
  const dashboardTheme = useSettingsStore((s) => s.settings.dashboardTheme);
  const theme = useSettingsStore((s) => s.settings.theme);
  const widgetStyle = useSettingsStore((s) => s.settings.widgetStyle);

  // 흐림이 실제로 걸렸을 때만 성능을 재본다. 안 걸렸으면 잴 것도 없다.
  const [blurActive, setBlurActive] = useState(false);
  useGlassPerformanceGuard(blurActive);

  useLayoutEffect(() => {
    /*
      대시보드는 사용자가 한 번이라도 직접 조절한 뒤부터 이 값을 따른다.

      `opacity`·`cardOpacity` 는 원래 위젯 창 전용이었다. 위젯을 반투명하게 맞춰 둔
      선생님이 업데이트했을 때 손대지도 않은 대시보드까지 반투명해지면 안 된다.
      위젯·옆핀은 원래 이 값을 쓰던 자리라 그대로 적용한다.
    */
    const skip = context === 'dashboard' && optIn === false;

    const input: GlassInput = skip
      ? FALLBACK
      : {
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

    /*
      왼쪽 패널처럼 `bg-sp-surface` 를 쓰는 뼈대용 면. 카드보다 조금 더 진하게 둔다 —
      늘 보이는 뼈대라 내용이 훤히 비치면 어지럽다. 1 을 넘지 않게 자른다.
    */
    const surfaceAlpha = Math.min(1, surface.cardAlpha * 1.4);
    root.style.setProperty(
      '--sp-glass-surface',
      surfaceAlpha >= 1
        ? 'var(--sp-surface-base)'
        : `color-mix(in srgb, var(--sp-surface-base) ${surfaceAlpha * 100}%, transparent)`,
    );

    root.style.setProperty('--sp-glass-blur', `${surface.blurPx}px`);
    setBlurActive(surface.blurPx > 0);
    // 유리가 켜졌는지 CSS 에서 알 수 있게 표시한다. 흐림 레이어를 아예 만들지 않기 위해
    // 클래스로 둔다 — 변수만으로는 "0px 흐림"도 합성 레이어를 만들어 성능을 깎는다.
    root.classList.toggle('sp-glass-on', surface.blurPx > 0 || surface.cardAlpha < 1);
  }, [opacity, cardOpacity, blur, optIn, context, dashboardTheme, theme, widgetStyle]);
}
