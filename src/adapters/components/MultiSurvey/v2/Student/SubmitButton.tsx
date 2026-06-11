/**
 * SubmitButton — T04(explicitSubmitButton) ON 시만 렌더되는 명시 제출 버튼.
 *
 * - 비활성 상태에서는 dim + cursor-not-allowed.
 * - sp-accent 강조. tap feedback scale (prefers-reduced-motion 존중).
 */

import { memo, useEffect, useState } from 'react';

interface SubmitButtonProps {
  readonly onSubmit: () => void;
  readonly disabled?: boolean;
  readonly label?: string;
}

function SubmitButtonImpl({ onSubmit, disabled, label }: SubmitButtonProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  const isDisabled = disabled === true;
  const text = label ?? '제출하기';

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={isDisabled}
      aria-label={text}
      aria-disabled={isDisabled}
      className={`w-full rounded-2xl bg-sp-accent px-6 py-4 font-sp-bold text-sp-accent-fg transition-all duration-200 ${
        reduceMotion ? '' : 'active:scale-95'
      } ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
      style={{
        backgroundColor: 'var(--color-accent, #60a5fa)',
        color: 'var(--color-bg, #0a0e17)',
        fontSize: 18,
      }}
    >
      {text}
    </button>
  );
}

export const SubmitButton = memo(SubmitButtonImpl);
