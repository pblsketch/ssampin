import { useState } from 'react';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

interface PeriodTimesEditorProps {
  initial: readonly PeriodTime[];
  onSave: (periodTimes: PeriodTime[]) => void;
}

interface Row {
  start: string; // "HH:mm"
  end: string;
}

function rowInvalid(r: Row): boolean {
  if (!r.start || !r.end) return true;
  return r.end <= r.start; // "HH:mm" 문자열 비교 = 시각 순서
}

/** 교시 시간(periodTimes) 편집 — 행마다 시작/종료 시각 + 행 추가/삭제. 저장 시 시작순 정렬·1..N 재번호. */
export function PeriodTimesEditor({ initial, onSave }: PeriodTimesEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((p) => ({ start: p.start, end: p.end }))
      : [{ start: '', end: '' }],
  );
  const [saved, setSaved] = useState(false);

  const touch = () => setSaved(false);
  const setRow = (i: number, field: keyof Row, val: string) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
    touch();
  };
  const addRow = () => {
    setRows((rs) => [...rs, { start: '', end: '' }]);
    touch();
  };
  const removeRow = (i: number) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));
    touch();
  };

  const anyInvalid = rows.some(rowInvalid);

  const handleSave = () => {
    if (anyInvalid) return;
    const sorted = [...rows].sort((a, b) => a.start.localeCompare(b.start));
    const periodTimes: PeriodTime[] = sorted.map((r, idx) => ({
      period: idx + 1,
      start: r.start,
      end: r.end,
    }));
    onSave(periodTimes);
    setSaved(true);
  };

  return (
    <div className="glass-card p-4">
      <div className="space-y-2">
        {rows.map((r, i) => {
          const bad = rowInvalid(r);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-sp-muted">{i + 1}교시</span>
              <input
                type="time"
                value={r.start}
                onChange={(e) => setRow(i, 'start', e.target.value)}
                aria-label={`${i + 1}교시 시작 시각`}
                className={`glass-input text-sm flex-1 ${bad ? 'border-red-500/60' : ''}`}
              />
              <span className="text-xs text-sp-muted">~</span>
              <input
                type="time"
                value={r.end}
                onChange={(e) => setRow(i, 'end', e.target.value)}
                aria-label={`${i + 1}교시 종료 시각`}
                className={`glass-input text-sm flex-1 ${bad ? 'border-red-500/60' : ''}`}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`${i + 1}교시 삭제`}
                disabled={rows.length <= 1}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sp-muted transition-colors active:bg-black/5 disabled:opacity-30 dark:active:bg-white/5"
              >
                <span className="material-symbols-outlined text-icon-md">close</span>
              </button>
            </div>
          );
        })}
      </div>
      {anyInvalid && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          시작·종료 시각을 모두 입력하고, 종료가 시작보다 늦어야 합니다.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="h-10 flex-1 rounded-lg border border-sp-border text-sm text-sp-muted transition-transform active:scale-[0.98]"
        >
          + 교시 추가
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={anyInvalid}
          className="h-10 flex-1 rounded-lg bg-sp-accent text-sm font-medium text-sp-accent-fg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
    </div>
  );
}
