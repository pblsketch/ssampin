import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { useMobileStudentRecordsStore } from '@mobile/stores/useMobileStudentRecordsStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { EmptyState } from '@mobile/components/common/EmptyState';
import { CATEGORY_COLORS } from './shared';

// ============================================================
// 학생 기록 전체 모아보기 (S1 풀시트)
// ============================================================

interface StudentRecordsFullSheetProps {
  studentId: string;
  studentName: string;
  onClose: () => void;
}

interface MonthGroup {
  key: string;
  label: string;
  records: StudentRecord[];
}

function groupRecordsByMonth(records: readonly StudentRecord[]): MonthGroup[] {
  const map = new Map<string, StudentRecord[]>();
  for (const r of records) {
    const key = r.date.slice(0, 7);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return Array.from(map.entries()).map(([key, recs]) => {
    const [y, m] = key.split('-');
    return { key, label: `${y}년 ${Number(m)}월`, records: recs };
  });
}

function formatMonthDay(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function StudentRecordsFullSheet({
  studentId,
  studentName,
  onClose,
}: StudentRecordsFullSheetProps) {
  useBottomSheet(true, onClose);
  const load = useMobileStudentRecordsStore((s) => s.load);
  const getRecords = useMobileStudentRecordsStore((s) => s.getRecordsByStudentId);
  const categories = useMobileStudentRecordsStore((s) => s.categories);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void load();
  }, [load]);

  const allRecords = getRecords(studentId, Number.POSITIVE_INFINITY);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRecords) {
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
    }
    return counts;
  }, [allRecords]);

  const filteredRecords = useMemo(() => {
    if (selectedCategory === 'all') return allRecords;
    return allRecords.filter((r) => r.category === selectedCategory);
  }, [allRecords, selectedCategory]);

  const monthGroups = useMemo(() => groupRecordsByMonth(filteredRecords), [filteredRecords]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={handleBackdropClick}>
      {/* 반투명 배경 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 시트 */}
      <div
        className="relative w-full h-[85dvh] glass-card rounded-t-2xl pb-safe flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${studentName} 전체 기록`}
      >
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-sp-border" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-sp-border shrink-0">
          <p className="text-sp-text font-bold text-base">
            {studentName} · 전체 기록 {allRecords.length}건
          </p>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="material-symbols-outlined text-sp-muted">close</span>
          </button>
        </div>

        {/* 카테고리 필터 칩 */}
        <div
          className="flex gap-1.5 px-5 py-3 overflow-x-auto no-scrollbar shrink-0"
          role="tablist"
          aria-label="기록 분류 필터"
        >
          <button
            role="tab"
            aria-selected={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
              selectedCategory === 'all'
                ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                : 'border-sp-border text-sp-muted'
            }`}
          >
            전체 {allRecords.length}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              role="tab"
              aria-selected={selectedCategory === cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`shrink-0 min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium border ${
                selectedCategory === cat.id
                  ? 'bg-sp-accent text-sp-accent-fg border-sp-accent'
                  : 'border-sp-border text-sp-muted'
              }`}
            >
              {cat.name.split('(')[0]?.trim()} {categoryCounts.get(cat.id) ?? 0}
            </button>
          ))}
        </div>

        {/* 타임라인 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {allRecords.length === 0 ? (
            <EmptyState
              mascot
              text="아직 기록이 없습니다."
              hint="학생 상세에서 기록을 추가해보세요."
            />
          ) : filteredRecords.length === 0 ? (
            <EmptyState icon="filter_alt_off" text="해당 분류의 기록이 없습니다." />
          ) : (
            monthGroups.map((group) => (
              <div key={group.key}>
                <p className="text-sp-muted text-xs font-semibold mb-2 px-1 sticky top-0 bg-sp-card py-1 -mx-1">
                  {group.label}
                </p>
                <div className="space-y-2">
                  {group.records.map((rec) => (
                    <RecordRow
                      key={rec.id}
                      record={rec}
                      categories={categories}
                      expanded={expandedIds.has(rec.id)}
                      onToggle={() => toggleExpand(rec.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 기록 행 — 읽기 전용, 내용이 1줄을 넘을 때만 펼치기 화살표를 보여준다.
// ------------------------------------------------------------
function RecordRow({
  record,
  categories,
  expanded,
  onToggle,
}: {
  record: StudentRecord;
  categories: readonly RecordCategoryItem[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [record.content]);

  const cat = categories.find((c) => c.id === record.category);
  const colorClass = CATEGORY_COLORS[cat?.color ?? 'gray'] ?? 'bg-gray-400';
  const label =
    record.category === 'attendance' ? record.subcategory : (record.tags?.join(' · ') ?? '');

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 flex rounded-xl overflow-hidden">
      <div className={`w-1 shrink-0 ${colorClass}`} />
      <button
        type="button"
        onClick={onToggle}
        disabled={!canExpand}
        aria-expanded={canExpand ? expanded : undefined}
        className="flex-1 p-3 text-left min-h-[44px]"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-sp-muted tabular-nums">{formatMonthDay(record.date)}</span>
          {label && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-sp-muted">
              {label}
            </span>
          )}
          {canExpand && (
            <span
              className={`material-symbols-outlined text-sm text-sp-muted ml-auto transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            >
              expand_more
            </span>
          )}
        </div>
        <p ref={textRef} className={`text-sp-text text-sm ${expanded ? '' : 'line-clamp-1'}`}>
          {record.content}
        </p>
      </button>
    </div>
  );
}
