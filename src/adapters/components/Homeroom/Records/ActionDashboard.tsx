import { useMemo } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';
import { formatDateKR } from './recordUtils';

interface ActionDashboardProps {
  records: readonly StudentRecord[];
  students: readonly Student[];
  onFilterUnreported: () => void;
  onFilterFollowUp: () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysFromToday(dateStr: string): number {
  const today = new Date(todayStr());
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function ActionDashboard({ records, students, onFilterUnreported, onFilterFollowUp }: ActionDashboardProps) {
  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const today = todayStr();

  // NEIS unreported attendance records
  const neisUnreported = useMemo(() => {
    const unreported = records.filter((r) => r.category === 'attendance' && !r.reportedToNeis);
    const byDate = new Map<string, number>();
    for (const r of unreported) {
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1);
    }
    return {
      total: unreported.length,
      byDate: Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5),
    };
  }, [records]);

  // Total attendance for progress
  const totalAttendance = useMemo(
    () => records.filter((r) => r.category === 'attendance').length,
    [records],
  );

  // Follow-up items
  const followUps = useMemo(() => {
    const pending = records.filter((r) => r.followUp && !r.followUpDone);
    const overdue: Array<{ record: StudentRecord; daysOver: number }> = [];
    const upcoming: Array<{ record: StudentRecord; daysUntil: number }> = [];
    const noDue: StudentRecord[] = [];

    for (const r of pending) {
      if (!r.followUpDate) {
        noDue.push(r);
      } else if (r.followUpDate < today) {
        overdue.push({ record: r, daysOver: -daysFromToday(r.followUpDate) });
      } else {
        const days = daysFromToday(r.followUpDate);
        if (days <= 7) {
          upcoming.push({ record: r, daysUntil: days });
        }
      }
    }
    overdue.sort((a, b) => b.daysOver - a.daysOver);
    upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

    const totalFollowUp = records.filter((r) => r.followUp).length;
    const doneFollowUp = records.filter((r) => r.followUp && r.followUpDone).length;

    return { overdue, upcoming, noDue, total: totalFollowUp, done: doneFollowUp, pendingCount: pending.length };
  }, [records, today]);

  const neisReported = totalAttendance - neisUnreported.total;

  return (
    <div className="w-[280px] shrink-0 flex flex-col gap-3 overflow-y-auto">
      {/* 완료 진행률 */}
      <div className="rounded-xl bg-sp-card p-4">
        <h4 className="text-xs font-bold text-sp-text mb-3 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">task_alt</span>
          진행 현황
        </h4>
        <div className="space-y-2.5">
          {totalAttendance > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-sp-muted">나이스 반영</span>
                <span className="text-sp-text font-medium">{neisReported}/{totalAttendance}</span>
              </div>
              <div className="h-1.5 bg-sp-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all"
                  style={{ width: `${totalAttendance > 0 ? (neisReported / totalAttendance) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {followUps.total > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-sp-muted">후속조치 완료</span>
                <span className="text-sp-text font-medium">{followUps.done}/{followUps.total}</span>
              </div>
              <div className="h-1.5 bg-sp-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full transition-all"
                  style={{ width: `${followUps.total > 0 ? (followUps.done / followUps.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {totalAttendance === 0 && followUps.total === 0 && (
            <p className="text-xs text-sp-muted/60">출결 및 후속조치 기록이 없습니다</p>
          )}
        </div>
      </div>

      {/* 나이스 미반영 */}
      {neisUnreported.total > 0 && (
        <div className="rounded-xl bg-sp-card p-4">
          <button
            onClick={onFilterUnreported}
            className="w-full flex items-center justify-between mb-3 group"
          >
            <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">warning</span>
              나이스 미반영
            </h4>
            <span className="text-xs text-red-400 font-bold">{neisUnreported.total}건</span>
          </button>
          <div className="space-y-1">
            {neisUnreported.byDate.map(([date, count]) => (
              <div key={date} className="flex items-center justify-between text-xs py-1">
                <span className="text-sp-muted">{formatDateKR(date)}</span>
                <span className="text-red-400 font-medium">{count}건</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 기한 지난 후속조치 */}
      {followUps.overdue.length > 0 && (
        <div className="rounded-xl bg-sp-card p-4">
          <button
            onClick={onFilterFollowUp}
            className="w-full flex items-center justify-between mb-3"
          >
            <h4 className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">schedule</span>
              기한 지난 후속조치
            </h4>
            <span className="text-xs text-orange-400 font-bold">{followUps.overdue.length}건</span>
          </button>
          <div className="space-y-1.5">
            {followUps.overdue.slice(0, 5).map(({ record, daysOver }) => (
              <div key={record.id} className="text-xs py-1 border-b border-sp-border/50 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sp-text font-medium">{studentMap.get(record.studentId)?.name ?? '?'}</span>
                  <span className="text-red-400">{daysOver}일 지남</span>
                </div>
                <p className="text-sp-muted truncate mt-0.5">{record.followUp}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 다가오는 후속조치 */}
      {followUps.upcoming.length > 0 && (
        <div className="rounded-xl bg-sp-card p-4">
          <h4 className="text-xs font-bold text-blue-400 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">upcoming</span>
            다가오는 후속조치
            <span className="text-blue-400 font-bold ml-auto">{followUps.upcoming.length}건</span>
          </h4>
          <div className="space-y-1.5">
            {followUps.upcoming.slice(0, 5).map(({ record, daysUntil }) => (
              <div key={record.id} className="text-xs py-1 border-b border-sp-border/50 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sp-text font-medium">{studentMap.get(record.studentId)?.name ?? '?'}</span>
                  <span className="text-blue-400">{daysUntil === 0 ? '오늘' : `${daysUntil}일 후`}</span>
                </div>
                <p className="text-sp-muted truncate mt-0.5">{record.followUp}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 모든 항목 완료 */}
      {neisUnreported.total === 0 && followUps.overdue.length === 0 && followUps.upcoming.length === 0 && followUps.pendingCount === 0 && totalAttendance > 0 && (
        <div className="rounded-xl bg-sp-card p-4 flex flex-col items-center justify-center py-8 text-center">
          <span className="material-symbols-outlined text-2xl text-green-400 mb-2">check_circle</span>
          <p className="text-sm text-sp-text font-medium">모든 업무 완료!</p>
          <p className="text-xs text-sp-muted mt-1">미처리 항목이 없습니다</p>
        </div>
      )}
    </div>
  );
}
