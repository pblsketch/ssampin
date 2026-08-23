import { useEffect, useState, useCallback } from 'react';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { DashboardHeader } from '@widgets/components/DashboardHeader';
import { WidgetGrid } from '@widgets/components/WidgetGrid';
import { WidgetSettingsPanel } from '@widgets/components/WidgetSettingsPanel';
import { ReminderDashboardBadge } from '@adapters/components/Reminder/ReminderDashboardBadge';
import { CoolImportBanner } from '@adapters/components/CoolMessenger/CoolImportBanner';

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
    /*
      ★글씨 크기 배율(zoom)은 헤더·카드에만 걸고 **오른쪽 스타일 편집 패널은 뺀다.**
        예전엔 이 바깥 상자에 한 번에 걸었는데, 그러면 배율을 조절하는 패널 자신도 같이
        커졌다 작아져서 슬라이더 손잡이가 끌고 있는 커서 밑에서 달아났다
        (2026-08-21 준일님 피드백). 조절하는 도구는 조절 대상에 포함되면 안 된다.
    */
    <div className="h-full flex flex-col">
      {/* 헤더 + 알림 배지 — 배율 적용 대상 */}
      <div className="shrink-0" style={{ zoom: fontScale }}>
        <DashboardHeader
          onOpenWidgetPanel={handleOpenWidgetPanel}
          onOpenStylePanel={handleOpenStylePanel}
        />

        {/* 학생 관찰 기록 알림 — 은은형 배지(설정 on + 미기록 있을 때만 렌더) */}
        <ReminderDashboardBadge />

        {/* 쿨메신저 등록 후보 쪽지 알림 (설정 on + 후보 있을 때만 렌더) */}
        <CoolImportBanner />
      </div>

      {/* 본문: 그리드 + 사이드 패널 */}
      <div className="flex-1 flex min-h-0">
        <section className="flex-1 overflow-y-auto pb-8" style={{ zoom: fontScale }}>
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
