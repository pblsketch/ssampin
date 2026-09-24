import { useRef, useState } from 'react';
import { MAX_TIMER_NAME_LENGTH } from '@domain/rules/timerSettings';

/**
 * 활동 이름 한 줄 입력(ADR-139, spec 3-4, 설계 5-4).
 * 누르면 최근에 쓴 이름(최대 8개)을 제안한다. 진행 중에도 고칠 수 있다.
 */
export function ActivityNameInput({
  value,
  onChange,
  recentNames,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly recentNames: readonly string[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestions = recentNames.filter((n) => n !== value);

  return (
    <div className="relative w-full max-w-[280px]">
      <input
        type="text"
        value={value}
        maxLength={MAX_TIMER_NAME_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (closeTimer.current) clearTimeout(closeTimer.current);
          setOpen(true);
        }}
        onBlur={() => {
          // 제안 칩을 누를 틈을 준다.
          closeTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
        placeholder="활동 이름(선택)"
        aria-label="활동 이름"
        className="w-full text-center text-base text-sp-text placeholder:text-sp-muted bg-transparent border-b border-sp-border hover:border-sp-muted focus:border-sp-accent focus:outline-none py-1.5 transition-colors"
      />
      {open && suggestions.length > 0 && (
        <div
          data-sp-floating
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-sp-dropdown flex flex-wrap gap-1.5 justify-center w-[280px] p-2 bg-sp-card border border-sp-border rounded-lg shadow-lg"
        >
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className="px-2.5 py-1 rounded-full text-xs bg-sp-bg border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
