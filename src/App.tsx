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
import { SettingsPage } from '@adapters/components/Settings/SettingsPage';
import { Widget } from '@adapters/components/Widget/Widget';
import { Export } from '@adapters/components/Export/Export';
import { Onboarding } from '@adapters/components/Onboarding/Onboarding';
import { ToastContainer } from '@adapters/components/common/Toast';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { validateShareFile } from '@domain/rules/shareRules';

function isWidgetMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'widget') return true;
  if (window.location.hash === '#widget') return true;
  return false;
}

function renderPage(page: PageId) {
  if (page === 'dashboard') {
    return <Dashboard />;
  }
  if (page === 'seating') {
    return <Seating />;
  }
  if (page === 'timetable') {
    return <TimetablePage />;
  }
  if (page === 'student-records') {
    return <StudentRecords />;
  }
  if (page === 'schedule') {
    return <Schedule />;
  }
  if (page === 'todo') {
    return <Todo />;
  }
  if (page === 'memo') {
    return <MemoPage />;
  }
  if (page === 'settings') {
    return <SettingsPage />;
  }
  if (page === 'export') {
    return <Export />;
  }
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sp-muted text-lg">준비 중...</p>
    </div>
  );
}

export function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const { setShareFile, setShowImportModal } = useEventsStore();
  const { settings } = useSettingsStore();

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

  const fontSizeClass = (() => {
    switch (settings.fontSize) {
      case 'small': return 'text-[13px]';
      case 'large': return 'text-[17px]';
      case 'xlarge': return 'text-[19px]';
      case 'medium':
      default: return 'text-[15px]';
    }
  })();

  const themeClass = settings.theme === 'light' ? 'theme-light' : 'theme-dark';

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
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto p-8">
        {renderPage(currentPage)}
      </main>
      <EventPopup />
      <ToastContainer />
      <Onboarding />
    </div>
  );
}
