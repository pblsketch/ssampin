import { useCallback, useMemo } from 'react';
import { PRESET_THEMES, DEFAULT_WIDGET_STYLE } from '@domain/entities/DashboardTheme';
import type { DashboardTheme, PresetThemeId, ThemeColors } from '@domain/entities/DashboardTheme';
import type { DashboardThemeSettings, WidgetStyleSettings } from '@domain/entities/Settings';
import { ThemePreviewCard } from './ThemePreviewCard';
import { CustomThemePanel } from './CustomThemePanel';

interface ThemeSectionProps {
  dashboardTheme: DashboardThemeSettings | undefined;
  widgetStyle: WidgetStyleSettings | undefined;
  onChange: (theme: DashboardThemeSettings) => void;
  onStyleChange: (style: WidgetStyleSettings) => void;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const DEFAULT_CUSTOM_COLORS: ThemeColors = PRESET_THEMES[0]!.colors;

export function ThemeSection({ dashboardTheme, widgetStyle, onChange, onStyleChange }: ThemeSectionProps) {
  const currentId = dashboardTheme?.presetId ?? 'dark';
  const customColors = dashboardTheme?.customColors ?? DEFAULT_CUSTOM_COLORS;

  const customTheme: DashboardTheme = useMemo(() => ({
    id: 'custom',
    name: '커스텀',
    colors: customColors,
  }), [customColors]);

  const handlePresetClick = useCallback((theme: DashboardTheme) => {
    onChange({ presetId: theme.id as PresetThemeId, customColors: dashboardTheme?.customColors });
    // styleHint가 있으면 위젯 스타일도 함께 적용
    if (theme.styleHint) {
      const colorReset = { bgColor: null, cardColor: null, accentColor: null, textColor: null } as const;
      onStyleChange({
        ...(widgetStyle ?? DEFAULT_WIDGET_STYLE),
        ...theme.styleHint,
        ...colorReset,
      });
    }
  }, [onChange, onStyleChange, dashboardTheme?.customColors, widgetStyle]);

  const handleCustomClick = useCallback(() => {
    onChange({ presetId: 'custom', customColors });
  }, [onChange, customColors]);

  const handleCustomColorsChange = useCallback((colors: ThemeColors) => {
    onChange({ presetId: 'custom', customColors: colors });
  }, [onChange]);

  const handleCustomReset = useCallback(() => {
    onChange({ presetId: 'custom', customColors: DEFAULT_CUSTOM_COLORS });
  }, [onChange]);

  return (
    <div>
      <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">
        대시보드 테마
      </h4>

      {/* 프리셋 + 커스텀 그리드 */}
      <div className="flex flex-wrap gap-3">
        {PRESET_THEMES.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            isSelected={currentId === theme.id}
            onClick={() => handlePresetClick(theme)}
          />
        ))}

        {/* 커스텀 카드 */}
        <ThemePreviewCard
          theme={customTheme}
          isSelected={currentId === 'custom'}
          onClick={handleCustomClick}
        />
      </div>

      {/* 커스텀 색상 패널: 커스텀 선택 시에만 열림 */}
      {currentId === 'custom' && (
        <div className="mt-4">
          <CustomThemePanel
            colors={customColors}
            onChange={handleCustomColorsChange}
            onReset={handleCustomReset}
          />
        </div>
      )}
    </div>
  );
}
