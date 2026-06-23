import { useMemo } from 'react';
import { formatDateKR } from '@adapters/components/common/calendarUtils';
import type { DisplayRecord } from '@adapters/presentation/displayRecord';

interface RecordResultSummaryProps {
  /** 현재 필터 결과(표시 ViewModel). */
  records: readonly DisplayRecord[];
}

/**
 * 조회 결과 요약 띠 공용 부품 — 분포(구분별 건수) · 상위 학생 · 날짜 범위.
 *
 * 도메인 무관 {@link DisplayRecord}만 받으므로 담임/수업 양쪽이 동일하게 사용 가능.
 * (담임은 현재 색칩형 FilterSummaryStrip 유지 — 수렴은 후속.)
 */
export function RecordResultSummary({ records }: RecordResultSummaryProps) {
  const summary = useMemo(() => {
    const kindCounts = new Map<string, number>();
    const studentCounts = new Map<string, { name: string; count: number }>();
    for (const r of records) {
      kindCounts.set(r.kindLabel, (kindCounts.get(r.kindLabel) ?? 0) + 1);
      const existing = studentCounts.get(r.studentKey);
      if (existing) existing.count += 1;
      else studentCounts.set(r.studentKey, { name: r.studentName, count: 1 });
    }
    const kinds = Array.from(kindCounts.entries()).map(([label, count]) => ({ label, count }));
    const students = Array.from(studentCounts.values()).sort((a, b) => b.count - a.count);
    const top = students.slice(0, 2);
    const remaining = students.length - top.length;

    let dateRange: string | null = null;
    if (records.length > 0) {
      const dates = records.map((r) => r.date).sort();
      const first = dates[0]!;
      const last = dates[dates.length - 1]!;
      dateRange =
        first === last ? formatDateKR(first) : `${formatDateKR(first)} ~ ${formatDateKR(last)}`;
    }

    return { kinds, top, remaining, totalStudents: students.length, dateRange };
  }, [records]);

  if (records.length === 0) return null;

  return (
    <div className="flex items-center gap-4 text-xs text-sp-muted py-1.5 flex-wrap">
      {/* 구분별 분포 */}
      <div className="flex items-center gap-2">
        {summary.kinds.map((k) => (
          <span
            key={k.label}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sp-surface"
          >
            {k.label} <span className="font-bold text-sp-text">{k.count}</span>
          </span>
        ))}
      </div>

      <span className="text-sp-border">|</span>

      {/* 상위 학생 */}
      <span>
        {summary.top.map((s, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <span className="text-sp-text font-medium">{s.name}</span> {s.count}건
          </span>
        ))}
        {summary.remaining > 0 && <span> 외 {summary.remaining}명</span>}
        {summary.top.length === 0 && `학생 ${summary.totalStudents}명`}
      </span>

      {/* 날짜 범위 */}
      {summary.dateRange && (
        <>
          <span className="text-sp-border">|</span>
          <span>{summary.dateRange}</span>
        </>
      )}
    </div>
  );
}
