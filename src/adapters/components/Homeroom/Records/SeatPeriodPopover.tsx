import { useEffect, useState } from 'react';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import { pickRepresentativeAttendance } from '@domain/rules/attendanceRules';
import {
  STATUS_CONFIG,
  STAT_COLORS,
  type LocalStudentAttendance,
} from '@adapters/components/attendance/shared/attendanceGridShared';

/**
 * 좌석 보기 전용 — 좌석을 클릭하면 그 학생의 교시별(조회~종례) 출결을 명렬 보기처럼
 * 하나씩 지정하는 팝오버(attendance-grid-v2 후속, 피드백 2026-07).
 *
 * 편집은 전부 호스트(HomeroomAttendanceGrid)의 핸들러로 위임한다 — 교시 클릭=칸 클릭과
 * 동일한 팔레트 적용(computeAutoPeriods), 비고=행 memo fan-out, 지우기=하루 전체 clear.
 * 이 컴포넌트는 스토어/편집 액션을 직접 import 하지 않는 프레젠테이션 계층이다.
 */
const PANEL_W = 340;
const EST_H = 260;

export interface SeatPeriodPopoverProps {
  student: { number: number; name: string };
  /** 현재 학생의 교시→출결 row (matrix[studentKey]) */
  row: Record<number, LocalStudentAttendance | undefined>;
  periods: readonly number[];
  /** 교시 이름 표시용 — 호스트가 주입 */
  periodTimes?: readonly PeriodTime[];
  /** 팔레트 종류(적용될 상태) — 라벨 표시용 */
  isEraser: boolean;
  /** 팔레트 선택 라벨 (예: "지각 · 질병" / "지우개") */
  paletteLabel: string;
  /** 클릭한 좌석의 화면 좌표 (팝오버 위치 기준) */
  anchorRect: { top: number; bottom: number; left: number };
  onCellClick: (period: number) => void;
  onMemoEdit: (memo: string) => void;
  onClearStudent: () => void;
  onClose: () => void;
}

export function SeatPeriodPopover({
  student,
  row,
  periods,
  periodTimes,
  isEraser,
  paletteLabel,
  anchorRect,
  onCellClick,
  onMemoEdit,
  onClearStudent,
  onClose,
}: SeatPeriodPopoverProps) {
  // 대표 출결(구분/비고 표시) — row로부터 계산.
  const repMap = new Map<number, StudentAttendance | undefined>();
  for (const p of periods) repMap.set(p, row[p]);
  const rep = pickRepresentativeAttendance(repMap);
  const hasException = rep != null && rep.status !== 'present';

  const [memo, setMemo] = useState(rep?.memo ?? '');
  useEffect(() => setMemo(rep?.memo ?? ''), [rep?.memo]);

  // Esc로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, anchorRect.left), vw - PANEL_W - 8);
  const opensDown = anchorRect.bottom + EST_H <= vh;
  const top = opensDown ? anchorRect.bottom + 8 : Math.max(8, anchorRect.top - EST_H - 8);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label={`${student.name} 교시별 출결`}
        className="fixed z-50 w-[340px] max-w-[92vw] bg-sp-card border border-sp-border rounded-2xl shadow-2xl p-4"
        style={{ top, left }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-sp-muted tabular-nums shrink-0">{student.number}</span>
            <span className="text-sm font-bold text-sp-text truncate">{student.name}</span>
            {hasException ? (
              <span className={`text-xs font-medium shrink-0 ${STAT_COLORS[rep!.status]}`}>
                {STATUS_CONFIG[rep!.status].label}
                {rep!.reason ? `(${rep!.reason})` : ''}
              </span>
            ) : (
              <span className="text-xs text-sp-muted/50 shrink-0">출석</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-sp-muted hover:text-sp-text transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="text-xs text-sp-muted">적용</span>
          <span
            className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
              isEraser ? 'bg-sp-surface text-sp-text' : 'bg-sp-accent/15 text-sp-accent'
            }`}
          >
            {paletteLabel}
          </span>
          <span className="text-caption text-sp-muted">
            교시를 클릭하세요 (종류·사유는 위 팔레트)
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {periods.map((p) => {
            const att = row[p];
            const status: AttendanceStatus = att?.status ?? 'present';
            const cfg = STATUS_CONFIG[status];
            const isPresent = status === 'present';
            return (
              <button
                key={p}
                type="button"
                onClick={() => onCellClick(p)}
                title={`${formatPeriodLabel(p, periodTimes)} ${cfg.label}`}
                className={`flex flex-col items-center justify-center gap-0.5 h-12 rounded-lg border transition-colors ${
                  isPresent
                    ? 'border-sp-border bg-sp-surface/40 hover:border-sp-accent/50 text-sp-muted'
                    : cfg.cell
                }`}
              >
                <span className="material-symbols-outlined text-base leading-none">
                  {isPresent ? 'radio_button_unchecked' : cfg.icon}
                </span>
                <span className="text-caption leading-none">
                  {formatPeriodLabel(p, periodTimes)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-sp-muted shrink-0">비고</span>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={() => {
              const t = memo.trim();
              if (t !== (rep?.memo ?? '')) onMemoEdit(t);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder={hasException ? '예: 감기' : '먼저 교시를 지정하세요'}
            disabled={!hasException}
            className="flex-1 min-w-0 bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:border-sp-accent disabled:opacity-50"
          />
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClearStudent}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-sp-muted hover:text-red-400 bg-sp-surface border border-sp-border rounded-lg transition-colors hover:border-red-500/40"
          >
            <span className="material-symbols-outlined text-sm">ink_eraser</span>
            하루 전체 지우기
          </button>
        </div>
      </div>
    </>
  );
}
