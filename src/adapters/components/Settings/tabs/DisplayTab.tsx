import { useCallback } from 'react';
import type { Settings, DashboardThemeSettings, FontFamily } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { ThemeSection } from '../ThemeSection';
import { FontSelector } from '../FontSelector';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function DisplayTab({ draft, patch }: Props) {
  const patchDashboardTheme = useCallback((t: DashboardThemeSettings) => {
    patch({ dashboardTheme: t });
  }, [patch]);

  const selectedFont: FontFamily = draft.fontFamily ?? 'noto-sans';

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
          onChange={patchDashboardTheme}
        />

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
              { value: 'small', label: '작게', iconSize: 'text-[14px]' },
              { value: 'medium', label: '보통', iconSize: 'text-[16px]' },
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
            <div className="flex justify-between text-[10px] text-sp-muted">
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
