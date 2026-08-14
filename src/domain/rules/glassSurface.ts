/**
 * 유리 표면 — 투명도·흐림을 맥락별로 환산하는 공용 규칙.
 *
 * 배경(2026-08-14): 같은 코드가 이미 두 번 반복돼 있었다.
 * - 위젯 모드   `Widget.tsx`            — `rgba(--sp-widget-rgb)` + `color-mix(--sp-card-base)`
 * - 옆핀 모드   `useSidePinAppearance`  — 같은 방식, `--sp-surface-base` 기준
 * 대시보드가 세 번째가 될 참이었다. 그래서 계산을 여기 한 곳으로 모은다.
 *
 * 준일님 결정: 투명도 설정은 **하나로 합친다**. 다만 위젯·옆핀은 바탕화면 위에 떠 있고
 * 대시보드는 창 안이라 같은 값이 같은 인상을 주지 않는다. 그래서 **설정은 하나로 두되
 * 맥락별로 환산**한다. 사용자가 보는 설정은 여전히 하나다.
 *
 * 관련 계획: `docs/01-plan/features/glass-surface.plan.md`
 */

/** 유리를 적용할 자리. 각자 뒤에 있는 것이 달라 같은 값이라도 다르게 보인다. */
export type GlassContext =
  /** 메인 창 안. 뒤에 있는 것은 앱이 통제한다(배경 사진·OS 재질). */
  | 'dashboard'
  /** 바탕화면 위에 떠 있는 위젯 창. 뒤가 무엇일지 알 수 없다. */
  | 'widget'
  /** 화면 가장자리에 붙는 옆핀 창. 위젯과 같은 조건. */
  | 'sidePin';

/** 사용자가 고르는 값 한 벌. 맥락별로 나뉘지 않는다. */
export interface GlassInput {
  /** 창·바탕 배경의 불투명도 (0~1). 1이면 완전 불투명. */
  readonly bgOpacity: number;
  /** 카드·안쪽 면의 불투명도 (0~1). 1이면 완전 불투명. */
  readonly cardOpacity: number;
  /** 흐림 세기 (px). 0이면 흐리지 않음. */
  readonly blur: number;
}

/** 실제로 화면에 적용할 값. */
export interface GlassSurface {
  readonly bgAlpha: number;
  readonly cardAlpha: number;
  readonly blurPx: number;
}

/** 유리 강도 3단계. 설정 화면에서 버튼 하나로 고르는 묶음. */
export type GlassLevel = 'none' | 'soft' | 'strong';

/**
 * 3단계 프리셋.
 *
 * `none`은 **지금 모습 그대로**여야 한다. 유리를 끈 상태에서 화면이 조금이라도 달라지면
 * 기능 추가가 아니라 회귀다.
 *
 * `strong`의 카드 42%는 실측으로 정한 값이다 — 그보다 진하면 유리로 안 보이고,
 * 그보다 옅으면 빽빽한 표에서 배경 얼룩이 글자를 방해했다.
 */
export const GLASS_PRESETS: Readonly<Record<GlassLevel, GlassInput>> = {
  none: { bgOpacity: 1, cardOpacity: 1, blur: 0 },
  soft: { bgOpacity: 0.82, cardOpacity: 0.78, blur: 12 },
  strong: { bgOpacity: 0.55, cardOpacity: 0.42, blur: 24 },
};

/**
 * 맥락별 보정 강도 (0~1). 클수록 불투명 쪽으로 끌어올린다.
 *
 * 위젯·옆핀은 **바탕화면 위**에 떠 있다. 뒤에 무엇이 올지 앱이 알 수 없어서
 * (밝은 사진, 복잡한 무늬, 다른 창) 대시보드와 같은 투명도를 주면 글자가 위험해진다.
 * 대시보드는 뒤에 오는 것을 앱이 정하므로 보정하지 않는다.
 */
const CONTEXT_LIFT: Readonly<Record<GlassContext, number>> = {
  dashboard: 0,
  widget: 0.25,
  sidePin: 0.25,
};

/** 0~1 밖으로 나가지 않게 자른다. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 알파를 불투명 쪽으로 끌어올린다.
 *
 * `alpha + (1 - alpha) * lift` 형태라 **1은 그대로 1**이다. 이게 중요하다 —
 * 유리를 끈 상태(알파 1)에서 보정이 끼어들면 화면이 달라진다.
 */
function lift(alpha: number, amount: number): number {
  return alpha + (1 - alpha) * amount;
}

/**
 * 사용자 값 한 벌을 특정 자리에 쓸 값으로 환산한다.
 *
 * 흐림은 보정하지 않는다. 흐림 세기는 "뒤가 얼마나 뭉개지는가"라서 맥락이 달라도
 * 같은 값이 같은 인상을 준다. 투명도와 달리 가독성을 직접 깎지도 않는다.
 */
export function resolveGlassSurface(input: GlassInput, context: GlassContext): GlassSurface {
  const bg = clamp01(input.bgOpacity);
  const card = clamp01(input.cardOpacity);
  const amount = CONTEXT_LIFT[context];
  const blurPx = Number.isFinite(input.blur) && input.blur > 0 ? input.blur : 0;

  return {
    bgAlpha: lift(bg, amount),
    cardAlpha: lift(card, amount),
    blurPx,
  };
}

/** 유리가 실제로 켜져 있는가. 꺼져 있으면 흐림 레이어를 아예 만들지 않는다. */
export function isGlassActive(input: GlassInput): boolean {
  const s = resolveGlassSurface(input, 'dashboard');
  return s.bgAlpha < 1 || s.cardAlpha < 1 || s.blurPx > 0;
}

/**
 * 지금 값이 어느 프리셋에 해당하는가. 어디에도 안 맞으면 `null`(직접 조절 상태).
 *
 * 설정 화면에서 "지금 어느 단계인지" 표시하는 데 쓴다. 슬라이더로 미세 조정한
 * 사용자를 억지로 3단계 중 하나로 밀어 넣지 않기 위해 `null`을 남긴다.
 */
export function matchGlassPreset(input: GlassInput): GlassLevel | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  for (const level of ['none', 'soft', 'strong'] as const) {
    const p = GLASS_PRESETS[level];
    if (
      near(input.bgOpacity, p.bgOpacity) &&
      near(input.cardOpacity, p.cardOpacity) &&
      near(input.blur, p.blur)
    ) {
      return level;
    }
  }
  return null;
}
