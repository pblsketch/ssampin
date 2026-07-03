import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useGoogleAuthContext } from './contexts/GoogleAuthContext';
import { useSyncTrigger } from './hooks/useSyncTrigger';
import { useMobileDriveSyncStore } from './stores/useMobileDriveSyncStore';
import { useMobileAttendanceStore } from './stores/useMobileAttendanceStore';
import { useMobileStudentStore } from './stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from './stores/useMobileStudentRecordsStore';
import { TodayHub } from './components/Today/TodayHub';
import { AttendanceCheckPage } from './pages/AttendanceCheckPage';
import { ClassListPage } from './pages/ClassListPage';
import { SchedulePage } from './pages/SchedulePage';
import { StudentsPage } from './pages/StudentsPage';
import { TodoPage } from './pages/TodoPage';
import { MorePage } from './pages/MorePage';
import { MemoPage } from './pages/MemoPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToolsOverviewPage } from './pages/ToolsOverviewPage';
import { ToolAssignmentPage } from './pages/ToolAssignmentPage';
import { ToolSurveyPage } from './pages/ToolSurveyPage';
// 쌤도구 PC 컴포넌트 — 동적 import (코드 스플리팅)
const ToolTrafficLight = React.lazy(() =>
  import('@adapters/components/Tools/ToolTrafficLight').then((m) => ({
    default: m.ToolTrafficLight,
  })),
);
const ToolDice = React.lazy(() =>
  import('@adapters/components/Tools/ToolDice').then((m) => ({ default: m.ToolDice })),
);
const ToolCoin = React.lazy(() =>
  import('@adapters/components/Tools/ToolCoin').then((m) => ({ default: m.ToolCoin })),
);
const ToolScoreboard = React.lazy(() =>
  import('@adapters/components/Tools/ToolScoreboard').then((m) => ({ default: m.ToolScoreboard })),
);
const ToolTimer = React.lazy(() =>
  import('@adapters/components/Tools/ToolTimer').then((m) => ({ default: m.ToolTimer })),
);
const ToolWorkSymbols = React.lazy(() =>
  import('@adapters/components/Tools/ToolWorkSymbols').then((m) => ({
    default: m.ToolWorkSymbols,
  })),
);
const ToolRandom = React.lazy(() =>
  import('@adapters/components/Tools/ToolRandom').then((m) => ({ default: m.ToolRandom })),
);
const ToolRoulette = React.lazy(() =>
  import('@adapters/components/Tools/ToolRoulette').then((m) => ({ default: m.ToolRoulette })),
);
const ToolQRCode = React.lazy(() =>
  import('@adapters/components/Tools/ToolQRCode').then((m) => ({ default: m.ToolQRCode })),
);
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { InstallGuide } from './components/Onboarding/InstallGuide';
import { NavMigrationCoachmark } from './components/Onboarding/NavMigrationCoachmark';
import { InAppBrowserBanner } from './components/InAppBrowserBanner';
import { SegmentedControl } from './components/common/SegmentedControl';
import { QuickAddFab, type QuickAddAction } from './components/QuickAddFab';
import { useMobileUiTriggerStore } from './stores/useMobileUiTriggerStore';

type MobileToolProps = { onBack: () => void; isFullscreen: boolean };

/** 더보기 > 쌤도구 lazy 컴포넌트 레지스트리 — moreSub 키로 조회해 단일 지점에서 렌더한다.
 *  9개 도구가 모두 동일 시그니처(onBack·isFullscreen)라 Suspense 래퍼 하나로 균일하게 렌더한다. */
const MORE_LAZY_TOOLS: Record<
  string,
  React.LazyExoticComponent<React.ComponentType<MobileToolProps>>
> = {
  'tool-traffic-light': ToolTrafficLight,
  'tool-dice': ToolDice,
  'tool-coin': ToolCoin,
  'tool-scoreboard': ToolScoreboard,
  'tool-timer': ToolTimer,
  'tool-work-symbols': ToolWorkSymbols,
  'tool-random': ToolRandom,
  'tool-roulette': ToolRoulette,
  'tool-qrcode': ToolQRCode,
};

/** 쌤도구 동적 로딩 시 표시할 폴백 스피너 */
function ToolLoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full mobile-bg">
      <div className="text-center">
        <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
          progress_activity
        </span>
        <p className="text-sp-muted mt-2 text-sm">도구 불러오는 중...</p>
      </div>
    </div>
  );
}

type MobileTab = 'home' | 'students' | 'schedule' | 'more';
type StudentsSeg = 'homeroom' | 'teaching';
type ScheduleSeg = 'schedule' | 'todo';

interface TabConfig {
  key: MobileTab;
  label: string;
  icon: string;
}

