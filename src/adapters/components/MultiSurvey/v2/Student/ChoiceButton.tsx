/**
 * ChoiceButton — 객관식 보기 탭 버튼 (모바일).
 *
 * - 선택 시 `bg-[--color-accent]/20 border-[--color-accent]` 강조.
 * - tap feedback scale (prefers-reduced-motion 존중).
 * - aria-label 필수 (DN-10 접근성).
 */

import { memo, useEffect, useState } from 'react';

interface ChoiceButtonProps {
  readonly label: string;
  readonly text: string;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  /** aria-label 보조 (예: "1번 보기 — 정답 후보 1") */
  readonly ariaLabel?: string;
}

function ChoiceButtonImpl({
  label,
  text,
  selected,
  disabled,
  onSelect,
  ariaLabel,
}: ChoiceButtonProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  const handleClick = (): void => {
    if (disabled === true) return;
    onSelect();
  };

  const aria = ariaLabel ?? `${label}번 보기: ${text}`;

  return (
    <button
      type="button"
      aria-label={aria}
      aria-pressed={selected}
      disabled={disabled === true}
      onClick={handleClick}
      className={`flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all duration-200 ${reduceMotion ? '' : 'active:scale-95'} ${
        selected
          ? 'border-sp-accent bg-sp-accent/20'
          : 'border-sp-border bg-sp-card hover:bg-sp-accent/10'
      } ${disabled === true ? 'opacity-40' : ''}`}
      style={{
        borderColor: selected ? 'var(--color-accent, #60a5fa)' : 'var(--color-border, #334155)',
        backgroundColor: selected
          ? 'color-mix(in srgb, var(--color-accent, #60a5fa) 20%, transparent)'
          : 'var(--color-card, #1a1f2e)',
      }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-sp-bold"
        style={{
          backgroundColor: selected ? 'var(--color-accent, #60a5fa)' : 'var(--color-bg, #0a0e17)',
          color: selected ? 'var(--color-bg, #0a0e17)' : 'var(--color-text, #e2e8f0)',
          fontSize: 18,
        }}
        aria-hidden="true"
      >
        {label}
      </span>
      <span
        className="flex-1 font-sp-medium"
        style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 16 }}
      >
        {text}
      </span>
    </button>
  );
}

export const ChoiceButton = memo(ChoiceButtonImpl);
