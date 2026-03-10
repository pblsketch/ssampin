import type { ReactNode } from 'react';

interface Props {
  icon: string;
  iconColor: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function SettingsSection({ icon, iconColor, title, description, actions, children }: Props) {
  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <span className="material-symbols-outlined">{icon}</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-sp-text">{title}</h3>
            {description && <p className="text-xs text-sp-muted mt-0.5">{description}</p>}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
