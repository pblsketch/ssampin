import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { MiniMonth } from './MiniMonth';

interface YearViewProps {
  year: number;
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onNavigateToMonth: (month: number) => void;
  onPrevYear: () => void;
  onNextYear: () => void;
}

export function YearView({
  year,
  events,
  categories,
  onNavigateToMonth,
  onPrevYear,
  onNextYear,
}: YearViewProps) {
  return (
    <div className="bg-sp-card rounded-3xl p-6 border border-sp-border shadow-xl">
      {/* 연도 네비게이션 */}
      <div className="flex items-center justify-between mb-6 px-2">
        <button
          type="button"
          onClick={onPrevYear}
          className="p-2 hover:bg-sp-surface rounded-full transition-colors text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <h3 className="text-xl font-bold text-sp-text">{year}년</h3>
        <button
          type="button"
          onClick={onNextYear}
          className="p-2 hover:bg-sp-surface rounded-full transition-colors text-sp-muted hover:text-sp-text"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* 12개 미니 캘린더 (4×3 그리드) */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, i) => (
          <MiniMonth
            key={i}
            year={year}
            month={i}
            events={events}
            categories={categories}
            onClick={() => onNavigateToMonth(i)}
          />
        ))}
      </div>
    </div>
  );
}
