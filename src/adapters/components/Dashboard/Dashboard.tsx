import { useEffect, useState, useCallback } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { DashboardHeader } from '@widgets/components/DashboardHeader';
import { WidgetGrid } from '@widgets/components/WidgetGrid';
import { WidgetSettingsPanel } from '@widgets/components/WidgetSettingsPanel';
import { ReminderDashboardBadge } from '@adapters/components/Reminder/ReminderDashboardBadge';

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const loadMessage = useMessageStore((s) => s.loadMessage);
  const loadConfig = useDashboardConfig((s) => s.load);
  const fontScale = useSettingsStore((s) => s.settings.dashboardFontScale) ?? 1.0;

  const [panelMode, setPanelMode] = useState<'closed' | 'widgets' | 'style'>('closed');

  useEffect(() => {
    void loadMessage();
    loadConfig();
  }, [loadMessage, loadConfig]);

  const handleOpenWidgetPanel = useCallback(() => {
    setPanelMode('widgets');
  }, []);

  const handleOpenStylePanel = useCallback(() => {
    setPanelMode('style');
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelMode('closed');
  }, []);

  return (
    <div className="h-full flex flex-col" style={{ zoom: fontScale }}>
      {/* 헤더 */}
      <DashboardHeader
        onOpenWidgetPanel={handleOpenWidgetPanel}
        onOpenStylePanel={handleOpenStylePanel}
      />

      {/* 학생 관찰 기록 알림 — 은은형 배지(설정 on + 미기록 있을 때만 렌더) */}
      <ReminderDashboardBadge />

      {/* 본문: 그리드 + 사이드 패널 */}
      <div className="flex-1 flex min-h-0">
        <section className="flex-1 overflow-y-auto pb-8">
          <WidgetGrid onNavigate={onNavigate} />
        </section>

        {/* 인라인 사이드 패널 (위젯 관리 또는 스타일) */}
        {panelMode !== 'closed' && (
          <WidgetSettingsPanel
            initialTab={panelMode === 'style' ? 'style' : 'widgets'}
            styleOnly={panelMode === 'style'}
            onClose={handleClosePanel}
          />
        )}
      </div>
    </div>
  );
}
