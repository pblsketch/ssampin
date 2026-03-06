import { useState, useEffect } from 'react';
import { Sidebar, type PageId } from '@adapters/components/Layout/Sidebar';
import { EventPopup } from '@adapters/components/Dashboard/EventPopup';
import { Dashboard } from '@adapters/components/Dashboard/Dashboard';
import { Seating } from '@adapters/components/Seating/Seating';
import { TimetablePage } from '@adapters/components/Timetable/TimetablePage';
import { StudentRecords } from '@adapters/components/StudentRecords/StudentRecords';
import { Schedule } from '@adapters/components/Schedule/Schedule';
import { Todo } from '@adapters/components/Todo/Todo';
import { MemoPage } from '@adapters/components/Memo/MemoPage';
import { MealPage } from '@adapters/components/Meal/MealPage';
import { SettingsPage } from '@adapters/components/Settings/SettingsPage';
import { Widget } from '@adapters/components/Widget/Widget';
import { Export } from '@adapters/components/Export/Export';
import { ToolsGrid } from '@adapters/components/Tools/ToolsGrid';
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
import { Onboarding } from '@adapters/components/Onboarding/Onboarding';
import { ToastContainer, useToastStore } from '@adapters/components/common/Toast';
import { UpdateNotification } from '@adapters/components/common/UpdateNotification';
import { FeedbackModal } from '@adapters/components/common/FeedbackModal';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { PinGuard } from '@adapters/components/common/PinGuard';
import { useAutoSync } from '@adapters/hooks/useAutoSync';
import { validateShareFile } from '@domain/rules/shareRules';

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
  if (page === 'student-records') {
    return <PinGuard feature="studentRecords"><StudentRecords /></PinGuard>;
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
  if (page === 'settings') {
    return <SettingsPage />;
  }
  if (page === 'export') {
    return <Export />;
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

  const fontSizeClass = (() => {
    switch (settings.fontSize) {
      case 'small': return 'text-[13px]';
      case 'large': return 'text-[17px]';
      case 'xlarge': return 'text-[19px]';
      case 'medium':
      default: return 'text-[15px]';
    }
  })();

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const themeClass = (() => {
    if (settings.theme === 'light') return 'theme-light';
    if (settings.theme === 'dark') return 'theme-dark';
    // 'system': follow OS preference
    return systemDark ? 'theme-dark' : 'theme-light';
  })();

  // 위젯 모드: URL에 ?mode=widget 또는 #widget 이 있으면 위젯 전용 렌더링
  if (isWidgetMode()) {
    return (
      <div className={`h-screen w-screen bg-transparent ${fontSizeClass} ${themeClass}`}>
        <Widget />
      </div>
    );
  }

  return (
    <div className={`flex h-screen bg-sp-bg ${fontSizeClass} ${themeClass}`}>
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
    </div>
  );
}
