import { useEffect, useState } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { DashboardHeader } from '@widgets/components/DashboardHeader';
import { WidgetGrid } from '@widgets/components/WidgetGrid';
import { WidgetSettings } from '@widgets/components/WidgetSettings';

export function Dashboard() {
  const loadMessage = useMessageStore((s) => s.loadMessage);
  const loadConfig = useDashboardConfig((s) => s.load);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    void loadMessage();
    loadConfig();
  }, [loadMessage, loadConfig]);

  return (
    <div className="h-full flex flex-col">
      {/* 헤더: 날짜/날씨 + 메시지 배너 + 설정/편집 버튼 */}
      <DashboardHeader
        onOpenSettings={() => setSettingsOpen(true)}
        isEditMode={isEditMode}
        onToggleEditMode={() => setIsEditMode((prev) => !prev)}
      />

      {/* 위젯 그리드 */}
      <section className="flex-1">
        <WidgetGrid
          isEditMode={isEditMode}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </section>

      {/* 위젯 설정 드로어 */}
      <WidgetSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
