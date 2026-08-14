import type { FontFamily, ShadowLevel, WidgetStyleSettings } from './Settings';

export type PresetThemeId =
  | 'dark'
  | 'light'
  | 'pastel'
  | 'navy'
  | 'forest'
  | 'sunset'
  | 'mono'
  | 'notion-light'
  | 'notion-dark'
  | 'kraft-light'
  | 'kraft-dark'
  | 'neutral-light'
  | 'neutral-dark';

export interface ThemeColors {
  readonly bg: string;
  readonly surface: string;
  readonly card: string;
  readonly border: string;
  readonly accent: string;
  readonly highlight: string;
  readonly text: string;
  readonly muted: string;
}

export interface ThemeStyleHint {
  readonly borderRadius?: number;
  readonly cardGap?: number;
  readonly showBorder?: boolean;
  readonly shadow?: ShadowLevel;
  readonly fontFamily?: FontFamily;
}

export interface DashboardTheme {
  readonly id: PresetThemeId | 'custom';
  readonly name: string;
  readonly colors: ThemeColors;
  readonly styleHint?: ThemeStyleHint;
}

export const PRESET_THEMES: readonly DashboardTheme[] = [
  {
    id: 'dark',
    name: '다크',
    colors: {
      bg: '#0a0e17',
      surface: '#131a2b',
      card: '#1a2332',
      border: '#2a3548',
      accent: '#3b82f6',
      highlight: '#f59e0b',
      text: '#e2e8f0',
      muted: '#94a3b8',
    },
  },
  {
    id: 'light',
    name: '라이트',
    colors: {
      bg: '#e0e2e6',
      surface: '#d7d9de',
      card: '#e6e7eb',
      border: '#b0b5bf',
      accent: '#2563eb',
      highlight: '#d97706',
      text: '#0f172a',
      muted: '#64748b',
    },
  },
  {
    id: 'pastel',
    name: '파스텔',
    colors: {
      bg: '#faf5ff',
      surface: '#f3e8ff',
      card: '#ede4f5',
      border: '#d8b4fe',
      accent: '#a855f7',
      highlight: '#e879f9',
      text: '#3b0764',
      muted: '#7c3aed',
    },
  },
  {
    id: 'navy',
    name: '네이비',
    colors: {
      bg: '#0c1929',
      surface: '#132241',
      card: '#1a2d50',
      border: '#2a4066',
      accent: '#60a5fa',
      highlight: '#fbbf24',
      text: '#dbeafe',
      muted: '#93c5fd',
    },
  },
  {
    id: 'forest',
    name: '포레스트',
    colors: {
      bg: '#0a1a0f',
      surface: '#112318',
      card: '#1a3322',
      border: '#2a5435',
      accent: '#4ade80',
      highlight: '#fbbf24',
      text: '#dcfce7',
      muted: '#86efac',
    },
  },
  {
    id: 'sunset',
    name: '선셋',
    colors: {
      bg: '#1a0e0a',
      surface: '#2d1810',
      card: '#3d2218',
      border: '#5c3a2a',
      accent: '#f97316',
      highlight: '#fbbf24',
      text: '#fff7ed',
      muted: '#fdba74',
    },
  },
  {
    id: 'mono',
    name: '모노',
    colors: {
      bg: '#111111',
      surface: '#1a1a1a',
      card: '#222222',
      border: '#3a3a3a',
      accent: '#ffffff',
      highlight: '#a3a3a3',
      text: '#e5e5e5',
      muted: '#a3a3a3',
    },
  },
  {
    id: 'notion-light',
    name: '노션',
    colors: {
      bg: '#ffffff',
      surface: '#f7f6f3',
      card: '#f5f5f3',
      border: '#e9e9e7',
      accent: '#2383e2',
      highlight: '#c29343',
      text: '#37352f',
      muted: '#787774',
    },
    styleHint: {
      borderRadius: 4,
      cardGap: 12,
      showBorder: false,
      shadow: 'none',
      fontFamily: 'pretendard',
    },
  },
  {
    id: 'notion-dark',
    name: '노션 다크',
    colors: {
      bg: '#191919',
      surface: '#202020',
      card: '#252525',
      border: '#363636',
      accent: '#447acb',
      highlight: '#c19138',
      text: '#d4d4d4',
      muted: '#9b9b9b',
    },
    styleHint: {
      borderRadius: 4,
      cardGap: 12,
      showBorder: false,
      shadow: 'none',
      fontFamily: 'pretendard',
    },
  },
  {
    id: 'kraft-light',
    name: '크래프트',
    colors: {
      bg: '#f5efe6',
      surface: '#ebe3d6',
      card: '#f9f4ec',
      border: '#d5c4ad',
      accent: '#c07830',
      highlight: '#8b6914',
      text: '#3d2c1e',
      muted: '#8c7b6a',
    },
    styleHint: {
      borderRadius: 8,
      cardGap: 14,
      showBorder: true,
      shadow: 'sm',
      fontFamily: 'pretendard',
    },
  },
  {
    id: 'kraft-dark',
    name: '크래프트 다크',
    colors: {
      bg: '#1c1610',
      surface: '#261e16',
      card: '#302518',
      border: '#4a3a28',
      accent: '#d4943c',
      highlight: '#c07830',
      text: '#ddd0c0',
      muted: '#9c8a74',
    },
    styleHint: {
      borderRadius: 8,
      cardGap: 14,
      showBorder: true,
      shadow: 'sm',
      fontFamily: 'pretendard',
    },
  },
  {
    // 무채색 미니멀 — 색을 쓰지 않고 검정 채움으로 강조하는 계열.
    // 회색 배경 위 순백 카드 + 헤어라인 테두리 + 그림자 없음이 핵심.
    // 노션(흰 배경 · 회색 카드 · 파란 accent)과는 배경/카드가 반대이고 accent 가 무채색이다.
    id: 'neutral-light',
    name: '뉴트럴',
    // muted 는 레퍼런스 실측(#8e8e93)보다 한 단계 어둡다. 실측값 그대로 쓰면 배경(#f5f5f7)
    // 대비가 2.99:1 로, 13개 프리셋 중 유일하게 큰 글씨 기준(3.0)조차 못 넘겨 보조 글씨가
    // 배경에 묻힌다. 하루 종일 보는 화면이라 픽셀 충실도보다 읽힘을 택했다(4.66:1).
    colors: {
      bg: '#f5f5f7',
      surface: '#fafafa',
      card: '#ffffff',
      border: '#e6e6ea',
      accent: '#1c1c1e',
      highlight: '#b91c1c',
      text: '#17171a',
      muted: '#6e6e73',
    },
    styleHint: {
      borderRadius: 10,
      cardGap: 14,
      showBorder: true,
      shadow: 'none',
      fontFamily: 'pretendard',
    },
  },
  {
    // 뉴트럴의 어두운 짝 — accent 를 흰색으로 반전해 "검정 채움"의 대칭을 유지한다.
    // accent 위 글자색은 useThemeApplier 의 computeAccentFg 가 자동으로 어둡게 잡는다.
    id: 'neutral-dark',
    name: '뉴트럴 다크',
    colors: {
      bg: '#0b0b0d',
      surface: '#141416',
      card: '#161618',
      border: '#2a2a2e',
      accent: '#fafafa',
      highlight: '#f87171',
      text: '#ededf0',
      muted: '#8e8e93',
    },
    styleHint: {
      borderRadius: 10,
      cardGap: 14,
      showBorder: true,
      shadow: 'none',
      fontFamily: 'pretendard',
    },
  },
] as const;

