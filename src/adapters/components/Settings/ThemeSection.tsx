import { useCallback, useMemo } from 'react';
import { PRESET_THEMES } from '@domain/entities/DashboardTheme';
import type { DashboardTheme, PresetThemeId, ThemeColors } from '@domain/entities/DashboardTheme';
import type { DashboardThemeSettings } from '@domain/entities/Settings';
import { ThemePreviewCard } from './ThemePreviewCard';
import { CustomThemePanel } from './CustomThemePanel';

interface ThemeSectionProps {
  dashboardTheme: DashboardThemeSettings | undefined;
  onChange: (theme: DashboardThemeSettings) => void;
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const DEFAULT_CUSTOM_COLORS: ThemeColors = PRESET_THEMES[0]!.colors;

export function ThemeSection({ dashboardTheme, onChange }: ThemeSectionProps) {
  const currentId = dashboardTheme?.presetId ?? 'dark';
  const customColors = dashboardTheme?.customColors ?? DEFAULT_CUSTOM_COLORS;

  const customTheme: DashboardTheme = useMemo(() => ({
    id: 'custom',
    name: '커스텀',
    colors: customColors,
  }), [customColors]);

  const handlePresetClick = useCallback((id: PresetThemeId) => {
    onChange({ presetId: id, customColors: dashboardTheme?.customColors });
  }, [onChange, dashboardTheme?.customColors]);

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
            onClick={() => handlePresetClick(theme.id as PresetThemeId)}
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
