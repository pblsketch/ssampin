import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Button — 쌤핀 디자인 시스템 공용 버튼.
 * Linear(radius/duration) + Toss(active scale) 기법 혼합.
 *
 * Tailwind 기본 `rounded-lg/xl` 유틸과 충돌 방지 위해 sp- 네임스페이스 사용.
 *
 * @example
 *   <Button variant="primary">저장</Button>
 *   <Button variant="ghost" size="sm" leftIcon={<span className="material-symbols-outlined">add</span>}>추가</Button>
 */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-sp-accent text-white hover:brightness-110 active:brightness-95 ' +
    'shadow-sp-none hover:shadow-sp-accent',
  secondary:
    'bg-sp-card text-sp-text border border-sp-border ' +
    'hover:bg-sp-surface hover:border-sp-accent/30',
  ghost:
    'bg-transparent text-sp-muted hover:text-sp-text hover:bg-sp-text/5',
  danger:
    'bg-red-500 text-white hover:brightness-110 active:brightness-95',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
  md: 'h-9 px-4 text-sm rounded-md gap-2',
  lg: 'h-11 px-5 text-base rounded-lg gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center font-sp-medium whitespace-nowrap',
    'transition-all duration-sp-base ease-sp-out',
    'active:scale-[0.98] hover:-translate-y-px',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100',
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled} {...rest}>
      {leftIcon && <span className="shrink-0 inline-flex">{leftIcon}</span>}
      {children && <span>{children}</span>}
      {rightIcon && <span className="shrink-0 inline-flex">{rightIcon}</span>}
    </button>
  );
}
