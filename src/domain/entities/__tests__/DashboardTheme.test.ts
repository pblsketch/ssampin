/*
  대시보드 테마 프리셋 + "오늘" 배경색 파생 규칙 가드.

  배경(2026-08-14): 무채색 미니멀 테마(뉴트럴/뉴트럴 다크)를 추가하면서,
  일정 목록의 "오늘" 카드 배경이 전 테마 공용 하늘색(#dbeafe)으로 고정이던 문제를
  테마 accent 파생으로 바꿨다. 이 테스트는 두 가지를 잡는다.

  1. 고정색 회귀 — computeTodayBg 를 다시 상수로 되돌리면 "테마마다 달라야 한다"가 깨진다.
  2. 무채색 오염 — 뉴트럴 계열에서 오늘 배경에 유채색이 섞이면 테마 컨셉이 무너진다.
*/

import { describe, expect, it } from 'vitest';
import {
  PRESET_THEMES,
  computeTodayBg,
  getPresetTheme,
  type PresetThemeId,
} from '../DashboardTheme';

/** '#rrggbb' → [r, g, b] */
function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** 채도(saturation) 근사 — max-min 채널 차. 0 이면 완전 무채색. */
function chroma(hex: string): number {
  const [r, g, b] = rgb(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

describe('PRESET_THEMES — 뉴트럴 계열 추가', () => {
  it('뉴트럴 라이트/다크가 프리셋 목록에 있다', () => {
    const ids = PRESET_THEMES.map((t) => t.id);
    expect(ids).toContain('neutral-light');
    expect(ids).toContain('neutral-dark');
  });

  it('id 는 서로 중복되지 않는다', () => {
    const ids = PRESET_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('뉴트럴 계열의 bg·card·accent 는 무채색이다 (채널 차 ≤ 6)', () => {
    for (const id of ['neutral-light', 'neutral-dark'] as const) {
      const { colors } = getPresetTheme(id);
      expect(chroma(colors.bg), `${id} bg`).toBeLessThanOrEqual(6);
      expect(chroma(colors.card), `${id} card`).toBeLessThanOrEqual(6);
      expect(chroma(colors.accent), `${id} accent`).toBeLessThanOrEqual(6);
    }
  });

  it('뉴트럴 라이트는 회색 배경 위 순백 카드 — 노션(흰 배경·회색 카드)과 반대다', () => {
    const neutral = getPresetTheme('neutral-light').colors;
    const notion = getPresetTheme('notion-light').colors;

    expect(neutral.card).toBe('#ffffff');
    // 뉴트럴: 카드가 배경보다 밝다 / 노션: 카드가 배경보다 어둡다
    expect(rgb(neutral.card)[0]).toBeGreaterThan(rgb(neutral.bg)[0]);
    expect(rgb(notion.card)[0]).toBeLessThan(rgb(notion.bg)[0]);
  });

  it('모든 프리셋이 8개 색 키를 빠짐없이 채운다', () => {
    const keys = ['bg', 'surface', 'card', 'border', 'accent', 'highlight', 'text', 'muted'];
    for (const theme of PRESET_THEMES) {
      for (const k of keys) {
        expect(theme.colors[k as keyof typeof theme.colors], `${theme.id}.${k}`).toMatch(
          /^#[0-9a-f]{6}$/,
        );
      }
    }
  });
});

describe('computeTodayBg — "오늘" 카드 배경 파생', () => {
  it('테마마다 다른 값이 나온다 (고정색으로 되돌리면 실패)', () => {
    const values = PRESET_THEMES.map((t) => computeTodayBg(t.colors));
    // 13개 테마가 전부 같은 색이면(= 상수 회귀) 고유값이 1개로 줄어든다.
    expect(new Set(values).size).toBeGreaterThan(PRESET_THEMES.length / 2);
  });

  it('더 이상 하늘색(#dbeafe) 하드코딩이 아니다', () => {
    const lightIds: PresetThemeId[] = ['light', 'pastel', 'notion-light', 'kraft-light'];
    for (const id of lightIds) {
      expect(computeTodayBg(getPresetTheme(id).colors), id).not.toBe('#dbeafe');
    }
  });

  it('테마 accent 의 색조를 따라간다 — 파스텔은 보라, 크래프트는 따뜻한 쪽', () => {
    const pastel = rgb(computeTodayBg(getPresetTheme('pastel').colors));
    // 보라 계열: 파랑 채널이 초록보다 높다
    expect(pastel[2]).toBeGreaterThan(pastel[1]);

    const kraft = rgb(computeTodayBg(getPresetTheme('kraft-light').colors));
    // 따뜻한 계열: 빨강 채널이 파랑보다 높다
    expect(kraft[0]).toBeGreaterThan(kraft[2]);
  });

  it('뉴트럴 계열의 오늘 배경은 무채색을 유지한다', () => {
    for (const id of ['neutral-light', 'neutral-dark'] as const) {
      expect(chroma(computeTodayBg(getPresetTheme(id).colors)), id).toBeLessThanOrEqual(6);
    }
  });

  it('오늘 배경은 카드 배경과 구분될 만큼 차이가 난다', () => {
    for (const theme of PRESET_THEMES) {
      const today = rgb(computeTodayBg(theme.colors));
      const bg = rgb(theme.colors.bg);
      const diff =
        Math.abs(today[0] - bg[0]) + Math.abs(today[1] - bg[1]) + Math.abs(today[2] - bg[2]);
      expect(diff, `${theme.id} 오늘 배경이 bg 와 거의 같음`).toBeGreaterThan(20);
    }
  });

  it('항상 유효한 6자리 HEX 를 반환한다', () => {
    for (const theme of PRESET_THEMES) {
      expect(computeTodayBg(theme.colors), theme.id).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
