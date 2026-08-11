import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
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
import { WidgetResizeHandle } from '@widgets/components/WidgetResizeHandle';
import { WidgetVerticalResizeHandle } from '@widgets/components/WidgetVerticalResizeHandle';
import { WidgetCornerResizeHandle } from '@widgets/components/WidgetCornerResizeHandle';
import { WidgetSettingsPanel } from '@widgets/components/WidgetSettingsPanel';
import { WidgetTabBar } from '@widgets/components/WidgetTabBar';
import type { TabFilter } from '@widgets/components/WidgetTabBar';
import { getSpanClass } from '@widgets/utils/getSpanClass';
import { triggerRefreshAll } from '@widgets/hooks/useWidgetRefresh';
import { triggerTimetableCheck } from '@widgets/hooks/useTimetableChangeCheck';
import { LayoutSelector } from '@widgets/components/LayoutSelector';
import { WidgetContextMenu } from './WidgetContextMenu';
import { WidgetWeatherBar } from '@widgets/components/WidgetWeatherBar';
import {
  WidgetModeIndicator,
  type ModeFallbackInfo,
} from '@widgets/components/WidgetModeIndicator';
import { WidgetModePopover } from '@widgets/components/WidgetModePopover';
import { WidgetModeFallbackModal } from '@widgets/components/WidgetModeFallbackModal';
import { WidgetModeCoachTour } from '@widgets/components/WidgetModeCoachTour';
import type { WidgetDesktopMode, WidgetLayoutMode } from '@domain/entities/Settings';
import { DEFAULT_WIDGET_STYLE } from '@domain/entities/DashboardTheme';
import { useNearScrollbar } from '@adapters/hooks/useNearScrollbar';
import { useFirstRunModeCoachTour } from '@adapters/hooks/useFirstRunModeCoachTour';

interface ContextMenuState {
  x: number;
  y: number;
}

const LAYOUT_CYCLE: WidgetLayoutMode[] = ['full', 'split-h', 'split-v', 'quad', 'sidebar-right'];

