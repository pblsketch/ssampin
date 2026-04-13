export type AccentColor = 'red' | 'amber' | 'orange' | 'purple';

interface AccentClasses {
  allActive: string;
  allInactive: string;
  periodActive: string;
  periodInactive: string;
  border: string;
  hint: string;
}

const ACCENT_CLASSES: Record<AccentColor, AccentClasses> = {
  red: {
    allActive: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40',
    allInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text',
    periodActive: 'bg-red-500/20 text-red-200 ring-1 ring-red-500/50',
    periodInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80',
    border: 'border-red-500/30',
    hint: 'text-red-300/80',
  },
  amber: {
    allActive: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40',
    allInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text',
    periodActive: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/50',
    periodInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80',
    border: 'border-amber-500/30',
    hint: 'text-amber-300/80',
  },
  orange: {
    allActive: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40',
    allInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text',
    periodActive: 'bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/50',
    periodInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80',
    border: 'border-orange-500/30',
    hint: 'text-orange-300/80',
  },
  purple: {
    allActive: 'bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/40',
    allInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text',
    periodActive: 'bg-purple-500/20 text-purple-200 ring-1 ring-purple-500/50',
    periodInactive: 'bg-sp-surface text-sp-muted hover:text-sp-text hover:bg-sp-surface/80',
    border: 'border-purple-500/30',
    hint: 'text-purple-300/80',
  },
};

interface Props {
  periodCount: number;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  accent?: AccentColor;
}

export function PeriodChipGroup({ periodCount, selected, onChange, accent = 'red' }: Props) {
  const classes = ACCENT_CLASSES[accent];
  const allSelected = selected.size === periodCount;
  const emptyMeansAll = selected.size === 0;

  const toggleAll = () => {
    if (allSelected || emptyMeansAll) {
      // 전체 → 해제 (빈 Set = 전체 의미와 동일하므로 명시적 전체 선택 상태로)
      if (emptyMeansAll) {
        onChange(new Set(Array.from({ length: periodCount }, (_, i) => i + 1)));
      } else {
        onChange(new Set());
      }
    } else {
      onChange(new Set(Array.from({ length: periodCount }, (_, i) => i + 1)));
    }
  };

  const togglePeriod = (p: number) => {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  };

  // "전체" 활성: 실제로 전부 선택됐거나, 아무것도 선택 안 됐을 때(기본 = 전체 의미)
  const allActive = allSelected || emptyMeansAll;
  const sortedSelected = Array.from(selected).sort((a, b) => a - b);

  return (
    <div className={`ml-2 pl-3 border-l-2 ${classes.border} space-y-1.5`}>
      <p className="text-[11px] text-sp-muted">적용 교시</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={toggleAll}
          className={[
            'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
            allActive ? classes.allActive : classes.allInactive,
          ].join(' ')}
        >
          {allActive && <span className="mr-1">✓</span>}전체
        </button>
        {Array.from({ length: periodCount }, (_, i) => i + 1).map((p) => {
          const on = selected.has(p) && !allSelected;
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePeriod(p)}
              className={[
                'min-w-[32px] px-2 py-1 rounded-lg text-xs font-mono tabular-nums transition-all',
                on ? classes.periodActive : classes.periodInactive,
              ].join(' ')}
            >
              {p}
            </button>
          );
        })}
      </div>
      {sortedSelected.length > 0 && !allSelected && (
        <p className={`text-[11px] ${classes.hint}`}>
          {sortedSelected.join('·')}교시 선택됨
        </p>
      )}
    </div>
  );
}
