/* ──────────────────────── 통계 카드 컴포넌트 ──────────────────────── */

interface SummaryCardProps {
  label: string;
  value: number;
  icon: string;
  color: string;
}

export function SummaryCard({ label, value, icon, color }: SummaryCardProps) {
  return (
    <div className="rounded-xl bg-sp-card p-4 flex items-center gap-3">
      <span className={`material-symbols-outlined text-2xl ${color}`}>{icon}</span>
      <div>
        <p className="text-xs text-sp-muted">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
      </div>
    </div>
  );
}

interface StatBadgeProps {
  value: number;
  color: string;
}

export function StatBadge({ value, color }: StatBadgeProps) {
  if (value === 0) {
    return <span className="text-sp-muted/40">-</span>;
  }
  const colorMap: Record<string, string> = {
    red: 'bg-red-500/15 text-red-400',
    orange: 'bg-orange-500/15 text-orange-400',
    yellow: 'bg-yellow-500/15 text-yellow-400',
    purple: 'bg-purple-500/15 text-purple-400',
    green: 'bg-green-500/15 text-green-400',
    blue: 'bg-blue-500/15 text-blue-400',
  };
  return (
    <span className={`inline-block min-w-[24px] px-1.5 py-0.5 rounded text-xs font-semibold ${colorMap[color] ?? ''}`}>
      {value}
    </span>
  );
}

interface StatItemProps {
  label: string;
  value: number;
  color: string;
}

export function StatItem({ label, value, color }: StatItemProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-sp-muted">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}
