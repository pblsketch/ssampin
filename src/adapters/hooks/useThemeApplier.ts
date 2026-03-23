import { useLayoutEffect } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getPresetTheme, PRESET_THEMES } from '@domain/entities/DashboardTheme';
import type { ThemeColors } from '@domain/entities/DashboardTheme';
import { DEFAULT_WIDGET_STYLE, SHADOW_MAP, FONT_MAP } from '@domain/entities/DashboardTheme';
import type { WidgetStyleSettings, FontFamily } from '@domain/entities/Settings';
import { getFontPreset } from '@domain/entities/FontPreset';

/**
 * HEX (#rrggbb) 를 "r, g, b" RGB 문자열로 변환
 */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * 색상의 perceived brightness (0~1)
 * 0.55 이상이면 "밝은 색"으로 판단하여 어두운 전경색 필요
 */
function perceivedBrightness(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isLightColor(hex: string): boolean {
  return perceivedBrightness(hex) > 0.5;
}

/**
 * accent 배경 위 텍스트 색상 자동 결정
 * 밝은 accent → 어두운 텍스트, 어두운 accent → 흰색 텍스트
 */
function computeAccentFg(accent: string): string {
  return perceivedBrightness(accent) > 0.55 ? '#111111' : '#ffffff';
}

/**
 * 테마 색상으로부터 모든 CSS 변수를 document에 적용
 */
function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--sp-bg', colors.bg);
  root.style.setProperty('--sp-surface', colors.surface);
  root.style.setProperty('--sp-card-base', colors.card);
  root.style.setProperty('--sp-card', 'var(--sp-card-base)');
  root.style.setProperty('--sp-border', colors.border);
  root.style.setProperty('--sp-accent', colors.accent);
  root.style.setProperty('--sp-accent-fg', computeAccentFg(colors.accent));
  root.style.setProperty('--sp-highlight', colors.highlight);
  root.style.setProperty('--sp-text', colors.text);
  root.style.setProperty('--sp-muted', colors.muted);
  root.style.setProperty('--sp-widget-rgb', hexToRgb(colors.bg));
  root.style.setProperty('--sp-today-bg', isLightColor(colors.bg) ? '#dbeafe' : 'rgba(30, 41, 59, 0.8)');
  root.style.setProperty('--memo-dot-color', isLightColor(colors.bg) ? 'rgba(0, 0, 0, 0.12)' : '#223149');

  // theme-light/theme-dark CSS 클래스 적용 (기존 CSS 오버라이드 규칙 호환)
  const light = isLightColor(colors.bg);
  root.classList.toggle('theme-light', light);
  root.classList.toggle('theme-dark', !light);
}

/**
 * 현재 settings에서 적용할 테마 색상을 결정
 */
function resolveColors(
  dashboardTheme: { presetId: string; customColors?: ThemeColors } | undefined,
  fallbackTheme: string,
  systemDark: boolean,
): ThemeColors {
  if (dashboardTheme) {
    const { presetId, customColors } = dashboardTheme;
    if (presetId === 'custom' && customColors) return customColors;
    if (presetId !== 'custom') return getPresetTheme(presetId as 'dark').colors;
    return PRESET_THEMES[0]!.colors;
  }
  // 폴백: 기존 theme 필드 사용
  if (fallbackTheme === 'light') return getPresetTheme('light').colors;
  if (fallbackTheme === 'dark') return getPresetTheme('dark').colors;
  return getPresetTheme(systemDark ? 'dark' : 'light').colors;
}

/**
 * 위젯 스타일 설정을 CSS 변수로 적용
 */
function applyWidgetStyle(ws: WidgetStyleSettings | undefined): void {
  const s = { ...DEFAULT_WIDGET_STYLE, ...ws };
  const root = document.documentElement;

  // 색상 오버라이드 → CSS 변수 덮어쓰기
  if (s.cardColor) root.style.setProperty('--sp-card-base', s.cardColor);
  if (s.bgColor) root.style.setProperty('--sp-bg', s.bgColor);
  if (s.accentColor) {
    root.style.setProperty('--sp-accent', s.accentColor);
    root.style.setProperty('--sp-accent-fg', computeAccentFg(s.accentColor));
  }
  if (s.textColor) {
    root.style.setProperty('--sp-text', s.textColor);
    // 텍스트 색상 변경 시 muted도 60% 불투명도로 파생
    const rgb = hexToRgb(s.textColor);
    root.style.setProperty('--sp-muted', `rgba(${rgb}, 0.6)`);
  }

  // 레이아웃 변수
  root.style.setProperty('--sp-card-radius', `${s.borderRadius}px`);
  root.style.setProperty('--sp-card-gap', `${s.cardGap}px`);
  root.style.setProperty('--sp-card-border', s.showBorder ? '1px solid var(--sp-border)' : 'none');
  root.style.setProperty('--sp-card-shadow', SHADOW_MAP[s.shadow]);
  root.style.setProperty('--sp-font-family', FONT_MAP[s.fontFamily]);

  // 폰트 파일 동적 로드
  loadFontStylesheet(s.fontFamily);
}

/**
 * 위젯 스타일에서 선택한 폰트의 stylesheet을 동적으로 로드
 */
function loadFontStylesheet(fontFamily: FontFamily): void {
  if (fontFamily === 'noto-sans') return; // 기본 폰트는 이미 로드됨

  const preset = getFontPreset(fontFamily);

  // customCss (@font-face 직접 정의) 처리
  if (preset.customCss && !document.querySelector(`style[data-ssp-font="${fontFamily}"]`)) {
    const style = document.createElement('style');
    style.dataset.sspFont = fontFamily;
    style.textContent = preset.customCss;
    document.head.appendChild(style);
  }

  // CDN/Google Fonts stylesheet 처리
  const url = preset.googleFontsUrl ?? preset.cdnUrl;
  if (url && !document.querySelector(`link[href="${url}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.sspFont = fontFamily;
    document.head.appendChild(link);
  }
}

/**
 * CSS 변수를 직접 document.documentElement에 주입하여 테마를 적용한다.
 * useLayoutEffect로 렌더링 전에 적용 (FOUC 방지)
 */
export function useThemeApplier(): void {
  const settings = useSettingsStore((s) => s.settings);

  useLayoutEffect(() => {
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const colors = resolveColors(settings.dashboardTheme, settings.theme, systemDark);
    applyThemeColors(colors);
    applyWidgetStyle(settings.widgetStyle);
  }, [settings.dashboardTheme, settings.theme, settings.widgetStyle]);

  // system 테마 변경 감지
  useLayoutEffect(() => {
    if (settings.dashboardTheme) return;
    if (settings.theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const colors = getPresetTheme(mq.matches ? 'dark' : 'light').colors;
      applyThemeColors(colors);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.dashboardTheme, settings.theme]);
}
