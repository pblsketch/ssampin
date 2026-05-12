import { useEffect, useRef, useState } from 'react';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

interface PeriodTimesEditorProps {
  initial: readonly PeriodTime[];
  /** 명시 "저장" 버튼으로 확정 (설정 화면). hideSaveButton 과 함께 쓰면 버튼은 숨겨진다. */
  onSave?: (periodTimes: PeriodTime[]) => void;
  /** 매 편집마다 현재 값(정렬·재번호 완료)을 흘려보냄. 한 행이라도 유효하지 않으면 null. (온보딩 등 controlled) */
  onChange?: (periodTimes: PeriodTime[] | null) => void;
  /** "저장"/"저장됨 ✓" 버튼을 숨긴다 (부모가 "다음" 등으로 확정하는 경우). */
  hideSaveButton?: boolean;
}

interface Row {
  start: string; // "HH:mm"
  end: string;
}

function rowInvalid(r: Row): boolean {
  if (!r.start || !r.end) return true;
  return r.end <= r.start; // "HH:mm" 문자열 비교 = 시각 순서
}

function toPeriodTimes(rows: Row[]): PeriodTime[] {
  return [...rows]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((r, idx) => ({ period: idx + 1, start: r.start, end: r.end }));
}

/** 교시 시간(periodTimes) 편집 — 행마다 시작/종료 시각 + 행 추가/삭제. 저장 시 시작순 정렬·1..N 재번호. */
export function PeriodTimesEditor({
  initial,
  onSave,
  onChange,
  hideSaveButton,
}: PeriodTimesEditorProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((p) => ({ start: p.start, end: p.end }))
      : [{ start: '', end: '' }],
  );
  const [saved, setSaved] = useState(false);

  const anyInvalid = rows.some(rowInvalid);

  // controlled 모드: 편집할 때마다 부모에게 알림 (초기 마운트 포함)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(anyInvalid ? null : toPeriodTimes(rows));
  }, [rows, anyInvalid]);

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

  const handleSave = () => {
    if (anyInvalid || !onSave) return;
    onSave(toPeriodTimes(rows));
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
        {!hideSaveButton && (
          <button
            type="button"
            onClick={handleSave}
            disabled={anyInvalid}
            className="h-10 flex-1 rounded-lg bg-sp-accent text-sm font-medium text-sp-accent-fg transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {saved ? '저장됨 ✓' : '저장'}
          </button>
        )}
      </div>
    </div>
  );
}
