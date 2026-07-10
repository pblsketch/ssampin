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
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  summarizeNeisAttendance,
  type NeisAttendanceCounts,
  type NeisReasonAxis,
} from '@domain/rules/attendanceRules';
import { SummaryCard, StatBadge } from './RecordStatCards';
import {
  type ModeProps,
  getWeekRange,
  getMonthRange,
  METHOD_OPTIONS,
  formatDateKR,
  getAttendanceTypeFromSubcategory,
  getRecordChipLabel,
} from './recordUtils';
import { studentRecordToDisplay, type DisplayRecord } from '@adapters/presentation/displayRecord';
import { RecordDetailModal } from '@adapters/components/common/records/RecordDetailModal';

type StatBadgeColor = ComponentProps<typeof StatBadge>['color'];

/* ── 생활기록부 기준 출결 집계 (P6 — 기재요령 별표 8 §3 정합) ── */

const NEIS_STATUS_COLUMNS = [
  { key: 'absent', label: '결석' },
  { key: 'late', label: '지각' },
  { key: 'earlyLeave', label: '조퇴' },
  { key: 'classAbsence', label: '결과' },
] as const;

const NEIS_REASON_AXES: readonly NeisReasonAxis[] = ['질병', '미인정', '기타'];

const NEIS_FOOTNOTE =
  '같은 날 지각·조퇴·결과가 겹치면 학교생활기록부 기재요령에 따라 한 가지로만 집계합니다(학교장 판단 사항 — 쌤핀 기본: 결석>조퇴>지각>결과). 출석인정(인정) 사유는 횟수에 포함하지 않습니다. 결석은 교시 수와 무관하게 1일 1회입니다.';

