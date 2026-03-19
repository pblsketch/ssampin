import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useSyncTrigger } from './hooks/useSyncTrigger';
import { useMobileDriveSyncStore } from './stores/useMobileDriveSyncStore';
import { useMobileAttendanceStore } from './stores/useMobileAttendanceStore';
import { useMobileStudentStore } from './stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from './stores/useMobileStudentRecordsStore';
import { TodayHub } from './components/Today/TodayHub';
import { AttendanceCheckPage } from './pages/AttendanceCheckPage';
import { SchedulePage } from './pages/SchedulePage';
import { StudentsPage } from './pages/StudentsPage';
import { TodoPage } from './pages/TodoPage';
import { MorePage } from './pages/MorePage';
import { MemoPage } from './pages/MemoPage';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { InstallGuide } from './components/Onboarding/InstallGuide';

type MobileTab = 'today' | 'schedule' | 'students' | 'todo' | 'memo' | 'more';

interface TabConfig {
  key: MobileTab;
  label: string;
  icon: string;
}

const tabs: TabConfig[] = [
  { key: 'today', label: '오늘', icon: 'today' },
  { key: 'schedule', label: '일정', icon: 'event_note' },
  { key: 'students', label: '학생', icon: 'people' },
  { key: 'todo', label: '할 일', icon: 'check_circle' },
  { key: 'memo', label: '메모', icon: 'sticky_note_2' },
  { key: 'more', label: '더보기', icon: 'more_horiz' },
];

interface AttendanceNav {
  classId: string;
  className: string;
  period: number;
  type: 'homeroom' | 'class';
}