export function Widget() {
  // G009: 이 BrowserWindow는 데스크톱 위젯 창이므로 플래그를 true로 설정.
  // WidgetCard가 이 플래그를 읽어 WidgetModal을 readOnly로 마운트 → 편집 비활성화.
  // WidgetSettingsPanel(📋/🎨 패널)은 이 플래그와 무관하게 항상 쓰기 모드 유지 — Architect N4.
  const setIsDesktopWidget = useDesktopWidgetContextStore((s) => s.setIsDesktopWidget);
  useEffect(() => {
    setIsDesktopWidget(true);
    return () => {
      setIsDesktopWidget(false);
    };
  }, [setIsDesktopWidget]);

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
  const resizeWidget = useDashboardConfig((s) => s.resizeWidget);
  const resizeWidgetHeight = useDashboardConfig((s) => s.resizeWidgetHeight);

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showLayoutSelector, setShowLayoutSelector] = useState(false);
  const [panelMode, setPanelMode] = useState<'closed' | 'widgets' | 'style'>('closed');
  const layoutBtnRef = useRef<HTMLButtonElement>(null);
  // widget-mode-discovery (v2.1.x~) — 모드 인디케이터 칩 + 팝오버 + fallback 모달 + 코치 투어
  const modeChipRef = useRef<HTMLDivElement>(null);
  const [showModePopover, setShowModePopover] = useState(false);
  const [modeFallback, setModeFallback] = useState<ModeFallbackInfo | null>(null);
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const coachTour = useFirstRunModeCoachTour();
  const [showCoachTour, setShowCoachTour] = useState(false);
  // Phase 7-C — 헤더 드래그 영역 좌표를 main에 등록 (native-desktop 모드 헤더 드래그용).
  // WS_CHILD가 된 위젯은 -webkit-app-region:drag가 작동 안 하므로, hook이 직접 widget을 이동시킨다.
  const headerRef = useRef<HTMLDivElement>(null);
  // Phase 7-C 회귀 fix — 헤더 우측 버튼 그룹은 drag region에서 제외해야 클릭이 정상 라우팅된다.
  // (헤더 전체를 drag로 등록하면 LBUTTONDOWN이 widget 이동으로 처리돼 버튼 클릭이 안 됨.)
  const buttonGroupRef = useRef<HTMLDivElement>(null);

  const layoutMode = settings.widget.layoutMode ?? 'full';
  const widgetStyle = useMemo(
    () => ({ ...DEFAULT_WIDGET_STYLE, ...settings.widgetStyle }),
    [settings.widgetStyle],
  );

  // 스크롤바 트랙 영역(가장자리 12px) 근처에서만 스크롤바 노출 (macOS overlay 관습)
  const normalScroll = useNearScrollbar(12);

  // 반응형 폴백: 창 크기가 작으면 강제 full 모드
  const [effectiveMode, setEffectiveMode] = useState<WidgetLayoutMode>(layoutMode);

  useEffect(() => {
    const checkSize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 우측 사이드(1/4 폭)는 좁은 게 본 의도라 w<640 fallback에서 제외한다.
      if (w < 640 && layoutMode !== 'sidebar-right') {
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

  // Phase 7-C — 헤더 영역 좌표를 main에 등록.
  // native-desktop 모드: WH_MOUSE_LL hook이 헤더 안에서 LBUTTONDOWN 받으면 widget 이동.
  // 이 effect는 환경 무관하게 IPC를 보내며(main이 native-desktop 비활성이면 단순 caching),
  // mount/resize 시 헤더 client rect를 갱신한다.
  useEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;
    if (typeof window.electronAPI?.setWidgetHeaderRegion !== 'function') return;

    const update = () => {
      const headerRect = headerEl.getBoundingClientRect();
      // getBoundingClientRect는 viewport(=widget client area) 기준 DIP 좌표. 음수/NaN 방지.
      const dragRects = [
        {
          x: Math.max(0, headerRect.left),
          y: Math.max(0, headerRect.top),
          width: Math.max(0, headerRect.width),
          height: Math.max(0, headerRect.height),
        },
      ];

      // Phase 7-C 회귀 fix — 헤더 우측 버튼 그룹(no-drag)을 drag 영역에서 빼낸다.
      // 그렇지 않으면 LBUTTONDOWN이 buttonGroup 위에서 발생해도 drag mode가 시작돼
      // 버튼 클릭(새로고침/편집/그리드/확장)이 동작하지 않음.
      const btnEl = buttonGroupRef.current;
      const excludeRects: { x: number; y: number; width: number; height: number }[] = [];
      if (btnEl) {
        const btnRect = btnEl.getBoundingClientRect();
        if (btnRect.width > 0 && btnRect.height > 0) {
          excludeRects.push({
            x: Math.max(0, btnRect.left),
            y: Math.max(0, btnRect.top),
            width: Math.max(0, btnRect.width),
            height: Math.max(0, btnRect.height),
          });
        }
      }

      void window.electronAPI?.setWidgetHeaderRegion?.(dragRects, excludeRects);
    };
    update();

    // ResizeObserver로 헤더/버튼 그룹 크기 변화(날씨바 toggle, 편집 모드 토글 등) 감지.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(headerEl);
    if (buttonGroupRef.current) ro?.observe(buttonGroupRef.current);
    // 위젯 창 resize는 헤더의 width를 바꾸므로 window resize도 듣는다.
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
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

  // widget-mode-discovery — 첫 진입 1회 코치 투어 트리거.
  // settings 로드 완료 + shouldShow=true일 때만 자동 표시.
  useEffect(() => {
    if (coachTour.shouldShow && !showCoachTour) {
      setShowCoachTour(true);
      track('widget_mode_coach_tour_shown', { firstRun: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachTour.shouldShow]);

  // widget-mode-discovery — desktopMode:fallback IPC 구독.
  // native-desktop 적용 실패 시 칩 상태 + 모달 트리거.
  useEffect(() => {
    const off = window.electronAPI?.onDesktopModeFallback?.((info) => {
      setModeFallback({ reason: info.reason, fallbackMode: info.fallbackMode });
      setShowFallbackModal(true);
      track('widget_mode_fallback_shown', {
        reason: info.reason,
        fallbackMode: info.fallbackMode,
      });
    });
    return off;
  }, [track]);

  // 모드 적용 헬퍼 — popover/tour/context-menu 공통 진입점
  const applyDesktopMode = useCallback(
    (
      next: WidgetDesktopMode,
      via: 'coach-tour' | 'header-chip' | 'context-menu' | 'settings',
      options?: { readonly force?: boolean },
    ) => {
      const from = settings.widget.desktopMode;
      // force=true는 "같은 모드를 다시 적용" 요청(다시 시도 버튼, 팝오버에서 현재 모드 재선택).
      //
      // 2026-08-11 사용자 신고 대응: 바탕화면 붙이기에 실패해 실제로는 일반 모드인데 저장값만
      // 'native-desktop'으로 남으면, from === next 조기 반환 때문에 "다시 시도" 버튼까지
      // 아무 일도 하지 않는 죽은 버튼이 됐다. main에 중복 적용 방지 가드가 있으므로
      // 강제 전송해도 안전하다.
      if (from === next && options?.force !== true) return;
      track('widget_mode_changed', { from, to: next, via });
      // 적용 성공 시 fallback 상태 클리어 (실패 시 onDesktopModeFallback이 다시 set)
      setModeFallback(null);
      void update({ widget: { ...settings.widget, desktopMode: next } });
      void window.electronAPI?.applyWidgetSettings({
        opacity: settings.widget.opacity,
        desktopMode: next,
      });
    },
    [settings.widget, track, update],
  );

  // 레이아웃 모드 변경 (설정 저장 + 창 크기 조절)
  const setLayoutMode = useCallback(
    (mode: WidgetLayoutMode) => {
      track('widget_layout_change', { from: layoutMode, to: mode });
      void update({ widget: { ...settings.widget, layoutMode: mode } });
      window.electronAPI?.setWidgetLayout(mode);
    },
    [settings.widget, update, layoutMode, track],
  );

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
        case '5':
          e.preventDefault();
          setLayoutMode('sidebar-right');
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

  // Phase 7-G — native-desktop 모드(WS_CHILD)일 때는 위젯이 keyboard focus를 받지 못해
  // 위 keydown listener가 작동 안 함. main이 마우스 hover 시 globalShortcut으로 가로채
  // IPC `widget:layout-shortcut`로 mode를 전달하면 그대로 setLayoutMode 호출.
  // 일반/topmost 모드에서는 이 IPC가 발사되지 않으므로 (manager가 hoverCallback을 호출 안 함)
  // 일반 keydown listener가 그대로 작동.
  useEffect(() => {
    const onShortcut = window.electronAPI?.onLayoutShortcut;
    if (!onShortcut) return;
    const dispose = onShortcut((mode) => {
      const valid: ReadonlyArray<WidgetLayoutMode> = [
        'full',
        'split-h',
        'split-v',
        'quad',
        'sidebar-right',
      ];
      if ((valid as readonly string[]).includes(mode)) {
        setLayoutMode(mode as WidgetLayoutMode);
      }
    });
    return dispose;
  }, [setLayoutMode]);

  // Phase 7-D — native-desktop 모드(WS_CHILD)에선 nc resize가 작동 안 하므로 main이 hook으로
  // 처리. renderer는 8개 resize edge의 client DIP rect를 IPC로 등록만 하면 된다.
  // 일반/topmost 모드에서는 noop manager가 받으므로 모드 분기 없이 매번 호출.
  // edge 좌표/크기는 아래 resize handle DOM(line 450~)의 style과 정확히 일치해야 함.
  useEffect(() => {
    const setRegion = window.electronAPI?.setWidgetResizeRegion;
    if (!setRegion) return;
    const update = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 4 edge: 가장자리 변. 모서리 12px씩 비워(corner와 겹치지 않도록).
      // 4 corner: 12×12 모서리.
      const regions = [
        { edge: 'top' as const, dipRect: { x: 8, y: 0, width: w - 16, height: 6 } },
        { edge: 'bottom' as const, dipRect: { x: 8, y: h - 6, width: w - 16, height: 6 } },
        { edge: 'left' as const, dipRect: { x: 0, y: 8, width: 6, height: h - 16 } },
        { edge: 'right' as const, dipRect: { x: w - 6, y: 8, width: 6, height: h - 16 } },
        { edge: 'top-left' as const, dipRect: { x: 0, y: 0, width: 12, height: 12 } },
        { edge: 'top-right' as const, dipRect: { x: w - 12, y: 0, width: 12, height: 12 } },
        { edge: 'bottom-left' as const, dipRect: { x: 0, y: h - 12, width: 12, height: 12 } },
        { edge: 'bottom-right' as const, dipRect: { x: w - 12, y: h - 12, width: 12, height: 12 } },
      ];
      void setRegion(regions);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      // unmount 시 빈 배열로 등록 해제 (manager의 cachedResizeRegions 정리).
      void setRegion([]);
    };
  }, []);

  // 우클릭 컨텍스트 메뉴
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // 더블클릭 → 전체 앱으로 전환
  const handleHeaderDoubleClick = (e: React.MouseEvent) => {
    // 버튼 또는 버튼 내부 요소에서 발생한 더블클릭은 무시 (버튼 자체 동작 보호)
    if (e.target instanceof Element && e.target.closest('button')) return;
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

  // Ctrl+5(우측 사이드)는 화면 가로 1/4 폭이라, 넓은 모드용 "가운데 시계 + 우측 버튼 6개"를
  // 한 줄에 두면 폭이 부족해 눌린다. 좁은 모드에선 헤더를 2행(시계 / 버튼)으로 분리한다.
  const isNarrow = layoutMode === 'sidebar-right';

  return (
    <>
      <div
        className={[
          'w-full h-screen backdrop-blur-md rounded-2xl shadow-2xl flex flex-col overflow-hidden text-sp-text relative select-none',
          widgetStyle.hideWindowBorder ? '' : 'border border-sp-border/50',
        ]
          .filter(Boolean)
          .join(' ')}
        onContextMenu={handleContextMenu}
        style={
          {
            fontFamily: 'inherit',
            backgroundColor: `rgba(var(--sp-widget-rgb), ${settings.widget.opacity})`,
            '--sp-card': `color-mix(in srgb, var(--sp-card-base) ${(settings.widget.cardOpacity ?? 1) * 100}%, transparent)`,
          } as React.CSSProperties
        }
      >
        {/* ── 헤더 (드래그 영역) ── */}
        {/*
          widget-mode-discovery fix (2026-05-22): 헤더 레이아웃을 grid 3-column으로 재구성.
          이전엔 우측 버튼 그룹이 absolute top-3 right-3였는데, 좁은 폭에서 가운데 정렬된
          시계가 우측 버튼 그룹 영역을 침범해 모드 칩과 시간 텍스트가 겹치는 회귀 발생.
          현재 구조:
            - column 1 (1fr): 좌측 placeholder — buttonGroup 폭과 좌우 균형으로 시계가 정확히 가운데
            - column 2 (auto): 시계 — 자기 너비만 차지, 좁아지면 placeholder를 0으로 압축하지만
                                 column 3은 자기 크기를 유지해 겹치지 않음
            - column 3 (1fr): 버튼 그룹 — justify-end로 우측 정렬
        */}
        <div
          ref={headerRef}
          className="flex-shrink-0 px-3 pt-3 pb-3 border-b border-sp-border/40"
          style={
            {
              WebkitAppRegion: 'drag',
              zoom: settings.dashboardFontScale ?? 1,
            } as React.CSSProperties
          }
          onDoubleClick={handleHeaderDoubleClick}
        >
          <div
            className={
              isNarrow
                ? 'flex flex-col gap-2 mb-1'
                : 'grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 mb-1'
            }
          >
            {/* 좌측 placeholder — 넓은 모드에서만 buttonGroup 폭과 균형(시계 중앙정렬용) */}
            {!isNarrow && <div aria-hidden="true" />}

            {/* 중앙: 날짜 + 시간 (좁은 모드는 세로 스택, 넓은 모드는 가로 baseline) */}
            <div
              className={
                isNarrow
                  ? 'flex flex-col items-center gap-0.5'
                  : 'flex items-baseline justify-center gap-3 min-w-0'
              }
            >
              <span
                className={[
                  'text-sp-muted font-medium whitespace-nowrap',
                  isNarrow ? 'text-sm' : 'text-lg',
                ].join(' ')}
              >
                {clock.date} ({clock.dayOfWeek})
              </span>
              <span className="text-4xl font-bold tracking-tight text-sp-text leading-none whitespace-nowrap">
                {clock.time}
              </span>
            </div>

            {/* 헤더 버튼 그룹 — 좁은 모드는 아래 행에서 중앙정렬, 넓은 모드는 grid 우측 정렬.
                buttonGroupRef 하나로 계속 감싸므로 IPC 드래그 영역 로직은 변경 불필요. */}
            <div
              ref={buttonGroupRef}
              className={
                isNarrow
                  ? 'flex items-center justify-center gap-2'
                  : 'flex items-center gap-1 justify-end'
              }
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              {/* widget-mode-discovery — 모드 인디케이터 칩 (헤더에서 가장 먼저 노출) */}
              <div ref={modeChipRef} className="mr-1">
                <WidgetModeIndicator
                  currentMode={settings.widget.desktopMode}
                  fallback={modeFallback}
                  layoutMode={layoutMode}
                  onClick={() => {
                    track('widget_mode_indicator_click', {
                      currentMode: settings.widget.desktopMode,
                      fallback: modeFallback !== null,
                    });
                    if (modeFallback) {
                      setShowFallbackModal(true);
                    } else {
                      setShowModePopover((v) => !v);
                    }
                  }}
                />
              </div>

              {/* 새로고침 버튼 */}
              <button
                className="p-1.5 rounded-lg hover:bg-sp-border/60 transition-colors text-sp-muted hover:text-sp-text"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerRefreshAll();
                  // 사용자가 직접 누른 순간에만 컴시간·압핀 변동을 확인한다.
                  // (자동 새로고침 경로인 useWidgetRefresh 에는 절대 넣지 말 것 — 5분 폴링이 된다)
                  triggerTimetableCheck();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="모든 위젯 새로고침 (시간표 변동도 함께 확인)"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  refresh
                </span>
              </button>

              {/* 좁은 모드 전용 클러스터 구분선 — "상태·액션 / 패널" 두 묶음으로 스캔성↑.
                  검증된 sp-border/50 조합 재사용(신규 투명도 수식 함정 회피). */}
              {isNarrow && <span className="w-px h-4 bg-sp-border/50 mx-0.5" aria-hidden="true" />}

              {/* 위젯 관리 버튼 */}
              <button
                className={[
                  'p-1.5 rounded-lg transition-colors',
                  panelMode === 'widgets'
                    ? 'bg-sp-accent/20 text-sp-accent'
                    : 'hover:bg-sp-border/60 text-sp-muted hover:text-sp-text',
                ].join(' ')}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelMode((prev) => (prev === 'widgets' ? 'closed' : 'widgets'));
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="위젯 관리"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  dashboard_customize
                </span>
              </button>

              {/* 스타일 버튼 */}
              <button
                className={[
                  'p-1.5 rounded-lg transition-colors',
                  panelMode === 'style'
                    ? 'bg-sp-accent/20 text-sp-accent'
                    : 'hover:bg-sp-border/60 text-sp-muted hover:text-sp-text',
                ].join(' ')}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelMode((prev) => (prev === 'style' ? 'closed' : 'style'));
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="스타일"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  palette
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
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLayoutSelector((prev) => !prev);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="레이아웃 선택 (Ctrl+0)"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  grid_view
                </span>
              </button>

              {/* 전체 화면 전환 버튼 */}
              <button
                className="p-1.5 rounded-lg hover:bg-sp-border/60 transition-colors text-sp-muted hover:text-sp-text"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation();
                  track('widget_close');
                  window.electronAPI?.toggleWidget();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                title="전체 화면으로 전환"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  open_in_full
                </span>
              </button>
            </div>
          </div>
          {/* 날씨 정보 — grid 행 밖, 헤더 두 번째 행 */}
          {settings.widget.showWeather !== false && <WidgetWeatherBar />}
        </div>

        {/* ── 메시지 배너 ── */}
        {message && (
          <div
            className="flex-shrink-0 mx-4 mt-3"
            style={{ zoom: settings.dashboardFontScale ?? 1 }}
          >
            <div className="bg-sp-accent/10 border border-sp-accent/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sp-accent flex-shrink-0"
                style={{ fontSize: 16 }}
              >
                campaign
              </span>
              <p className="text-sm text-sp-text leading-relaxed flex-1 truncate">{message}</p>
            </div>
          </div>
        )}

        {/* ── 대시보드 카드 ── */}
        <div className="flex-1 flex min-h-0" style={{ zoom: settings.dashboardFontScale ?? 1 }}>
          <div className="flex-1 overflow-hidden px-4 py-3 min-h-0">
            {visibleWidgets.length === 0 && panelMode === 'closed' ? (
              <div className="flex flex-col items-center justify-center h-full text-sp-muted">
                <span className="mb-3 text-4xl">📌</span>
                <p className="text-sm">표시할 위젯이 없습니다</p>
                <p className="mt-1 text-xs">위젯 관리 버튼을 눌러 위젯을 추가하세요</p>
              </div>
            ) : (
              /* 전체/분할 공통: 3열 그리드 + 단일 스크롤 + scale 축소 */
              <div
                ref={normalScroll.ref}
                className={`h-full overflow-y-auto scrollbar-hover-only${normalScroll.near ? ' is-near-scrollbar' : ''}`}
                {...normalScroll.handlers}
              >
                {/* 탭 바 */}
                {visibleWidgets.length > 4 && (
                  <WidgetTabBar activeTab={activeTab} onTabChange={setActiveTab} />
                )}
                <div
                  style={
                    effectiveMode !== 'full' && effectiveMode !== 'sidebar-right'
                      ? {
                          transform: `scale(${effectiveMode === 'quad' ? 0.7 : 0.85})`,
                          transformOrigin: 'top left',
                          width: `${100 / (effectiveMode === 'quad' ? 0.7 : 0.85)}%`,
                        }
                      : undefined
                  }
                >
                  <div
                    className={[
                      'grid gap-3 grid-flow-row-dense',
                      effectiveMode === 'sidebar-right' ? 'grid-cols-1' : 'grid-cols-4',
                    ].join(' ')}
                    style={{ gridAutoRows: '80px' }}
                  >
                    {filteredWidgets.map((instance) => {
                      const definition = getWidgetById(instance.widgetId);
                      if (!definition) return null;

                      return (
                        <div
                          key={instance.widgetId}
                          className={
                            effectiveMode === 'sidebar-right'
                              ? 'col-span-1'
                              : getSpanClass(instance.colSpan)
                          }
                          style={{ gridRow: `span ${instance.rowSpan} / span ${instance.rowSpan}` }}
                        >
                          {/* 대시보드와 동일한 리사이즈 그립 — 카드 호버 시 표시 (group-hover) */}
                          <div className="relative group/widget h-full">
                            <div className="h-full">
                              <WidgetCard
                                definition={definition}
                                onNavigate={handleWidgetNavigate}
                              />
                            </div>
                            <WidgetResizeHandle
                              currentSpan={instance.colSpan}
                              minSpan={definition.minSize.w as 1 | 2 | 3 | 4}
                              onResize={(colSpan) => resizeWidget(instance.widgetId, colSpan)}
                            />
                            <WidgetVerticalResizeHandle
                              currentRowSpan={instance.rowSpan}
                              minRowSpan={definition.minSize.h}
                              onResize={(rowSpan) => resizeWidgetHeight(instance.widgetId, rowSpan)}
                            />
                            <WidgetCornerResizeHandle
                              currentColSpan={instance.colSpan}
                              currentRowSpan={instance.rowSpan}
                              minColSpan={definition.minSize.w as 1 | 2 | 3 | 4}
                              minRowSpan={definition.minSize.h}
                              onResize={(colSpan, rowSpan) => {
                                if (colSpan !== instance.colSpan)
                                  resizeWidget(instance.widgetId, colSpan);
                                if (rowSpan !== instance.rowSpan)
                                  resizeWidgetHeight(instance.widgetId, rowSpan);
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 위젯 설정 사이드 패널 */}
          {panelMode !== 'closed' && (
            <WidgetSettingsPanel
              initialTab={panelMode}
              styleOnly={panelMode === 'style'}
              onClose={() => setPanelMode('closed')}
            />
          )}
        </div>

        {/* ── 리사이즈 핸들 (JS 기반, thickFrame: false 대응) ── */}
        {[
          'top',
          'bottom',
          'left',
          'right',
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
        ].map((edge) => (
          <div
            key={edge}
            className="absolute"
            style={
              {
                ...(edge === 'right'
                  ? { right: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }
                  : {}),
                ...(edge === 'bottom'
                  ? { bottom: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }
                  : {}),
                ...(edge === 'left'
                  ? { left: 0, top: 8, bottom: 8, width: 6, cursor: 'ew-resize' }
                  : {}),
                ...(edge === 'top'
                  ? { top: 0, left: 8, right: 8, height: 6, cursor: 'ns-resize' }
                  : {}),
                ...(edge === 'bottom-right'
                  ? { bottom: 0, right: 0, width: 12, height: 12, cursor: 'nwse-resize' }
                  : {}),
                ...(edge === 'bottom-left'
                  ? { bottom: 0, left: 0, width: 12, height: 12, cursor: 'nesw-resize' }
                  : {}),
                ...(edge === 'top-right'
                  ? { top: 0, right: 0, width: 12, height: 12, cursor: 'nesw-resize' }
                  : {}),
                ...(edge === 'top-left'
                  ? { top: 0, left: 0, width: 12, height: 12, cursor: 'nwse-resize' }
                  : {}),
                WebkitAppRegion: 'no-drag',
                zIndex: 50,
              } as React.CSSProperties
            }
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // screenX/Y 사용: setBounds()로 윈도우가 이동해도 좌표계가 변하지 않음
              let lastX = e.screenX;
              let lastY = e.screenY;
              let rafId: number | null = null;
              let pendingDx = 0;
              let pendingDy = 0;

              const flush = () => {
                if (pendingDx !== 0 || pendingDy !== 0) {
                  window.electronAPI?.resizeWidget(edge, pendingDx, pendingDy);
                  pendingDx = 0;
                  pendingDy = 0;
                }
              };

              const onMove = (me: PointerEvent) => {
                pendingDx += me.screenX - lastX;
                pendingDy += me.screenY - lastY;
                lastX = me.screenX;
                lastY = me.screenY;
                // RAF로 프레임당 1회만 IPC 호출
                if (rafId === null) {
                  rafId = requestAnimationFrame(() => {
                    rafId = null;
                    flush();
                  });
                }
              };

              const onUp = () => {
                if (rafId !== null) cancelAnimationFrame(rafId);
                flush(); // 남은 delta 즉시 반영
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
          onShowModeTour={() => {
            void coachTour.reset().then(() => setShowCoachTour(true));
          }}
        />
      )}

      {/* widget-mode-discovery — 모드 팝오버 */}
      {showModePopover && modeChipRef.current && (
        <WidgetModePopover
          anchorRect={modeChipRef.current.getBoundingClientRect()}
          currentMode={settings.widget.desktopMode}
          onSelect={(mode) => {
            // 현재 모드를 다시 고르는 것도 "재적용" 의도로 본다(고착 상태 탈출구).
            applyDesktopMode(mode, 'header-chip', { force: true });
            setShowModePopover(false);
          }}
          onShowTour={() => {
            void coachTour.reset().then(() => setShowCoachTour(true));
          }}
          onClose={() => setShowModePopover(false)}
        />
      )}

      {/* widget-mode-discovery — fallback 진단 모달 */}
      {modeFallback && (
        <WidgetModeFallbackModal
          isOpen={showFallbackModal}
          reason={modeFallback.reason}
          fallbackMode={modeFallback.fallbackMode}
          onClose={() => setShowFallbackModal(false)}
          onRetry={() => {
            // 다시 native-desktop 적용 시도 — 실패하면 IPC가 다시 fallback 발사.
            // force=true: 저장값이 이미 'native-desktop'인 고착 상태에서도 반드시 재시도한다.
            applyDesktopMode('native-desktop', 'header-chip', { force: true });
          }}
        />
      )}

      {/* widget-mode-discovery — 1회성 모드 코치 투어 */}
      <WidgetModeCoachTour
        isOpen={showCoachTour}
        onSkip={(slideIndex) => {
          track('widget_mode_coach_tour_skipped', { slideIndex });
          void coachTour.markShown();
          setShowCoachTour(false);
        }}
        onComplete={(trySelected) => {
          track('widget_mode_coach_tour_completed', { trySelected });
          void coachTour.markShown();
          setShowCoachTour(false);
        }}
        onTrySelected={(mode) => {
          applyDesktopMode(mode, 'coach-tour');
        }}
      />
    </>
  );
}
