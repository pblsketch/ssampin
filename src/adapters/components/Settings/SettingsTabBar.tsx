import type { SettingsTabId } from './SettingsPage';
import { TABS } from './SettingsSidebar';

interface Props {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div role="tablist" className="flex overflow-x-auto py-2 px-4 gap-1 scrollbar-hide">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap text-sm shrink-0 transition-all ${
            activeTab === tab.id
              ? 'bg-sp-accent/10 text-sp-accent font-medium'
              : 'text-sp-muted hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
