import { useCallback, useMemo } from 'react';
import type { Settings, DashboardThemeSettings, FontFamily, WidgetStyleSettings, ShadowLevel } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { ThemeSection } from '../ThemeSection';
import { FontSelector } from '../FontSelector';
import {
  DEFAULT_WIDGET_STYLE,
  PRESET_THEMES,
  COLOR_SWATCHES,
  getPresetTheme,
} from '@domain/entities/DashboardTheme';
import type { ThemeColors, PresetThemeId } from '@domain/entities/DashboardTheme';
import { SliderRow, ToggleRow, SelectRow, ColorSwatchRow } from '../../shared/StyleControls';
import { BackgroundImageSection } from '../../shared/BackgroundImageSection';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function DisplayTab({ draft, patch }: Props) {
  const patchDashboardTheme = useCallback((t: DashboardThemeSettings) => {
    patch({ dashboardTheme: t });
  }, [patch]);

  const patchWidgetStyle = useCallback((s: WidgetStyleSettings) => {
    patch({ widgetStyle: s });
  }, [patch]);

  const selectedFont: FontFamily = draft.fontFamily ?? 'noto-sans';

  const ws = { ...DEFAULT_WIDGET_STYLE, ...draft.widgetStyle };

  const themeColors: ThemeColors = useMemo(() => {
    const pid = draft.dashboardTheme?.presetId;
    if (pid && pid !== 'custom') return getPresetTheme(pid as PresetThemeId).colors;
    if (pid === 'custom' && draft.dashboardTheme?.customColors) return draft.dashboardTheme.customColors;
    return PRESET_THEMES[0]!.colors;
  }, [draft.dashboardTheme]);

  const updateStyle = useCallback((p: Partial<WidgetStyleSettings>) => {
    patch({ widgetStyle: { ...ws, ...p } });
  }, [patch, ws]);

  return (
    <SettingsSection
      icon="palette"
      iconColor="bg-yellow-500/10 text-yellow-500"
      title="디스플레이"
    >
      <div className="grid grid-cols-1 gap-8">
        {/* 테마 설정 */}
        <ThemeSection
          dashboardTheme={draft.dashboardTheme}
          widgetStyle={draft.widgetStyle}
          onChange={patchDashboardTheme}
          onStyleChange={patchWidgetStyle}
        />

        {/* 투명도 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">투명도</h4>
          <div className="space-y-3">
            <SliderRow label="배경 투명도" min={0} max={100} step={5}
              value={Math.round(draft.widget.opacity * 100)} unit="%"
              onChange={(v) => patch({ widget: { ...draft.widget, opacity: v / 100 } })} />
            <SliderRow label="카드 투명도" min={0} max={100} step={5}
              value={Math.round((draft.widget.cardOpacity ?? 1) * 100)} unit="%"
              onChange={(v) => patch({ widget: { ...draft.widget, cardOpacity: v / 100 } })} />
          </div>
        </div>

        {/* 색상 조정 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">색상 조정</h4>
          <div className="space-y-4">
            <ColorSwatchRow label="배경" value={ws.bgColor} themeDefault={themeColors.bg}
              swatches={COLOR_SWATCHES['bg'] ?? []} onChange={(v) => updateStyle({ bgColor: v })}
              onReset={() => updateStyle({ bgColor: null })} />
            <ColorSwatchRow label="카드" value={ws.cardColor} themeDefault={themeColors.card}
              swatches={COLOR_SWATCHES['card'] ?? []} onChange={(v) => updateStyle({ cardColor: v })}
              onReset={() => updateStyle({ cardColor: null })} />
            <ColorSwatchRow label="강조" value={ws.accentColor} themeDefault={themeColors.accent}
              swatches={COLOR_SWATCHES['accent'] ?? []} onChange={(v) => updateStyle({ accentColor: v })}
              onReset={() => updateStyle({ accentColor: null })} />
            <ColorSwatchRow label="텍스트" value={ws.textColor} themeDefault={themeColors.text}
              swatches={COLOR_SWATCHES['text'] ?? []} onChange={(v) => updateStyle({ textColor: v })}
              onReset={() => updateStyle({ textColor: null })} />
          </div>
        </div>

        {/* 배경 이미지 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">배경 이미지</h4>
          <BackgroundImageSection
            value={ws.backgroundImage}
            opacity={ws.backgroundImageOpacity}
            onChange={(p) => updateStyle(p)}
          />
        </div>

        {/* 카드 모양 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">카드 모양</h4>
          <div className="space-y-3">
            <SliderRow label="둥글기" min={0} max={24} step={2} value={ws.borderRadius} unit="px"
              onChange={(v) => updateStyle({ borderRadius: v })} />
            <SliderRow label="간격" min={4} max={32} step={2} value={ws.cardGap} unit="px"
              onChange={(v) => updateStyle({ cardGap: v })} />
            <ToggleRow label="테두리" checked={ws.showBorder}
              onChange={(v) => updateStyle({ showBorder: v })} />
            {ws.showBorder && (
              <>
                <SliderRow label="두께" min={1} max={4} step={1} value={ws.borderWidth} unit="px"
                  onChange={(v) => updateStyle({ borderWidth: v })} />
                <ColorSwatchRow label="테두리 색상" value={ws.borderColor} themeDefault={themeColors.border}
                  swatches={COLOR_SWATCHES['border'] ?? []} onChange={(v) => updateStyle({ borderColor: v })}
                  onReset={() => updateStyle({ borderColor: null })} />
              </>
            )}
            <SelectRow label="그림자" value={ws.shadow}
              options={[
                { value: 'none', label: '없음' },
                { value: 'sm', label: '약간' },
                { value: 'md', label: '보통' },
                { value: 'lg', label: '강하게' },
              ]}
              onChange={(v) => updateStyle({ shadow: v as ShadowLevel })} />
          </div>
        </div>

        {/* 글꼴 선택 */}
        <FontSelector
          value={selectedFont}
          onChange={(font) => patch({ fontFamily: font })}
        />

        {/* 글꼴 크기 설정 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">글꼴 크기 (Font Size)</h4>
          <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
            {([
              { value: 'small', label: '작게', iconSize: 'text-icon-sm' },
              { value: 'medium', label: '보통', iconSize: 'text-icon' },
              { value: 'large', label: '크게', iconSize: 'text-[18px]' },
              { value: 'xlarge', label: '매우 크게', iconSize: 'text-[20px]' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patch({ fontSize: opt.value })}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-md text-sm font-medium transition-all ${draft.fontSize === opt.value
                  ? 'bg-sp-accent text-white shadow-md'
                  : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                  }`}
              >
                <span className={`material-symbols-outlined ${opt.iconSize}`}>format_size</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 대시보드 글씨 크기 */}
        <div>
          <h4 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-4">대시보드 글씨 크기</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-sp-text">대시보드·위젯 전용 글씨 배율</span>
              <span className="text-sm text-sp-accent font-mono font-medium">
                {Math.round((draft.dashboardFontScale ?? 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.05"
              value={draft.dashboardFontScale ?? 1.0}
              onChange={(e) => patch({ dashboardFontScale: parseFloat(e.target.value) })}
              className="w-full accent-sp-accent"
            />
            <div className="flex justify-between text-caption text-sp-muted">
              <span>80%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
            <div className="flex gap-2 mt-1">
              {([
                { label: '작게', value: 0.85 },
                { label: '기본', value: 1.0 },
                { label: '크게', value: 1.2 },
                { label: '아주 크게', value: 1.4 },
              ] as const).map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => patch({ dashboardFontScale: preset.value })}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                    (draft.dashboardFontScale ?? 1.0) === preset.value
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-text/30'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
