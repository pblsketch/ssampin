import { useMemo, useState, Fragment } from 'react';
import { WIDGET_DEFINITIONS } from '../registry';
import { useDashboardConfig } from '../useDashboardConfig';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { WidgetCategory } from '../types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../constants';
import type { WidgetStyleSettings, FontFamily, ShadowLevel } from '@domain/entities/Settings';
import {
  DEFAULT_WIDGET_STYLE,
  PRESET_THEMES,
  COLOR_SWATCHES,
  getPresetTheme,
} from '@domain/entities/DashboardTheme';
import type { ThemeColors, PresetThemeId } from '@domain/entities/DashboardTheme';
import { FONT_PRESETS } from '@domain/entities/FontPreset';
import { StyleSection, SliderRow, ToggleRow, SelectRow, ColorSwatchRow } from '@adapters/components/shared/StyleControls';

type PanelTab = 'widgets' | 'style';

interface WidgetSettingsPanelProps {
  onClose: () => void;
  /** true면 스타일 탭만 표시 (위젯 구성 탭 숨김) */
  styleOnly?: boolean;
}

/**
 * 위젯 설정 인라인 사이드 패널
 * 2탭 구조: 위젯 구성 / 스타일
 * styleOnly=true 면 스타일 탭만 표시
 */
export function WidgetSettingsPanel({ onClose, styleOnly = false }: WidgetSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(styleOnly ? 'style' : 'widgets');

  return (
    <aside className="w-64 shrink-0 border-l-2 border-sp-accent/30 bg-sp-bg flex flex-col animate-slide-in-right shadow-[-4px_0_16px_rgba(0,0,0,0.3)]">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-sp-border/50 px-4 py-3 bg-sp-accent/5">
        <h2 className="text-sm font-bold text-sp-text flex items-center gap-2">
          {styleOnly ? (
            <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: 14 }}>palette</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sp-accent">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
          {styleOnly ? '스타일 편집' : '위젯 설정'}
        </h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
          title="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 탭 헤더: styleOnly일 때는 숨김 */}
      {!styleOnly && (
        <div className="flex border-b border-sp-border/50">
          {(['widgets', 'style'] as PanelTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'text-sp-accent border-b-2 border-sp-accent'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {tab === 'widgets' ? '위젯 구성' : '스타일'}
            </button>
          ))}
        </div>
      )}

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'widgets' && !styleOnly ? <WidgetListTab /> : <StyleTab />}
      </div>

      {/* 푸터 */}
      <PanelFooter activeTab={styleOnly ? 'style' : activeTab} />
    </aside>
  );
}

/* ────────────────────────────────────────────
 * 위젯 구성 탭 (기존 로직)
 * ──────────────────────────────────────────── */
