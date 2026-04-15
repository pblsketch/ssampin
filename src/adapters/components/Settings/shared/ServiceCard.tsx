import type { ReactNode } from 'react';
import { Toggle } from './Toggle';

interface ServiceCardProps {
  icon: string;
  iconBg: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  collapsedHint?: string;
  children?: ReactNode;
}

export function ServiceCard({
  icon,
  iconBg,
  title,
  description,
  enabled,
  onToggle,
  disabled = false,
  collapsedHint,
  children,
}: ServiceCardProps) {
  return (
    <section
      className={`rounded-xl bg-sp-card ring-1 ring-sp-border p-5 transition-opacity ${
        disabled ? 'opacity-60 pointer-events-none' : ''
      }`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-sp-text truncate">{title}</h3>
          <p className="text-xs text-sp-muted mt-0.5">{description}</p>
        </div>
        <div className="shrink-0">
          <Toggle checked={enabled} onChange={onToggle} />
        </div>
      </div>

      {!enabled && collapsedHint && (
        <p className="text-xs text-sp-muted/80 mt-3">{collapsedHint}</p>
      )}

      {enabled && children && (
        <div className="mt-4 pt-4 border-t border-sp-border/50 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}
