/**
 * OXButton — O·X 큰 버튼 (모바일).
 *
 * - O = sp-accent / X = sp-highlight (DN-10 의미 색상).
 * - 큰 탭 타깃 (최소 96px).
 * - aria-label 필수 — DN-10 접근성 규칙.
 */

import { memo, useEffect, useState } from 'react';

type OXVariant = 'O' | 'X';

interface OXButtonProps {
  readonly variant: OXVariant;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

function OXButtonImpl({ variant, selected, disabled, onSelect }: OXButtonProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  const handleClick = (): void => {
    if (disabled === true) return;
    onSelect();
  };

  const isO = variant === 'O';
  const fallbackColor = isO ? '#60a5fa' : '#fbbf24';
  const tokenVar = isO ? 'var(--color-accent, #60a5fa)' : 'var(--color-highlight, #fbbf24)';

  const ariaLabel = isO ? 'O 선택 — 정답' : 'X 선택 — 오답';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      disabled={disabled === true}
      onClick={handleClick}
      className={`flex h-32 w-full items-center justify-center rounded-3xl border-4 font-sp-bold transition-all duration-200 ${reduceMotion ? '' : 'active:scale-95'} ${
        disabled === true ? 'opacity-40' : ''
      }`}
      style={{
        borderColor: tokenVar,
        backgroundColor: selected
          ? tokenVar
          : `color-mix(in srgb, ${fallbackColor} 15%, transparent)`,
        color: selected ? 'var(--color-bg, #0a0e17)' : tokenVar,
        fontSize: 72,
      }}
    >
      <span aria-hidden="true">{variant}</span>
    </button>
  );
}

export const OXButton = memo(OXButtonImpl);