export function App() {
  const [activeTab, setActiveTab] = useState<MobileTab>('today');
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const [attendanceNav, setAttendanceNav] = useState<AttendanceNav | null>(null);
  const [moreSub, setMoreSub] = useState<'settings' | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding-completed');
  });
  const auth = useGoogleAuth();
  const setTokenGetter = useMobileDriveSyncStore((s) => s.setTokenGetter);

  // 스와이프 제스처 상태
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // 테마 적용 함수
  const applyTheme = useCallback(() => {
    const theme = localStorage.getItem('ssampin-mobile-theme') ?? 'system';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    }
  }, []);

  // 다크 모드 감지 + 테마 설정 반영
  useEffect(() => {
    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const theme = localStorage.getItem('ssampin-mobile-theme') ?? 'system';
      if (theme === 'system') {
        document.documentElement.classList.toggle('dark', mediaQuery.matches);
      }
    };
    const handleThemeChanged = () => {
      applyTheme();
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    window.addEventListener('theme-changed', handleThemeChanged);
    return () => {
      mediaQuery.removeEventListener('change', handleSystemChange);
      window.removeEventListener('theme-changed', handleThemeChanged);
    };
  }, [applyTheme]);

  // 인증 완료 시 동기화 스토어에 토큰 getter 연결, 로그아웃 시 인증 상태 초기화
  useEffect(() => {
    if (auth.isAuthenticated) {
      setTokenGetter(auth.getValidAccessToken);
    } else {
      useMobileDriveSyncStore.setState({ isAuthenticated: false });
    }
  }, [auth.isAuthenticated, auth.getValidAccessToken, setTokenGetter]);

  // 자동 동기화 (마운트 시 + 앱 복귀 시)
  useSyncTrigger();

  const attendanceLoaded = useMobileAttendanceStore((s) => s.loaded);
  const studentsLoaded = useMobileStudentStore((s) => s.loaded);
  const recordsLoaded = useMobileStudentRecordsStore((s) => s.loaded);
  const migrateExistingAttendance = useMobileStudentRecordsStore((s) => s.migrateExistingAttendance);

  // 기존 출결 데이터 → student-records 브릿지 마이그레이션 (최초 1회)
  useEffect(() => {
    if (!attendanceLoaded || !studentsLoaded || !recordsLoaded) return;
    migrateExistingAttendance().then((count) => {
      if (count > 0) {
        console.log(`[att-bridge] 기존 출결 ${count}건 마이그레이션 완료`);
      }
    });
  }, [attendanceLoaded, studentsLoaded, recordsLoaded, migrateExistingAttendance]);

  // OAuth 콜백 처리
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    if (code && !isProcessingCallback) {
      setIsProcessingCallback(true);
      auth.handleCallback(code).then(() => {
        window.history.replaceState({}, '', '/');
        setIsProcessingCallback(false);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 스와이프로 탭 전환
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches.item(0);
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = e.changedTouches.item(0);
    if (!touch) return;

    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // 수직 스크롤이 더 클 경우 스와이프 무시
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      touchStartX.current = null;
      touchStartY.current = null;
      return;
    }

    // 50px 이상 수평 스와이프
    if (Math.abs(deltaX) > 50) {
      const currentIndex = tabs.findIndex((t) => t.key === activeTab);
      if (deltaX < 0 && currentIndex < tabs.length - 1) {
        // 왼쪽 스와이프 → 다음 탭
        const nextTab = tabs[currentIndex + 1];
        if (nextTab) {
          setActiveTab(nextTab.key);
          setMoreSub(null);
        }
      } else if (deltaX > 0 && currentIndex > 0) {
        // 오른쪽 스와이프 → 이전 탭
        const prevTab = tabs[currentIndex - 1];
        if (prevTab) {
          setActiveTab(prevTab.key);
          setMoreSub(null);
        }
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [activeTab]);

  // 온보딩 (첫 방문)
  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={() => {
          localStorage.setItem('onboarding-completed', 'true');
          setShowOnboarding(false);
        }}
        onLogin={() => {
          localStorage.setItem('onboarding-completed', 'true');
          setShowOnboarding(false);
          auth.startLogin();
        }}
      />
    );
  }

  if (auth.isLoading || isProcessingCallback) {
    return (
      <div className="flex items-center justify-center h-dvh mobile-bg">
        <div className="text-center">
          <span className="material-symbols-outlined text-sp-accent text-4xl animate-spin">
            progress_activity
          </span>
          <p className="text-sp-muted mt-3 text-sm">
            {isProcessingCallback ? '동기화 연결 중...' : '로딩 중...'}
          </p>
        </div>
      </div>
    );
  }

  // 출결 체크 페이지 (전체 화면, 탭바 숨김)
  if (attendanceNav) {
    return (
      <AttendanceCheckPage
        classId={attendanceNav.classId}
        className={attendanceNav.className}
        period={attendanceNav.period}
        type={attendanceNav.type}
        onBack={() => setAttendanceNav(null)}
      />
    );
  }

  return (
    <div className="flex flex-col h-dvh mobile-bg">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 glass-header shrink-0"
        style={{ height: 'var(--header-height)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <h1 className="text-lg font-bold text-sp-text">쌤핀</h1>
        {auth.isAuthenticated ? (
          <button
            onClick={auth.logout}
            className="text-xs text-sp-muted hover:text-sp-text transition-colors flex items-center gap-1"
          >
            <span>{auth.email}</span>
            <span className="material-symbols-outlined text-[14px]">logout</span>
          </button>
        ) : (
          <button
            onClick={auth.startLogin}
            className="text-xs text-sp-accent font-medium px-3 py-1 rounded-full glass-card hover:bg-sp-accent/10 transition-colors"
          >
            PC 동기화
          </button>
        )}
      </header>

      {/* Content */}
      <main
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeTab === 'today' && (
          <TodayHub onNavigateAttendance={setAttendanceNav} />
        )}
        {activeTab === 'schedule' && <SchedulePage />}
        {activeTab === 'students' && <StudentsPage />}
        {activeTab === 'todo' && <TodoPage />}
        {activeTab === 'memo' && <MemoPage />}
        {activeTab === 'more' && (
          moreSub === 'settings' ? (
            <SettingsPage onBack={() => setMoreSub(null)} />
          ) : (
            <MorePage onNavigate={setMoreSub} />
          )
        )}
      </main>

      {/* 설치 가이드 (PWA 미설치 시) */}
      <InstallGuide />

      {/* Tab Bar */}
      <nav className="tab-bar flex items-center justify-around glass-tabbar shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key !== 'more') setMoreSub(null);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition-all active:scale-95 ${
              activeTab === tab.key
                ? 'text-blue-500'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            <span className={`material-symbols-outlined text-[22px] ${
              activeTab === tab.key ? 'font-bold' : ''
            }`}>
              {tab.icon}
            </span>
            <span className="text-[9px] font-medium leading-tight">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
