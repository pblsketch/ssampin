import { useMemo, useState, useEffect } from 'react';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import {
  summarizeByStudent,
  summarizeByPeriod,
  pickRepresentativeAttendance,
} from '@domain/rules/attendanceRules';
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
 * 날짜·저장·dirty·팔레트 같은 셸 상태는 갖지 않는다(각 기능 셸이 소유).
 * 셀 클릭·이름 클릭은 콜백으로 위임한다(담임=팔레트 적용, 수업관리=상태 순환).
 *
 * 표 골격은 table-fixed + colgroup 으로 교시 열 폭을 균등 고정한다(조회/종례가
 * 잔여 폭을 흡수해 정규 교시만 좁아지던 문제 해소, attendance-grid-v2 P7.1).
 * 이 골격 변경은 공유 뷰 전체(담임·수업관리)에 적용된다(§3.10-8).
 * 담임 전용 옵션(blankPresent·reasonColumn 등)은 opt-in prop(기본 off)로 격리한다.
 */

/** 식별(왼쪽 고정) 열 폭 상수 (px) */
const W_CHECK = 40;
const W_GRADE = 64;
const W_NUM = 48;
const W_NAME = 128;
const W_PERIOD = 48;
const W_SUMMARY = 96;
const W_GUBUN = 100;
const W_REASON = 160;

export interface AttendanceGridViewProps {
  students: readonly MatrixStudent[];
  matrix: MatrixState;
  periods: readonly number[];
  /** 하이라이트할 매칭 교시 Set. undefined 이면 하이라이트 없음 */
  matchingPeriods?: ReadonlySet<number>;
  onCellClick: (sKey: string, period: number) => void;
  onCellContextMenu: (e: React.MouseEvent, sKey: string, period: number) => void;
  /**
   * 이름 클릭 훅(선택): 지정 시 학생 이름이 버튼이 되고, 클릭하면 앵커 좌표와 함께 호출된다.
   * 담임 셸이 (지우개 모드) 행 전체 지우기 등에 사용.
   */
  onStudentNameClick?: (sKey: string, anchorRect: DOMRect) => void;
  /** 이름 버튼 title(툴팁). onStudentNameClick 사용 시 문맥에 맞게 지정. */
  nameClickTitle?: string;
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
  /**
   * opt-in(기본 off): true 면 우측 요약 열 대신 '구분'(지각(질병) 형식)+'사유'(자유 텍스트) 열을
   * 렌더한다. 담임 행-1건 모델 전용(§3.10-8). 수업관리는 미전달로 기존 '요약' 열 유지.
   */
  reasonColumn?: boolean;
  /** 사유(비고) 인라인 편집 콜백 — reasonColumn 일 때. 행 대표 memo를 찍힌 교시 전체로 fan-out. */
  onMemoEdit?: (sKey: string, memo: string) => void;
  /** opt-in(기본 null): 지정 상태를 가진 학생 행을 하이라이트한다(요약 칩 클릭 연동, §3.5). */
  highlightStatus?: AttendanceStatus | null;
}

/** 사유(비고) 인라인 편집 셀 — 로컬 상태로 타이핑, blur/Enter 시 커밋. */
function MemoCell({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  if (disabled) {
    return <span className="text-sp-muted/30 text-xs">-</span>;
  }
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const trimmed = local.trim();
        if (trimmed !== value) onCommit(trimmed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
      }}
      title={local || undefined}
      placeholder="비고 입력"
      className="w-full bg-transparent border-b border-transparent hover:border-sp-border focus:border-sp-accent
                 text-xs text-sp-text placeholder:text-sp-muted/40 focus:outline-none px-1 py-0.5 transition-colors"
    />
  );
}