/**
 * 두 HEX 색을 ratio(0~1) 비율로 섞어 불투명 HEX 를 반환한다.
 * ratio=0 이면 base 그대로, ratio=1 이면 tint 그대로.
 */
function mixHex(tint: string, base: string, ratio: number): string {
  const t = tint.replace('#', '');
  const b = base.replace('#', '');
  const ch = (i: number): string => {
    const tv = parseInt(t.substring(i, i + 2), 16);
    const bv = parseInt(b.substring(i, i + 2), 16);
    return Math.round(tv * ratio + bv * (1 - ratio))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
}

/**
 * 일정 목록의 "오늘" 카드 배경색 — 테마 accent 를 bg 에 옅게 섞어 파생한다.
 *
 * 기존에는 밝은 테마 = #dbeafe(하늘색), 어두운 테마 = 슬레이트 남색으로 고정이었다.
 * 테마별로 색을 정할 자리가 없어 파스텔(보라)·크래프트(베이지)처럼 색조가 다른
 * 테마에서도 오늘 일정만 혼자 파랗게 겉돌았고, 무채색 계열(뉴트럴/모노)에서는
 * 화면에서 유일한 유채색이 된다. accent 파생으로 바꿔 테마 색조를 따라가게 한다.
 *
 * 어두운 테마는 bg 와의 명도 차가 덜 벌어지므로 섞는 비율을 더 크게 잡는다.
 */
export function computeTodayBg(colors: ThemeColors): string {
  const isLightBg = perceivedBrightness(colors.bg) > 0.5;
  return mixHex(colors.accent, colors.bg, isLightBg ? 0.16 : 0.22);
}

/** 색상의 perceived brightness (0~1). 0.5 초과면 밝은 색으로 본다. */
function perceivedBrightness(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function getPresetTheme(id: PresetThemeId): DashboardTheme {
  // PRESET_THEMES는 항상 9개 이상의 요소를 가지므로 [0]은 안전
  return PRESET_THEMES.find((t) => t.id === id) ?? PRESET_THEMES[0]!;
}

export const DEFAULT_WIDGET_STYLE: WidgetStyleSettings = {
  borderRadius: 12,
  cardColor: null,
  bgColor: null,
  accentColor: null,
  textColor: null,
  cardGap: 16,
  showBorder: true,
  borderWidth: 1,
  borderColor: null,
  shadow: 'none',
  backgroundImage: null,
  backgroundImageOpacity: 0.15,
  fontFamily: 'noto-sans',
  gridRowHeight: 80,
  hideWindowBorder: false,
};

export const SHADOW_MAP: Record<ShadowLevel, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
  lg: '0 8px 24px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.12)',
};

export const FONT_MAP: Record<FontFamily, string> = {
  'noto-sans': '"Noto Sans KR", sans-serif',
  pretendard: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
  'ibm-plex': '"IBM Plex Sans KR", "Noto Sans KR", sans-serif',
  'nanum-gothic': '"NanumGothic", "Noto Sans KR", sans-serif',
  'nanum-square': '"NanumSquare", "Noto Sans KR", sans-serif',
  'gowun-dodum': '"Gowun Dodum", "Noto Sans KR", sans-serif',
  suit: '"SUIT Variable", "SUIT", "Noto Sans KR", sans-serif',
  'wanted-sans': '"Wanted Sans Variable", "Wanted Sans", "Noto Sans KR", sans-serif',
  paperlogy: '"Paperlogy", "Noto Sans KR", sans-serif',
  'kakao-big': '"KakaoBig", "Noto Sans KR", sans-serif',
  'spoqa-han-sans': '"Spoqa Han Sans Neo", "Noto Sans KR", sans-serif',
  custom: '"SsampinCustomFont", "Noto Sans KR", sans-serif',
};

export const COLOR_SWATCHES: Record<string, readonly string[]> = {
  bg: [
    '#0a0e17',
    '#1a1a2e',
    '#0c1929',
    '#0a1a0f',
    '#1a0e0a',
    '#111111',
    '#e0e2e6',
    '#faf5ff',
    '#f0fdf4',
    '#fff7ed',
  ],
  card: [
    '#1a2332',
    '#1e293b',
    '#1a2d50',
    '#1a3322',
    '#3d2218',
    '#222222',
    '#e6e7eb',
    '#f5f3ff',
    '#ecfdf5',
    '#ffffff',
  ],
  accent: [
    '#4285d6',
    '#cc5a5a',
    '#35a862',
    '#9564cc',
    '#d47a35',
    '#c45a8e',
    '#1a9ab0',
    '#bfa01c',
    '#626bc8',
    '#24a090',
  ],
  text: [
    '#ffffff',
    '#e2e8f0',
    '#f1f5f9',
    '#fef3c7',
    '#dcfce7',
    '#0f172a',
    '#1e293b',
    '#334155',
    '#1a1a1a',
    '#374151',
  ],
  border: [
    '#2a3548',
    '#3a3a3a',
    '#363636',
    '#2a4066',
    '#2a5435',
    '#5c3a2a',
    '#b0b5bf',
    '#d8b4fe',
    '#e9e9e7',
    '#ffffff',
  ],
};
