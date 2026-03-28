import { useMemo } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { formatDateKR } from './recordUtils';

interface FilterSummaryStripProps {
  filtered: readonly StudentRecord[];
  students: readonly Student[];
  categories: readonly RecordCategoryItem[];
  onCategoryClick: (categoryId: string) => void;
}

export function FilterSummaryStrip({ filtered, students, categories, onCategoryClick }: FilterSummaryStripProps) {
  // Category distribution
  const categoryDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filtered) {
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return categories
      .map((c) => ({ id: c.id, name: c.name.split(' (')[0], color: c.color, count: counts.get(c.id) ?? 0 }))
      .filter((c) => c.count > 0);
  }, [filtered, categories]);

  // Student distribution
  const studentDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of filtered) {
      counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1]);
    const studentMap = new Map(students.map((s) => [s.id, s]));
    const top = sorted.slice(0, 2).map(([id, count]) => ({
      name: studentMap.get(id)?.name ?? '?',
      count,
    }));
    const totalStudents = counts.size;
    const remaining = totalStudents - top.length;
    return { top, totalStudents, remaining };
  }, [filtered, students]);

  // Date range
  const dateRange = useMemo(() => {
    if (filtered.length === 0) return null;
    const dates = filtered.map((r) => r.date).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first === last) return formatDateKR(first!);
    return `${formatDateKR(first!)} ~ ${formatDateKR(last!)}`;
  }, [filtered]);

  if (filtered.length === 0) return null;

  const GRAY = RECORD_COLOR_MAP['gray']!;

  return (
    <div className="flex items-center gap-4 text-xs text-sp-muted py-1.5 flex-wrap">
      {/* Category distribution */}
      <div className="flex items-center gap-2">
        {categoryDist.map((c) => {
          const colorSet = RECORD_COLOR_MAP[c.color] ?? GRAY;
          return (
            <button
              key={c.id}
              onClick={() => onCategoryClick(c.id)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors hover:opacity-80 ${colorSet.tagBg}`}
            >
              {c.name} <span className="font-bold">{c.count}</span>
            </button>
          );
        })}
      </div>

      <span className="text-sp-border">|</span>

      {/* Student distribution */}
      <span>
        {studentDist.top.map((s, i) => (
          <span key={i}>
            {i > 0 && ', '}
            <span className="text-sp-text font-medium">{s.name}</span> {s.count}건
          </span>
        ))}
        {studentDist.remaining > 0 && (
          <span className="text-sp-muted"> 외 {studentDist.remaining}명</span>
        )}
        {studentDist.top.length === 0 && `학생 ${studentDist.totalStudents}명`}
      </span>

      <span className="text-sp-border">|</span>

      {/* Date range */}
      {dateRange && <span>{dateRange}</span>}
    </div>
  );
}
