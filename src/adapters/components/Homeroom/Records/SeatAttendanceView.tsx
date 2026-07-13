import { useMemo } from 'react';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { pickRepresentativeAttendance } from '@domain/rules/attendanceRules';
import {
  STATUS_CONFIG,
  STAT_COLORS,
  type MatrixState,
} from '@adapters/components/attendance/shared/attendanceGridShared';

/**
 * 출결 전용 읽기 전용 좌석 뷰 (attendance-grid-v2 §3.8·§3.10-4).
 *
 * 자리 배치 도구의 렌더(SeatCard·GroupSeatingView·FreestyleSeatingView)는 편집 액션과
 * 강결합돼 있어 재사용하면 좌석 편집 부작용이 유출된다. 그래서 **데이터(seats 그리드)만
 * 받아 신규로 그린다** — 좌석 편집 스토어/액션을 일절 import 하지 않는다(구조적 격리).
 *
 * 좌석 클릭 = 팔레트 적용(호스트 콜백). 카드에 현재 구분(지각(질병)) + 종류 색을 표시.
 * 번호 없는 재학생·결번·빈 좌석은 비활성. 1차는 grid 레이아웃만(모둠/자유는 호스트가 안내).
 */
export interface SeatAttendanceViewProps {
  rows: number;
  cols: number;
  /** studentId 그리드 (빈 좌석은 null) */
  seats: readonly (readonly (string | null)[])[];
  /** studentId → {번호, 이름} (활성·유번호 학생만 포함) */
  studentMap: ReadonlyMap<string, { number: number; name: string }>;
  /** 현재 편집 매트릭스 (studentKey = String(number)) */
  matrix: MatrixState;
  /** 교시 목록 (대표 출결 계산용) */
  periods: readonly number[];
  /** 좌석 클릭 = 그 학생(studentKey) 교시별 팝오버 열기 (앵커 좌표 전달) */
  onSeatClick: (studentKey: string, anchorRect: DOMRect) => void;
  /** 지정 상태를 가진 좌석을 강조 (요약 칩 클릭 연동, §3.5) */
  highlightStatus?: AttendanceStatus | null;
}

export function SeatAttendanceView({
  rows,
  cols,
  seats,
  studentMap,
  matrix,
  periods,
  onSeatClick,
  highlightStatus = null,
}: SeatAttendanceViewProps) {
  // studentKey(=번호 문자열) → 대표 출결
  const repByKey = useMemo(() => {
    const m = new Map<string, StudentAttendance | undefined>();
    for (const [sKey, row] of Object.entries(matrix)) {
      const periodMap = new Map<number, StudentAttendance | undefined>();
      for (const p of periods) periodMap.set(p, row?.[p]);
      m.set(sKey, pickRepresentativeAttendance(periodMap));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, periods.join(',')]);

  return (
    <div className="overflow-auto rounded-xl border border-sp-border p-4 bg-sp-bg/40">
      <div
        className="grid gap-2 mx-auto w-fit"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}
      >
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const studentId = seats[r]?.[c] ?? null;
            const student = studentId ? studentMap.get(studentId) : undefined;
            const key = `${r}-${c}`;

            if (!student) {
              // 빈 좌석 또는 번호 없는/비활성 학생 → 비활성
              return (
                <div
                  key={key}
                  className="h-16 rounded-lg border border-dashed border-sp-border/60 bg-sp-surface/20"
                  aria-hidden
                />
              );
            }

            const sKey = String(student.number);
            const rep = repByKey.get(sKey);
            const hasException = rep != null && rep.status !== 'present';
            const cfg = hasException ? STATUS_CONFIG[rep!.status] : null;
            const highlighted = highlightStatus != null && rep?.status === highlightStatus;

            return (
              <button
                key={key}
                type="button"
                onClick={(e) =>
                  onSeatClick(sKey, (e.currentTarget as HTMLElement).getBoundingClientRect())
                }
                title={
                  hasException
                    ? `${student.name} · ${cfg!.label}${rep!.reason ? `(${rep!.reason})` : ''}`
                    : `${student.name} · 출석`
                }
                className={`h-16 rounded-lg border px-1.5 py-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  hasException
                    ? cfg!.cell
                    : 'bg-sp-card border-sp-border hover:border-sp-accent/60 text-sp-text'
                } ${highlighted ? 'ring-2 ring-sp-accent ring-offset-1 ring-offset-sp-bg' : ''}`}
              >
                <span className="text-caption tabular-nums opacity-70 leading-none">
                  {student.number}
                </span>
                <span className="text-xs font-medium truncate max-w-full leading-none">
                  {student.name}
                </span>
                {hasException ? (
                  <span
                    className={`text-caption font-medium leading-none ${STAT_COLORS[rep!.status]}`}
                  >
                    {cfg!.label}
                    {rep!.reason ? `(${rep!.reason})` : ''}
                  </span>
                ) : (
                  <span className="text-caption text-sp-muted/40 leading-none">출석</span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