function WidgetListTab() {
  const config = useDashboardConfig((s) => s.config);
  const toggleWidget = useDashboardConfig((s) => s.toggleWidget);

  const widgetsByCategory = useMemo(() => {
    const map = new Map<WidgetCategory, typeof WIDGET_DEFINITIONS>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const def of WIDGET_DEFINITIONS) {
      const list = map.get(def.category);
      if (list) {
        (list as typeof WIDGET_DEFINITIONS[number][]).push(def);
      }
    }
    return map;
  }, []);

  const visibilityMap = useMemo(() => {
    if (!config) return new Map<string, boolean>();
    return new Map(config.widgets.map((w) => [w.widgetId, w.visible]));
  }, [config]);

  const sizeMap = useMemo(() => {
    if (!config) return new Map<string, { colSpan: number; rowSpan: number }>();
    return new Map(config.widgets.map((w) => [w.widgetId, { colSpan: w.colSpan, rowSpan: w.rowSpan }]));
  }, [config]);

  return (
    <div className="px-4 py-3 space-y-5">
      {CATEGORY_ORDER.map((category) => {
        const widgets = widgetsByCategory.get(category);
        if (!widgets || widgets.length === 0) return null;

        return (
          <Fragment key={category}>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sp-muted">
                {CATEGORY_LABELS[category]}
              </h3>
              <div className="space-y-1">
                {widgets.map((def) => {
                  const isVisible = visibilityMap.get(def.id) ?? false;

                  return (
                    <label
                      key={def.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-sp-card/50 transition-colors"
                    >
                      <span className="text-base">{def.icon}</span>
                      <span className="flex-1 text-xs font-medium text-sp-text truncate">
                        {def.name}
                      </span>
                      {isVisible && (
                        <span className="text-[10px] text-sp-muted tabular-nums">
                          {sizeMap.get(def.id)?.colSpan ?? 1}×{sizeMap.get(def.id)?.rowSpan ?? 3}
                        </span>
                      )}
                      <button
                        role="switch"
                        aria-checked={isVisible}
                        onClick={() => toggleWidget(def.id)}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors ${
                          isVisible ? 'bg-sp-accent' : 'bg-sp-border'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                            isVisible ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>
          </Fragment>
        );
      })}

    </div>
  );
}

/* ────────────────────────────────────────────
 * 스타일 탭
 * ──────────────────────────────────────────── */
function StyleTab() {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const ws = { ...DEFAULT_WIDGET_STYLE, ...settings.widgetStyle };

  const themeColors: ThemeColors = useMemo(() => {
    const pid = settings.dashboardTheme?.presetId;
    if (pid && pid !== 'custom') return getPresetTheme(pid as PresetThemeId).colors;
    if (pid === 'custom' && settings.dashboardTheme?.customColors) return settings.dashboardTheme.customColors;
    return PRESET_THEMES[0]!.colors;
  }, [settings.dashboardTheme]);

  const updateStyle = (patch: Partial<WidgetStyleSettings>) => {
    void updateSettings({
      widgetStyle: { ...ws, ...patch },
    });
  };

  return (
    <div className="space-y-5 px-4 py-3">
      <StyleSection title="투명도" compact>
        <SliderRow label="배경 투명도" min={0} max={100} step={5} compact
          value={Math.round(settings.widget.opacity * 100)} unit="%"
          onChange={(v) => void updateSettings({ widget: { ...settings.widget, opacity: v / 100 } })} />
        <SliderRow label="카드 투명도" min={0} max={100} step={5} compact
          value={Math.round((settings.widget.cardOpacity ?? 1) * 100)} unit="%"
          onChange={(v) => void updateSettings({ widget: { ...settings.widget, cardOpacity: v / 100 } })} />
      </StyleSection>

      <StyleSection title="테마" compact>
        <div className="grid grid-cols-3 gap-1.5">
          {(() => {
            const currentPresetId = settings.dashboardTheme?.presetId
              ?? (settings.theme === 'light' ? 'light' : settings.theme === 'dark' ? 'dark' : undefined);
            return PRESET_THEMES.map((t) => {
              const isSelected = currentPresetId === t.id;
              return (
              <button
                key={t.id}
                onClick={() => {
                  const colorReset = { bgColor: null, cardColor: null, accentColor: null, textColor: null } as const;
                  const baseStyle = settings.widgetStyle
                    ? { ...settings.widgetStyle, ...colorReset }
                    : undefined;
                  const mergedStyle = t.styleHint
                    ? { ...(baseStyle ?? DEFAULT_WIDGET_STYLE), ...t.styleHint, ...colorReset }
                    : baseStyle;
                  void updateSettings({
                    dashboardTheme: { presetId: t.id },
                    widgetStyle: mergedStyle,
                  });
                }}
                className={`rounded-lg p-1.5 text-center text-[10px] border transition-all ${
                  isSelected
                    ? 'border-sp-accent ring-1 ring-sp-accent scale-105'
                    : 'border-sp-border/50 hover:border-sp-border'
                }`}
                style={{ background: t.colors.bg, color: t.colors.text }}
              >
                <div className="flex gap-0.5 justify-center mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: t.colors.card }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: t.colors.accent }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: t.colors.highlight }} />
                </div>
                {t.name}
              </button>
            );
            });
          })()}
        </div>
      </StyleSection>

      <StyleSection title="색상 조정" compact>
        <div className="space-y-3">
          <ColorSwatchRow label="배경" value={ws.bgColor} themeDefault={themeColors.bg} compact
            swatches={COLOR_SWATCHES['bg'] ?? []} onChange={(v) => updateStyle({ bgColor: v })}
            onReset={() => updateStyle({ bgColor: null })} />
          <ColorSwatchRow label="카드" value={ws.cardColor} themeDefault={themeColors.card} compact
            swatches={COLOR_SWATCHES['card'] ?? []} onChange={(v) => updateStyle({ cardColor: v })}
            onReset={() => updateStyle({ cardColor: null })} />
          <ColorSwatchRow label="강조" value={ws.accentColor} themeDefault={themeColors.accent} compact
            swatches={COLOR_SWATCHES['accent'] ?? []} onChange={(v) => updateStyle({ accentColor: v })}
            onReset={() => updateStyle({ accentColor: null })} />
          <ColorSwatchRow label="텍스트" value={ws.textColor} themeDefault={themeColors.text} compact
            swatches={COLOR_SWATCHES['text'] ?? []} onChange={(v) => updateStyle({ textColor: v })}
            onReset={() => updateStyle({ textColor: null })} />
        </div>
      </StyleSection>

      <StyleSection title="카드 모양" compact>
        <SliderRow label="둥글기" min={0} max={24} step={2} value={ws.borderRadius} unit="px" compact
          onChange={(v) => updateStyle({ borderRadius: v })} />
        <SliderRow label="간격" min={4} max={32} step={2} value={ws.cardGap} unit="px" compact
          onChange={(v) => updateStyle({ cardGap: v })} />
        <ToggleRow label="테두리" checked={ws.showBorder} compact
          onChange={(v) => updateStyle({ showBorder: v })} />
        {ws.showBorder && (
          <>
            <SliderRow label="두께" min={1} max={4} step={1} value={ws.borderWidth} unit="px" compact
              onChange={(v) => updateStyle({ borderWidth: v })} />
            <ColorSwatchRow label="테두리 색상" value={ws.borderColor} themeDefault={themeColors.border} compact
              swatches={COLOR_SWATCHES['border'] ?? []} onChange={(v) => updateStyle({ borderColor: v })}
              onReset={() => updateStyle({ borderColor: null })} />
          </>
        )}
        <SelectRow label="그림자" value={ws.shadow} compact
          options={[
            { value: 'none', label: '없음' },
            { value: 'sm', label: '약간' },
            { value: 'md', label: '보통' },
            { value: 'lg', label: '강하게' },
          ]}
          onChange={(v) => updateStyle({ shadow: v as ShadowLevel })} />
      </StyleSection>

      <StyleSection title="텍스트" compact>
        <SelectRow label="폰트" value={ws.fontFamily} compact
          options={FONT_PRESETS.map((f) => ({ value: f.id, label: f.name }))}
          onChange={(v) => updateStyle({ fontFamily: v as FontFamily })} />
        <SliderRow label="글씨 크기" min={80} max={150} step={5} compact
          value={Math.round((settings.dashboardFontScale ?? 1.0) * 100)} unit="%"
          onChange={(v) => void updateSettings({ dashboardFontScale: v / 100 })} />
        <div className="flex gap-1 mt-1">
          {([
            { label: '작게', value: 0.85 },
            { label: '기본', value: 1.0 },
            { label: '크게', value: 1.2 },
            { label: '최대', value: 1.4 },
          ] as const).map((p) => (
            <button
              key={p.label}
              onClick={() => void updateSettings({ dashboardFontScale: p.value })}
              className={`flex-1 py-1 text-[10px] rounded-md border transition-all ${
                Math.round((settings.dashboardFontScale ?? 1.0) * 100) === Math.round(p.value * 100)
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                  : 'border-sp-border text-sp-muted hover:text-sp-text'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </StyleSection>
    </div>
  );
}

/* ────────────────────────────────────────────
 * 푸터
 * ──────────────────────────────────────────── */
function PanelFooter({ activeTab }: { activeTab: PanelTab }) {
  const resetToPreset = useDashboardConfig((s) => s.resetToPreset);
  const updateSettings = useSettingsStore((s) => s.update);

  const handleReset = () => {
    if (activeTab === 'widgets') {
      resetToPreset();
    } else {
      void updateSettings({ widgetStyle: undefined });
    }
  };

  return (
    <div className="border-t border-sp-border/50 px-4 py-2.5">
      <button onClick={handleReset}
        className="w-full rounded-lg border border-sp-border/50 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text hover:border-sp-accent/30 transition-colors">
        {activeTab === 'widgets' ? '기본 프리셋으로 초기화' : '스타일 초기화'}
      </button>
    </div>
  );
}
