import { useMemo } from 'react';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import { summarizeByStudent, summarizeByPeriod } from '@domain/rules/attendanceRules';
import { studentKey } from '@domain/entities/TeachingClass';
import {
  STATUS_CONFIG,
  STAT_COLORS,
  isSpecialPeriod,
  type MatrixStudent,
  type MatrixState,
} from './attendanceGridShared';

/**
 * 학생×교시 출결 매트릭스 — headless 프레젠테이션 뷰.
 * 날짜·저장·dirty·일괄 액션 같은 셸 상태는 갖지 않는다(각 기능 셸이 소유).
 * 셀 클릭(상태 순환)·우클릭(사유 팝오버)은 콜백으로 위임한다.
 */
export interface AttendanceGridViewProps {
  students: readonly MatrixStudent[];
  matrix: MatrixState;
  periods: readonly number[];
  /** 하이라이트할 매칭 교시 Set. undefined 이면 하이라이트 없음 */
  matchingPeriods?: ReadonlySet<number>;
  onCellClick: (sKey: string, period: number) => void;
  onCellContextMenu: (e: React.MouseEvent, sKey: string, period: number) => void;
}

export function AttendanceGridView({
  students,
  matrix,
  periods,
  matchingPeriods,
  onCellClick,
  onCellContextMenu,
}: AttendanceGridViewProps) {
  const hasGradeInfo = useMemo(
    () => students.some((s) => s.grade != null || s.classNum != null),
    [students],
  );

  const effectiveMatchingPeriods = useMemo(
    () => matchingPeriods ?? new Set<number>(),
    [matchingPeriods],
  );

  /* 도메인 집계용 Map 변환 */
  const matrixMap = useMemo(() => {
    const m = new Map<string, Map<number, StudentAttendance | undefined>>();
    for (const [sKey, row] of Object.entries(matrix)) {
      const inner = new Map<number, StudentAttendance | undefined>();
      for (const p of periods) {
        inner.set(p, row?.[p]);
      }
      m.set(sKey, inner);
    }
    return m;
    // periods는 원시 배열이므로 직렬화로 의존성 비교
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, periods.join(',')]);

  const byStudentStats = useMemo(() => summarizeByStudent(matrixMap), [matrixMap]);
  const byPeriodStats = useMemo(() => summarizeByPeriod(matrixMap), [matrixMap]);

  return (
    <div className="overflow-x-auto rounded-xl border border-sp-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-sp-surface border-b border-sp-border">
            {hasGradeInfo && (
              <th className="sticky left-0 z-10 bg-sp-surface px-3 py-2 text-xs text-sp-muted font-medium text-left whitespace-nowrap min-w-[4rem]">
                소속
              </th>
            )}
            <th className="sticky left-0 z-10 bg-sp-surface px-2 py-2 text-xs text-sp-muted font-medium text-center whitespace-nowrap min-w-[2.5rem]">
              번호
            </th>
            <th className="sticky left-0 z-10 bg-sp-surface px-3 py-2 text-xs text-sp-muted font-medium text-left whitespace-nowrap min-w-[5rem]">
              이름
            </th>
            {periods.map((p) => {
              const special = isSpecialPeriod(p);
              return (
                <th
                  key={p}
                  className={`px-1 py-2 text-xs font-medium text-center ${
                    special ? 'min-w-[3rem]' : 'w-10'
                  } whitespace-nowrap ${
                    effectiveMatchingPeriods.has(p)
                      ? 'bg-sp-accent/20 text-sp-accent'
                      : special
                        ? 'text-sp-muted/80 bg-sp-bg/40'
                        : 'text-sp-muted'
                  }`}
                >
                  {formatPeriodLabel(p)}
                </th>
              );
            })}
            <th className="px-3 py-2 text-xs text-sp-muted font-medium text-center whitespace-nowrap min-w-[5rem]">
              요약
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sp-border/50">
          {students.map((student) => {
            const sKey = studentKey(student);
            const row = matrix[sKey] ?? {};
            const studentStats = byStudentStats.get(sKey);

            return (
              <tr key={sKey} className="hover:bg-sp-card/30 transition-colors">
                {hasGradeInfo && (
                  <td className="sticky left-0 bg-sp-bg px-3 py-2 text-xs text-sp-muted whitespace-nowrap">
                    {student.grade != null && student.classNum != null
                      ? `${student.grade}-${student.classNum}`
                      : ''}
                  </td>
                )}
                <td className="sticky left-0 bg-sp-bg px-2 py-2 text-xs text-sp-muted text-center whitespace-nowrap font-medium">
                  {student.number}
                </td>
                <td className="sticky left-0 bg-sp-bg px-3 py-2 text-sm text-sp-text whitespace-nowrap">
                  {student.name}
                </td>
                {periods.map((p) => {
                  const att = row[p];
                  const status: AttendanceStatus = att?.status ?? 'present';
                  const config = STATUS_CONFIG[status];
                  const periodLabel = formatPeriodLabel(p);
                  const titleParts = [
                    periodLabel,
                    config.label,
                    att?.reason ? att.reason : '',
                    att?.memo ? att.memo : '',
                  ].filter(Boolean);

                  return (
                    <td key={p} className="px-0.5 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => onCellClick(sKey, p)}
                        onContextMenu={(e) => onCellContextMenu(e, sKey, p)}
                        title={titleParts.join(' · ')}
                        aria-label={`${student.name} ${periodLabel} ${config.label}${att?.reason ? ` (${att.reason})` : ''}`}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all
                                   cursor-pointer ${config.cell}`}
                      >
                        <span className="material-symbols-outlined text-base leading-none">
                          {config.icon}
                        </span>
                      </button>
                    </td>
                  );
                })}
                {/* 학생별 요약 */}
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {studentStats &&
                      (['absent', 'late', 'earlyLeave', 'classAbsence'] as AttendanceStatus[])
                        .filter((s) => (studentStats[s] ?? 0) > 0)
                        .map((s) => (
                          <span key={s} className={`text-caption font-medium ${STAT_COLORS[s]}`}>
                            {STATUS_CONFIG[s].label}
                            {studentStats[s]}
                          </span>
                        ))}
                  </div>
                </td>
              </tr>
            );
          })}

          {/* ── 교시별 요약 행 ── */}
          <tr className="bg-sp-surface border-t border-sp-border">
            {hasGradeInfo && <td className="px-3 py-2" />}
            <td className="px-2 py-2" />
            <td className="px-3 py-2 text-xs text-sp-muted font-medium">교시 합계</td>
            {periods.map((p) => {
              const ps = byPeriodStats.get(p);
              const nonPresent = ps
                ? (['absent', 'late', 'earlyLeave', 'classAbsence'] as AttendanceStatus[]).filter(
                    (s) => (ps[s] ?? 0) > 0,
                  )
                : [];
              return (
                <td key={p} className="px-0.5 py-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    {nonPresent.length === 0 ? (
                      <span className="text-caption text-sp-muted/40">-</span>
                    ) : (
                      nonPresent.map((s) => (
                        <span key={s} className={`text-caption font-medium ${STAT_COLORS[s]}`}>
                          {STATUS_CONFIG[s].label}
                          {ps![s]}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              );
            })}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
