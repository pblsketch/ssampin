import { useState, useRef, useEffect } from 'react';
import { COUNSELING_METHODS } from './recordUtils';
import type { UseRecordFiltersReturn } from './useRecordFilters';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';

interface RecordFilterPopoverProps {
  categories: readonly RecordCategoryItem[];
  filters: UseRecordFiltersReturn;
}

/**
 * "필터 더보기" 팝오버 — 자주 쓰지 않는 필터(카테고리·서브카테고리·상담방법·
 * 후속조치/나이스/서류 토글)를 필터 줄에서 걷어내 담는다(리디자인 3단계).
 * 트리거 배지에 활성 필터 개수를 표시해 팝오버를 열지 않아도 상태를 알 수 있다.
 * 패턴: DatePopover와 동일(relative 래퍼 + absolute 패널 + mousedown 바깥 닫힘).
 */
export function RecordFilterPopover({ categories, filters }: RecordFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const {
    selectedCategory,
    setSelectedCategory,
    setSelectedSubcategory,
    selectedSubcategory,
    selectedMethod,
    setSelectedMethod,
    followUpOnly,
    setFollowUpOnly,
    unreportedOnly,
    setUnreportedOnly,
    docUnsubmittedOnly,
    setDocUnsubmittedOnly,
    subcategoryOptions,
    advancedFilterCount,
  } = filters;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
          advancedFilterCount > 0
            ? 'bg-sp-surface text-sp-accent border-sp-accent'
            : 'bg-sp-surface text-sp-muted hover:text-sp-text border-sp-border'
        }`}
      >
        <span className="material-symbols-outlined text-sm">tune</span>
        필터 더보기
        {advancedFilterCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-sp-accent text-sp-accent-fg text-caption font-bold tabular-nums">
            {advancedFilterCount}
          </span>
        )}
        <span
          className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-sp-card rounded-xl shadow-xl ring-1 ring-sp-border p-3 w-72 space-y-2.5">
          {/* 카테고리 */}
          <div className="space-y-1">
            <label className="text-caption text-sp-muted">카테고리</label>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setSelectedSubcategory('');
              }}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            >
              <option value="">전체 카테고리</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* 서브카테고리 (카테고리 선택 시) */}
          {subcategoryOptions.length > 0 && (
            <div className="space-y-1">
              <label className="text-caption text-sp-muted">하위 분류</label>
              <select
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
                className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
              >
                <option value="">전체 하위</option>
                {subcategoryOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 상담 방법 */}
          <div className="space-y-1">
            <label className="text-caption text-sp-muted">상담 방법</label>
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent"
            >
              <option value="">전체 방법</option>
              {COUNSELING_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* 상태 토글 */}
          <div className="space-y-1">
            <label className="text-caption text-sp-muted">상태</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFollowUpOnly(!followUpOnly)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  followUpOnly
                    ? 'bg-sp-accent text-sp-accent-fg'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                }`}
              >
                후속조치 미완료
              </button>
              <button
                onClick={() => setUnreportedOnly(!unreportedOnly)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  unreportedOnly
                    ? 'bg-red-500 text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                }`}
              >
                나이스 미반영
              </button>
              <button
                onClick={() => setDocUnsubmittedOnly(!docUnsubmittedOnly)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  docUnsubmittedOnly
                    ? 'bg-orange-500 text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                }`}
              >
                서류 미제출
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
