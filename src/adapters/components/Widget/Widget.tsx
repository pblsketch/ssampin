import { useEffect, useState } from 'react';
import { useClock } from '@adapters/hooks/useClock';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { getWidgetById } from '@widgets/registry';
import { WidgetCard } from '@widgets/components/WidgetCard';
import { WidgetContextMenu } from './WidgetContextMenu';

interface ContextMenuState {
  x: number;
  y: number;
}

export function Widget() {
  const clock = useClock();
  const { load: loadSchedule } = useScheduleStore();
  const { settings, load: loadSettings } = useSettingsStore();
  const { load: loadTodos } = useTodoStore();
  const { load: loadEvents } = useEventsStore();
  const { load: loadMemos } = useMemoStore();
  const { message, loadMessage } = useMessageStore();

  const loadConfig = useDashboardConfig((s) => s.load);
  const getVisibleWidgets = useDashboardConfig((s) => s.getVisibleWidgets);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 위젯 모드: body/html 배경을 투명하게 (Electron transparent 창이 바탕화면을 비춰보이도록)
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  // 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void loadSettings();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
    loadConfig();
  }, [loadSchedule, loadSettings, loadTodos, loadEvents, loadMemos, loadMessage, loadConfig]);

  // 우클릭 컨텍스트 메뉴
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // 더블클릭 → 전체 앱으로 전환
  const handleHeaderDoubleClick = () => {
    window.electronAPI?.toggleWidget();
  };

  // 대시보드 설정에서 보이는 위젯 목록 가져오기
  const visibleWidgets = getVisibleWidgets();

  return (
    <>
      <div
        className="w-full h-screen backdrop-blur-md rounded-2xl shadow-2xl border border-sp-border/50 flex flex-col overflow-hidden text-sp-text relative select-none"
        onContextMenu={handleContextMenu}
        style={{
          fontFamily: "'Noto Sans KR', sans-serif",
          backgroundColor: `rgba(var(--sp-widget-rgb), ${settings.widget.opacity})`,
          '--sp-card': `color-mix(in srgb, var(--sp-card-base) ${(settings.widget.cardOpacity ?? 1) * 100}%, transparent)`,
        } as React.CSSProperties}
      >
        {/* ── 헤더 (드래그 영역) ── */}
        <div
          className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-sp-border/40 text-center"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          onDoubleClick={handleHeaderDoubleClick}
        >
          {/* 날짜 + 시간 */}
          <div className="flex items-baseline justify-center gap-3 mb-1">
            <span className="text-sp-muted text-lg font-medium">
              {clock.date} ({clock.dayOfWeek})
            </span>
            <span className="text-4xl font-bold tracking-tight text-sp-text leading-none">
              {clock.time}
            </span>
          </div>

          {/* 전체 화면 전환 버튼 */}
          <button
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-sp-border/60 transition-colors text-sp-muted hover:text-sp-text"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => window.electronAPI?.toggleWidget()}
            title="전체 화면으로 전환"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              open_in_full
            </span>
          </button>
        </div>

        {/* ── 메시지 배너 ── */}
        {message && (
          <div className="flex-shrink-0 mx-4 mt-3">
            <div className="bg-sp-accent/10 border border-sp-accent/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span className="material-symbols-outlined text-sp-accent flex-shrink-0" style={{ fontSize: 16 }}>
                campaign
              </span>
              <p className="text-sm text-sp-text leading-relaxed flex-1 truncate">{message}</p>
            </div>
          </div>
        )}

        {/* ── 대시보드 카드 (대시보드 설정 동기화) ── */}
        <div
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{
            scrollbarWidth: 'thin',
          }}
        >
          {visibleWidgets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-sp-muted">
              <span className="mb-3 text-4xl">📌</span>
              <p className="text-sm">표시할 위젯이 없습니다</p>
              <p className="mt-1 text-xs">대시보드에서 위젯을 추가하세요</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 grid-flow-row-dense items-start">
              {visibleWidgets.map((instance) => {
                const definition = getWidgetById(instance.widgetId);
                if (!definition) return null;

                // colSpan 매핑: 위젯 창은 3열 그리드
                const spanClass =
                  instance.colSpan >= 3 ? 'col-span-3' :
                  instance.colSpan === 2 ? 'col-span-2' : 'col-span-1';

                return (
                  <div key={instance.widgetId} className={spanClass}>
                    <WidgetCard definition={definition} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <WidgetContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
        />
      )}
    </>
  );
}
