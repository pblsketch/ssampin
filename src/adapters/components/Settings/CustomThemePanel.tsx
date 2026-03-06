import { useCallback } from 'react';
import type { ThemeColors } from '@domain/entities/DashboardTheme';

interface CustomThemePanelProps {
  colors: ThemeColors;
  onChange: (colors: ThemeColors) => void;
  onReset: () => void;
}

interface ColorFieldConfig {
  key: keyof ThemeColors;
  label: string;
}

const COLOR_FIELDS: readonly ColorFieldConfig[] = [
  { key: 'bg', label: '배경색' },
  { key: 'surface', label: '서피스색' },
  { key: 'card', label: '카드색' },
  { key: 'border', label: '테두리색' },
  { key: 'accent', label: '강조색' },
  { key: 'highlight', label: '하이라이트색' },
  { key: 'text', label: '텍스트색' },
  { key: 'muted', label: '보조텍스트색' },
];

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function CustomThemePanel({ colors, onChange, onReset }: CustomThemePanelProps) {
  const handleColorChange = useCallback((key: keyof ThemeColors, value: string) => {
    if (isValidHex(value)) {
      onChange({ ...colors, [key]: value });
    }
  }, [colors, onChange]);

  const handleTextInput = useCallback((key: keyof ThemeColors, raw: string) => {
    let value = raw.trim();
    if (value && !value.startsWith('#')) {
      value = '#' + value;
    }
    if (isValidHex(value)) {
      onChange({ ...colors, [key]: value });
    }
  }, [colors, onChange]);

  return (
    <div className="bg-sp-surface/50 rounded-xl border border-sp-border p-4">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-sm font-semibold text-sp-text">커스텀 색상 편집</h5>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-sp-muted hover:text-sp-accent transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          기본값으로 리셋
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {COLOR_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="color"
              value={colors[key]}
              onChange={(e) => handleColorChange(key, e.target.value)}
              className="w-8 h-8 rounded-lg border border-sp-border cursor-pointer shrink-0 [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
            />
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-sp-muted block mb-0.5">{label}</label>
              <input
                type="text"
                value={colors[key]}
                onChange={(e) => handleTextInput(key, e.target.value)}
                className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1 text-xs text-sp-text font-mono focus:outline-none focus:ring-1 focus:ring-sp-accent"
                maxLength={7}
                placeholder="#000000"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
