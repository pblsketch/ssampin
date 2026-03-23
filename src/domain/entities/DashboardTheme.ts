import type { FontFamily, ShadowLevel, WidgetStyleSettings } from './Settings';

export type PresetThemeId = 'dark' | 'light' | 'pastel' | 'navy' | 'forest' | 'sunset' | 'mono' | 'notion-light' | 'notion-dark' | 'kraft-light' | 'kraft-dark';

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
    colors: { bg: '#0a0e17', surface: '#131a2b', card: '#1a2332', border: '#2a3548', accent: '#3b82f6', highlight: '#f59e0b', text: '#e2e8f0', muted: '#94a3b8' },
  },
  {
    id: 'light',
    name: '라이트',
    colors: { bg: '#e0e2e6', surface: '#d7d9de', card: '#e6e7eb', border: '#b0b5bf', accent: '#2563eb', highlight: '#d97706', text: '#0f172a', muted: '#64748b' },
  },
  {
    id: 'pastel',
    name: '파스텔',
    colors: { bg: '#faf5ff', surface: '#f3e8ff', card: '#ede4f5', border: '#d8b4fe', accent: '#a855f7', highlight: '#e879f9', text: '#3b0764', muted: '#7c3aed' },
  },
  {
    id: 'navy',
    name: '네이비',
    colors: { bg: '#0c1929', surface: '#132241', card: '#1a2d50', border: '#2a4066', accent: '#60a5fa', highlight: '#fbbf24', text: '#dbeafe', muted: '#93c5fd' },
  },
  {
    id: 'forest',
    name: '포레스트',
    colors: { bg: '#0a1a0f', surface: '#112318', card: '#1a3322', border: '#2a5435', accent: '#4ade80', highlight: '#fbbf24', text: '#dcfce7', muted: '#86efac' },
  },
  {
    id: 'sunset',
    name: '선셋',
    colors: { bg: '#1a0e0a', surface: '#2d1810', card: '#3d2218', border: '#5c3a2a', accent: '#f97316', highlight: '#fbbf24', text: '#fff7ed', muted: '#fdba74' },
  },
  {
    id: 'mono',
    name: '모노',
    colors: { bg: '#111111', surface: '#1a1a1a', card: '#222222', border: '#3a3a3a', accent: '#ffffff', highlight: '#a3a3a3', text: '#e5e5e5', muted: '#a3a3a3' },
  },
  {
    id: 'notion-light',
    name: '노션',
    colors: { bg: '#ffffff', surface: '#f7f6f3', card: '#f5f5f3', border: '#e9e9e7', accent: '#2383e2', highlight: '#c29343', text: '#37352f', muted: '#787774' },
    styleHint: { borderRadius: 4, cardGap: 12, showBorder: false, shadow: 'none', fontFamily: 'pretendard' },
  },
  {
    id: 'notion-dark',
    name: '노션 다크',
    colors: { bg: '#191919', surface: '#202020', card: '#252525', border: '#363636', accent: '#447acb', highlight: '#c19138', text: '#d4d4d4', muted: '#9b9b9b' },
    styleHint: { borderRadius: 4, cardGap: 12, showBorder: false, shadow: 'none', fontFamily: 'pretendard' },
  },
  {
    id: 'kraft-light',
    name: '크래프트',
    colors: { bg: '#f5efe6', surface: '#ebe3d6', card: '#f9f4ec', border: '#d5c4ad', accent: '#c07830', highlight: '#8b6914', text: '#3d2c1e', muted: '#8c7b6a' },
    styleHint: { borderRadius: 8, cardGap: 14, showBorder: true, shadow: 'sm', fontFamily: 'pretendard' },
  },
  {
    id: 'kraft-dark',
    name: '크래프트 다크',
    colors: { bg: '#1c1610', surface: '#261e16', card: '#302518', border: '#4a3a28', accent: '#d4943c', highlight: '#c07830', text: '#ddd0c0', muted: '#9c8a74' },
    styleHint: { borderRadius: 8, cardGap: 14, showBorder: true, shadow: 'sm', fontFamily: 'pretendard' },
  },
] as const;

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
};

export const SHADOW_MAP: Record<ShadowLevel, string> = {
  none: 'none',
  sm: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
  md: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
  lg: '0 8px 24px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.12)',
};

export const FONT_MAP: Record<FontFamily, string> = {
  'noto-sans': '"Noto Sans KR", sans-serif',
  'pretendard': '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
  'ibm-plex': '"IBM Plex Sans KR", "Noto Sans KR", sans-serif',
  'nanum-gothic': '"NanumGothic", "Noto Sans KR", sans-serif',
  'nanum-square': '"NanumSquare", "Noto Sans KR", sans-serif',
  'gowun-dodum': '"Gowun Dodum", "Noto Sans KR", sans-serif',
  'suit': '"SUIT Variable", "SUIT", "Noto Sans KR", sans-serif',
  'wanted-sans': '"Wanted Sans Variable", "Wanted Sans", "Noto Sans KR", sans-serif',
  'paperlogy': '"Paperlogy", "Noto Sans KR", sans-serif',
  'kakao-big': '"KakaoBig", "Noto Sans KR", sans-serif',
  'spoqa-han-sans': '"Spoqa Han Sans Neo", "Noto Sans KR", sans-serif',
};

export const BACKGROUND_PRESETS = [
  { id: 'geometric', name: '기하학', thumbnail: '◇' },
  { id: 'gradient-warm', name: '따뜻한 그라데이션', thumbnail: '🌅' },
  { id: 'gradient-cool', name: '시원한 그라데이션', thumbnail: '🌊' },
  { id: 'dots', name: '도트', thumbnail: '⚬' },
  { id: 'waves', name: '웨이브', thumbnail: '〰️' },
] as const;

export const BG_PATTERN_CSS: Record<string, string> = {
  'geometric': 'repeating-linear-gradient(45deg, transparent, transparent 20px, var(--sp-border) 20px, var(--sp-border) 21px)',
  'gradient-warm': 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
  'gradient-cool': 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 50%, #10b981 100%)',
  'dots': 'radial-gradient(circle, var(--sp-border) 1px, transparent 1px)',
  'waves': 'repeating-linear-gradient(0deg, transparent, transparent 14px, var(--sp-border) 14px, var(--sp-border) 15px)',
};

export const COLOR_SWATCHES: Record<string, readonly string[]> = {
  bg: [
    '#0a0e17', '#1a1a2e', '#0c1929', '#0a1a0f', '#1a0e0a', '#111111',
    '#e0e2e6', '#faf5ff', '#f0fdf4', '#fff7ed',
  ],
  card: [
    '#1a2332', '#1e293b', '#1a2d50', '#1a3322', '#3d2218', '#222222',
    '#e6e7eb', '#f5f3ff', '#ecfdf5', '#ffffff',
  ],
  accent: [
    '#4285d6', '#cc5a5a', '#35a862', '#9564cc', '#d47a35',
    '#c45a8e', '#1a9ab0', '#bfa01c', '#626bc8', '#24a090',
  ],
  text: [
    '#ffffff', '#e2e8f0', '#f1f5f9', '#fef3c7', '#dcfce7',
    '#0f172a', '#1e293b', '#334155', '#1a1a1a', '#374151',
  ],
  border: [
    '#2a3548', '#3a3a3a', '#363636', '#2a4066', '#2a5435', '#5c3a2a',
    '#b0b5bf', '#d8b4fe', '#e9e9e7', '#ffffff',
  ],
};
