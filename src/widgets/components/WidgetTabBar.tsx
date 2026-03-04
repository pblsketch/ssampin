import type { WidgetCategory } from '../types';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../constants';

export type TabFilter = 'all' | WidgetCategory;

const TAB_ITEMS: readonly { key: TabFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  ...CATEGORY_ORDER.map((cat) => ({ key: cat as TabFilter, label: CATEGORY_LABELS[cat] })),
];

interface WidgetTabBarProps {
  activeTab: TabFilter;
  onTabChange: (tab: TabFilter) => void;
}

export function WidgetTabBar({ activeTab, onTabChange }: WidgetTabBarProps) {
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {TAB_ITEMS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            whitespace-nowrap transition-colors
            ${activeTab === tab.key
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-sp-text hover:bg-sp-card/50'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