export function AttendanceGridView({
  students,
  matrix,
  periods,
  matchingPeriods,
  onCellClick,
  onCellContextMenu,
  onStudentNameClick,
  nameClickTitle = '클릭하면 이 학생의 교시를 자동으로 채워요 (결석·지각·조퇴·결과)',
  selectable = false,
  selectedKeys,
  onToggleSelect,
  blankPresent = false,
  reasonColumn = false,
  onMemoEdit,
  highlightStatus = null,
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

  /* 행 대표 출결(구분/사유 열) — 행-1건 모델이면 곧 그 값, 레거시 혼재면 심각도 대표. */
  const repByStudent = useMemo(() => {
    const m = new Map<string, StudentAttendance | undefined>();
    if (reasonColumn) {
      for (const [sKey, row] of matrixMap) {
        m.set(sKey, pickRepresentativeAttendance(row));
      }
    }
    return m;
  }, [matrixMap, reasonColumn]);

  const trailingColCount = reasonColumn ? 2 : 1;

  return (
    <div className="overflow-auto rounded-xl border border-sp-border max-h-full">
      <table
        className="border-collapse text-sm table-fixed [&_th]:border-sp-border/50 [&_td]:border-sp-border/50 [&_th+th]:border-l [&_td+td]:border-l"
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
          {reasonColumn ? (
            <>
              <col style={{ width: W_GUBUN }} />
              <col style={{ width: W_REASON }} />
            </>
          ) : (
            <col style={{ width: W_SUMMARY }} />
          )}
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
              className="sticky top-0 z-30 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-center whitespace-nowrap"
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
                      ? 'bg-sp-accent text-white'
                      : special
                        ? 'text-sp-muted/80 bg-sp-bg'
                        : 'text-sp-muted bg-sp-surface'
                  }`}
                >
                  {formatPeriodLabel(p)}
                </th>
              );
            })}
            {reasonColumn ? (
              <>
                <th className="sticky top-0 z-20 bg-sp-surface px-2 py-2 text-sm text-sp-muted font-medium text-center whitespace-nowrap">
                  구분
                </th>
                <th className="sticky top-0 z-20 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-left whitespace-nowrap">
                  비고
                </th>
              </>
            ) : (
              <th className="sticky top-0 z-20 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium text-center whitespace-nowrap">
                요약
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-sp-border/50">
          {students.map((student) => {
            const sKey = studentKey(student);
            const row = matrix[sKey] ?? {};
            const studentStats = byStudentStats.get(sKey);
            const rep = repByStudent.get(sKey);
            const hasException = rep != null && rep.status !== 'present';
            const highlighted =
              highlightStatus != null && (studentStats?.[highlightStatus] ?? 0) > 0;
            // sticky 식별 셀은 자체 배경(bg-sp-bg)이라 행 배경이 가려진다 → 하이라이트 시 함께 tint.
            const stickyBg = highlighted ? 'bg-sp-accent/10' : 'bg-sp-bg';

            return (
              <tr
                key={sKey}
                className={`transition-colors ${
                  highlighted ? 'bg-sp-accent/10' : 'hover:bg-sp-card/30'
                }`}
              >
                {selectable && (
                  <td
                    className={`sticky z-10 ${stickyBg} px-2 py-2 text-center`}
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
                    className={`sticky z-10 ${stickyBg} px-3 py-2 text-sm text-sp-muted whitespace-nowrap`}
                    style={{ left: stickyLeft.gradeLeft }}
                  >
                    {student.grade != null && student.classNum != null
                      ? `${student.grade}-${student.classNum}`
                      : ''}
                  </td>
                )}
                <td
                  className={`sticky z-10 ${stickyBg} px-2 py-2 text-sm text-sp-muted text-center whitespace-nowrap font-medium`}
                  style={{ left: stickyLeft.numLeft }}
                >
                  {student.number}
                </td>
                <td
                  className={`sticky z-10 ${stickyBg} px-3 py-2 text-base text-sp-text whitespace-nowrap text-center`}
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
                      title={nameClickTitle}
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
                        className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center transition-all
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
                {reasonColumn ? (
                  <>
                    {/* 구분 — 행 대표 상태(사유) */}
                    <td className="px-2 py-2 text-center whitespace-nowrap">
                      {hasException ? (
                        <span className={`text-xs font-medium ${STAT_COLORS[rep!.status]}`}>
                          {STATUS_CONFIG[rep!.status].label}
                          {rep!.reason ? `(${rep!.reason})` : ''}
                        </span>
                      ) : (
                        <span className="text-sp-muted/30 text-xs">-</span>
                      )}
                    </td>
                    {/* 비고 — 자유 텍스트 인라인 편집 (통계의 '사유'=질병/인정/미인정/기타와 구분) */}
                    <td className="px-2 py-1">
                      <MemoCell
                        value={rep?.memo ?? ''}
                        onCommit={(v) => onMemoEdit?.(sKey, v)}
                        disabled={!hasException || !onMemoEdit}
                      />
                    </td>
                  </>
                ) : (
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
                )}
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
              className="sticky z-10 bg-sp-surface px-3 py-2 text-sm text-sp-muted font-medium whitespace-nowrap text-center"
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
            {Array.from({ length: trailingColCount }, (_, i) => (
              <td key={i} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
