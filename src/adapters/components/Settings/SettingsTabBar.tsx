import { Fragment } from 'react';
import type { SettingsTabId } from './SettingsPage';
import { TAB_GROUPS } from './SettingsSidebar';

interface Props {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsTabBar({ activeTab, onTabChange }: Props) {
  return (
    <div
      role="tablist"
      className="flex items-center overflow-x-auto py-2 px-4 gap-1 scrollbar-hide"
    >
      {TAB_GROUPS.map((group, gi) => (
        <Fragment key={group.label}>
          {gi > 0 && <span aria-hidden="true" className="h-4 w-px bg-sp-border shrink-0 mx-1" />}
          {group.tabs.map((tab) => (
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
        </Fragment>
      ))}
    </div>
  );
}