const tabs: TabConfig[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'students', label: '학생', icon: 'group' },
  { key: 'schedule', label: '일정', icon: 'calendar_month' },
  { key: 'more', label: '더보기', icon: 'more_horiz' },
];

const STUDENTS_SEGMENTS = [
  { key: 'homeroom', label: '담임' },
  { key: 'teaching', label: '수업' },
] as const;

const SCHEDULE_SEGMENTS = [
  { key: 'schedule', label: '일정' },
  { key: 'todo', label: '할 일' },
] as const;

interface AttendanceNav {
  classId: string;
  className: string;
  period: number;
  type: 'homeroom' | 'class';
}

export function App() {
  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [studentsSeg, setStudentsSeg] = useState<StudentsSeg>('homeroom');
  const [scheduleSeg, setScheduleSeg] = useState<ScheduleSeg>('schedule');
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const [attendanceNav, setAttendanceNav] = useState<AttendanceNav | null>(null);
  const requestUiAction = useMobileUiTriggerStore((s) => s.requestAction);
  const [moreSub, setMoreSub] = useState<
    | 'settings'
    | 'memo'
    | 'tools'
    | 'tool-assignment'
    | 'tool-survey'
    | 'tool-traffic-light'
    | 'tool-dice'
    | 'tool-coin'
    | 'tool-scoreboard'
    | 'tool-timer'
    | 'tool-work-symbols'
    | 'tool-random'
    | 'tool-roulette'
    | 'tool-qrcode'
    | null
  >(null);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('onboarding-completed');
  });
  const auth = useGoogleAuthContext();
  const setTokenGetter = useMobileDriveSyncStore((s) => s.setTokenGetter);

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
  const migrateExistingAttendance = useMobileStudentRecordsStore(
    (s) => s.migrateExistingAttendance,
  );

  // 기존 출결 데이터 → student-records 브릿지 마이그레이션 (최초 1회)
  useEffect(() => {
    if (!attendanceLoaded || !studentsLoaded || !recordsLoaded) return;
    migrateExistingAttendance().then((count) => {
      if (count > 0) {
        console.log(`[att-bridge] 기존 출결 ${count}건 마이그레이션 완료`);
      }
    });
  }, [attendanceLoaded, studentsLoaded, recordsLoaded, migrateExistingAttendance]);

  // OAuth 콜백 처리.
  // 실패 시 URL 의 `?code=...` 를 지우고 로딩 상태를 풀어준다(.catch + .finally).
  // 이게 빠지면 교환 실패 시 "동기화 연결 중..." 화면에 영원히 갇힌다.
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      // 사용자가 Google 동의 화면에서 취소했거나 OAuth 자체가 에러로 끝남
      window.history.replaceState({}, '', '/');
      console.warn('[oauth] Google OAuth returned error:', oauthError);
      if (oauthError !== 'access_denied') {
        alert(`Google 로그인이 취소되었습니다.\n(${oauthError})`);
      }
      return;
    }

    if (code && !isProcessingCallback) {
      setIsProcessingCallback(true);
      auth
        .handleCallback(code)
        .then(() => {
          window.history.replaceState({}, '', '/');
        })
        .catch((err: unknown) => {
          console.error('[oauth-callback] handleCallback failed:', err);
          window.history.replaceState({}, '', '/');
          const message = err instanceof Error ? err.message : String(err);
          alert(
            `Google 로그인을 마치지 못했어요.\n\n${message}\n\n` +
              '잠시 뒤 다시 시도해주세요. 문제가 계속되면 개발자에게 알려주세요.',
          );
        })
        .finally(() => {
          setIsProcessingCallback(false);
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 전역 빠른 추가 FAB 액션 (현재 탭 기준; '더보기' 탭에서는 FAB 숨김)
  const fabActions: QuickAddAction[] =
    activeTab === 'more'
      ? []
      : [
          {
            key: 'add-event',
            label: '일정 추가',
            icon: 'event',
            onSelect: () => {
              setMoreSub(null);
              setActiveTab('schedule');
              setScheduleSeg('schedule');
              requestUiAction('add-event');
            },
          },
          {
            key: 'add-todo',
            label: '할 일 추가',
            icon: 'check_circle',
            tone: 'bg-green-500/15 text-green-500',
            onSelect: () => {
              setMoreSub(null);
              setActiveTab('schedule');
              setScheduleSeg('todo');
              requestUiAction('add-todo');
            },
          },
          {
            key: 'memo',
            label: '메모 작성',
            icon: 'sticky_note_2',
            tone: 'bg-yellow-500/15 text-yellow-500',
            onSelect: () => {
              setActiveTab('more');
              setMoreSub('memo');
            },
          },
        ];

  // 더보기 탭 콘텐츠 — moreSub 키에 따라 하위 페이지/도구를 렌더하는 단일 지점.
  // 9개 쌤도구는 MORE_LAZY_TOOLS 레지스트리에서 조회해 Suspense 래퍼 하나로 균일 렌더한다.
  const renderMoreSub = (): React.ReactNode => {
    if (moreSub === 'settings') return <SettingsPage onBack={() => setMoreSub(null)} />;
    if (moreSub === 'memo') return <MemoPage onBack={() => setMoreSub(null)} />;
    if (moreSub === 'tools')
      return (
        <ToolsOverviewPage
          onNavigate={(sub) => setMoreSub(sub as NonNullable<typeof moreSub>)}
          onBack={() => setMoreSub(null)}
        />
      );
    if (moreSub === 'tool-assignment')
      return <ToolAssignmentPage onBack={() => setMoreSub('tools')} />;
    if (moreSub === 'tool-survey') return <ToolSurveyPage onBack={() => setMoreSub('tools')} />;
    const LazyTool = moreSub ? MORE_LAZY_TOOLS[moreSub] : undefined;
    if (LazyTool)
      return (
        <Suspense fallback={<ToolLoadingFallback />}>
          <LazyTool onBack={() => setMoreSub('tools')} isFullscreen={false} />
        </Suspense>
      );
    return <MorePage onNavigate={(sub) => setMoreSub(sub as NonNullable<typeof moreSub>)} />;
  };

  return (
    <div className="flex flex-col h-dvh mobile-bg">
      {/* 인앱 브라우저 경고 배너 */}
      <InAppBrowserBanner />

      {/* Header */}
      <header
        className="flex items-center justify-between px-4 glass-header shrink-0"
        style={{ height: 'var(--header-height)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <h1 className="text-lg font-bold text-sp-text">쌤핀</h1>
        {auth.isAuthenticated ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                auth.logout().then(() => auth.startLogin(true));
              }}
              className="text-xs text-sp-muted hover:text-sp-accent transition-colors"
              title="다른 계정으로 변경"
            >
              <span className="material-symbols-outlined text-icon-sm">swap_horiz</span>
            </button>
            <button
              onClick={auth.logout}
              className="text-xs text-sp-muted hover:text-sp-text transition-colors flex items-center gap-1"
            >
              <span>{auth.email}</span>
              <span className="material-symbols-outlined text-icon-sm">logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => void auth.startLogin()}
            className="text-xs text-sp-accent font-medium px-3 py-1 rounded-full glass-card hover:bg-sp-accent/10 transition-colors"
          >
            PC 동기화
          </button>
        )}
      </header>

      {/* Content
          글로벌 좌우 스와이프로 탭 전환하던 동작은 제거됨 (사용자 요청, 2026-05-14).
          이유: 의도치 않은 탭 전환이 잦아 UX 안티패턴. 탭 전환은 하단 탭바 버튼만으로. */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'home' && <TodayHub onNavigateAttendance={setAttendanceNav} />}
        {activeTab === 'students' && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-4 pt-2 pb-2">
              <SegmentedControl
                options={STUDENTS_SEGMENTS}
                value={studentsSeg}
                onChange={setStudentsSeg}
                ariaLabel="담임/수업 보기"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {studentsSeg === 'homeroom' ? <StudentsPage /> : <ClassListPage />}
            </div>
          </div>
        )}
        {activeTab === 'schedule' && (
          <div className="flex flex-col h-full">
            <div className="shrink-0 px-4 pt-2 pb-2">
              <SegmentedControl
                options={SCHEDULE_SEGMENTS}
                value={scheduleSeg}
                onChange={setScheduleSeg}
                ariaLabel="일정/할 일 보기"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {scheduleSeg === 'schedule' ? <SchedulePage /> : <TodoPage />}
            </div>
          </div>
        )}
        {activeTab === 'more' && renderMoreSub()}
      </main>

      {/* 설치 가이드 (PWA 미설치 시) */}
      <InstallGuide />

      {/* 전역 빠른 추가 FAB */}
      <QuickAddFab actions={fabActions} />

      {/* 하단 탭 6→4 재편 첫 실행 안내 */}
      <NavMigrationCoachmark />

      {/* Tab Bar */}
      <nav
        aria-label="하단 내비게이션"
        className="tab-bar flex items-center justify-around glass-tabbar shrink-0"
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key !== 'more') setMoreSub(null);
              }}
              aria-label={`${tab.label} 탭`}
              aria-current={active ? 'page' : undefined}
              className="flex flex-1 items-center justify-center py-1 transition-transform active:scale-95"
            >
              <span
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 transition-colors ${
                  active ? 'bg-sp-accent/12 text-sp-accent' : 'text-sp-muted'
                }`}
              >
                <span className={`material-symbols-outlined text-2xl ${active ? 'font-bold' : ''}`}>
                  {tab.icon}
                </span>
                <span className="text-tiny font-medium leading-tight">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
