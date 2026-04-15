interface LockedCardProps {
  icon: string;
  iconBg: string;
  title: string;
  onScrollToAccount: () => void;
}

export function LockedCard({ icon, iconBg, title, onScrollToAccount }: LockedCardProps) {
  return (
    <section className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5 opacity-60">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-sp-text truncate">{title}</h3>
          <p className="text-xs text-sp-muted mt-0.5">
            계정 연결 후 사용할 수 있어요
          </p>
        </div>
        <button
          type="button"
          onClick={onScrollToAccount}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-sp-border text-xs font-medium text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-sm">arrow_upward</span>
          연결
        </button>
      </div>
    </section>
  );
}
