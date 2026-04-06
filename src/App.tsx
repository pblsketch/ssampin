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
import { ToolWordCloud } from '@adapters/components/Tools/ToolWordCloud';
import { ToolSeatPicker } from '@adapters/components/Tools/ToolSeatPicker';
import { ToolGrouping } from '@adapters/components/Tools/ToolGrouping';
import { AssignmentTool } from '@adapters/components/Tools/Assignment/AssignmentTool';
import { AssignmentDetail } from '@adapters/components/Tools/Assignment/AssignmentDetail';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { Onboarding } from '@adapters/components/Onboarding/Onboarding';
import { ToastContainer, useToastStore } from '@adapters/components/common/Toast';
import { UpdateNotification } from '@adapters/components/common/UpdateNotification';
import { FeedbackModal } from '@adapters/components/common/FeedbackModal';
import { HelpChatPanel } from '@adapters/components/HelpChat';
import { CloseActionDialog } from '@adapters/components/common/CloseActionDialog';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { PinGuard } from '@adapters/components/common/PinGuard';
import { useAutoSync } from '@adapters/hooks/useAutoSync';
import { useNeisAutoSync } from '@adapters/hooks/useNeisAutoSync';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { DriveSyncConflictModal } from '@adapters/components/common/DriveSyncConflictModal';
import { reloadStores } from '@adapters/hooks/useDriveSync';
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
  if (page === 'tool-grouping') {
    return <ToolGrouping onBack={() => onNavigate('tools')} isFullscreen={isFullscreen} />;
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
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const { setShareFile, setShowImportModal } = useEventsStore();
  const { settings } = useSettingsStore();
  useAnalyticsLifecycle();
  const { track } = useAnalytics();

  // Analytics: 앱 시작 이벤트 + 활성일 기록
  useEffect(() => {
    track('app_open', { launchMode: isWidgetMode() ? 'widget' : 'normal' });
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

  // 구글 캘린더 연결 상태 초기화
  useEffect(() => {
    useCalendarSyncStore.getState().initialize();
  }, []);

  // 구글 캘린더 자동 동기화
  useAutoSync();

  // Google Drive 자동 동기화 (앱 시작 시)
  useEffect(() => {
    const initDriveSync = async () => {
      const syncSettings = useSettingsStore.getState().settings.sync;
      if (!syncSettings?.enabled || !syncSettings.autoSyncOnStart) return;

      // Google 인증 상태 확인
      const calState = useCalendarSyncStore.getState();
      if (!calState.isConnected) return;

      // 첫 동기화 시 확인 다이얼로그
      if (!syncSettings.lastSyncedAt) {
        const ok = window.confirm(
          '클라우드 동기화를 시작합니다.\n' +
          '클라우드에 기존 데이터가 있으면 다운로드되고,\n' +
          '로컬 데이터는 클라우드에 업로드됩니다.\n\n' +
          '지금 동기화를 시작하시겠습니까?',
        );
        if (!ok) return;
      }

      const { syncFromCloud, syncToCloud } = useDriveSyncStore.getState();
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
  useEffect(() => {
    const syncSettings = useSettingsStore.getState().settings.sync;
    if (!syncSettings?.enabled || !syncSettings.autoSyncOnSave) return;

    const calState = useCalendarSyncStore.getState();
    if (!calState.isConnected) return;

    const { triggerSaveSync } = useDriveSyncStore.getState();

    // 주요 스토어들의 변경을 구독
    const unsubscribers = [
      useScheduleStore.subscribe(() => triggerSaveSync()),
      useSeatingStore.subscribe(() => triggerSaveSync()),
      useEventsStore.subscribe(() => triggerSaveSync()),
      useMemoStore.subscribe(() => triggerSaveSync()),
      useTodoStore.subscribe(() => triggerSaveSync()),
      useStudentRecordsStore.subscribe(() => triggerSaveSync()),
      useTeachingClassStore.subscribe(() => triggerSaveSync()),
    ];

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

  // 위젯 모드: URL에 ?mode=widget 또는 #widget 이 있으면 위젯 전용 렌더링
  if (isWidgetMode()) {
    return (
      <div className="h-screen w-screen bg-transparent">
        <Widget />
        <WidgetUpdateBanner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-sp-bg">
      <MobileAnnouncementBanner />
      <div className="flex flex-1 min-h-0">
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
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      <ShareModal />
      <SharePromptOverlay />
      <HelpChatPanel />
      <CloseActionDialog />
      </div>
    </div>
  );
}
