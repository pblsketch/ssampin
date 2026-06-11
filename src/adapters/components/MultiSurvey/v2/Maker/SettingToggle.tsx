/**
 * SettingToggle — 개별 토글 스위치 + 라벨 + 보조 설명
 *
 * 핵심 규칙:
 * - aria-label 필수
 * - prefers-reduced-motion 존중 (motion-reduce: 클래스)
 * - sp-* 토큰: sp-accent, sp-muted, sp-text, sp-duration-base
 * - DN-01: 옵션 토글은 즉시(동기) 호출 — 부모가 store action 직접 호출
 */

import { useId } from 'react';

interface SettingToggleProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  /** 접근성 보조: 화면에 표시되는 label만으로 충분치 않을 때 보조 안내 */
  readonly ariaLabel?: string;
}

export function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: SettingToggleProps): JSX.Element {
  const id = useId();
  const ariaText = ariaLabel ?? `${label}${checked ? ' 켜짐' : ' 꺼짐'}`;

  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <label htmlFor={id} className="flex-1 cursor-pointer select-none">
        <span className="block text-sm font-sp-medium text-sp-text">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-sp-muted leading-relaxed">{description}</span>
        )}
      </label>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaText}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full',
          'transition-colors duration-sp-base motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          checked ? 'bg-sp-accent' : 'bg-sp-muted/40',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm',
            'transition-transform duration-sp-base motion-reduce:transition-none',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}
