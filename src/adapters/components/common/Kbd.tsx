import type { ReactNode } from 'react';

/**
 * Kbd — 단축키 시각화 뱃지 컴포넌트.
 * Raycast 레퍼런스. JetBrains Mono fallback.
 *
 * @example
 *   <Kbd>Ctrl</Kbd><Kbd>K</Kbd>
 *   <Kbd combo="Ctrl+K" />
 */

interface KbdProps {
  children?: ReactNode;
  combo?: string;
  className?: string;
  title?: string;
}

const KEY_LABEL: Record<string, string> = {
  Ctrl: 'Ctrl',
  Cmd: '⌘',
  Meta: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  Option: '⌥',
  Enter: '↵',
  Return: '↵',
  Escape: 'Esc',
  Esc: 'Esc',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Space: '␣',
};

function formatKey(key: string): string {
  return KEY_LABEL[key] ?? key;
}

export function Kbd({ children, combo, className = '', title }: KbdProps) {
  const baseClass =
    'inline-flex items-center rounded border border-sp-border bg-sp-card ' +
    'px-1.5 py-0.5 font-mono text-detail font-sp-medium leading-none text-sp-muted ' +
    'select-none';

  if (combo) {
    const keys = combo.split('+').map((k) => k.trim());
    return (
      <span className={`inline-flex items-center gap-0.5 ${className}`} title={title ?? combo}>
        {keys.map((key, idx) => (
          <span key={`${key}-${idx}`} className="inline-flex items-center gap-0.5">
            {idx > 0 && <span className="text-caption text-sp-muted/50">+</span>}
            <kbd className={baseClass}>{formatKey(key)}</kbd>
          </span>
        ))}
      </span>
    );
  }

  return (
    <kbd className={`${baseClass} ${className}`} title={title}>
      {children}
    </kbd>
  );
}
