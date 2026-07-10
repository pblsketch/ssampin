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
 *
 * 표 골격은 table-fixed + colgroup 으로 교시 열 폭을 균등 고정한다(조회/종례가
 * 잔여 폭을 흡수해 정규 교시만 좁아지던 문제 해소, attendance-grid-v2 P7.1).
 * 이 골격 변경은 공유 뷰 전체(담임·수업관리)에 적용된다(§3.10-8).
 * 담임 전용 옵션(blankPresent 등)은 opt-in prop(기본 off)로 격리한다.
 */

/** 식별(왼쪽 고정) 열 폭 상수 (px) */
const W_CHECK = 40;
const W_GRADE = 64;
const W_NUM = 48;
const W_NAME = 128;
const W_PERIOD = 48;
const W_SUMMARY = 96;

export interface AttendanceGridViewProps {
  students: readonly MatrixStudent[];
  matrix: MatrixState;
  periods: readonly number[];
  /** 하이라이트할 매칭 교시 Set. undefined 이면 하이라이트 없음 */
  matchingPeriods?: ReadonlySet<number>;
  onCellClick: (sKey: string, period: number) => void;
  onCellContextMenu: (e: React.MouseEvent, sKey: string, period: number) => void;
  /**
   * 자동채움 훅(선택): 지정 시 학생 이름이 버튼이 되고, 클릭하면 앵커 좌표와 함께 호출된다.
   * 셸이 상태 선택 → computeAutoPeriods 행 채움 팝오버를 띄우는 용도 (담임 셸에서 사용).
   */
  onStudentNameClick?: (sKey: string, anchorRect: DOMRect) => void;
  /** 다중 선택 모드(선택): true 면 행 앞에 체크박스 열을 렌더한다 (일괄 적용용) */
  selectable?: boolean;
  /** 선택된 studentKey 집합 (selectable 일 때) */
  selectedKeys?: ReadonlySet<string>;
  /** 체크박스 토글 콜백 (selectable 일 때) */
  onToggleSelect?: (sKey: string) => void;
  /**
   * opt-in(기본 off): true 면 출석(present) 칸을 아이콘 없이 빈칸으로 렌더한다.
   * 담임 그리드는 예외만 표시(나이스식 '/' 모델), 수업관리는 미전달로 기존 아이콘 유지(§3.10-8).
   */
  blankPresent?: boolean;
}

