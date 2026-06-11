/**
 * ToggleGroup — 그룹 헤더 + 토글 목록 (아코디언)
 *
 * sp-* 토큰: sp-surface, sp-border, sp-text, sp-muted, sp-duration-base
 */

import { useState, useId, type ReactNode } from 'react';

interface ToggleGroupProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

export function ToggleGroup({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: ToggleGroupProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const headerId = useId();

  return (
    <section
      className={[
        'bg-sp-surface border border-sp-border rounded-lg overflow-hidden',
        'transition-shadow duration-sp-base motion-reduce:transition-none',
      ].join(' ')}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'w-full flex items-center justify-between px-4 py-3 text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-sp-bg',
          'hover:bg-sp-bg/40 transition-colors duration-sp-base motion-reduce:transition-none',
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className="text-sm font-sp-semibold text-sp-text">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-sp-muted">{subtitle}</div>}
        </div>
        <span
          aria-hidden="true"
          className={[
            'shrink-0 ml-3 text-sp-muted text-icon-sm',
            'transition-transform duration-sp-base motion-reduce:transition-none',
            open ? 'rotate-180' : 'rotate-0',
          ].join(' ')}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="px-4 pb-3 pt-1 border-t border-sp-border/60"
        >
          {children}
        </div>
      )}
    </section>
  );
}
