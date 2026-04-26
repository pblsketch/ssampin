import React, { useCallback, useEffect, useState, Suspense } from 'react';
import { Sidebar, type PageId } from '@adapters/components/Layout/Sidebar';
import { EventPopup } from '@adapters/components/Dashboard/EventPopup';
import { Dashboard } from '@adapters/components/Dashboard/Dashboard';
import { Seating } from '@adapters/components/Seating/Seating';
import { TimetablePage } from '@adapters/components/Timetable/TimetablePage';
import { HomeroomPage } from '@adapters/components/Homeroom/HomeroomPage';
import { Schedule } from '@adapters/components/Schedule/Schedule';
import { Todo } from '@adapters/components/Todo/Todo';
import { MemoPage } from '@adapters/components/Memo/MemoPage';
import { MealPage } from '@adapters/components/Meal/MealPage';
import { ClassManagementPage } from '@adapters/components/ClassManagement/ClassManagementPage';
import { SettingsPage } from '@adapters/components/Settings/SettingsPage';
import { Widget } from '@adapters/components/Widget/Widget';
import { Export } from '@adapters/components/Export/Export';
const FormsPage = React.lazy(() =>
  import('@adapters/components/Forms/FormsPage').then((m) => ({ default: m.FormsPage })),
);
const NotePage = React.lazy(() =>
  import('@adapters/components/Note/NotePage').then((m) => ({ default: m.NotePage })),
);
import { ToolsGrid } from '@adapters/components/Tools/ToolsGrid';
import { BookmarksPage } from '@adapters/components/Tools/BookmarksPage';
import { DualToolContainer } from '@adapters/components/Tools/DualToolContainer';
import { ToolServicesContext, type ToolServicesValue } from '@adapters/components/Tools/ToolServicesContext';
import { isDualToolId, type DualToolId } from '@adapters/components/Tools/toolRegistry';
import { ToolTimer } from '@adapters/components/Tools/Timer';
import { ToolRandom } from '@adapters/components/Tools/ToolRandom';
import { ToolTrafficLight } from '@adapters/components/Tools/ToolTrafficLight';
import { ToolScoreboard } from '@adapters/components/Tools/ToolScoreboard';
import { ToolRoulette } from '@adapters/components/Tools/ToolRoulette';
import { ToolDice } from '@adapters/components/Tools/ToolDice';
import { ToolCoin } from '@adapters/components/Tools/ToolCoin';
import { ToolQRCode } from '@adapters/components/Tools/ToolQRCode';
import { ToolWorkSymbols } from '@adapters/components/Tools/ToolWorkSymbols';
import { ToolPoll } from '@adapters/components/Tools/ToolPoll';
import { ToolSurvey } from '@adapters/components/Tools/ToolSurvey';
import { ToolMultiSurvey } from '@adapters/components/Tools/ToolMultiSurvey';
import { ToolRealtimeWall } from '@adapters/components/Tools/ToolRealtimeWall';
import { ToolWordCloud } from '@adapters/components/Tools/ToolWordCloud';
import { ToolSeatPicker } from '@adapters/components/Tools/ToolSeatPicker';
import { ToolGrouping } from '@adapters/components/Tools/ToolGrouping';
import { AssignmentTool } from '@adapters/components/Tools/Assignment/AssignmentTool';
import { AssignmentDetail } from '@adapters/components/Tools/Assignment/AssignmentDetail';
import { ToolChalkboard } from '@adapters/components/Tools/ToolChalkboard';
import { ToolCollabBoard } from '@adapters/components/Tools/ToolCollabBoard';
import { ToolValueLine, ToolTrafficLightDiscussion } from '@adapters/components/Tools/Discussion';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { Onboarding } from '@adapters/components/Onboarding/Onboarding';
import { ToastContainer, useToastStore } from '@adapters/components/common/Toast';
import { UpdateNotification } from '@adapters/components/common/UpdateNotification';
import { FeedbackModal } from '@adapters/components/common/FeedbackModal';
import { HelpChatPanel } from '@adapters/components/HelpChat';
import { CloseActionDialog } from '@adapters/components/common/CloseActionDialog';
import { CommandPalette } from '@adapters/components/common/CommandPalette';
import { QuickAddModal } from '@adapters/components/common/QuickAdd';
import { useGlobalShortcuts } from '@adapters/hooks/useGlobalShortcuts';
import { useQuickAddStore } from '@adapters/stores/useQuickAddStore';
import type { QuickAddKind } from '@adapters/stores/useQuickAddStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { OAuthModalsProvider } from '@adapters/components/Settings/modals/OAuthModalsProvider';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useNoteStore } from '@adapters/stores/useNoteStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useSeatConstraintsStore } from '@adapters/stores/useSeatConstraintsStore';
import { useDDayStore } from '@adapters/stores/useDDayStore';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { PinGuard } from '@adapters/components/common/PinGuard';
import { useAutoSync } from '@adapters/hooks/useAutoSync';
import { useTasksAutoSync } from '@adapters/hooks/useTasksAutoSync';
import { useNeisAutoSync } from '@adapters/hooks/useNeisAutoSync';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { DriveSyncConflictModal } from '@adapters/components/common/DriveSyncConflictModal';
import { FirstSyncConfirmModal } from '@adapters/components/common/FirstSyncConfirmModal';
import { reloadStores } from '@adapters/hooks/useDriveSync';
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';
import { validateShareFile } from '@domain/rules/shareRules';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';
import { useFontApplier } from '@adapters/hooks/useFontApplier';
import { useAnalytics, useAnalyticsLifecycle } from '@adapters/hooks/useAnalytics';
import { MobileAnnouncementBanner } from '@adapters/components/MobileAnnouncementBanner';
import { ShareModal } from '@adapters/components/Share/ShareModal';
import { SharePromptOverlay } from '@adapters/components/Share/SharePromptOverlay';
import { recordActiveDay } from '@adapters/stores/useShareStore';

function isWidgetMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'widget') return true;
  if (window.location.hash === '#widget') return true;
  return false;
}

function isQuickAddMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'quickAdd';
}

function getQuickAddKindFromUrl(): QuickAddKind {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('kind');
  if (
    raw === 'todo' ||
    raw === 'event' ||
    raw === 'memo' ||
    raw === 'note' ||
    raw === 'bookmark'
  ) {
    return raw;
  }
  return 'todo';
}

function isPrewarmMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('prewarm') === '1';
}

function useCallbackForDualEntry(
  setCurrentPage: (page: PageId) => void,
): () => void {
  return useCallback(() => {
    setCurrentPage('dual-tool-view');
  }, [setCurrentPage]);
}

interface RenderPageContext {
  readonly onRequestDualMode: () => void;
  readonly lastSingleTool: DualToolId | null;
}

function renderPage(
  page: PageId,
  onNavigate: (page: PageId) => void,
  isFullscreen: boolean,
  ctx: RenderPageContext,
) {
  if (page === 'dashboard') {
    return <Dashboard onNavigate={(page) => onNavigate(page as PageId)} />;
  }
  if (page === 'seating') {
    return <PinGuard feature="seating"><Seating /></PinGuard>;
  }
  if (page === 'timetable') {
    return <PinGuard feature="timetable"><TimetablePage /></PinGuard>;
  }
  if (page === 'homeroom') {
    return <PinGuard feature="studentRecords"><HomeroomPage /></PinGuard>;
  }
  if (page === 'student-records') {
    return <PinGuard feature="studentRecords"><HomeroomPage /></PinGuard>;
  }
  if (page === 'schedule') {
    return <PinGuard feature="schedule"><Schedule /></PinGuard>;
  }
  if (page === 'todo') {
    return <PinGuard feature="todo"><Todo /></PinGuard>;
  }
  if (page === 'meal') {
    return <PinGuard feature="meal"><MealPage /></PinGuard>;
  }
  if (page === 'memo') {
    return <PinGuard feature="memo"><MemoPage /></PinGuard>;
  }
  if (page === 'note') {
    return (
      <PinGuard feature="note">
        <Suspense fallback={<div className="flex h-full items-center justify-center"><p className="text-sp-muted text-lg">쌤핀 노트를 준비하는 중...</p></div>}>
          <NotePage />
        </Suspense>
      </PinGuard>
    );
  }
  if (page === 'class-management') {
    return <PinGuard feature="classManagement"><ClassManagementPage /></PinGuard>;
  }
  if (page === 'settings') {
    return <SettingsPage />;
  }
  if (page === 'export') {
    return <Export />;
  }
  if (page === 'tool-forms') {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center"><p className="text-sp-muted text-lg">서식 불러오는 중...</p></div>}>
        <FormsPage onBack={() => onNavigate('tools')} />
      </Suspense>
    );
  }
  if (page === 'bookmarks') {
    return <PinGuard feature="bookmarks"><BookmarksPage /></PinGuard>;
  }
  if (page === 'tools') {
    return <ToolsGrid onNavigate={onNavigate} />;
  }
  if (page === 'dual-tool-view') {
    return (
      <DualToolContainer
        initialLeftTool={ctx.lastSingleTool}
        onExit={(remaining) => onNavigate(remaining ?? 'tools')}
      />
    );
  }
  // 단일 모드 tool-* 페이지는 공통 ToolServicesContext로 감싸 "병렬 모드 열기" 버튼을 활성화
  const singleToolServices: ToolServicesValue = { onRequestDualMode: ctx.onRequestDualMode };
  if (page === 'tool-timer') {
    return (
      <ToolServicesContext.Provider value={singleToolServices}>
        <ToolTimer onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />
      </ToolServicesContext.Provider>
    );
  }
  const wrap = (el: React.ReactNode) => (
    <ToolServicesContext.Provider value={singleToolServices}>{el}</ToolServicesContext.Provider>
  );
  if (page === 'tool-random') {
    return wrap(<ToolRandom onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-traffic-light') {
    return wrap(<ToolTrafficLight onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-scoreboard') {
    return wrap(<ToolScoreboard onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-roulette') {
    return wrap(<ToolRoulette onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-dice') {
    return wrap(<ToolDice onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-coin') {
    return wrap(<ToolCoin onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-qrcode') {
    return wrap(<ToolQRCode onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-work-symbols') {
    return wrap(<ToolWorkSymbols onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-poll') {
    return wrap(<ToolPoll onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-survey') {
    return wrap(<ToolSurvey onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-multi-survey') {
    return wrap(<ToolMultiSurvey onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-realtime-wall') {
    return wrap(<ToolRealtimeWall onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-wordcloud') {
    return wrap(<ToolWordCloud onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-seat-picker') {
    // 듀얼 모드 미지원 — ToolServicesContext 미제공으로 "병렬 모드" 버튼도 표시하지 않음
    return <ToolSeatPicker onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-grouping') {
    return wrap(<ToolGrouping onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-valueline') {
    return wrap(<ToolValueLine onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-traffic-discussion') {
    return wrap(<ToolTrafficLightDiscussion onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-chalkboard') {
    return wrap(<ToolChalkboard onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-collab-board') {
    return wrap(<ToolCollabBoard onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />);
  }
  if (page === 'tool-assignment') {
    return (
      <AssignmentTool
        onBack={() => onNavigate('tools')}
        onDetail={(id) => {
          useAssignmentStore.getState().selectAssignment(id);
          onNavigate('tool-assignment-detail');
        }}
      />
    );
  }
  if (page === 'tool-assignment-detail') {
    return <AssignmentDetail onBack={() => onNavigate('tool-assignment')} />;
  }
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sp-muted text-lg">준비 중...</p>
    </div>
  );
}

function WidgetUpdateBanner() {
  const [status, setStatus] = useState<'idle' | 'downloaded'>('idle');
  const [version, setVersion] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: (() => void)[] = [];
    cleanups.push(api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    }));
    cleanups.push(api.onUpdateAvailable((info) => {
      setVersion(info.version);
    }));
    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  if (status !== 'downloaded') return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-green-600 text-white text-xs text-center py-2 cursor-pointer z-50 hover:bg-green-500 transition-colors"
      onClick={() => window.electronAPI?.installUpdate()}
    >
      🎉 v{version} 업데이트 준비 완료 — 클릭하여 재시작
    </div>
  );
}

export function App() {
  if (isQuickAddMode()) {
    return <QuickAddApp />;
  }
  if (isWidgetMode()) {
    return <WidgetApp />;
  }
  return <MainApp />;
}

const COMMAND_TO_KIND: Record<string, QuickAddKind> = {
  'quickAdd.todo': 'todo',
  'quickAdd.event': 'event',
  'quickAdd.memo': 'memo',
  'quickAdd.note': 'note',
  'quickAdd.bookmark': 'bookmark',
};

function QuickAddApp(): JSX.Element {
  useThemeApplier();
  const isOpen = useQuickAddStore((s) => s.isOpen);

  // 마운트 시 body를 투명으로 + 데이터 로드 + (prewarm이 아닌 경우) 초기 kind 오픈
  useEffect(() => {
    document.body.classList.add('ssampin-quickadd-popup');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void useTodoStore.getState().load();
    void useEventsStore.getState().load();
    void useMemoStore.getState().load();
    void useNoteStore.getState().load();
    void useBookmarkStore.getState().loadAll();
    if (!isPrewarmMode()) {
      useQuickAddStore.getState().open(getQuickAddKindFromUrl());
    }
    // prewarm 모드면 첫 IPC `shortcut:triggered` 수신 시 open (아래 effect)
    return () => {
      document.body.classList.remove('ssampin-quickadd-popup');
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  // 데이터 외부 변경 동기화
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;
    return api.onDataChanged((filename: string) => {
      void reloadStores([filename]);
    });
  }, []);

  // 글로벌 단축키 IPC 수신 (창이 떠있는 동안 다른 단축키 누르면 kind swap)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onShortcutTriggered) return;
    return api.onShortcutTriggered((commandId: string) => {
      const kind = COMMAND_TO_KIND[commandId];
      if (kind) useQuickAddStore.getState().open(kind);
    });
  }, []);

  // 모달 닫히면 창 자체 닫기
  useEffect(() => {
    if (isOpen) return;
    const t = setTimeout(() => window.close(), 150);
    return () => clearTimeout(t);
  }, [isOpen]);

  // ESC로 즉시 창 닫기 (모달 close → 위 effect로 window.close)
  return (
    <div className="h-screen w-screen bg-transparent">
      <QuickAddModal standalone />
      <ToastContainer />
    </div>
  );
}

function WidgetApp() {
  const { settings } = useSettingsStore();
  const { track } = useAnalytics();

  // Analytics: 위젯 오픈 이벤트 + 활성일 기록
  useEffect(() => {
    track('app_open', { launchMode: 'widget' });
    recordActiveDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메인 ↔ 위젯 데이터 동기화: 다른 창에서 데이터 변경 시 스토어 리로드
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;
    const unsubscribe = api.onDataChanged((filename: string) => {
      void reloadStores([filename]);
    });
    return unsubscribe;
  }, []);

  // 위젯 → 메인 윈도우 크로스 윈도우 네비게이션 수신
  // (위젯이 열려있을 때 메인 창이 destroy된 경우 대비; 보통은 MainApp이 수신)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onNavigateToPage) return;
    const unsubscribe = api.onNavigateToPage(() => {
      // 위젯 모드에서는 페이지 전환 불가; 메인 창이 열릴 때 처리됨
    });
    return unsubscribe;
  }, []);

  // 위젯 내 도구 클릭 → ssampin:navigate 이벤트 수신 (위젯 내부 네비게이션용)
  useEffect(() => {
    const handler = () => {
      // 위젯 모드에서는 페이지 전환 없음 — 메인 창에서 열리도록 IPC로 위임
    };
    window.addEventListener('ssampin:navigate', handler);
    return () => window.removeEventListener('ssampin:navigate', handler);
  }, []);

  // 테마 CSS 변수 주입
  useThemeApplier();

  // 글꼴 종류 적용
  useFontApplier(settings.fontFamily ?? 'noto-sans', settings.customFont);

  // 글꼴 크기: html 루트 font-size
  useEffect(() => {
    const root = document.documentElement;
    switch (settings.fontSize) {
      case 'small':
        root.style.fontSize = '14px';
        break;
      case 'large':
        root.style.fontSize = '18px';
        break;
      case 'xlarge':
        root.style.fontSize = '20px';
        break;
      case 'medium':
      default:
        root.style.fontSize = '16px';
        break;
    }
    return () => {
      root.style.fontSize = '';
    };
  }, [settings.fontSize]);

  return (
    <div className="h-screen w-screen bg-transparent">
      <Widget />
      <WidgetUpdateBanner />
    </div>
  );
}

function MainApp() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // 듀얼 모드 진입 시 초기 좌측 도구 힌트로 쓰일, 마지막으로 본 단일 듀얼지원 도구
  const [lastSingleTool, setLastSingleTool] = useState<DualToolId | null>(null);
  useEffect(() => {
    if (isDualToolId(currentPage)) setLastSingleTool(currentPage);
  }, [currentPage]);
  const handleRequestDualMode = useCallbackForDualEntry(setCurrentPage);
  const { setShareFile, setShowImportModal } = useEventsStore();
  const { settings } = useSettingsStore();
  useAnalyticsLifecycle();
  const { track } = useAnalytics();

  // Analytics: 앱 시작 이벤트 + 활성일 기록
  useEffect(() => {
    track('app_open', { launchMode: 'normal' });
    recordActiveDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 전역 에러 추적
  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      track('error', {
        message: e.message || 'Unknown error',
        component: 'global',
        stack: e.error?.stack?.substring(0, 500),
      });
    };
    const handleRejection = (e: PromiseRejectionEvent) => {
      track('error', {
        message: String((e.reason as { message?: string })?.message || e.reason || 'Unhandled rejection'),
        component: 'global',
        stack: String((e.reason as { stack?: string })?.stack || '').substring(0, 500),
      });
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [track]);

  // Analytics: 페이지 이동 추적
  useEffect(() => {
    track('page_view', { page: currentPage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  // 챗봇에 현재 페이지 전달
  useEffect(() => {
    (window as any).__ssampin_current_page = currentPage;
  }, [currentPage]);

  // 전체화면 상태 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Ctrl+B / Cmd+B: 사이드바 접기/펼치기 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) return;
      e.preventDefault();
      const current = useSettingsStore.getState().settings.sidebarCollapsed ?? false;
      void useSettingsStore.getState().update({ sidebarCollapsed: !current });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 글로벌 퀵애드 단축키 (Ctrl+Alt+T/E/M/N) 등록
  useGlobalShortcuts();

  // .ssampin 파일 열기 이벤트 리스너 (Electron에서 파일 더블클릭 시)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFileOpened) return;

    const unsubscribe = api.onFileOpened((content: string) => {
      try {
        const parsed: unknown = JSON.parse(content);
        const shareFile = validateShareFile(parsed);
        if (shareFile) {
          setCurrentPage('schedule');
          setShareFile(shareFile);
          setShowImportModal(true);
          track('share_import');
        }
      } catch {
        // Invalid file, ignore
      }
    });

    return unsubscribe;
  }, [setShareFile, setShowImportModal]);

  // 위젯 → 메인 윈도우 크로스 윈도우 네비게이션 수신
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onNavigateToPage) return;

    const unsubscribe = api.onNavigateToPage((page: string) => {
      setCurrentPage(page as PageId);
    });

    return unsubscribe;
  }, []);

  // 다른 창에서 데이터 변경 시 스토어 리로드 (메인 ↔ 위젯 동기화)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;

    const unsubscribe = api.onDataChanged((filename: string) => {
      void reloadStores([filename]);
    });

    return unsubscribe;
  }, []);

  // 위젯 내 도구 클릭 → 해당 도구 페이지로 네비게이션
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setCurrentPage(detail as PageId);
    };
    window.addEventListener('ssampin:navigate', handler);
    return () => window.removeEventListener('ssampin:navigate', handler);
  }, []);

  // 구글 계정 + 캘린더 + Tasks 연결 상태 초기화
  // useGoogleAccountStore.initialize()가 useCalendarSyncStore.initialize()도 연쇄 호출함
  useEffect(() => {
    void useGoogleAccountStore.getState().initialize();
    void useTasksSyncStore.getState().initialize();
  }, []);

  // 구글 캘린더 자동 동기화
  useAutoSync();

  // Google Tasks 자동 동기화
  useTasksAutoSync();

  // Google Drive 자동 동기화 (앱 시작 시)
  useEffect(() => {
    const initDriveSync = async () => {
      const syncSettings = useSettingsStore.getState().settings.sync;
      if (!syncSettings?.enabled || !syncSettings.autoSyncOnStart) return;

      // Google 인증 상태 확인
      const calState = useCalendarSyncStore.getState();
      if (!calState.isConnected) return;

      // 신규 기기 첫 동기화 감지: manifest 부재 시 FirstSyncConfirmModal로 위임.
      // checkFirstSyncRequired는 manifest.deviceId === ''이면 firstSyncRequired=true 설정.
      // 이 경우 자동으로 모달이 노출되며, syncFromCloud/syncToCloud는 가드로 차단됨.
      const { checkFirstSyncRequired, syncFromCloud, syncToCloud } = useDriveSyncStore.getState();
      await checkFirstSyncRequired();
      if (useDriveSyncStore.getState().firstSyncRequired) return;

      const result = await syncFromCloud();

      // 다운로드된 파일이 있으면 스토어 리로드
      if (result.downloaded.length > 0) {
        await reloadStores(result.downloaded);
      }

      // 다운로드 후 로컬 변경사항도 업로드
      await syncToCloud();
    };
    // 2초 딜레이 (캘린더 초기화 완료 대기)
    const timer = setTimeout(() => { void initDriveSync(); }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google Drive 주기적 동기화
  useEffect(() => {
    const syncSettings = useSettingsStore.getState().settings.sync;
    if (!syncSettings?.enabled || !syncSettings.autoSyncIntervalMin) return;

    const intervalMs = syncSettings.autoSyncIntervalMin * 60 * 1000;
    const timer = setInterval(async () => {
      const calState = useCalendarSyncStore.getState();
      if (!calState.isConnected) return;

      const { syncFromCloud, syncToCloud } = useDriveSyncStore.getState();
      const result = await syncFromCloud();
      if (result.downloaded.length > 0) {
        await reloadStores(result.downloaded);
      }
      await syncToCloud();
    }, intervalMs);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sync?.autoSyncIntervalMin, settings.sync?.enabled]);

  // autoSyncOnSave: 스토어 변경 시 자동 업로드
  // SYNC_REGISTRY를 단일 소스로 활용해 누락을 구조적으로 차단한다.
  // 새 도메인 추가 시 syncRegistry.ts의 SYNC_REGISTRY와 아래 STORE_SUBSCRIBE_MAP에
  // 한 줄씩 추가하면 된다. SyncSubscribers.test.ts가 두 곳의 정합성을 자동 검증한다.
  useEffect(() => {
    const syncSettings = useSettingsStore.getState().settings.sync;
    if (!syncSettings?.enabled || !syncSettings.autoSyncOnSave) return;

    const calState = useCalendarSyncStore.getState();
    if (!calState.isConnected) return;

    const { triggerSaveSync } = useDriveSyncStore.getState();

    // STORE_SUBSCRIBE_MAP: registry의 fileName을 실제 store.subscribe 함수로 매핑.
    // syncRegistry.ts는 usecases 레이어라 store를 직접 import 못 하므로,
    // adapters 레이어인 본 파일에서 어댑터 역할을 한다.
    // subscribeExcluded:true 도메인(settings, teacher-schedule, timetable-overrides,
    // curriculum-progress, attendance)은 본 맵에서 제외 — 동일 store 중복 구독 방지.
    const STORE_SUBSCRIBE_MAP: Record<string, (cb: () => void) => () => void> = {
      'class-schedule':   (cb) => useScheduleStore.subscribe(cb),
      'students':         (cb) => useStudentStore.subscribe(cb),
      'seating':          (cb) => useSeatingStore.subscribe(cb),
      'events':           (cb) => useEventsStore.subscribe(cb),
      'memos':            (cb) => useMemoStore.subscribe(cb),
      'todos':            (cb) => useTodoStore.subscribe(cb),
      'student-records':  (cb) => useStudentRecordsStore.subscribe(cb),
      'bookmarks':        (cb) => useBookmarkStore.subscribe(cb),
      'surveys':          (cb) => useSurveyStore.subscribe(cb),
      'assignments':      (cb) => useAssignmentStore.subscribe(cb),
      'seat-constraints': (cb) => useSeatConstraintsStore.subscribe(cb),
      'teaching-classes': (cb) => useTeachingClassStore.subscribe(cb),
      'dday':             (cb) => useDDayStore.subscribe(cb),
      'consultations':    (cb) => useConsultationStore.subscribe(cb),
      'manual-meals':     (cb) => useMealStore.subscribe(cb),
      // note-cloud-sync PDCA: 노트북 메타가 useNoteStore의 대표 키.
      // note-sections / note-pages-meta / note-body는 동일 store이므로
      // syncRegistry에서 subscribeExcluded:true로 처리되어 본 맵에서 제외됨.
      'note-notebooks':   (cb) => useNoteStore.subscribe(cb),
    };

    const unsubscribers: Array<() => void> = [];
    for (const d of SYNC_REGISTRY) {
      if (d.subscribeExcluded || d.isDynamic) continue;
      const subscribe = STORE_SUBSCRIBE_MAP[d.fileName];
      if (!subscribe) continue;
      unsubscribers.push(subscribe(() => triggerSaveSync()));
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sync?.enabled, settings.sync?.autoSyncOnSave]);

  // Google Drive: 창 포커스 복귀 시 syncFromCloud → syncToCloud
  useEffect(() => {
    const syncSettings = useSettingsStore.getState().settings.sync;
    if (!syncSettings?.enabled) return;

    let lastFocusSyncAt = 0;
    const COOLDOWN_MS = 10_000;

    const onFocus = async () => {
      const calState = useCalendarSyncStore.getState();
      if (!calState.isConnected) return;

      const now = Date.now();
      if (now - lastFocusSyncAt < COOLDOWN_MS) return;
      lastFocusSyncAt = now;

      const { syncFromCloud, syncToCloud } = useDriveSyncStore.getState();
      const result = await syncFromCloud();
      if (result.downloaded.length > 0) {
        await reloadStores(result.downloaded);
      }
      await syncToCloud();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void onFocus();
      }
    };

    const onWindowFocus = () => { void onFocus(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onWindowFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sync?.enabled]);

  // Google Drive 충돌 상태 구독
  const driveConflicts = useDriveSyncStore((s) => s.conflicts);

  // NEIS 시간표 자동 동기화 (앱 시작 시)
  useNeisAutoSync();

  // NEIS 학사일정 자동 동기화 (앱 시작 시) + 학기 초 안내
  const showToast = useToastStore((s) => s.show);
  useEffect(() => {
    const initNeisSync = async () => {
      const { useNeisScheduleStore } = await import('@adapters/stores/useNeisScheduleStore');
      await useNeisScheduleStore.getState().loadSettings();
      const neisSettings = useNeisScheduleStore.getState().settings;

      if (neisSettings.enabled) {
        void useNeisScheduleStore.getState().syncIfNeeded();
      }

      // 학기 초(3/1~3/15, 9/1~9/15) 동기화 안내
      const now = new Date();
      const month = now.getMonth() + 1;
      const day = now.getDate();
      const isSemesterStart = (month === 3 || month === 9) && day <= 15;

      if (isSemesterStart && neisSettings.enabled && !neisSettings.lastSyncAt) {
        showToast(
          '새 학기가 시작되었습니다! 설정에서 NEIS 학사일정을 동기화해보세요.',
          'info',
        );
      }
    };
    void initNeisSync();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 테마 CSS 변수 주입 (useLayoutEffect)
  useThemeApplier();

  // 글꼴 종류 적용
  useFontApplier(settings.fontFamily ?? 'noto-sans', settings.customFont);

  // 글꼴 크기: html 루트 font-size를 변경하여 모든 rem 기반 크기를 비례 스케일링
  useEffect(() => {
    const root = document.documentElement;
    switch (settings.fontSize) {
      case 'small':
        root.style.fontSize = '14px';
        break;
      case 'large':
        root.style.fontSize = '18px';
        break;
      case 'xlarge':
        root.style.fontSize = '20px';
        break;
      case 'medium':
      default:
        root.style.fontSize = '16px';
        break;
    }
    return () => {
      root.style.fontSize = '';
    };
  }, [settings.fontSize]);

  return (
    <div className="flex flex-col h-screen bg-sp-bg">
      <MobileAnnouncementBanner />
      <div className="flex flex-1 min-h-0">
      {!isFullscreen && (
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onFeedback={() => setShowFeedback(true)} />
      )}
      <main className={`flex-1 overflow-y-auto ${isFullscreen ? 'p-4' : 'p-8'}`}>
        {renderPage(currentPage, setCurrentPage, isFullscreen, {
          onRequestDualMode: handleRequestDualMode,
          lastSingleTool,
        })}
      </main>
      <UpdateNotification />
      <EventPopup />
      <ToastContainer />
      <Onboarding />
      {driveConflicts.length > 0 && (
        <DriveSyncConflictModal
          conflicts={driveConflicts}
          onResolve={async (conflict, resolution) => {
            await useDriveSyncStore.getState().resolveConflict(conflict, resolution);
            // 'remote' 해결 시 스토어 리로드
            if (resolution === 'remote') {
              await reloadStores([conflict.filename]);
            }
          }}
          onClose={() => useDriveSyncStore.getState().resetStatus()}
        />
      )}
      <FirstSyncConfirmModalContainer />
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      <ShareModal />
      <SharePromptOverlay />
      <HelpChatPanel />
      <CloseActionDialog />
      <OAuthModalsProvider />
      <CommandPalette onNavigate={setCurrentPage} />
      <QuickAddModal />
      </div>
    </div>
  );
}

/**
 * FirstSyncConfirmModal 컨테이너 — useDriveSyncStore 상태 구독.
 * 별도 컴포넌트로 분리해 selector 기반 구독으로 불필요한 리렌더를 방지한다.
 */
function FirstSyncConfirmModalContainer() {
  const firstSyncRequired = useDriveSyncStore((s) => s.firstSyncRequired);
  const cloudInfo = useDriveSyncStore((s) => s.firstSyncCloudInfo);
  const chooseFirstSync = useDriveSyncStore((s) => s.chooseFirstSync);

  return (
    <FirstSyncConfirmModal
      open={firstSyncRequired}
      cloudInfo={cloudInfo}
      onChooseDownload={async () => {
        await chooseFirstSync('download');
        // 다운로드 결과 reload 처리 (chooseFirstSync는 결과를 반환하지 않으므로 store에서 조회)
        const lastResult = useDriveSyncStore.getState().lastSyncResult;
        if (lastResult?.direction === 'download' && lastResult.downloaded?.length) {
          await reloadStores(lastResult.downloaded);
        }
      }}
      onChooseUpload={async () => {
        await chooseFirstSync('upload');
      }}
      onDefer={async () => {
        await chooseFirstSync('defer');
        useToastStore.getState().show(
          '동기화를 나중에 설정해요. 설정 > 구글 드라이브에서 결정할 수 있어요.',
          'info',
        );
      }}
    />
  );
}
