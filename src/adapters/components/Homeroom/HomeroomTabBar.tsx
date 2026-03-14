export type HomeroomTab = 'roster' | 'records' | 'survey' | 'consultation' | 'seating';

const TABS: { id: HomeroomTab; icon: string; label: string }[] = [
  { id: 'roster', icon: '👥', label: '명렬 관리' },
  { id: 'records', icon: '📝', label: '기록' },
  { id: 'survey', icon: '📋', label: '설문/체크리스트' },
  { id: 'consultation', icon: '📅', label: '상담 예약' },
  { id: 'seating', icon: '🪑', label: '자리배치' },
];

interface HomeroomTabBarProps {
  activeTab: HomeroomTab;
  onChange: (tab: HomeroomTab) => void;
}

export function HomeroomTabBar({ activeTab, onChange }: HomeroomTabBarProps) {
  return (
    <div className="flex gap-1 bg-sp-surface rounded-lg p-1 overflow-x-auto">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            activeTab === tab.id
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-white'
          }`}
        >
          <span>{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
