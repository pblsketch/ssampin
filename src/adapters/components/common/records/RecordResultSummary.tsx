import { useMemo } from 'react';
import { formatDateKR } from '@adapters/components/common/calendarUtils';
import type { DisplayRecord } from '@adapters/presentation/displayRecord';

interface RecordResultSummaryProps {
  /** 현재 필터 결과(표시 ViewModel). */
  records: readonly DisplayRecord[];
  /**
   * 구분 칩 색상 클래스(tailwind) 해석기. kindKey를 받아 배경+글자색 클래스를 반환.
   * 미지정 시 회색 칩(bg-sp-surface).
   */
  chipClassName?: (kindKey: string) => string;
  /** 구분 칩 클릭 핸들러(필터 토글). 미지정 시 클릭 불가(span 렌더). */
  onKindClick?: (kindKey: string) => void;
  /** 현재 활성(선택)된 kindKey — 강조 표시용. */
  activeKind?: string;
}

/**
 * 조회 결과 요약 띠 공용 부품 — 분포(구분별 건수) · 상위 학생 · 날짜 범위.
 *
 * 도메인 무관 {@link DisplayRecord}만 받으므로 담임/수업 양쪽이 동일하게 사용한다.
 * 색상·클릭(카테고리 필터 토글)은 호출부가 주입 — 담임은 카테고리 색/클릭,
 * 수업은 출결/특기 색/클릭을 넘겨 동일한 부품으로 양쪽 경험을 통일한다.
 */
export function RecordResultSummary({
  records,
  chipClassName,
  onKindClick,
  activeKind,
}: RecordResultSummaryProps) {
  const summary = useMemo(() => {
    const kindMap = new Map<string, { key: string; label: string; count: number }>();
    const studentCounts = new Map<string, { name: string; count: number }>();
    for (const r of records) {
      const existingKind = kindMap.get(r.kindKey);
      if (existingKind) existingKind.count += 1;
      else kindMap.set(r.kindKey, { key: r.kindKey, label: r.kindLabel, count: 1 });
      const existing = studentCounts.get(r.studentKey);
      if (existing) existing.count += 1;
      else studentCounts.set(r.studentKey, { name: r.studentName, count: 1 });
    }
    const kinds = Array.from(kindMap.values());
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
        {summary.kinds.map((k) => {
          const colorClass = chipClassName?.(k.key) ?? 'bg-sp-surface';
          const isActive = activeKind != null && activeKind === k.key;
          const content = (
            <>
              {k.label} <span className="font-bold">{k.count}</span>
            </>
          );
          return onKindClick ? (
            <button
              key={k.key}
              onClick={() => onKindClick(k.key)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-all hover:opacity-80 ${colorClass} ${
                isActive ? 'ring-1 ring-sp-accent' : ''
              }`}
            >
              {content}
            </button>
          ) : (
            <span
              key={k.key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${colorClass}`}
            >
              {content}
            </span>
          );
        })}
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
