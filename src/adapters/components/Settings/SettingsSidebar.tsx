import type { SettingsTabId } from './SettingsPage';

interface TabDef {
  id: SettingsTabId;
  icon: string;
  label: string;
  color: string;
}

const TABS: TabDef[] = [
  { id: 'school',   icon: 'school',                label: '학교 정보',  color: 'bg-blue-500/10 text-blue-400' },
  { id: 'period',   icon: 'schedule',              label: '교시 시간',  color: 'bg-emerald-500/10 text-emerald-400' },
  { id: 'widget',   icon: 'widgets',               label: '위젯',      color: 'bg-indigo-500/10 text-indigo-400' },
  { id: 'seat',     icon: 'chair',                 label: '좌석',      color: 'bg-orange-500/10 text-orange-400' },
  { id: 'security', icon: 'lock',                  label: '보안',      color: 'bg-red-500/10 text-red-400' },
  { id: 'calendar', icon: 'event',                 label: '일정',      color: 'bg-pink-500/10 text-pink-400' },
  { id: 'weather',  icon: 'cloud',                 label: '날씨',      color: 'bg-sky-500/10 text-sky-500' },
  { id: 'display',  icon: 'palette',               label: '디스플레이', color: 'bg-yellow-500/10 text-yellow-500' },
  { id: 'sidebar',  icon: 'menu',                  label: '사이드바',   color: 'bg-slate-500/10 text-slate-400' },
  { id: 'sync',     icon: 'cloud_sync',            label: '구글 드라이브 동기화', color: 'bg-cyan-500/10 text-cyan-400' },
  { id: 'system',   icon: 'settings_applications', label: '시스템',     color: 'bg-gray-500/10 text-gray-400' },
  { id: 'about',    icon: 'info',                  label: '앱 정보',   color: 'bg-violet-500/10 text-violet-400' },
];

export { TABS };

interface Props {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: Props) {
  return (
    <nav className="w-56 shrink-0 border-r border-sp-border bg-sp-card/50 overflow-y-auto py-4 px-3 h-full">
      <div className="space-y-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                isActive
                  ? 'bg-sp-accent/10 text-sp-accent ring-1 ring-sp-accent/20'
                  : 'text-sp-muted hover:bg-sp-text/5 hover:text-sp-text'
              }`}
            >
              <div className={`p-1.5 rounded-md ${isActive ? 'bg-sp-accent/15 text-sp-accent' : tab.color}`}>
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-sp-accent' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
