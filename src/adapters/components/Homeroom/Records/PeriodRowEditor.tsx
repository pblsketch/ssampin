import { useMemo } from 'react';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import {
  PERIOD_MORNING,
  PERIOD_CLOSING,
  ATTENDANCE_REASONS,
  formatPeriodLabel,
} from '@domain/entities/Attendance';
import { validateAttendancePeriods } from '@domain/rules/attendanceRules';

const ATTENDANCE_STATUS_OPTIONS: { value: Exclude<AttendanceStatus, 'present'>; label: string }[] = [
  { value: 'absent', label: '결석' },
  { value: 'late', label: '지각' },
  { value: 'earlyLeave', label: '조퇴' },
  { value: 'classAbsence', label: '결과' },
];

const REASON_NONE = '__none__';

interface PeriodRowEditorProps {
  entries: readonly AttendancePeriodEntry[];
  onChange: (next: AttendancePeriodEntry[]) => void;
  regularPeriodCount: number;
  compact?: boolean;
}

export function PeriodRowEditor({
  entries,
  onChange,
  regularPeriodCount,
  compact,
}: PeriodRowEditorProps) {
  const periodOptions = useMemo(() => {
    const list: number[] = [PERIOD_MORNING];
    for (let i = 1; i <= regularPeriodCount; i += 1) list.push(i);
    list.push(PERIOD_CLOSING);
    return list;
  }, [regularPeriodCount]);

  const validation = useMemo(
    () => validateAttendancePeriods(entries, { regularPeriodCount }),
    [entries, regularPeriodCount],
  );

  const duplicatePeriod =
    validation?.code === 'DUPLICATE_PERIOD' ? validation.period : undefined;

  const updateAt = (idx: number, patch: Partial<AttendancePeriodEntry>) => {
    const next = entries.map((e, i) => {
      if (i !== idx) return e;
      const merged = { ...e, ...patch };
      // reason 제거 신호
      if ((patch as { reason?: AttendanceReason | undefined }).reason === undefined &&
          Object.prototype.hasOwnProperty.call(patch, 'reason')) {
        const { reason: _reason, ...rest } = merged;
        return rest as AttendancePeriodEntry;
      }
      return merged;
    });
    onChange(next);
  };

  const removeAt = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    // 현재 사용 안 된 가장 낮은 교시 찾기
    const used = new Set(entries.map((e) => e.period));
    let nextPeriod = 1;
    for (const p of periodOptions) {
      if (!used.has(p)) {
        nextPeriod = p;
        break;
      }
    }
    onChange([
      ...entries,
      { period: nextPeriod, status: 'absent' as const },
    ]);
  };

  const inputBase = `bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent ${
    compact ? 'text-detail px-2 py-0.5' : 'text-xs px-2 py-1'
  }`;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {entries.length === 0 && (
        <p role="alert" className="text-[11px] text-red-400">
          최소 1개 교시가 필요합니다
        </p>
      )}
      {entries.map((e, idx) => {
        const isDuplicate = duplicatePeriod !== undefined && e.period === duplicatePeriod;
        // 첫 번째 중복은 원본, 두 번째부터 경고 — Set으로 체크
        const seenBefore = entries.slice(0, idx).some((p) => p.period === e.period);
        const showDupWarn = isDuplicate && seenBefore;

        return (
          <div
            key={idx}
            className={`flex items-center gap-1.5 p-1 rounded-lg ${
              showDupWarn ? 'border border-red-500/60 bg-red-500/5' : ''
            }`}
          >
            <select
              value={e.period}
              onChange={(ev) => updateAt(idx, { period: Number(ev.target.value) })}
              className={inputBase}
              aria-label="교시"
            >
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>

            <select
              value={e.status}
              onChange={(ev) =>
                updateAt(idx, {
                  status: ev.target.value as Exclude<AttendanceStatus, 'present'>,
                })
              }
              className={inputBase}
              aria-label="유형"
            >
              {ATTENDANCE_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              value={e.reason ?? REASON_NONE}
              onChange={(ev) => {
                const v = ev.target.value;
                if (v === REASON_NONE) {
                  updateAt(idx, { reason: undefined });
                } else {
                  updateAt(idx, { reason: v as AttendanceReason });
                }
              }}
              className={inputBase}
              aria-label="사유"
            >
              <option value={REASON_NONE}>(없음)</option>
              {ATTENDANCE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="ml-auto text-sp-muted hover:text-red-400 transition-colors px-1"
              aria-label="교시 삭제"
              title="교시 삭제"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        );
      })}

      {duplicatePeriod !== undefined && (
        <p role="alert" className="text-[11px] text-red-400 ml-1">
          {formatPeriodLabel(duplicatePeriod)}가 중복됩니다
        </p>
      )}

      <button
        type="button"
        onClick={addRow}
        className={`flex items-center gap-1 text-red-300 hover:text-red-200 transition-colors ${
          compact ? 'text-detail px-1.5 py-0.5' : 'text-xs px-2 py-1'
        }`}
      >
        <span className="material-symbols-outlined text-sm">add</span>
        교시 추가
      </button>
    </div>
  );
}
