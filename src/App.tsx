import { useState, useEffect } from 'react';
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
import { ToolsGrid } from '@adapters/components/Tools/ToolsGrid';
import { BookmarksPage } from '@adapters/components/Tools/BookmarksPage';
import { ToolTimer } from '@adapters/components/Tools/ToolTimer';
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
import { ToolWordCloud } from '@adapters/components/Tools/ToolWordCloud';
import { ToolSeatPicker } from '@adapters/components/Tools/ToolSeatPicker';
import { AssignmentTool } from '@adapters/components/Tools/Assignment/AssignmentTool';
import { AssignmentDetail } from '@adapters/components/Tools/Assignment/AssignmentDetail';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { Onboarding } from '@adapters/components/Onboarding/Onboarding';
import { ToastContainer, useToastStore } from '@adapters/components/common/Toast';
import { UpdateNotification } from '@adapters/components/common/UpdateNotification';
import { FeedbackModal } from '@adapters/components/common/FeedbackModal';
import { HelpChatPanel } from '@adapters/components/HelpChat';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { PinGuard } from '@adapters/components/common/PinGuard';
import { useAutoSync } from '@adapters/hooks/useAutoSync';
import { useNeisAutoSync } from '@adapters/hooks/useNeisAutoSync';
import { validateShareFile } from '@domain/rules/shareRules';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';
import { useFontApplier } from '@adapters/hooks/useFontApplier';
import { useAnalytics, useAnalyticsLifecycle } from '@adapters/hooks/useAnalytics';

function isWidgetMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'widget') return true;
  if (window.location.hash === '#widget') return true;
  return false;
}

function renderPage(page: PageId, onNavigate: (page: PageId) => void, isFullscreen: boolean) {
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
  if (page === 'class-management') {
    return <ClassManagementPage />;
  }
  if (page === 'settings') {
    return <SettingsPage />;
  }
  if (page === 'export') {
    return <Export />;
  }
  if (page === 'bookmarks') {
    return <BookmarksPage />;
  }
  if (page === 'tools') {
    return <ToolsGrid onNavigate={onNavigate} />;
  }
  if (page === 'tool-timer') {
    return <ToolTimer onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-random') {
    return <ToolRandom onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-traffic-light') {
    return <ToolTrafficLight onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-scoreboard') {
    return <ToolScoreboard onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-roulette') {
    return <ToolRoulette onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-dice') {
    return <ToolDice onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-coin') {
    return <ToolCoin onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-qrcode') {
    return <ToolQRCode onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-work-symbols') {
    return <ToolWorkSymbols onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-poll') {
    return <ToolPoll onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-survey') {
    return <ToolSurvey onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-wordcloud') {
    return <ToolWordCloud onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
  }
  if (page === 'tool-seat-picker') {
    return <ToolSeatPicker onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
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

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const { setShareFile, setShowImportModal } = useEventsStore();
  const { settings } = useSettingsStore();
  useAnalyticsLifecycle();
  const { track } = useAnalytics();

  // Analytics: 앱 시작 이벤트
  useEffect(() => {
    track('app_open', { launchMode: isWidgetMode() ? 'widget' : 'normal' });
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

  // 전체화면 상태 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  // 구글 캘린더 연결 상태 초기화
  useEffect(() => {
    useCalendarSyncStore.getState().initialize();
  }, []);

  // 구글 캘린더 자동 동기화
  useAutoSync();

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
  useFontApplier(settings.fontFamily ?? 'noto-sans');

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

  // 위젯 모드: URL에 ?mode=widget 또는 #widget 이 있으면 위젯 전용 렌더링
  if (isWidgetMode()) {
    return (
      <div className="h-screen w-screen bg-transparent">
        <Widget />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-sp-bg">
      {!isFullscreen && (
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onFeedback={() => setShowFeedback(true)} />
      )}
      <main className={`flex-1 overflow-y-auto ${isFullscreen ? 'p-4' : 'p-8'}`}>
        {renderPage(currentPage, setCurrentPage, isFullscreen)}
      </main>
      <UpdateNotification />
      <EventPopup />
      <ToastContainer />
      <Onboarding />
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      <HelpChatPanel />
    </div>
  );
}
