import { useState, useMemo, useCallback, Fragment, type ComponentProps } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';
import {
  filterByStudent,
  filterByDateRange,
  getAttendanceStats,
  getCategorySummary,
  getWarningStudents,
} from '@domain/rules/studentRecordRules';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  summarizeNeisAttendance,
  isPerfectAttendance,
  type NeisAttendanceCounts,
  type NeisReasonAxis,
  type NeisReasonAxisWithExcused,
} from '@domain/rules/attendanceRules';
import { requiresDocument } from '@domain/rules/attendanceDocumentPolicy';
import { formatPeriodLabel, type AttendanceStatus } from '@domain/entities/Attendance';
import { SummaryCard, StatBadge } from './RecordStatCards';
import {
  type ModeProps,
  getWeekRange,
  getMonthRange,
  METHOD_OPTIONS,
  getAttendanceTypeFromSubcategory,
  formatDateKR,
  docCompletionCellView,
} from './recordUtils';
import { studentRecordToDisplay, type DisplayRecord } from '@adapters/presentation/displayRecord';
import { RecordDetailModal } from '@adapters/components/common/records/RecordDetailModal';
import { printHtmlDocument } from '@adapters/utils/printHtmlDocument';
import { AttendanceStatusBanners } from './AttendanceStatusBanners';
import { useToastStore } from '@adapters/components/common/Toast';
/* eslint-disable no-restricted-imports */
import {
  exportNeisAttendanceToExcel,
  exportNeisAttendanceToHwpx,
  type NeisAttendanceExportInput,
} from '@infrastructure/export';
/* eslint-enable no-restricted-imports */

type StatBadgeColor = ComponentProps<typeof StatBadge>['color'];

/* ── 생활기록부 기준 출결 집계 (P6 — 기재요령 별표 8 §3 정합) ── */

const NEIS_STATUS_COLUMNS = [
  { key: 'absent', label: '결석' },
  { key: 'late', label: '지각' },
  { key: 'earlyLeave', label: '조퇴' },
  { key: 'classAbsence', label: '결과' },
] as const;

const NEIS_REASON_AXES: readonly NeisReasonAxis[] = ['질병', '미인정', '기타'];

const ATT_STATUS_LABEL: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

/** 출결 집계 학생 상세 — 날짜별 1건으로 묶어(교시 범위) 언제·구분·사유·비고를 보여준다. */
interface AttendanceDetailEntry {
  date: string;
  periodStart: number;
  periodEnd: number;
  status: Exclude<AttendanceStatus, 'present'>;
  reason?: string;
  memo?: string;
}

const NEIS_FOOTNOTE =
  '같은 날 지각·조퇴·결과가 겹치면 학교생활기록부 기재요령에 따라 한 가지로만 집계합니다(학교장 판단 사항 — 쌤핀 기본: 결석>조퇴>지각>결과). 출석인정(인정) 사유는 횟수에 포함하지 않습니다. 결석은 교시 수와 무관하게 1일 1회입니다.';

