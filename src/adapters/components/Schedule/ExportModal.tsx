import { useState, useMemo } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import type { CategoryItem, SchoolEvent } from '@domain/entities/SchoolEvent';
import type { DateRangeType } from '@domain/entities/EventsShareFile';
import { filterEventsByCategories, filterEventsByDateRange } from '@domain/rules/shareRules';
import { getCategoryColors } from '@adapters/presenters/categoryPresenter';

interface ExportModalProps {
  categories: readonly CategoryItem[];
  events: readonly SchoolEvent[];
  onClose: () => void;
}

const DATE_RANGE_OPTIONS: { key: DateRangeType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'semester', label: '이번 학기' },
  { key: 'month', label: '이번 달' },
  { key: 'custom', label: '직접 지정' },
];

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 학기 날짜 범위 계산 (1학기: 3~7월, 2학기: 9~2월) */
function resolveSemesterRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  if (month >= 3 && month <= 7) {
    // 1학기
    return {
      start: `${year}-03-01`,
      end: `${year}-07-31`,
    };
  } else if (month >= 9) {
    // 2학기 (상반기)
    return {
      start: `${year}-09-01`,
      end: `${year + 1}-02-28`,
    };
  } else {
    // 2학기 (1~2월 = 전년도 9월 시작)
    return {
      start: `${year - 1}-09-01`,
      end: `${year}-02-28`,
    };
  }
}

function resolveMonthRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function ExportModal({ categories, events, onClose }: ExportModalProps) {
  const { exportEvents, triggerExport } = useEventsStore();

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    () => new Set(categories.map((c) => c.id)),
  );
  const [dateRange, setDateRange] = useState<DateRangeType>('all');
  const [customStart, setCustomStart] = useState(getTodayStr());
  const [customEnd, setCustomEnd] = useState(getTodayStr());
  const [description, setDescription] = useState('');
  const [includeNeis, setIncludeNeis] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // NEIS 일정이 존재하는지 확인
  const hasNeisEvents = useMemo(
    () => events.some((e) => e.source === 'neis' && !e.isHidden),
    [events],
  );

  // 전체 선택 여부
  const allSelected = selectedCategories.size === categories.length;

  function toggleAllCategories() {
    if (allSelected) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(categories.map((c) => c.id)));
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // 미리보기 카운트 (useMemo)
  const previewCount = useMemo(() => {
    const catFiltered = filterEventsByCategories(events, [...selectedCategories]);

    if (dateRange === 'all') {
      return catFiltered.length;
    }

    let start: string;
    let end: string;

    if (dateRange === 'semester') {
      const range = resolveSemesterRange();
      start = range.start;
      end = range.end;
    } else if (dateRange === 'month') {
      const range = resolveMonthRange();
      start = range.start;
      end = range.end;
    } else {
      // custom
      start = customStart;
      end = customEnd;
    }

    return filterEventsByDateRange(catFiltered, start, end).length;
  }, [events, selectedCategories, dateRange, customStart, customEnd]);

  async function handleExport() {
    if (previewCount === 0 || isExporting) return;

    setIsExporting(true);
    try {
      let startDate: string | undefined;
      let endDate: string | undefined;

      if (dateRange === 'semester') {
        const range = resolveSemesterRange();
        startDate = range.start;
        endDate = range.end;
      } else if (dateRange === 'month') {
        const range = resolveMonthRange();
        startDate = range.start;
        endDate = range.end;
      } else if (dateRange === 'custom') {
        startDate = customStart;
        endDate = customEnd;
      }

      const shareFile = await exportEvents({
        categoryIds: [...selectedCategories],
        dateRange,
        startDate,
        endDate,
        description: description.trim(),
        includeNeisEvents: includeNeis,
      });

      await triggerExport(shareFile);
      onClose();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-sp-card rounded-2xl border border-sp-border shadow-2xl w-full max-w-[520px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-6 pb-4 border-b border-sp-border">
            <h2 className="text-lg font-bold text-white">일정 내보내기</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-slate-700 rounded-lg transition-colors text-sp-muted hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 바디 */}
          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* 카테고리 선택 */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-sp-text">카테고리 선택</h3>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAllCategories}
                    className="w-4 h-4 rounded border-sp-border bg-sp-bg text-sp-accent focus:ring-sp-accent"
                  />
                  <span className="text-xs text-sp-muted">전체 선택</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {categories.map((cat) => {
                  const colors = getCategoryColors(cat.color);
                  const checked = selectedCategories.has(cat.id);
                  return (
                    <label
                      key={cat.id}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                        checked
                          ? 'border-sp-accent bg-sp-accent/10'
                          : 'border-sp-border bg-sp-bg hover:bg-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat.id)}
                        className="sr-only"
                      />
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                      <span className="text-sm text-sp-text truncate">{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* 기간 선택 */}
            <section>
              <h3 className="text-sm font-semibold text-sp-text mb-3">기간 선택</h3>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {DATE_RANGE_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                      dateRange === key
                        ? 'border-sp-accent bg-sp-accent/10'
                        : 'border-sp-border bg-sp-bg hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dateRange"
                      value={key}
                      checked={dateRange === key}
                      onChange={() => setDateRange(key)}
                      className="sr-only"
                    />
                    <span
                      className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                        dateRange === key ? 'border-sp-accent' : 'border-sp-border'
                      }`}
                    >
                      {dateRange === key && (
                        <span className="w-1.5 h-1.5 rounded-full bg-sp-accent block" />
                      )}
                    </span>
                    <span className="text-sm text-sp-text">{label}</span>
                  </label>
                ))}
              </div>
              {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-sp-muted mb-1.5">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full bg-sp-bg border border-sp-border rounded-xl px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-sp-muted mb-1.5">
                      종료일
                    </label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      min={customStart}
                      className="w-full bg-sp-bg border border-sp-border rounded-xl px-3 py-2 text-sm text-sp-text focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* NEIS 학사일정 포함 옵션 */}
            {hasNeisEvents && (
              <section className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded font-medium border border-purple-500/20">
                    NEIS
                  </span>
                  <span className="text-sm text-sp-text">학사일정 포함</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeNeis}
                    onChange={(e) => setIncludeNeis(e.target.checked)}
                    className="w-4 h-4 rounded border-sp-border bg-sp-bg text-purple-500 focus:ring-purple-500"
                  />
                  <span className="text-xs text-sp-muted">
                    {includeNeis ? '포함' : '제외'}
                  </span>
                </label>
              </section>
            )}

            {/* 설명 */}
            <section>
              <h3 className="text-sm font-semibold text-sp-text mb-3">설명</h3>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="공유 파일에 대한 설명을 입력하세요 (선택사항)"
                rows={2}
                className="w-full bg-sp-bg border border-sp-border rounded-xl px-4 py-2.5 text-sm text-sp-text placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sp-accent focus:border-transparent resize-none"
              />
            </section>

            {/* 미리보기 */}
            <section className="bg-sp-surface rounded-xl border border-sp-border px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-sp-muted">선택된 일정</span>
              <span className="text-sm font-bold text-sp-text">
                <span
                  className={previewCount > 0 ? 'text-sp-accent' : 'text-sp-muted'}
                >
                  {previewCount}개
                </span>
              </span>
            </section>
          </div>

          {/* 푸터 */}
          <div className="flex gap-3 p-6 pt-4 border-t border-sp-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-sp-border px-4 py-2.5 text-sm font-semibold text-sp-muted hover:bg-sp-surface transition-all"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={previewCount === 0 || isExporting}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sp-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">upload</span>
              {isExporting ? '내보내는 중...' : '내보내기'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
