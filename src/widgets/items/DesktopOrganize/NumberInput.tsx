import type { ChangeEvent } from 'react';

interface NumberInputProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * 작은 숫자 입력 (1~6 범위 그리드 차원용).
 * 직접 타이핑 + ↑↓ 화살표 클릭으로 값 변경.
 */
export function NumberInput({ value, min, max, onChange, label, disabled }: NumberInputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') return;
    const next = Number.parseInt(raw, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.max(min, Math.min(max, next));
    onChange(clamped);
  };

  const step = (delta: number) => {
    const next = value + delta;
    if (next < min || next > max) return;
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
        className="w-12 rounded-lg bg-sp-card border border-sp-border px-2 py-1 text-center text-sm text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-50"
      />
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => step(1)}
          disabled={disabled || value >= max}
          aria-label={`${label} 증가`}
          className="text-sp-muted hover:text-sp-text disabled:opacity-30 transition-colors motion-reduce:transition-none leading-none"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            arrow_drop_up
          </span>
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={disabled || value <= min}
          aria-label={`${label} 감소`}
          className="text-sp-muted hover:text-sp-text disabled:opacity-30 transition-colors motion-reduce:transition-none leading-none"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            arrow_drop_down
          </span>
        </button>
      </div>
    </div>
  );
}
