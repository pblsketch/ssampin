import { useEffect, useState, useCallback } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { DashboardHeader } from '@widgets/components/DashboardHeader';
import { WidgetGrid } from '@widgets/components/WidgetGrid';
import { WidgetSettingsPanel } from '@widgets/components/WidgetSettingsPanel';

interface DashboardProps {
  onNavigate?: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const loadMessage = useMessageStore((s) => s.loadMessage);
  const loadConfig = useDashboardConfig((s) => s.load);
  const fontScale = useSettingsStore((s) => s.settings.dashboardFontScale) ?? 1.0;
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    void loadMessage();
    loadConfig();
  }, [loadMessage, loadConfig]);

  const handleToggleEditMode = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  return (
    <div className="h-full flex flex-col" style={{ zoom: fontScale }}>
      {/* 헤더 */}
      <DashboardHeader
        isEditMode={isEditMode}
        onToggleEditMode={handleToggleEditMode}
      />

      {/* 본문: 그리드 + 사이드 패널 (편집 모드) */}
      <div className="flex-1 flex min-h-0">
        <section className="flex-1 overflow-y-auto">
          <WidgetGrid isEditMode={isEditMode} onNavigate={onNavigate} />
        </section>

        {/* 편집 모드 시 인라인 사이드 패널 */}
        {isEditMode && (
          <WidgetSettingsPanel onClose={handleToggleEditMode} />
        )}
      </div>
    </div>
  );
}
