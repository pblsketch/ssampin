import { forwardRef, type ButtonHTMLAttributes } from 'react';

type IconButtonVariant = 'ghost' | 'soft' | 'outline' | 'danger';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols 아이콘 이름 */
  icon: string;
  /** 스크린리더용 label (필수) */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost:   'text-sp-muted hover:text-sp-text hover:bg-sp-text/8',
  soft:    'text-sp-accent bg-sp-accent/10 hover:bg-sp-accent/20',
  outline: 'text-sp-text ring-1 ring-sp-border hover:bg-sp-text/5',
  danger:  'text-red-400 hover:text-red-300 hover:bg-red-500/10',
};

const SIZE_CLASS: Record<IconButtonSize, { btn: string; icon: string }> = {
  sm: { btn: 'p-1 rounded-lg min-w-9 min-h-9',    icon: 'icon-xs' },
  md: { btn: 'p-1.5 rounded-lg min-w-9 min-h-9',  icon: 'icon-sm' },
  lg: { btn: 'p-2 rounded-xl min-w-9 min-h-9',    icon: 'icon-md' },
};

/**
 * 공통 IconButton 컴포넌트.
 *
 * - WCAG 2.5.5 (target size ≥ 24px) 준수: 모든 size에 min-w-9 min-h-9 (36px) 강제
 * - aria-label 필수 (스크린리더 친화)
 * - type="button" 기본값 (form submit 사고 방지)
 *
 * 2026-04-25 신설.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', className = '', type = 'button', ...rest },
  ref,
) {
  const s = SIZE_CLASS[size];
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={[
        'inline-flex items-center justify-center transition-colors duration-sp-base ease-sp-out',
        VARIANT_CLASS[variant],
        s.btn,
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className={`material-symbols-outlined ${s.icon}`} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
});