function NeisAttendanceSection({
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
  const attendanceRecords = useTeachingClassStore((s) => s.attendanceRecords);
  const [open, setOpen] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

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

  /* 인쇄 — 현재 보기(요약/사유 상세) 그대로 A4 가로 인쇄 (2종 옵션) */
  const handlePrint = useCallback(() => {
    const title = `${className || '우리 반'} 출결 집계 (${periodLabel})`;
    const headCols = showBreakdown
      ? NEIS_STATUS_COLUMNS.map((c) => `<th colspan="4">${c.label}</th>`).join('')
      : NEIS_STATUS_COLUMNS.map((c) => `<th>${c.label}</th>`).join('');
    const subHead = showBreakdown
      ? `<tr><th></th><th></th>${NEIS_STATUS_COLUMNS.map(
          () => `<th>계</th>${NEIS_REASON_AXES.map((r) => `<th>${r}</th>`).join('')}`,
        ).join('')}</tr>`
      : '';
    const bodyRows = rows
      .map((s) => {
        const c = stats.get(String(s.studentNumber ?? 0));
        const cells = NEIS_STATUS_COLUMNS.map((col) => {
          const total = c?.[col.key] ?? 0;
          if (!showBreakdown) return `<td>${total || ''}</td>`;
          const reasons = NEIS_REASON_AXES.map(
            (r) => `<td>${c?.byReason[r][col.key] || ''}</td>`,
          ).join('');
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
        const reasonTotals = NEIS_REASON_AXES.map((r) => {
          let sum = 0;
          for (const c of stats.values()) sum += c.byReason[r][col.key];
          return `<td>${sum || ''}</td>`;
        }).join('');
        return `<td>${totals[col.key] || ''}</td>${reasonTotals}`;
      }).join('')}</tr></tfoot></table>
      <p class="footnote">${NEIS_FOOTNOTE}</p>
    </body></html>`;
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }, [className, periodLabel, showBreakdown, rows, stats, totals]);

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl bg-sp-card p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="material-symbols-outlined text-base text-sp-accent">table_chart</span>
          <span className="text-sm font-bold text-sp-text">출결 집계 (생활기록부 기준)</span>
          <span className="text-xs text-sp-muted">{periodLabel}</span>
          <span className="material-symbols-outlined text-sp-muted text-base">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </button>
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
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text transition-colors"
          title="현재 보기(요약/사유 상세)를 A4 가로로 인쇄"
        >
          <span className="material-symbols-outlined text-sm">print</span>
          인쇄
        </button>
      </div>

      {open && (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-sp-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-sp-surface text-sp-muted">
                  <th rowSpan={showBreakdown ? 2 : 1} className="px-2 py-2 text-sm font-medium">
                    번호
                  </th>
                  <th
                    rowSpan={showBreakdown ? 2 : 1}
                    className="px-3 py-2 text-sm font-medium text-left"
                  >
                    이름
                  </th>
                  {NEIS_STATUS_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      colSpan={showBreakdown ? 4 : 1}
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
                        <th className="px-2 py-1 text-xs font-medium border-l border-sp-border">
                          계
                        </th>
                        {NEIS_REASON_AXES.map((r) => (
                          <th key={r} className="px-2 py-1 text-xs font-normal">
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
                    <tr key={s.id} className="hover:bg-sp-surface/50 transition-colors">
                      <td className="px-2 py-1.5 text-center text-sm text-sp-muted tabular-nums">
                        {s.studentNumber}
                      </td>
                      <td className="px-3 py-1.5 text-sm text-sp-text whitespace-nowrap">
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
                              NEIS_REASON_AXES.map((r) => {
                                const v = c?.byReason[r][col.key] ?? 0;
                                return (
                                  <td
                                    key={r}
                                    className={`px-2 py-1.5 text-center text-xs ${
                                      v > 0 ? 'text-sp-text' : 'text-sp-muted/30'
                                    }`}
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
                        NEIS_REASON_AXES.map((r) => {
                          let sum = 0;
                          for (const c of stats.values()) sum += c.byReason[r][col.key];
                          return (
                            <td key={r} className="px-2 py-1.5 text-center text-xs text-sp-muted">
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
          <p className="mt-2 text-caption text-sp-muted leading-relaxed">{NEIS_FOOTNOTE}</p>
        </>
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
  const { bulkMarkDocumentSubmitted } = useStudentRecordsStore();
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all');
  const [statsTab, setStatsTab] = useState<StatsTab>('attendance');
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const monthRange = useMemo(() => getMonthRange(), []);
  const [customStart, setCustomStart] = useState<string>(toDateInputString(monthRange.start));
  const [customEnd, setCustomEnd] = useState<string>(toDateInputString(monthRange.end));

  // Feature 2: NEIS drill-down toggle
  const [showNeisDetail, setShowNeisDetail] = useState(false);

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

  // Feature 2: NEIS unreported detail data
  const unreportedCount = useMemo(() => {
    return records.filter((r) => r.category === 'attendance' && !r.reportedToNeis).length;
  }, [records]);

  const neisDetail = useMemo(() => {
    const unreported = records.filter((r) => r.category === 'attendance' && !r.reportedToNeis);
    const byStudent = new Map<string, StudentRecord[]>();
    for (const r of unreported) {
      const arr = byStudent.get(r.studentId) ?? [];
      arr.push(r as StudentRecord);
      byStudent.set(r.studentId, arr);
    }
    return Array.from(byStudent.entries())
      .map(([studentId, recs]) => ({
        student: students.find((s) => s.id === studentId),
        records: recs,
      }))
      .filter((d) => d.student);
  }, [records, students]);

  // Document-not-submitted detail data
  const [showDocDetail, setShowDocDetail] = useState(false);

  const docUnsubmittedCount = useMemo(() => {
    return records.filter((r) => r.category === 'attendance' && !r.documentSubmitted).length;
  }, [records]);

  const docDetail = useMemo(() => {
    const unsubmitted = records.filter((r) => r.category === 'attendance' && !r.documentSubmitted);
    const byStudent = new Map<string, StudentRecord[]>();
    for (const r of unsubmitted) {
      const arr = byStudent.get(r.studentId) ?? [];
      arr.push(r as StudentRecord);
      byStudent.set(r.studentId, arr);
    }
    return Array.from(byStudent.entries())
      .map(([studentId, recs]) => ({
        student: students.find((s) => s.id === studentId),
        records: recs,
      }))
      .filter((d) => d.student);
  }, [records, students]);

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
      const docSubmitted = studentRecs.filter(
        (r) => r.category === 'attendance' && r.documentSubmitted,
      ).length;

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
  }, [students, filteredRecords, sortKey, sortDir]);

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

      {/* Feature 2: NEIS warning - clickable drill-down */}
      {unreportedCount > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowNeisDetail(!showNeisDetail)}
            aria-expanded={showNeisDetail}
            className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs text-left"
          >
            <span className="material-symbols-outlined text-icon-sm">warning</span>
            나이스 미반영 출결 기록 {unreportedCount}건
            <span
              className={`material-symbols-outlined text-sm ml-auto transition-transform ${showNeisDetail ? 'rotate-180' : ''}`}
            >
              expand_more
            </span>
          </button>
          {showNeisDetail && (
            <div className="rounded-lg bg-sp-card p-3 space-y-2 border border-sp-border">
              {neisDetail.map(({ student, records: recs }) => (
                <div key={student!.id} className="flex items-center gap-3 text-xs">
                  <span className="font-medium text-sp-text min-w-[60px]">{student!.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {recs.map((r) => (
                      <span
                        key={r.id}
                        className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400"
                      >
                        {formatDateKR(r.date)} {getRecordChipLabel(r, categories)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document not-submitted warning - clickable drill-down */}
      {docUnsubmittedCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDocDetail(!showDocDetail)}
              aria-expanded={showDocDetail}
              className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs text-left"
            >
              <span className="material-symbols-outlined text-icon-sm">description</span>
              서류 미제출 출결 기록 {docUnsubmittedCount}건
              <span
                className={`material-symbols-outlined text-sm ml-auto transition-transform ${showDocDetail ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `서류 미제출 출결 기록 ${docUnsubmittedCount}건을 모두 제출 완료로 처리하시겠습니까?`,
                  )
                )
                  void bulkMarkDocumentSubmitted(
                    records
                      .filter((r) => r.category === 'attendance' && !r.documentSubmitted)
                      .map((r) => r.id),
                  );
              }}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs hover:bg-green-500/20 transition-colors whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-icon-sm">done_all</span>
              전체 제출 완료
            </button>
          </div>
          {showDocDetail && (
            <div className="rounded-lg bg-sp-card p-3 space-y-2 border border-sp-border">
              {docDetail.map(({ student, records: recs }) => (
                <div key={student!.id} className="flex items-center gap-3 text-xs">
                  <span className="font-medium text-sp-text min-w-[60px]">{student!.name}</span>
                  <div className="flex flex-wrap gap-1">
                    {recs.map((r) => (
                      <span
                        key={r.id}
                        className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400"
                      >
                        {formatDateKR(r.date)} {getRecordChipLabel(r, categories)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* 생활기록부 기준 출결 집계 — 일 단위 대표 접기 + 인정 제외 + 사유 드릴다운 + 인쇄 (P6) */}
      <NeisAttendanceSection
        students={students}
        dateFrom={neisRange.from}
        dateTo={neisRange.to}
        periodLabel={neisRange.label}
      />

      {/* Stats table */}
      <div className="flex-1 overflow-auto rounded-xl bg-sp-card">
        <table className="w-full text-sm border-collapse timetable-grid">
          <thead>
            <tr className="text-sp-muted">
              <SortHeader label="번호" sortId="number" className="text-left" />
              <SortHeader label="이름" sortId="name" className="text-left" />
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
                  <th className="p-3 font-medium border-b text-center border-l text-sp-muted">
                    서류
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
                docSubmitted,
                methodCounts,
                subCounts,
              }) => (
                <tr key={student.id} className="hover:bg-sp-surface/30 transition-colors">
                  <td className="p-3 text-sp-muted border-b">{idx + 1}</td>
                  <td className="p-3 text-sp-text font-medium border-b">{student.name}</td>
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
                      {/* Document submitted/total */}
                      <td
                        className={`text-center p-3 border-b border-l text-xs ${docSubmitted < attendanceTotal ? 'text-orange-400 font-medium' : 'text-green-400'}`}
                      >
                        {attendanceTotal > 0 ? `${docSubmitted}/${attendanceTotal}` : '-'}
                      </td>
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
