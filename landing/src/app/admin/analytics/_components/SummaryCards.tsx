import { SummaryCard } from './primitives';
import { formatDuration } from '../_lib/format';
import type { DailyActiveRow, SessionDurationRow, Totals, WeeklySummaryRow } from '../_lib/types';

export function SummaryCards({
  totals,
  daily,
  weekly,
  sessions,
}: {
  totals: Totals;
  daily: DailyActiveRow[];
  weekly: WeeklySummaryRow[];
  sessions: SessionDurationRow[];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      <SummaryCard label="총 이벤트" value={totals.totalEvents.toLocaleString()} />
      <SummaryCard label="총 사용자" value={totals.totalUsers.toString()} />
      <SummaryCard label="오늘 DAU" value={daily[0]?.dau?.toString() || '0'} />
      <SummaryCard label="주간 사용자" value={weekly[0]?.weekly_active_users?.toString() || '0'} />
      <SummaryCard
        label="평균 세션 (7일)"
        value={
          sessions.length > 0
            ? formatDuration(
                Math.round(
                  sessions
                    .slice(0, 7)
                    .reduce((sum, s) => sum + (s.avg_seconds ?? 0) * (s.sessions ?? 1), 0) /
                    Math.max(
                      1,
                      sessions.slice(0, 7).reduce((sum, s) => sum + (s.sessions ?? 1), 0),
                    ),
                ),
              )
            : '-'
        }
      />
    </div>
  );
}
