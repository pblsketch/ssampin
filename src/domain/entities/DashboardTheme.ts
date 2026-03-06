export type PresetThemeId = 'dark' | 'light' | 'pastel' | 'navy' | 'forest' | 'sunset' | 'mono';

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

export interface DashboardTheme {
  readonly id: PresetThemeId | 'custom';
  readonly name: string;
  readonly colors: ThemeColors;
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
] as const;

export function getPresetTheme(id: PresetThemeId): DashboardTheme {
  // PRESET_THEMES는 항상 7개 이상의 요소를 가지므로 [0]은 안전
  return PRESET_THEMES.find((t) => t.id === id) ?? PRESET_THEMES[0]!;
}