export function AttendanceGridView({
  students,
  matrix,
  periods,
  matchingPeriods,
  onCellClick,
  onCellContextMenu,
  onStudentNameClick,
  selectable = false,
  selectedKeys,
  onToggleSelect,
  blankPresent = false,
}: AttendanceGridViewProps) {
  const hasGradeInfo = useMemo(
    () => students.some((s) => s.grade != null || s.classNum != null),
    [students],
  );

  const effectiveMatchingPeriods = useMemo(
    () => matchingPeriods ?? new Set<number>(),
    [matchingPeriods],
  );

  /* 왼쪽 고정 식별 열들의 누적 left 오프셋 (sticky 열 겹침 방지) */
  const stickyLeft = useMemo(() => {
    const checkLeft = 0;
    const gradeLeft = selectable ? W_CHECK : 0;
    const numLeft = gradeLeft + (hasGradeInfo ? W_GRADE : 0);
    const nameLeft = numLeft + W_NUM;
    return { checkLeft, gradeLeft, numLeft, nameLeft };
  }, [selectable, hasGradeInfo]);

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
    <div className="overflow-auto rounded-xl border border-sp-border max-h-full">
      <table
        className="border-collapse text-sm table-fixed"
        style={{ width: 'max-content', minWidth: '100%' }}
      >
        <colgroup>
          {selectable && <col style={{ width: W_CHECK }} />}
          {hasGradeInfo && <col style={{ width: W_GRADE }} />}
          <col style={{ width: W_NUM }} />
          <col style={{ width: W_NAME }} />
          {periods.map((p) => (
            <col key={p} style={{ width: W_PERIOD }} />
          ))}
          <col style={{ width: W_SUMMARY }} />
        </colgroup>
        <thead>
          <tr className="bg-sp-surface border-b border-sp-border">
            {selectable && (
              <th
                className="sticky top-0 z-30 bg-sp-surface px-2 py-2 text-center"
                style={{ left: stickyLeft.checkLeft }}
              />
            )}
            {hasGradeInfo && (
              <th
                className="sticky top-0 z-30 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-left whitespace-nowrap"
                style={{ left: stickyLeft.gradeLeft }}
              >
                소속
              </th>
            )}
            <th
              className="sticky top-0 z-30 bg-sp-surface px-2 py-2 text-sm text-sp-muted font-medium text-center whitespace-nowrap"
              style={{ left: stickyLeft.numLeft }}
            >
              번호
            </th>
            <th
              className="sticky top-0 z-30 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-left whitespace-nowrap"
              style={{ left: stickyLeft.nameLeft }}
            >
              이름
            </th>
            {periods.map((p) => {
              const special = isSpecialPeriod(p);
              return (
                <th
                  key={p}
                  className={`sticky top-0 z-20 px-1 py-2 text-sm font-medium text-center whitespace-nowrap ${
                    effectiveMatchingPeriods.has(p)
                      ? 'bg-sp-accent/20 text-sp-accent'
                      : special
                        ? 'text-sp-muted/80 bg-sp-bg/40'
                        : 'text-sp-muted bg-sp-surface'
                  }`}
                >
                  {formatPeriodLabel(p)}
                </th>
              );
            })}
            <th className="sticky top-0 z-20 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-center whitespace-nowrap">
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
                {selectable && (
                  <td
                    className="sticky z-10 bg-sp-bg px-2 py-2 text-center"
                    style={{ left: stickyLeft.checkLeft }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys?.has(sKey) ?? false}
                      onChange={() => onToggleSelect?.(sKey)}
                      aria-label={`${student.name} 선택`}
                      className="w-4 h-4 accent-sp-accent cursor-pointer"
                    />
                  </td>
                )}
                {hasGradeInfo && (
                  <td
                    className="sticky z-10 bg-sp-bg px-3 py-2 text-sm text-sp-muted whitespace-nowrap"
                    style={{ left: stickyLeft.gradeLeft }}
                  >
                    {student.grade != null && student.classNum != null
                      ? `${student.grade}-${student.classNum}`
                      : ''}
                  </td>
                )}
                <td
                  className="sticky z-10 bg-sp-bg px-2 py-2 text-sm text-sp-muted text-center whitespace-nowrap font-medium"
                  style={{ left: stickyLeft.numLeft }}
                >
                  {student.number}
                </td>
                <td
                  className="sticky z-10 bg-sp-bg px-3 py-2 text-base text-sp-text whitespace-nowrap"
                  style={{ left: stickyLeft.nameLeft }}
                >
                  {onStudentNameClick ? (
                    <button
                      type="button"
                      onClick={(e) =>
                        onStudentNameClick(
                          sKey,
                          (e.currentTarget as HTMLElement).getBoundingClientRect(),
                        )
                      }
                      title="클릭하면 이 학생의 교시를 자동으로 채워요 (결석·지각·조퇴·결과)"
                      className="text-base text-sp-text hover:text-sp-accent underline-offset-2 hover:underline transition-colors truncate max-w-full"
                    >
                      {student.name}
                    </button>
                  ) : (
                    student.name
                  )}
                </td>
                {periods.map((p) => {
                  const att = row[p];
                  const status: AttendanceStatus = att?.status ?? 'present';
                  const config = STATUS_CONFIG[status];
                  const periodLabel = formatPeriodLabel(p);
                  const isPresent = status === 'present';
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
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all
                                   cursor-pointer ${
                                     blankPresent && isPresent
                                       ? 'text-transparent hover:bg-sp-surface'
                                       : config.cell
                                   }`}
                      >
                        {blankPresent && isPresent ? null : (
                          <span className="material-symbols-outlined text-lg leading-none">
                            {config.icon}
                          </span>
                        )}
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
                          <span key={s} className={`text-xs font-medium ${STAT_COLORS[s]}`}>
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
            {selectable && (
              <td
                className="sticky z-10 bg-sp-surface px-2 py-2"
                style={{ left: stickyLeft.checkLeft }}
              />
            )}
            {hasGradeInfo && (
              <td
                className="sticky z-10 bg-sp-surface px-3 py-2"
                style={{ left: stickyLeft.gradeLeft }}
              />
            )}
            <td
              className="sticky z-10 bg-sp-surface px-2 py-2"
              style={{ left: stickyLeft.numLeft }}
            />
            <td
              className="sticky z-10 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium whitespace-nowrap"
              style={{ left: stickyLeft.nameLeft }}
            >
              교시 합계
            </td>
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
                      <span className="text-xs text-sp-muted/40">-</span>
                    ) : (
                      nonPresent.map((s) => (
                        <span key={s} className={`text-xs font-medium ${STAT_COLORS[s]}`}>
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
