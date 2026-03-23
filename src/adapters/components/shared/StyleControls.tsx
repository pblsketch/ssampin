import { useState } from 'react';

interface StyleSectionProps {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}

export function StyleSection({ title, children, compact = false }: StyleSectionProps) {
  return (
    <div>
      <h3 className={`mb-2 font-semibold uppercase tracking-wider text-sp-muted ${compact ? 'text-detail' : 'text-xs'}`}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  compact?: boolean;
}

export function SliderRow({ label, min, max, step, value, unit, onChange, compact = false }: SliderRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sp-muted shrink-0 ${compact ? 'text-caption w-14' : 'text-xs w-20'}`}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[var(--sp-accent)]"
      />
      <span className={`text-sp-muted tabular-nums w-10 text-right ${compact ? 'text-caption' : 'text-xs'}`}>
        {value}{unit}
      </span>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  compact?: boolean;
}

export function ToggleRow({ label, checked, onChange, compact = false }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sp-muted flex-1 ${compact ? 'text-caption' : 'text-xs'}`}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-sp-accent' : 'bg-sp-border'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

interface SelectRowProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  compact?: boolean;
}

export function SelectRow<T extends string>({ label, value, options, onChange, compact = false }: SelectRowProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sp-muted shrink-0 ${compact ? 'text-caption w-14' : 'text-xs w-20'}`}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={`flex-1 bg-sp-surface border border-sp-border/50 rounded-lg px-2 py-1 text-sp-text ${compact ? 'text-detail' : 'text-xs'}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface ColorSwatchRowProps {
  label: string;
  value: string | null;
  themeDefault: string;
  swatches: readonly string[];
  onChange: (v: string) => void;
  onReset: () => void;
  compact?: boolean;
}

export function ColorSwatchRow({ label, value, themeDefault, swatches, onChange, onReset, compact = false }: ColorSwatchRowProps) {
  const currentColor = value ?? themeDefault;
  const [hexInput, setHexInput] = useState('');
  const [showHexInput, setShowHexInput] = useState(false);

  const applyHex = () => {
    const raw = hexInput.trim();
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      onChange(hex);
      setShowHexInput(false);
      setHexInput('');
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`text-sp-muted shrink-0 ${compact ? 'text-caption w-10' : 'text-xs w-20'}`}>{label}</span>
        <div
          className={`rounded border border-sp-border/50 shrink-0 ${compact ? 'w-5 h-5' : 'w-6 h-6'}`}
          style={{ background: currentColor }}
        />
        {showHexInput ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              type="text"
              value={hexInput}
              onChange={(e) => setHexInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyHex();
                if (e.key === 'Escape') { setShowHexInput(false); setHexInput(''); }
              }}
              placeholder="#000000"
              maxLength={7}
              autoFocus
              className={`w-full bg-sp-surface border border-sp-border/50 rounded px-1.5 py-0.5 text-sp-text font-mono placeholder:text-sp-muted/50 focus:border-sp-accent outline-none ${compact ? 'text-caption' : 'text-xs'}`}
            />
            <button
              onClick={applyHex}
              className={`text-sp-accent hover:text-sp-accent/80 shrink-0 font-medium ${compact ? 'text-tiny' : 'text-caption'}`}
            >
              적용
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setShowHexInput(true); setHexInput(currentColor); }}
            className={`text-sp-muted hover:text-sp-text flex-1 truncate text-left transition-colors font-mono ${compact ? 'text-caption' : 'text-xs'}`}
            title="클릭하여 색상 코드 입력"
          >
            {value ?? '테마 기본'}
          </button>
        )}
        {value && !showHexInput && (
          <button
            onClick={onReset}
            className={`text-sp-muted hover:text-red-400 transition-colors shrink-0 ${compact ? 'text-tiny' : 'text-caption'}`}
          >
            초기화
          </button>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-wrap">
        {swatches.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`rounded-sm border transition-all hover:scale-125 ${compact ? 'w-4 h-4' : 'w-5 h-5'} ${
              currentColor.toLowerCase() === color.toLowerCase()
                ? 'border-sp-accent ring-1 ring-sp-accent scale-110'
                : 'border-sp-border/30'
            }`}
            style={{ background: color }}
            title={color}
          />
        ))}
        <label
          className={`relative rounded-sm border border-dashed border-sp-border/50 cursor-pointer hover:border-sp-accent/50 transition-colors flex items-center justify-center shrink-0 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`}
          title="직접 선택"
        >
          <span className="text-[7px] text-sp-muted leading-none">+</span>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}
