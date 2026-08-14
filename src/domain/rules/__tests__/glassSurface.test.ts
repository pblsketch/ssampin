/*
  유리 표면 규칙 가드.

  배경(2026-08-14): 투명도·흐림을 위젯·옆핀·대시보드 세 곳에서 각각 계산하던 것을
  한 곳으로 모았다. 이 테스트가 지키는 것은 두 가지다.

  1. **유리를 끄면 지금과 100% 동일해야 한다.** 이 기능은 기존 화면 위에 얹는 것이라,
     꺼진 상태에서 1픽셀이라도 달라지면 기능 추가가 아니라 회귀다. 맥락별 보정이
     들어오면서 알파 1이 0.99 같은 값으로 새는 것이 가장 흔한 실수라 못 박는다.
  2. **위젯·옆핀은 대시보드보다 불투명해야 한다.** 바탕화면 위에 떠 있어 뒤에 무엇이
     올지 앱이 알 수 없기 때문이다. 이 관계가 뒤집히면 늘 떠 있는 창의 글자가 위험해진다.
*/

import { describe, expect, it } from 'vitest';
import {
  GLASS_PRESETS,
  isGlassActive,
  matchGlassPreset,
  resolveGlassSurface,
  type GlassContext,
  type GlassInput,
} from '../glassSurface';

const CONTEXTS: GlassContext[] = ['dashboard', 'widget', 'sidePin'];

describe('resolveGlassSurface — 유리를 끈 상태', () => {
  it('none 프리셋은 모든 자리에서 알파 1 · 흐림 0 (지금 모습 그대로)', () => {
    for (const ctx of CONTEXTS) {
      const s = resolveGlassSurface(GLASS_PRESETS.none, ctx);
      expect(s.bgAlpha, `${ctx} bgAlpha`).toBe(1);
      expect(s.cardAlpha, `${ctx} cardAlpha`).toBe(1);
      expect(s.blurPx, `${ctx} blurPx`).toBe(0);
    }
  });

  it('알파 1은 맥락 보정을 거쳐도 정확히 1이다 (0.99 로 새지 않는다)', () => {
    for (const ctx of CONTEXTS) {
      const s = resolveGlassSurface({ bgOpacity: 1, cardOpacity: 1, blur: 0 }, ctx);
      expect(s.bgAlpha).toBe(1);
      expect(s.cardAlpha).toBe(1);
    }
  });

  it('isGlassActive 는 none 에서 false', () => {
    expect(isGlassActive(GLASS_PRESETS.none)).toBe(false);
    expect(isGlassActive(GLASS_PRESETS.soft)).toBe(true);
    expect(isGlassActive(GLASS_PRESETS.strong)).toBe(true);
  });
});

describe('resolveGlassSurface — 맥락별 환산', () => {
  it('위젯·옆핀은 대시보드보다 불투명하다 (바탕화면 위라 뒤를 알 수 없음)', () => {
    for (const level of ['soft', 'strong'] as const) {
      const dash = resolveGlassSurface(GLASS_PRESETS[level], 'dashboard');
      const widget = resolveGlassSurface(GLASS_PRESETS[level], 'widget');
      const sidePin = resolveGlassSurface(GLASS_PRESETS[level], 'sidePin');

      expect(widget.cardAlpha, `${level} widget`).toBeGreaterThan(dash.cardAlpha);
      expect(sidePin.cardAlpha, `${level} sidePin`).toBeGreaterThan(dash.cardAlpha);
      expect(widget.bgAlpha, `${level} widget bg`).toBeGreaterThan(dash.bgAlpha);
    }
  });

  it('대시보드는 사용자 값을 그대로 쓴다 (보정 없음)', () => {
    const input: GlassInput = { bgOpacity: 0.6, cardOpacity: 0.4, blur: 20 };
    const s = resolveGlassSurface(input, 'dashboard');
    expect(s.bgAlpha).toBeCloseTo(0.6, 5);
    expect(s.cardAlpha).toBeCloseTo(0.4, 5);
  });

  it('흐림은 맥락과 무관하게 같은 값이다', () => {
    const input: GlassInput = { bgOpacity: 0.5, cardOpacity: 0.5, blur: 18 };
    const values = CONTEXTS.map((c) => resolveGlassSurface(input, c).blurPx);
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe(18);
  });

  it('보정된 값도 0~1 을 벗어나지 않는다', () => {
    for (const ctx of CONTEXTS) {
      for (const v of [0, 0.01, 0.5, 0.99, 1]) {
        const s = resolveGlassSurface({ bgOpacity: v, cardOpacity: v, blur: 0 }, ctx);
        expect(s.bgAlpha).toBeGreaterThanOrEqual(0);
        expect(s.bgAlpha).toBeLessThanOrEqual(1);
        expect(s.cardAlpha).toBeGreaterThanOrEqual(0);
        expect(s.cardAlpha).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('resolveGlassSurface — 이상한 값 방어', () => {
  it('숫자가 아니거나 범위를 벗어난 값은 불투명(1)으로 되돌린다', () => {
    // 저장된 설정이 깨졌을 때 화면이 사라지는 것보다 불투명한 편이 안전하다.
    const bad = [NaN, Infinity, -Infinity] as number[];
    for (const v of bad) {
      const s = resolveGlassSurface({ bgOpacity: v, cardOpacity: v, blur: v }, 'dashboard');
      expect(s.bgAlpha).toBe(1);
      expect(s.cardAlpha).toBe(1);
      expect(s.blurPx).toBe(0);
    }
  });

  it('음수·1 초과는 잘라낸다', () => {
    const low = resolveGlassSurface({ bgOpacity: -3, cardOpacity: -3, blur: -5 }, 'dashboard');
    expect(low.bgAlpha).toBe(0);
    expect(low.blurPx).toBe(0);

    const high = resolveGlassSurface({ bgOpacity: 9, cardOpacity: 9, blur: 0 }, 'dashboard');
    expect(high.bgAlpha).toBe(1);
    expect(high.cardAlpha).toBe(1);
  });
});

describe('matchGlassPreset', () => {
  it('프리셋 값은 해당 단계로 알아본다', () => {
    expect(matchGlassPreset(GLASS_PRESETS.none)).toBe('none');
    expect(matchGlassPreset(GLASS_PRESETS.soft)).toBe('soft');
    expect(matchGlassPreset(GLASS_PRESETS.strong)).toBe('strong');
  });

  it('직접 조절한 값은 null — 3단계 중 하나로 억지로 밀어 넣지 않는다', () => {
    expect(matchGlassPreset({ bgOpacity: 0.7, cardOpacity: 0.65, blur: 15 })).toBeNull();
  });
});