export function NeisAttendanceSection({
  students,
  dateFrom,
  dateTo,
  periodLabel,
}: {
  students: readonly Student[];
  dateFrom?: string;
  dateTo?: string;
  periodLabel: string;
}) {
  const className = useSettingsStore((s) => s.settings.className);
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  // 사유 상세(질병/미인정/기타 분해)를 기본으로 펼쳐 보여준다(사용자 피드백 2026-07).
  const [showBreakdown, setShowBreakdown] = useState(true);
  // 인정(출석인정) 참고 표시 — 기본 숨김. 켜면 사유 상세에 '인정' 칸이 붙는다(피드백 2026-07).
  const [showExcused, setShowExcused] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const showToast = useToastStore((s) => s.show);
  // 학생 클릭 상세 (언제·교시·구분·사유·비고)
  const [detail, setDetail] = useState<{
    name: string;
    studentNumber: number;
    entries: AttendanceDetailEntry[];
  } | null>(null);
  // 개근 파악 — 포함 축 토글 (기본: 공식 3축. '인정'은 규칙 라에 따라 기본 제외)
  const [perfectOpen, setPerfectOpen] = useState(false);
  const [perfectAxes, setPerfectAxes] =
    useState<readonly NeisReasonAxisWithExcused[]>(NEIS_REASON_AXES);
  // 사유 상세에서 렌더할 사유 축 — 인정 표시 시 '인정'을 마지막 칸으로 덧붙인다.
  const reasonAxes: readonly NeisReasonAxisWithExcused[] = showExcused
    ? [...NEIS_REASON_AXES, '인정']
    : NEIS_REASON_AXES;
  const reasonColSpan = showBreakdown ? 1 + reasonAxes.length : 1;

  const rows = useMemo(
    () =>
      students
        .filter((s) => isStudentActive(s) && s.studentNumber != null && s.studentNumber > 0)
        .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0)),
    [students],
  );

  const stats = useMemo(() => {
    if (!className) return new Map<string, NeisAttendanceCounts>();
    return summarizeNeisAttendance(
      attendanceRecords,
      className,
      rows.map((s) => ({ number: s.studentNumber ?? 0 })),
      dateFrom,
      dateTo,
    );
  }, [className, attendanceRecords, rows, dateFrom, dateTo]);

  const totals = useMemo(() => {
    const t = { absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 };
    for (const c of stats.values()) {
      t.absent += c.absent;
      t.late += c.late;
      t.earlyLeave += c.earlyLeave;
      t.classAbsence += c.classAbsence;
    }
    return t;
  }, [stats]);

  // 출석번호 중복 시 같은 키로 이중 집계·통계 공유가 일어난다(codex QA) — 후보 판정을 멈추고 안내.
  const hasDuplicateNumbers = useMemo(
    () => new Set(rows.map((s) => s.studentNumber)).size !== rows.length,
    [rows],
  );

  // 개근 후보 — 포함 축 기준 결석·지각·조퇴·결과 전부 0인 학생 (참고용).
  // 학급명 미설정이면 집계 자체가 비어 전원이 후보로 보이는 오류가 있어(codex QA) 빈 목록으로 멈춘다.
  const perfectCandidates = useMemo(() => {
    if (!className || hasDuplicateNumbers) return [];
    return rows.filter((s) => {
      const c = stats.get(String(s.studentNumber ?? 0));
      return c != null && isPerfectAttendance(c, perfectAxes);
    });
  }, [className, hasDuplicateNumbers, rows, stats, perfectAxes]);

  const togglePerfectAxis = useCallback((axis: NeisReasonAxisWithExcused) => {
    setPerfectAxes((prev) =>
      prev.includes(axis) ? prev.filter((a) => a !== axis) : [...prev, axis],
    );
  }, []);

  /* 인쇄 — 현재 보기(요약/사유 상세) 그대로 A4 가로 인쇄 (2종 옵션) */
  const handlePrint = useCallback(() => {
    const title = `${className || '우리 반'} 출결 집계 (${periodLabel})`;
    // 인정 표시 시 사유 축에 '인정'을 덧붙인다(공식 계 미포함, 참고 표시).
    const axes: readonly NeisReasonAxisWithExcused[] = showExcused
      ? [...NEIS_REASON_AXES, '인정']
      : NEIS_REASON_AXES;
    const headCols = showBreakdown
      ? NEIS_STATUS_COLUMNS.map((c) => `<th colspan="${1 + axes.length}">${c.label}</th>`).join('')
      : NEIS_STATUS_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
    // 번호·이름은 위 행에서 rowspan=2로 이미 두 행을 차지하므로, 이 하위 헤더에 빈 칸을
    // 추가하면 계/질병/미인정/기타가 두 칸씩 밀린다(피드백 2026-07). 빈 칸을 넣지 않는다.
    const subHead = showBreakdown
      ? `<tr>${NEIS_STATUS_COLUMNS.map(
          () => `<th>계</th>${axes.map((r) => `<th>${r}</th>`).join('')}`,
        ).join('')}</tr>`
      : '';
    const bodyRows = rows
      .map((s) => {
        const c = stats.get(String(s.studentNumber ?? 0));
        const cells = NEIS_STATUS_COLUMNS.map((col) => {
          const total = c?.[col.key] ?? 0;
          if (!showBreakdown) return `<td>${total || ''}</td>`;
          const reasons = axes.map((r) => `<td>${c?.byReason[r][col.key] || ''}</td>`).join('');
          return `<td>${total || ''}</td>${reasons}`;
        }).join('');
        return `<tr><td>${s.studentNumber}</td><td class="name">${s.name}</td>${cells}</tr>`;
      })
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: A4 landscape; margin: 12mm; }
      body { font-family: 'Malgun Gothic', sans-serif; color: #111; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      .meta { font-size: 11px; color: #555; margin-bottom: 10px; }
      table { border-collapse: collapse; width: 100%; font-size: 11px; }
      th, td { border: 1px solid #999; padding: 3px 6px; text-align: center; }
      td.name { text-align: left; }
      tfoot td { font-weight: bold; background: #f2f2f2; }
      .footnote { font-size: 9px; color: #666; margin-top: 8px; line-height: 1.5; }
    </style></head><body>
      <h1>${title}</h1>
      <div class="meta">${showBreakdown ? '사유 상세' : '요약'} · 인쇄일 ${new Date().toLocaleDateString('ko-KR')}</div>
      <table><thead><tr><th rowspan="${showBreakdown ? 2 : 1}">번호</th><th rowspan="${showBreakdown ? 2 : 1}">이름</th>${headCols}</tr>${subHead}</thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr><td colspan="2">합계</td>${NEIS_STATUS_COLUMNS.map((col) => {
        if (!showBreakdown) return `<td>${totals[col.key] || ''}</td>`;
        const reasonTotals = axes
          .map((r) => {
            let sum = 0;
            for (const c of stats.values()) sum += c.byReason[r][col.key];
            return `<td>${sum || ''}</td>`;
          })
          .join('');
        return `<td>${totals[col.key] || ''}</td>${reasonTotals}`;
      }).join('')}</tr></tfoot></table>
      <p class="footnote">${NEIS_FOOTNOTE}</p>
    </body></html>`;
    // window.open은 Electron 보안 가드에 막히므로(about:blank deny) 숨김 iframe로 인쇄한다.
    printHtmlDocument(html);
  }, [className, periodLabel, showBreakdown, showExcused, rows, stats, totals]);

  /* 내보내기(Excel/HWPX) 입력 구성 — PDF는 handlePrint 재사용 */
  const buildExportInput = useCallback(
    (): NeisAttendanceExportInput => ({
      title: `${className || '우리 반'} 출결 집계 (${periodLabel})`,
      footnote: NEIS_FOOTNOTE,
      showBreakdown,
      statusColumns: NEIS_STATUS_COLUMNS,
      reasonAxes: showExcused ? [...NEIS_REASON_AXES, '인정'] : NEIS_REASON_AXES,
      rows: rows.map((s) => ({ studentNumber: s.studentNumber ?? 0, name: s.name })),
      stats,
    }),
    [className, periodLabel, showBreakdown, showExcused, rows, stats],
  );

  /* 생성된 파일 저장 — Electron 저장 대화상자 / 브라우저 다운로드 폴백 (기존 익스포터 패턴) */
  const saveExport = useCallback(
    async (data: ArrayBuffer, filename: string, mime: string, kindLabel: string) => {
      const ext = filename.split('.').pop() ?? 'dat';
      if (window.electronAPI) {
        const saved = await window.electronAPI.showSaveDialog({
          title: '출결 집계 내보내기',
          defaultPath: filename,
          filters: [{ name: `${kindLabel} 파일`, extensions: [ext] }],
        });
        if (!saved) return;
        await window.electronAPI.writeFile(saved.handle, data);
        showToast('파일이 저장되었습니다', 'success', {
          label: '파일 열기',
          onClick: () => window.electronAPI?.openFile(saved.handle),
        });
      } else {
        const blob = new Blob([data], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('파일이 다운로드되었습니다', 'success');
      }
    },
    [showToast],
  );

  const handleExport = useCallback(
    async (format: 'pdf' | 'hwpx' | 'excel') => {
      setExportMenuOpen(false);
      if (format === 'pdf') {
        handlePrint();
        return;
      }
      try {
        const input = buildExportInput();
        const base = `${(className || '우리반').replace(/\s+/g, '')}_출결집계`;
        if (format === 'excel') {
          const buf = await exportNeisAttendanceToExcel(input);
          await saveExport(
            buf,
            `${base}.xlsx`,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Excel',
          );
        } else {
          const bytes = await exportNeisAttendanceToHwpx(input);
          const ab = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          await saveExport(ab, `${base}.hwpx`, 'application/octet-stream', '한글');
        }
      } catch {
        showToast('내보내기 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', 'error');
      }
    },
    [handlePrint, buildExportInput, saveExport, className, showToast],
  );

  /* 학생 행 클릭 → 그 학생의 이상 출결 상세.
     날짜+구분+사유 단위로 묶어 교시 범위(조회~종례 등)로 보여준다(교시별 나열 대신 날짜별 1건). */
  const openStudentDetail = useCallback(
    (studentNumber: number, name: string) => {
      const groups = new Map<string, AttendanceDetailEntry>();
      for (const r of attendanceRecords) {
        if (r.classId !== className) continue;
        if (dateFrom != null && r.date < dateFrom) continue;
        if (dateTo != null && r.date > dateTo) continue;
        const hit = r.students.find((sa) => sa.number === studentNumber);
        if (!hit || hit.status === 'present') continue;
        const key = `${r.date}|${hit.status}|${hit.reason ?? ''}`;
        const g = groups.get(key);
        if (!g) {
          groups.set(key, {
            date: r.date,
            periodStart: r.period,
            periodEnd: r.period,
            status: hit.status,
            ...(hit.reason ? { reason: hit.reason } : {}),
            ...(hit.memo ? { memo: hit.memo } : {}),
          });
        } else {
          if (r.period < g.periodStart) g.periodStart = r.period;
          if (r.period > g.periodEnd) g.periodEnd = r.period;
          if (!g.memo && hit.memo) g.memo = hit.memo;
        }
      }
      const entries = [...groups.values()].sort((a, b) =>
        a.date < b.date ? -1 : a.date > b.date ? 1 : a.periodStart - b.periodStart,
      );
      setDetail({ studentNumber, name, entries });
    },
    [attendanceRecords, className, dateFrom, dateTo],
  );

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl bg-sp-card p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-sp-accent">table_chart</span>
          <span className="text-sm font-bold text-sp-text">출결 집계 (생활기록부 기준)</span>
          <span className="text-xs text-sp-muted">{periodLabel}</span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
            showBreakdown
              ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
              : 'text-sp-muted hover:text-sp-text bg-sp-surface border-sp-border'
          }`}
        >
          <span className="material-symbols-outlined text-sm">unfold_more_double</span>
          사유 상세
        </button>
        {showBreakdown && (
          <button
            type="button"
            onClick={() => setShowExcused((v) => !v)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              showExcused
                ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                : 'text-sp-muted hover:text-sp-text bg-sp-surface border-sp-border'
            }`}
            title="출석인정(인정) 사유를 참고용으로 표시 (공식 집계 '계'에는 미포함)"
          >
            <span className="material-symbols-outlined text-sm">event_available</span>
            인정 표시
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setExportMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text transition-colors"
            title="현재 보기(요약/사유 상세)를 PDF·한글·Excel로 저장"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            내보내기
            <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
          </button>
          {exportMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setExportMenuOpen(false)}
                aria-hidden
              />
              <div
                role="menu"
                className="absolute right-0 mt-1 z-50 w-44 rounded-lg border border-sp-border bg-sp-card shadow-xl py-1"
              >
                {(
                  [
                    { fmt: 'pdf', icon: 'picture_as_pdf', label: 'PDF (인쇄·저장)' },
                    { fmt: 'hwpx', icon: 'description', label: '한글 (HWPX)' },
                    { fmt: 'excel', icon: 'table_view', label: 'Excel (XLSX)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.fmt}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleExport(opt.fmt)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-sp-text hover:bg-sp-surface transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-sm text-sp-muted">
                      {opt.icon}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 출석번호 중복 경고 — 같은 번호는 한 키로 접혀 결석 등이 이중 집계된다(codex QA) */}
      {hasDuplicateNumbers && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-sp-surface border border-sp-border px-3 py-2">
          <span className="material-symbols-outlined text-base text-amber-500">warning</span>
          <p className="text-xs text-sp-muted leading-relaxed">
            출석번호가 겹치는 학생이 있어 아래 집계가 부정확할 수 있어요(같은 번호는 한 명으로
            합산됩니다). 출결 탭이나 명렬에서 번호를 먼저 정리해주세요.
          </p>
        </div>
      )}

      <div className="mt-3 overflow-x-auto rounded-lg border border-sp-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sp-surface text-sp-muted">
              <th rowSpan={showBreakdown ? 2 : 1} className="px-2 py-2 text-sm font-medium">
                번호
              </th>
              <th
                rowSpan={showBreakdown ? 2 : 1}
                className="px-3 py-2 text-sm font-medium text-center"
              >
                이름
              </th>
              {NEIS_STATUS_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  colSpan={reasonColSpan}
                  className="px-2 py-2 text-sm font-medium border-l border-sp-border"
                >
                  {col.label}
                </th>
              ))}
            </tr>
            {showBreakdown && (
              <tr className="bg-sp-surface text-sp-muted">
                {NEIS_STATUS_COLUMNS.map((col) => (
                  <Fragment key={col.key}>
                    <th className="px-2 py-1 text-xs font-medium border-l border-sp-border">계</th>
                    {reasonAxes.map((r) => (
                      <th
                        key={r}
                        className={`px-2 py-1 text-xs font-normal ${
                          r === '인정' ? 'text-sp-muted/70 italic' : ''
                        }`}
                      >
                        {r}
                      </th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-sp-border/50">
            {rows.map((s) => {
              const c = stats.get(String(s.studentNumber ?? 0));
              return (
                <tr
                  key={s.id}
                  onClick={() => openStudentDetail(s.studentNumber ?? 0, s.name)}
                  title={`${s.name} 출결 상세 보기`}
                  className="cursor-pointer hover:bg-sp-surface/50 transition-colors"
                >
                  <td className="px-2 py-1.5 text-center text-sm text-sp-muted tabular-nums">
                    {s.studentNumber}
                  </td>
                  <td className="px-3 py-1.5 text-sm text-sp-text whitespace-nowrap text-center">
                    {s.name}
                  </td>
                  {NEIS_STATUS_COLUMNS.map((col) => {
                    const total = c?.[col.key] ?? 0;
                    return (
                      <Fragment key={col.key}>
                        <td
                          className={`px-2 py-1.5 text-center text-sm border-l border-sp-border/60 ${
                            total > 0 ? 'text-sp-text font-medium' : 'text-sp-muted/40'
                          }`}
                        >
                          {total > 0 ? total : '·'}
                        </td>
                        {showBreakdown &&
                          reasonAxes.map((r) => {
                            const v = c?.byReason[r][col.key] ?? 0;
                            const excused = r === '인정';
                            return (
                              <td
                                key={r}
                                className={`px-2 py-1.5 text-center text-xs ${
                                  excused ? 'italic ' : ''
                                }${v > 0 ? (excused ? 'text-sp-muted' : 'text-sp-text') : 'text-sp-muted/30'}`}
                              >
                                {v > 0 ? v : '·'}
                              </td>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
            <tr className="bg-sp-surface border-t border-sp-border">
              <td colSpan={2} className="px-3 py-1.5 text-sm text-sp-muted font-medium">
                합계
              </td>
              {NEIS_STATUS_COLUMNS.map((col) => (
                <Fragment key={col.key}>
                  <td className="px-2 py-1.5 text-center text-sm font-bold text-sp-text border-l border-sp-border/60">
                    {totals[col.key] || '·'}
                  </td>
                  {showBreakdown &&
                    reasonAxes.map((r) => {
                      let sum = 0;
                      for (const c of stats.values()) sum += c.byReason[r][col.key];
                      return (
                        <td
                          key={r}
                          className={`px-2 py-1.5 text-center text-xs text-sp-muted ${
                            r === '인정' ? 'italic' : ''
                          }`}
                        >
                          {sum || '·'}
                        </td>
                      );
                    })}
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* 개근 파악 (참고) — 포함 축을 골라 누적 0인 학생을 본다 (M1, 연간 누적 필터) */}
      <div className="mt-3 rounded-lg border border-sp-border bg-sp-surface p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setPerfectOpen((v) => !v)}
            aria-expanded={perfectOpen}
            className="flex items-center gap-1.5 text-sm font-medium text-sp-text"
          >
            <span className="material-symbols-outlined text-base text-sp-accent">
              workspace_premium
            </span>
            개근 파악 (참고)
            <span className="text-xs text-sp-muted">
              {periodLabel} · 후보 {perfectCandidates.length}명
            </span>
            <span
              className={`material-symbols-outlined text-sm text-sp-muted transition-transform ${
                perfectOpen ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          </button>
          <div className="flex-1" />
          {([...NEIS_REASON_AXES, '인정'] as readonly NeisReasonAxisWithExcused[]).map((axis) => {
            const on = perfectAxes.includes(axis);
            return (
              <button
                key={axis}
                type="button"
                onClick={() => togglePerfectAxis(axis)}
                aria-pressed={on}
                title={
                  on
                    ? `${axis} 사유를 집계에 포함 중 (클릭하면 제외)`
                    : `${axis} 사유를 집계에서 제외 중 (클릭하면 포함)`
                }
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  on
                    ? 'bg-sp-accent/15 text-sp-accent border-sp-accent/50'
                    : 'text-sp-muted hover:text-sp-text bg-sp-surface border-sp-border'
                }`}
              >
                {axis} {on ? '(포함)' : '(제외)'}
              </button>
            );
          })}
        </div>
        {perfectOpen &&
          (perfectCandidates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {perfectCandidates.map((s) => (
                <span
                  key={s.id}
                  className="px-2 py-0.5 rounded-full bg-sp-card border border-sp-border text-xs text-sp-text"
                >
                  {s.studentNumber} {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-sp-muted">
              {!className
                ? '설정에서 담임 학급을 입력하면 개근 후보를 판정할 수 있어요.'
                : hasDuplicateNumbers
                  ? '출석번호가 겹치는 학생이 있어 개근 판정을 멈췄어요. 명렬에서 번호를 정리해주세요.'
                  : '현재 조건에서 개근 후보가 없습니다.'}
            </p>
          ))}
        <p className="mt-2 text-caption text-sp-muted leading-relaxed">
          포함으로 켠 사유만 집계해 결석·지각·조퇴·결과가 모두 0인 학생을 보여줍니다.
          출석인정(인정)은 기재요령에 따라 기본 제외입니다. 개근의 최종 확인은 나이스 기준으로
          해주세요.
        </p>
      </div>

      <p className="mt-2 text-caption text-sp-muted leading-relaxed">{NEIS_FOOTNOTE}</p>

      {/* 학생 클릭 상세 — 언제·몇 교시·구분·사유·비고 (피드백 2026-07) */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-label={`${detail.name} 출결 상세`}
            className="bg-sp-card border border-sp-border rounded-2xl w-[560px] max-w-full max-h-[80vh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-sp-border">
              <h3 className="text-sm font-bold text-sp-text">
                {detail.studentNumber}번 {detail.name} · 출결 상세
                <span className="ml-2 text-xs font-normal text-sp-muted">
                  {detail.entries.length}건
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="닫기"
                className="text-sp-muted hover:text-sp-text transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="overflow-auto p-4">
              {detail.entries.length === 0 ? (
                <p className="text-sm text-sp-muted text-center py-6">이상 출결 기록이 없어요.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-sp-surface text-sp-muted">
                      <th className="px-2 py-2 text-sm font-medium">날짜</th>
                      <th className="px-2 py-2 text-sm font-medium">교시</th>
                      <th className="px-2 py-2 text-sm font-medium">구분</th>
                      <th className="px-2 py-2 text-sm font-medium">사유</th>
                      <th className="px-3 py-2 text-sm font-medium text-left">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sp-border/50">
                    {detail.entries.map((e, i) => (
                      <tr
                        key={`${e.date}-${e.status}-${e.periodStart}-${i}`}
                        className="hover:bg-sp-surface/40"
                      >
                        <td className="px-2 py-1.5 text-center text-sm text-sp-text whitespace-nowrap">
                          {formatDateKR(e.date)}
                        </td>
                        <td className="px-2 py-1.5 text-center text-sm text-sp-muted whitespace-nowrap">
                          {e.periodStart === e.periodEnd
                            ? formatPeriodLabel(e.periodStart, periodTimes)
                            : `${formatPeriodLabel(e.periodStart, periodTimes)}~${formatPeriodLabel(e.periodEnd, periodTimes)}`}
                        </td>
                        <td className="px-2 py-1.5 text-center text-sm text-sp-text">
                          {ATT_STATUS_LABEL[e.status]}
                        </td>
                        <td className="px-2 py-1.5 text-center text-sm text-sp-muted">
                          {e.reason ?? '-'}
                        </td>
                        <td className="px-3 py-1.5 text-sm text-sp-text">{e.memo ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 통계 수치 — 값>0이면 클릭 가능(상세 모달 열기), 아니면 단순 배지. */
function ClickableStat({
  value,
  color,
  onClick,
  label,
}: {
  value: number;
  color: StatBadgeColor;
  onClick: () => void;
  label?: string;
}) {
  if (value <= 0) return <StatBadge value={value} color={color} />;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="rounded hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
    >
      <StatBadge value={value} color={color} />
    </button>
  );
}

type StatsPeriod = 'week' | 'month' | 'custom' | 'all';
type StatsTab = 'attendance' | 'counseling' | 'life' | 'all';
type SortKey =
  | 'number'
  | 'name'
  | 'absent'
  | 'late'
  | 'earlyLeave'
  | 'resultAbsent'
  | 'praise'
  | 'total'
  | 'counseling_count'
  | 'life_count'
  | 'all_count';
type SortDir = 'asc' | 'desc';

function toDateInputString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ProgressMode({ students, records, categories }: ModeProps) {
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [statsTab, setStatsTab] = useState<StatsTab>('attendance');
  // M4: 서류 완료율은 증빙서류 요구 정책 게이트를 거친다 (분모=요구 대상)
  const documentPolicy = useSettingsStore((s) => s.settings.attendanceDocumentPolicy);
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const monthRange = useMemo(() => getMonthRange(), []);
  const [customStart, setCustomStart] = useState<string>(toDateInputString(monthRange.start));
  const [customEnd, setCustomEnd] = useState<string>(toDateInputString(monthRange.end));

  // Feature 4: Follow-up tracker toggle
  const [showFollowUpTracker, setShowFollowUpTracker] = useState(true);

  // Feature 5: Expandable alert cards
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const toggleAlert = useCallback((id: string) => {
    setExpandedAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const today = toDateInputString(new Date());

  const filteredRecords = useMemo(() => {
    if (statsPeriod === 'week') {
      const { start, end } = getWeekRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'month') {
      const { start, end } = getMonthRange();
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    if (statsPeriod === 'custom') {
      const start = new Date(customStart + 'T00:00:00');
      const end = new Date(customEnd + 'T23:59:59');
      return filterByDateRange(records, start, end) as StudentRecord[];
    }
    return records as StudentRecord[];
  }, [records, statsPeriod, customStart, customEnd]);

  // 생활기록부 기준 출결 집계용 기간 문자열 (YYYY-MM-DD) — 기존 기간 필터와 동일 기준
  const neisRange = useMemo((): { from?: string; to?: string; label: string } => {
    if (statsPeriod === 'week') {
      const { start, end } = getWeekRange();
      return { from: toDateInputString(start), to: toDateInputString(end), label: '이번 주' };
    }
    if (statsPeriod === 'month') {
      const { start, end } = getMonthRange();
      return { from: toDateInputString(start), to: toDateInputString(end), label: '이번 달' };
    }
    if (statsPeriod === 'custom') {
      return { from: customStart, to: customEnd, label: `${customStart} ~ ${customEnd}` };
    }
    return { label: '전체 기간' };
  }, [statsPeriod, customStart, customEnd]);

  // Summary cards
  const summary = useMemo(() => getCategorySummary(filteredRecords), [filteredRecords]);

  // Warning students
  const warningStudents = useMemo(
    () => getWarningStudents(filteredRecords, students),
    [filteredRecords, students],
  );

  // Feature 1: No-record student count
  const noRecordStudentCount = useMemo(() => {
    return students.filter(
      (s) => isStudentActive(s) && !filteredRecords.some((r) => r.studentId === s.id),
    ).length;
  }, [students, filteredRecords]);

  // Feature 1: Average records per active student
  const avgRecords = useMemo(() => {
    const activeStudentCount = students.filter(isStudentActive).length;
    return activeStudentCount > 0 ? filteredRecords.length / activeStudentCount : 0;
  }, [students, filteredRecords]);

  // Feature 3: Life subcategories from categories prop (string[])
  const lifeSubcategories = useMemo(() => {
    const lifeCat = categories.find((c) => c.id === 'life');
    return lifeCat?.subcategories ?? [];
  }, [categories]);

  // Feature 4: Follow-up tracker data
  const followUpData = useMemo(() => {
    const pending = filteredRecords.filter((r) => r.followUp && !r.followUpDone);
    const overdue = pending
      .filter((r) => r.followUpDate && r.followUpDate < today)
      .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''));
    const upcoming = pending
      .filter((r) => r.followUpDate && r.followUpDate >= today)
      .sort((a, b) => (a.followUpDate ?? '').localeCompare(b.followUpDate ?? ''))
      .slice(0, 5);
    const totalWithFollowUp = filteredRecords.filter((r) => r.followUp).length;
    const done = filteredRecords.filter((r) => r.followUp && r.followUpDone).length;
    return { overdue, upcoming, total: totalWithFollowUp, done, pendingCount: pending.length };
  }, [filteredRecords, today]);

  // Feature 5: Alert categories
  const alertData = useMemo(() => {
    const activeStudents = students.filter(isStudentActive);

    const noRecords = activeStudents.filter(
      (s) => !filteredRecords.some((r) => r.studentId === s.id),
    );

    const attendanceOnly = activeStudents.filter((s) => {
      const recs = filteredRecords.filter((r) => r.studentId === s.id);
      return recs.length > 0 && recs.every((r) => r.category === 'attendance');
    });

    const overdueFollowUp = activeStudents.filter((s) => {
      return filteredRecords.some(
        (r) =>
          r.studentId === s.id &&
          r.followUp &&
          !r.followUpDone &&
          r.followUpDate &&
          r.followUpDate < today,
      );
    });

    return { noRecords, attendanceOnly, overdueFollowUp };
  }, [students, filteredRecords, today]);

  const statsRows = useMemo(() => {
    const rows = students.map((student, idx) => {
      const studentRecs = filterByStudent(filteredRecords, student.id);
      const stats = getAttendanceStats(filteredRecords, student.id);
      const counselingCount = studentRecs.filter((r) => r.category === 'counseling').length;
      const lifeCount = studentRecs.filter((r) => r.category === 'life').length;
      const totalRecords = studentRecs.length;

      // Feature 2: Per-student NEIS data
      const attendanceTotal = studentRecs.filter((r) => r.category === 'attendance').length;
      const neisReported = studentRecs.filter(
        (r) => r.category === 'attendance' && r.reportedToNeis,
      ).length;
      // M4: 서류 완료율의 분모는 '서류 요구 대상'(정책 게이트) — "요구 N건 중 제출 M건".
      // 나이스 열 분모(attendanceTotal)는 불변 — 나이스 반영은 전 출결 대상.
      const docRequiredRecs = studentRecs.filter(
        (r) => r.category === 'attendance' && requiresDocument(r, documentPolicy),
      );
      const docRequired = docRequiredRecs.length;
      const docSubmitted = docRequiredRecs.filter((r) => r.documentSubmitted).length;

      // Feature 3: Counseling method breakdown
      const methodCounts: Record<string, number> = {};
      for (const r of studentRecs.filter((r) => r.category === 'counseling')) {
        const m = r.method ?? 'other';
        methodCounts[m] = (methodCounts[m] ?? 0) + 1;
      }

      // Feature 3: Life subcategory breakdown
      const subCounts: Record<string, number> = {};
      for (const r of studentRecs.filter((r) => r.category === 'life')) {
        const sub = r.subcategory || '기타';
        subCounts[sub] = (subCounts[sub] ?? 0) + 1;
      }

      return {
        student,
        stats,
        counselingCount,
        lifeCount,
        totalRecords,
        idx,
        attendanceTotal,
        neisReported,
        docRequired,
        docSubmitted,
        methodCounts,
        subCounts,
      };
    });

    // Sort
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'number':
          cmp = a.idx - b.idx;
          break;
        case 'name':
          cmp = a.student.name.localeCompare(b.student.name);
          break;
        case 'absent':
          cmp = a.stats.absent - b.stats.absent;
          break;
        case 'late':
          cmp = a.stats.late - b.stats.late;
          break;
        case 'earlyLeave':
          cmp = a.stats.earlyLeave - b.stats.earlyLeave;
          break;
        case 'resultAbsent':
          cmp = a.stats.resultAbsent - b.stats.resultAbsent;
          break;
        case 'praise':
          cmp = a.stats.praise - b.stats.praise;
          break;
        case 'total':
        case 'all_count':
          cmp = a.totalRecords - b.totalRecords;
          break;
        case 'counseling_count':
          cmp = a.counselingCount - b.counselingCount;
          break;
        case 'life_count':
          cmp = a.lifeCount - b.lifeCount;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [students, filteredRecords, sortKey, sortDir, documentPolicy]);

  // 셀 클릭 상세 모달
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const [detail, setDetail] = useState<{ title: string; records: DisplayRecord[] } | null>(null);
  const openDetail = useCallback(
    (student: Student, label: string, predicate: (r: StudentRecord) => boolean) => {
      const recs = filterByStudent(filteredRecords, student.id)
        .filter(predicate)
        .map((r) => studentRecordToDisplay(r, { categories, studentMap }));
      setDetail({ title: `${student.name} · ${label} ${recs.length}건`, records: recs });
    },
    [filteredRecords, categories, studentMap],
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const SortHeader = useCallback(
    ({ label, sortId, className }: { label: string; sortId: SortKey; className?: string }) => (
      <th
        onClick={() => handleSort(sortId)}
        className={`p-3 font-medium border-b cursor-pointer hover:text-sp-text transition-colors select-none ${className ?? ''}`}
      >
        {label}
        {sortKey === sortId && (
          <span className="ml-1 text-sp-accent">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
        )}
      </th>
    ),
    [handleSort, sortKey, sortDir],
  );

  const STATS_TABS: { id: StatsTab; label: string }[] = [
    { id: 'attendance', label: '출결' },
    { id: 'counseling', label: '상담' },
    { id: 'life', label: '생활' },
    { id: 'all', label: '전체' },
  ];

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {/* Summary cards - Feature 1: 5th card added */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard
          label="총 기록"
          value={summary.total}
          icon="description"
          color="text-sp-accent"
        />
        <SummaryCard
          label="출결"
          value={summary.attendance}
          icon="event_busy"
          color="text-red-400"
        />
        <SummaryCard
          label="상담"
          value={summary.counseling}
          icon="psychology"
          color="text-blue-400"
        />
        <SummaryCard label="생활" value={summary.life} icon="school" color="text-green-400" />
        <SummaryCard
          label="기록 없음"
          value={noRecordStudentCount}
          icon="person_off"
          color="text-amber-400"
        />
      </div>

      {/* 나이스 미반영·서류 미제출 배너 (출결 탭과 공유 — 가독성·나이스 일괄 반영 버튼 포함) */}
      <AttendanceStatusBanners students={students} />

      {/* Feature 4: Follow-up tracker panel */}
      {(followUpData.overdue.length > 0 || followUpData.upcoming.length > 0) && (
        <div className="rounded-xl bg-sp-card p-4">
          <button
            type="button"
            onClick={() => setShowFollowUpTracker(!showFollowUpTracker)}
            aria-expanded={showFollowUpTracker}
            className="w-full flex items-center justify-between"
          >
            <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base">assignment_late</span>
              후속조치 현황
              <span className="text-xs font-normal text-sp-muted">
                완료 {followUpData.done}/{followUpData.total}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              {followUpData.overdue.length > 0 && (
                <span className="text-xs font-bold text-red-400">
                  {followUpData.overdue.length}건 지연
                </span>
              )}
              <span
                className={`material-symbols-outlined text-sm text-sp-muted transition-transform ${showFollowUpTracker ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
            </div>
          </button>
          {showFollowUpTracker && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {followUpData.overdue.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-400 mb-2">기한 지남</p>
                  <div className="space-y-1.5">
                    {followUpData.overdue.slice(0, 5).map((r) => {
                      const s = students.find((st) => st.id === r.studentId);
                      const days = Math.round(
                        (new Date(today).getTime() - new Date(r.followUpDate!).getTime()) /
                          86400000,
                      );
                      return (
                        <div key={r.id} className="text-xs flex items-center gap-2 py-1">
                          <span className="font-medium text-sp-text">{s?.name ?? '?'}</span>
                          <span className="text-sp-muted truncate flex-1">{r.followUp}</span>
                          <span className="text-red-400 shrink-0">{days}일</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {followUpData.upcoming.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-400 mb-2">다가오는 일정</p>
                  <div className="space-y-1.5">
                    {followUpData.upcoming.map((r) => {
                      const s = students.find((st) => st.id === r.studentId);
                      const days = Math.round(
                        (new Date(r.followUpDate!).getTime() - new Date(today).getTime()) /
                          86400000,
                      );
                      return (
                        <div key={r.id} className="text-xs flex items-center gap-2 py-1">
                          <span className="font-medium text-sp-text">{s?.name ?? '?'}</span>
                          <span className="text-sp-muted truncate flex-1">{r.followUp}</span>
                          <span className="text-blue-400 shrink-0">
                            {days === 0 ? '오늘' : `${days}일 후`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Period filter + category tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          {STATS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatsTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                statsTab === tab.id ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-sp-surface rounded-lg p-1 ml-auto">
          {(
            [
              { id: 'week', label: '이번 주' },
              { id: 'month', label: '이번 달' },
              { id: 'custom', label: '직접 설정' },
              { id: 'all', label: '전체' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatsPeriod(f.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                statsPeriod === f.id
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {statsPeriod === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs text-sp-muted">시작일</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
            <span className="text-xs text-sp-muted">~</span>
            <label className="text-xs text-sp-muted">종료일</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            />
          </div>
        )}
      </div>

      {/* 생활기록부 기준 출결 집계 — 일 단위 대표 접기 + 인정 제외 + 사유 드릴다운 + 인쇄 (P6).
          출결 탭에서만 노출 — 상담/생활/전체 탭에선 아래 통계 표만 바뀌어야 탭이 눌리는 게 보인다(피드백 2026-07). */}
      {statsTab === 'attendance' && (
        <NeisAttendanceSection
          students={students}
          dateFrom={neisRange.from}
          dateTo={neisRange.to}
          periodLabel={neisRange.label}
        />
      )}

      {/* Stats table */}
      <div className="flex-1 overflow-auto rounded-xl bg-sp-card">
        <table className="w-full text-sm border-collapse timetable-grid">
          <thead>
            <tr className="text-sp-muted">
              <SortHeader label="번호" sortId="number" className="text-left" />
              <SortHeader label="이름" sortId="name" className="text-center" />
              {statsTab === 'attendance' && (
                <>
                  <SortHeader label="결석" sortId="absent" className="text-center border-l" />
                  <SortHeader label="지각" sortId="late" className="text-center border-l" />
                  <SortHeader label="조퇴" sortId="earlyLeave" className="text-center border-l" />
                  <SortHeader label="결과" sortId="resultAbsent" className="text-center border-l" />
                  <SortHeader label="칭찬" sortId="praise" className="text-center border-l" />
                  {/* Feature 2: NEIS column */}
                  <th className="p-3 font-medium border-b text-center border-l text-sp-muted">
                    나이스
                  </th>
                  <th
                    className="p-3 font-medium border-b text-center border-l text-sp-muted"
                    title="증빙서류 제출 (요구 대상 N건 중 제출 M건)"
                  >
                    증빙서류
                  </th>
                </>
              )}
              {statsTab === 'counseling' && (
                <>
                  <SortHeader
                    label="상담 건수"
                    sortId="counseling_count"
                    className="text-center border-l"
                  />
                  {/* Feature 3: Method breakdown columns */}
                  {METHOD_OPTIONS.map((opt) => (
                    <th
                      key={opt.value}
                      className="p-3 font-medium border-b text-center border-l text-sp-muted text-xs"
                      title={opt.label}
                    >
                      {opt.icon}
                    </th>
                  ))}
                </>
              )}
              {statsTab === 'life' && (
                <>
                  <SortHeader
                    label="생활 건수"
                    sortId="life_count"
                    className="text-center border-l"
                  />
                  {/* Feature 3: Life subcategory columns */}
                  {lifeSubcategories.map((sub) => (
                    <th
                      key={sub}
                      className="p-3 font-medium border-b text-center border-l text-sp-muted text-xs"
                    >
                      {sub}
                    </th>
                  ))}
                </>
              )}
              <SortHeader label="전체" sortId="total" className="text-center border-l" />
              {/* Feature 1: Coverage column */}
              <th className="p-3 font-medium border-b text-center border-l text-sp-muted">
                기록량
              </th>
            </tr>
          </thead>
          <tbody>
            {statsRows.map(
              ({
                student,
                stats,
                counselingCount,
                lifeCount,
                totalRecords,
                idx,
                attendanceTotal,
                neisReported,
                docRequired,
                docSubmitted,
                methodCounts,
                subCounts,
              }) => (
                <tr key={student.id} className="hover:bg-sp-surface/30 transition-colors">
                  <td className="p-3 text-sp-muted border-b">{idx + 1}</td>
                  <td className="p-3 text-sp-text font-medium border-b text-center">
                    {student.name}
                  </td>
                  {statsTab === 'attendance' && (
                    <>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={stats.absent}
                          color="red"
                          label={`${student.name} 결석 상세`}
                          onClick={() =>
                            openDetail(
                              student,
                              '결석',
                              (r) =>
                                r.category === 'attendance' &&
                                getAttendanceTypeFromSubcategory(r.subcategory) === '결석',
                            )
                          }
                        />
                      </td>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={stats.late}
                          color="orange"
                          label={`${student.name} 지각 상세`}
                          onClick={() =>
                            openDetail(
                              student,
                              '지각',
                              (r) =>
                                r.category === 'attendance' &&
                                getAttendanceTypeFromSubcategory(r.subcategory) === '지각',
                            )
                          }
                        />
                      </td>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={stats.earlyLeave}
                          color="yellow"
                          label={`${student.name} 조퇴 상세`}
                          onClick={() =>
                            openDetail(
                              student,
                              '조퇴',
                              (r) =>
                                r.category === 'attendance' &&
                                getAttendanceTypeFromSubcategory(r.subcategory) === '조퇴',
                            )
                          }
                        />
                      </td>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={stats.resultAbsent}
                          color="purple"
                          label={`${student.name} 결과 상세`}
                          onClick={() =>
                            openDetail(
                              student,
                              '결과',
                              (r) =>
                                r.category === 'attendance' &&
                                getAttendanceTypeFromSubcategory(r.subcategory) === '결과',
                            )
                          }
                        />
                      </td>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={stats.praise}
                          color="green"
                          label={`${student.name} 칭찬 상세`}
                          onClick={() =>
                            openDetail(
                              student,
                              '칭찬',
                              (r) =>
                                r.category === 'life' &&
                                (r.tags?.includes('칭찬') === true || r.subcategory === '칭찬'),
                            )
                          }
                        />
                      </td>
                      {/* Feature 2: NEIS reported/total */}
                      <td
                        className={`text-center p-3 border-b border-l text-xs ${neisReported < attendanceTotal ? 'text-red-400 font-medium' : 'text-green-400'}`}
                      >
                        {attendanceTotal > 0 ? `${neisReported}/${attendanceTotal}` : '-'}
                      </td>
                      {/* Document submitted/required — M4+N1: 분모·색상 술어·빈 가드를 '요구 대상'으로 세트 교체 */}
                      {(() => {
                        const docCell = docCompletionCellView(docSubmitted, docRequired);
                        return (
                          <td
                            className={`text-center p-3 border-b border-l text-xs ${docCell.toneClass}`}
                          >
                            {docCell.text}
                          </td>
                        );
                      })()}
                    </>
                  )}
                  {statsTab === 'counseling' && (
                    <>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={counselingCount}
                          color="blue"
                          label={`${student.name} 상담 상세`}
                          onClick={() =>
                            openDetail(student, '상담', (r) => r.category === 'counseling')
                          }
                        />
                      </td>
                      {/* Feature 3: Method counts */}
                      {METHOD_OPTIONS.map((opt) => (
                        <td key={opt.value} className="text-center p-3 border-b border-l">
                          <ClickableStat
                            value={methodCounts[opt.value] ?? 0}
                            color="blue"
                            label={`${student.name} 상담(${opt.label}) 상세`}
                            onClick={() =>
                              openDetail(
                                student,
                                `상담 (${opt.label})`,
                                (r) =>
                                  r.category === 'counseling' &&
                                  (r.method ?? 'other') === opt.value,
                              )
                            }
                          />
                        </td>
                      ))}
                    </>
                  )}
                  {statsTab === 'life' && (
                    <>
                      <td className="text-center p-3 border-b border-l">
                        <ClickableStat
                          value={lifeCount}
                          color="green"
                          label={`${student.name} 생활 상세`}
                          onClick={() => openDetail(student, '생활', (r) => r.category === 'life')}
                        />
                      </td>
                      {/* Feature 3: Life subcategory counts */}
                      {lifeSubcategories.map((sub) => (
                        <td key={sub} className="text-center p-3 border-b border-l">
                          <ClickableStat
                            value={subCounts[sub] ?? 0}
                            color="green"
                            label={`${student.name} 생활(${sub}) 상세`}
                            onClick={() =>
                              openDetail(
                                student,
                                `생활 (${sub})`,
                                (r) => r.category === 'life' && (r.subcategory || '기타') === sub,
                              )
                            }
                          />
                        </td>
                      ))}
                    </>
                  )}
                  <td className="text-center p-3 text-sp-muted border-b border-l">
                    {totalRecords > 0 ? (
                      <button
                        type="button"
                        onClick={() => openDetail(student, '전체', () => true)}
                        className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent rounded"
                        title={`${student.name} 전체 기록 상세`}
                      >
                        {totalRecords}
                      </button>
                    ) : (
                      totalRecords
                    )}
                  </td>
                  {/* Feature 1: Coverage bar */}
                  <td className="p-3 border-b border-l">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-sp-surface rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${totalRecords === 0 ? 'bg-red-400' : totalRecords < avgRecords ? 'bg-amber-400' : 'bg-green-400'}`}
                          style={{
                            width: `${Math.min(100, avgRecords > 0 ? (totalRecords / (avgRecords * 2)) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                      <span className="text-caption text-sp-muted tabular-nums w-4">
                        {totalRecords}
                      </span>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {/* Feature 5: Student alert cards + existing warning students */}
      {(warningStudents.length > 0 ||
        alertData.noRecords.length > 0 ||
        alertData.attendanceOnly.length > 0 ||
        alertData.overdueFollowUp.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {/* Existing: warning students (attendance threshold) */}
          {warningStudents.length > 0 && (
            <div className="rounded-xl bg-sp-card p-4">
              <button
                onClick={() => toggleAlert('warning')}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">warning</span>
                  주의 학생
                </h4>
                <span className="text-xs text-red-400 font-bold">{warningStudents.length}명</span>
              </button>
              {expandedAlerts.has('warning') && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {warningStudents.map((ws) => (
                    <span
                      key={ws.student.id}
                      className="text-xs px-2 py-1 rounded-lg bg-red-500/10 text-red-400"
                    >
                      {ws.student.name}{' '}
                      <span className="text-red-400/60">{ws.reasons.join(', ')}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {alertData.noRecords.length > 0 && (
            <div className="rounded-xl bg-sp-card p-4">
              <button
                onClick={() => toggleAlert('noRecords')}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">person_off</span>
                  기록 없음
                </h4>
                <span className="text-xs text-amber-400 font-bold">
                  {alertData.noRecords.length}명
                </span>
              </button>
              {expandedAlerts.has('noRecords') && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {alertData.noRecords.map((s) => (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {alertData.attendanceOnly.length > 0 && (
            <div className="rounded-xl bg-sp-card p-4">
              <button
                onClick={() => toggleAlert('attendanceOnly')}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">event_note</span>
                  출결만 있음
                </h4>
                <span className="text-xs text-blue-400 font-bold">
                  {alertData.attendanceOnly.length}명
                </span>
              </button>
              {expandedAlerts.has('attendanceOnly') && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {alertData.attendanceOnly.map((s) => (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {alertData.overdueFollowUp.length > 0 && (
            <div className="rounded-xl bg-sp-card p-4">
              <button
                onClick={() => toggleAlert('overdueFollowUp')}
                className="w-full flex items-center justify-between mb-2"
              >
                <h4 className="text-xs font-bold text-orange-400 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  후속조치 지연
                </h4>
                <span className="text-xs text-orange-400 font-bold">
                  {alertData.overdueFollowUp.length}명
                </span>
              </button>
              {expandedAlerts.has('overdueFollowUp') && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {alertData.overdueFollowUp.map((s) => (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-1 rounded-lg bg-orange-500/10 text-orange-400"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {detail && (
        <RecordDetailModal
          isOpen
          onClose={() => setDetail(null)}
          title={detail.title}
          records={detail.records}
        />
      )}
    </div>
  );
}

export { ProgressMode };
