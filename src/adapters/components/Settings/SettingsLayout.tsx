import { useRef, useEffect } from 'react';
import type { Settings } from '@domain/entities/Settings';
import type { SettingsTabId } from './SettingsPage';
import { SettingsSidebar } from './SettingsSidebar';
import { SettingsTabBar } from './SettingsTabBar';
import { SchoolTab } from './tabs/SchoolTab';
import { PeriodTab } from './tabs/PeriodTab';
import { WidgetTab } from './tabs/WidgetTab';
import { SeatTab } from './tabs/SeatTab';
import { SecurityTab } from './tabs/SecurityTab';
import { SidebarTab } from './tabs/SidebarTab';
import { CalendarTab } from './tabs/CalendarTab';
import { WeatherTab } from './tabs/WeatherTab';
import { DisplayTab } from './tabs/DisplayTab';
import { SystemTab } from './tabs/SystemTab';
import { AboutTab } from './tabs/AboutTab';
import { GoogleIntegrationTab } from './tabs/GoogleIntegrationTab';
import { TodoTab } from './tabs/TodoTab';
import { ToolsTab } from './tabs/ToolsTab';
interface Props {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId) => void;
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Settings>>;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
  showReset: boolean;
  setShowReset: (v: boolean) => void;
}

export function SettingsLayout({
  activeTab, onTabChange, draft, patch, setDraft,
  saving, onSave, onReset, showReset, setShowReset,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-8 py-5 bg-sp-bg border-b border-sp-border z-10">
        <h2 className="text-2xl font-black text-sp-text tracking-tight flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-muted">settings</span>
          설정
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowReset(true)}
            className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:bg-sp-text/5 hover:text-sp-text font-medium text-sm transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-icon">refresh</span>
            초기화
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm shadow-lg shadow-sp-accent/25 transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-icon">save</span>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </header>

      {/* Body: Sidebar + Content */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop: 좌측 사이드바 */}
        <div className="hidden md:block">
          <SettingsSidebar activeTab={activeTab} onTabChange={onTabChange} />
        </div>

        {/* Mobile: 상단 탭바 + Content */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="md:hidden shrink-0 bg-sp-bg border-b border-sp-border">
            <SettingsTabBar activeTab={activeTab} onTabChange={onTabChange} />
          </div>

          <main ref={contentRef} className="flex-1 overflow-y-auto p-8">
            <div className="max-w-3xl mx-auto">
              <TabContent activeTab={activeTab} draft={draft} patch={patch} setDraft={setDraft} />
            </div>
          </main>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showReset && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" aria-hidden="true">
          <div
            className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title-settings-reset"
          >
            <h3 id="modal-title-settings-reset" className="text-lg font-bold text-sp-text mb-2">설정 초기화</h3>
            <p className="text-sm text-sp-muted mb-6">
              변경사항을 저장하지 않고 마지막 저장 상태로 되돌리시겠습니까?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowReset(false)}
                className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium transition-colors"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabContent({ activeTab, draft, patch, setDraft }: {
  activeTab: SettingsTabId;
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
  setDraft: React.Dispatch<React.SetStateAction<Settings>>;
}) {
  switch (activeTab) {
    case 'google':    return <GoogleIntegrationTab />;
    case 'school':    return <SchoolTab draft={draft} patch={patch} />;
    case 'period':    return <PeriodTab draft={draft} patch={patch} />;
    case 'widget':    return <WidgetTab draft={draft} patch={patch} />;
    case 'seat':      return <SeatTab draft={draft} patch={patch} />;
    case 'security':  return <SecurityTab draft={draft} patch={patch} />;
    case 'calendar':  return <CalendarTab draft={draft} patch={patch} />;
    case 'weather':   return <WeatherTab draft={draft} patch={patch} />;
    case 'display':   return <DisplayTab draft={draft} patch={patch} />;
    case 'sidebar':   return <SidebarTab draft={draft} patch={patch} />;
    case 'todo':      return <TodoTab draft={draft} patch={patch} />;
    case 'tools':     return <ToolsTab />;
    case 'system':    return <SystemTab draft={draft} patch={patch} setDraft={setDraft} />;
    case 'about':     return <AboutTab />;
    default:          return null;
  }
}
