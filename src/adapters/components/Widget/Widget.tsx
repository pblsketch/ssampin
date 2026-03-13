import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClock } from '@adapters/hooks/useClock';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMessageStore } from '@adapters/stores/useMessageStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { getWidgetById } from '@widgets/registry';
import { WidgetCard } from '@widgets/components/WidgetCard';
import { WidgetGrid } from '@widgets/components/WidgetGrid';
import { WidgetSettingsPanel } from '@widgets/components/WidgetSettingsPanel';
import { WidgetTabBar } from '@widgets/components/WidgetTabBar';
import type { TabFilter } from '@widgets/components/WidgetTabBar';
import { getSpanClass } from '@widgets/utils/getSpanClass';
import { triggerRefreshAll } from '@widgets/hooks/useWidgetRefresh';

import { LayoutSelector } from '@widgets/components/LayoutSelector';
import { WidgetContextMenu } from './WidgetContextMenu';
import type { WidgetLayoutMode } from '@domain/entities/Settings';

interface ContextMenuState {
  x: number;
  y: number;
}

const LAYOUT_CYCLE: WidgetLayoutMode[] = ['full', 'split-h', 'split-v', 'quad'];

export function Widget() {
  const { track } = useAnalytics();
  const clock = useClock();
  const { load: loadSchedule } = useScheduleStore();
  const { settings, update } = useSettingsStore();
  const { load: loadTodos } = useTodoStore();
  const { load: loadEvents } = useEventsStore();
  const { load: loadMemos } = useMemoStore();
  const { message, loadMessage } = useMessageStore();

  const loadConfig = useDashboardConfig((s) => s.load);
  const getVisibleWidgets = useDashboardConfig((s) => s.getVisibleWidgets);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const layoutBtnRef = useRef<HTMLButtonElement>(null);

  const layoutMode = settings.widget.layoutMode ?? 'full';

  // 반응형 폴백: 창 크기가 작으면 강제 full 모드
  const [effectiveMode, setEffectiveMode] = useState<WidgetLayoutMode>(layoutMode);

  useEffect(() => {
    const checkSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 640) {
        setEffectiveMode('full');
      } else if (h < 480 && (layoutMode === 'split-v' || layoutMode === 'quad')) {
        setEffectiveMode(layoutMode === 'quad' ? 'split-h' : 'full');
      } else {
        setEffectiveMode(layoutMode);
      }
    };
    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, [layoutMode]);

  // 위젯 모드: 투명 영역 hit-test 보강
  // transparent: true 창에서 완전 투명 영역은 클릭이 통과됨
  // 미세한 배경색(alpha 0.01)을 적용하여 hit-test 보장
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'rgba(0,0,0,0.01)';
    document.body.style.backgroundColor = 'rgba(0,0,0,0.01)';
    return () => {
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  // WorkerW 연결 후 입력 검증 (메인 프로세스가 요청 시 마우스 이벤트 + RAF 폴백으로 응답)
  useEffect(() => {
    let verified = false;

    const handler = () => {
      if (verified) return;

      // 방법1: 이벤트 감지 (기존)
      const onAnyInput = () => {
        if (verified) return;
        verified = true;
        window.electronAPI?.verifyWidgetInput();
        console.log('[Widget] 입력 검증 성공 (이벤트 감지)');
        cleanup();
      };

      document.addEventListener('mousemove', onAnyInput, { once: true });
      document.addEventListener('pointerdown', onAnyInput, { once: true });
      document.addEventListener('pointermove', onAnyInput, { once: true });
      document.addEventListener('touchstart', onAnyInput, { once: true });

      // 방법2: 능동적 자가 검증 (1초 후 RAF 폴백)
      const rafCheck = setTimeout(() => {
        if (verified) return;
        requestAnimationFrame(() => {
          if (verified) return;
          verified = true;
          window.electronAPI?.verifyWidgetInput();
          console.log('[Widget] 입력 검증 성공 (RAF 폴백)');
        });
      }, 1000);

      const cleanup = () => {
        document.removeEventListener('mousemove', onAnyInput);
        document.removeEventListener('pointerdown', onAnyInput);
        document.removeEventListener('pointermove', onAnyInput);
        document.removeEventListener('touchstart', onAnyInput);
        clearTimeout(rafCheck);
      };

      setTimeout(cleanup, 4000);
    };

    window.electronAPI?.onVerifyInput(handler);
    return () => {
      window.electronAPI?.offVerifyInput(handler);
    };
  }, []);

  // 데이터 로드
  useEffect(() => {
    void loadSchedule();
    void useSettingsStore.getState().load();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
    loadConfig();
  }, [loadSchedule, loadTodos, loadEvents, loadMemos, loadMessage, loadConfig]);

  // 위젯 오픈 추적
  useEffect(() => {
    track('widget_open', { trigger: 'close_button' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 레이아웃 모드 변경 (설정 저장 + 창 크기 조절)
  const setLayoutMode = useCallback((mode: WidgetLayoutMode) => {
    void update({ widget: { ...settings.widget, layoutMode: mode } });
    window.electronAPI?.setWidgetLayout(mode);
  }, [settings.widget, update]);

  // 키보드 단축키: Ctrl+1~4, Ctrl+0 순환
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      switch (e.key) {
        case '1':
          e.preventDefault();
          setLayoutMode('full');
          break;
        case '2':
          e.preventDefault();
          setLayoutMode('split-h');
          break;
        case '3':
          e.preventDefault();
          setLayoutMode('split-v');
          break;
        case '4':
          e.preventDefault();
          setLayoutMode('quad');
          break;
        case '0': {
          e.preventDefault();
          const idx = LAYOUT_CYCLE.indexOf(layoutMode);
          const next = LAYOUT_CYCLE[(idx + 1) % LAYOUT_CYCLE.length] ?? 'full';
          setLayoutMode(next);
          break;
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, setLayoutMode]);

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
    track('widget_close');
    window.electronAPI?.toggleWidget();
  };

  // 대시보드 설정에서 보이는 위젯 목록 가져오기
  const visibleWidgets = getVisibleWidgets();

  // 탭 필터링
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const filteredWidgets = useMemo(() => {
    if (activeTab === 'all') return visibleWidgets;
    return visibleWidgets.filter((w) => {
      const def = getWidgetById(w.widgetId);
      return def?.category === activeTab;
    });
  }, [visibleWidgets, activeTab]);

  // 위젯 → 메인 윈도우 네비게이션 (IPC)
  const handleWidgetNavigate = useCallback((page: string) => {
    void window.electronAPI?.navigateToPage(page);
  }, []);

  return (
    <>
      <div
        className="w-full h-screen backdrop-blur-md rounded-2xl shadow-2xl border border-sp-border/50 flex flex-col overflow-hidden text-sp-text relative select-none"
        onContextMenu={handleContextMenu}
        style={{
          fontFamily: 'inherit',
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

          {/* 헤더 우측 버튼 그룹 */}
          <div
            className="absolute top-3 right-3 flex items-center gap-1"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* 새로고침 버튼 */}
            <button
              className="p-1.5 rounded-lg hover:bg-sp-border/60 transition-colors text-sp-muted hover:text-sp-text"
              onClick={triggerRefreshAll}
              title="모든 위젯 새로고침"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                refresh
              </span>
            </button>

            {/* 위젯 편집 버튼 */}
            <button
              className={[
                'p-1.5 rounded-lg transition-colors',
                isEditMode
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'hover:bg-sp-border/60 text-sp-muted hover:text-sp-text',
              ].join(' ')}
              onClick={() => setIsEditMode((prev) => !prev)}
              title="위젯 편집"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {isEditMode ? 'check' : 'edit'}
              </span>
            </button>

            {/* 레이아웃 선택 버튼 */}
            <button
              ref={layoutBtnRef}
              className={[
                'p-1.5 rounded-lg transition-colors',
                showLayoutSelector
                  ? 'bg-sp-accent/20 text-sp-accent'
                  : 'hover:bg-sp-border/60 text-sp-muted hover:text-sp-text',
              ].join(' ')}
              onClick={() => setShowLayoutSelector((prev) => !prev)}
              title="레이아웃 선택 (Ctrl+0)"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                grid_view
              </span>
            </button>

            {/* 전체 화면 전환 버튼 */}
            <button
              className="p-1.5 rounded-lg hover:bg-sp-border/60 transition-colors text-sp-muted hover:text-sp-text"
              onClick={() => { track('widget_close'); window.electronAPI?.toggleWidget(); }}
              title="전체 화면으로 전환"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                open_in_full
              </span>
            </button>
          </div>
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

        {/* ── 대시보드 카드 ── */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-hidden px-4 py-3 min-h-0">
            {visibleWidgets.length === 0 && !isEditMode ? (
              <div className="flex flex-col items-center justify-center h-full text-sp-muted">
                <span className="mb-3 text-4xl">📌</span>
                <p className="text-sm">표시할 위젯이 없습니다</p>
                <p className="mt-1 text-xs">편집 버튼을 눌러 위젯을 추가하세요</p>
              </div>
            ) : isEditMode ? (
              /* 편집 모드: WidgetGrid (DnD 지원) */
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                <WidgetGrid isEditMode onNavigate={handleWidgetNavigate} />
              </div>
            ) : (
              /* 전체/분할 공통: 3열 그리드 + 단일 스크롤 + scale 축소 */
              <div className="h-full overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {/* 탭 바 */}
                {visibleWidgets.length > 4 && (
                  <WidgetTabBar activeTab={activeTab} onTabChange={setActiveTab} />
                )}
                <div
                  style={effectiveMode !== 'full' ? {
                    transform: `scale(${effectiveMode === 'quad' ? 0.7 : 0.85})`,
                    transformOrigin: 'top left',
                    width: `${100 / (effectiveMode === 'quad' ? 0.7 : 0.85)}%`,
                  } : undefined}
                >
                  <div
                    className="grid grid-cols-4 gap-3 grid-flow-row-dense"
                    style={{ gridAutoRows: '80px' }}
                  >
                    {filteredWidgets.map((instance) => {
                      const definition = getWidgetById(instance.widgetId);
                      if (!definition) return null;

                      return (
                        <div
                          key={instance.widgetId}
                          className={getSpanClass(instance.colSpan)}
                          style={{ gridRow: `span ${instance.rowSpan} / span ${instance.rowSpan}` }}
                        >
                          <WidgetCard definition={definition} onNavigate={handleWidgetNavigate} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 편집 모드: 위젯 설정 사이드 패널 */}
          {isEditMode && (
            <WidgetSettingsPanel onClose={() => setIsEditMode(false)} />
          )}
        </div>

        {/* ── 리사이즈 핸들 (JS 기반, thickFrame: false 대응) ── */}
        {['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map((edge) => (
          <div
            key={edge}
            className="absolute"
            style={{
              ...(edge === 'right' ? { right: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' } : {}),
              ...(edge === 'bottom' ? { bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' } : {}),
              ...(edge === 'left' ? { left: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' } : {}),
              ...(edge === 'top' ? { top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' } : {}),
              ...(edge === 'bottom-right' ? { bottom: 0, right: 0, width: 12, height: 12, cursor: 'nwse-resize' } : {}),
              ...(edge === 'bottom-left' ? { bottom: 0, left: 0, width: 12, height: 12, cursor: 'nesw-resize' } : {}),
              ...(edge === 'top-right' ? { top: 0, right: 0, width: 12, height: 12, cursor: 'nesw-resize' } : {}),
              ...(edge === 'top-left' ? { top: 0, left: 0, width: 12, height: 12, cursor: 'nwse-resize' } : {}),
              WebkitAppRegion: 'no-drag',
              zIndex: 50,
            } as React.CSSProperties}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startY = e.clientY;

              const onMove = (me: PointerEvent) => {
                const dx = me.clientX - startX;
                const dy = me.clientY - startY;
                window.electronAPI?.resizeWidget(edge, dx, dy);
              };

              const onUp = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
              };

              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            }}
          />
        ))}
      </div>

      {/* 레이아웃 선택 팝업 */}
      {showLayoutSelector && layoutBtnRef.current && (
        <LayoutSelector
          anchorRect={layoutBtnRef.current.getBoundingClientRect()}
          currentMode={layoutMode}
          onSelect={setLayoutMode}
          onClose={() => setShowLayoutSelector(false)}
        />
      )}

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
