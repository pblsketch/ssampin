import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useGoogleAuthContext } from './contexts/GoogleAuthContext';
import { useSyncTrigger } from './hooks/useSyncTrigger';
import { useMobileDriveSyncStore } from './stores/useMobileDriveSyncStore';
import { useMobileAttendanceStore } from './stores/useMobileAttendanceStore';
import { useMobileStudentStore } from './stores/useMobileStudentStore';
import { useMobileStudentRecordsStore } from './stores/useMobileStudentRecordsStore';
import { TodayHub } from './components/Today/TodayHub';
import { YearTransitionNotice } from './components/common/YearTransitionNotice';
import { AttendanceCheckPage } from './pages/AttendanceCheckPage';
import { HomeroomAttendanceView } from './pages/HomeroomAttendanceView';
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
import { ToolGroupingPage } from './pages/ToolGroupingPage';
import { ToolRubricPage } from './pages/ToolRubricPage';
import { BookmarkPage } from './pages/BookmarkPage';
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
const ToolScoreAllocator = React.lazy(() =>
  import('@adapters/components/Tools/ToolScoreAllocator').then((m) => ({
    default: m.ToolScoreAllocator,
  })),
);
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { InstallGuide } from './components/Onboarding/InstallGuide';
import { NavMigrationCoachmark } from './components/Onboarding/NavMigrationCoachmark';
import { InAppBrowserBanner } from './components/InAppBrowserBanner';
import { SegmentedControl } from './components/common/SegmentedControl';
import { QuickAddFab, type QuickAddAction } from './components/QuickAddFab';
import { Snackbar } from '@mobile/components/common/Snackbar';
import { MobileHeader } from '@mobile/components/common/MobileHeader';
import { useMobileUiTriggerStore } from './stores/useMobileUiTriggerStore';
import { useRoute } from '@mobile/routing/useRoute';
import {
  HOME_ROUTE,
  tabOf,
  toolIdToLegacyKey,
  legacyKeyToToolId,
  type MobileTab,
  type ScheduleSeg,
} from '@mobile/routing/routes';
import { useMobileViewPrefsStore } from '@mobile/stores/useMobileViewPrefsStore';

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
  'tool-score-allocator': ToolScoreAllocator,
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

// MobileTab · StudentsSeg · ScheduleSeg 는 주소 모델(routing/routes.ts)이 단일 출처다.
// 여기서 다시 선언하면 주소와 화면이 서로 다른 정의를 갖게 된다.

interface TabConfig {
  key: MobileTab;
  label: string;
  icon: string;
}

/**
 * 하단 탭 5개.
 *
 * 담임(학급)과 수업을 따로 둔 이유는 저장소·화면 폴더가 원래 나뉘어 있었기 때문이다
 * (routing/routes.ts 의 MobileTab 주석 참조). 겉의 탭만 "학생" 하나로 묶고 그 안에서
 * 세그먼트로 다시 가르던 구조를 속에 맞췄다.
 *
 * 출결은 탭이 아니다. "출결하기"는 장소가 아니라 반 안에서 하는 동작이고,
 * Apple HIG 는 "탭 바는 이동 전용, 탭 버튼으로 동작을 실행하지 말라"고 한다.
 *
 * 라벨 폭: 390px 기준 칸당 78px 인데 한국어 라벨이 2~3글자(가장 긴 '더보기' 29px)라
 * 여유가 있다. Material 3 의 "5개일 때 라벨 주의" 경고는 이 경우 해당하지 않는다.
 */
const ALL_TABS: TabConfig[] = [
  { key: 'home', label: '홈', icon: 'home' },
  { key: 'homeroom', label: '학급', icon: 'groups' },
  { key: 'teaching', label: '수업', icon: 'school' },
  { key: 'schedule', label: '일정', icon: 'calendar_month' },
  { key: 'more', label: '더보기', icon: 'more_horiz' },
];

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
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);
  const requestUiAction = useMobileUiTriggerStore((s) => s.requestAction);

  // 화면 전환은 주소 기반이다. 이전에는 useState 5개였고, 주소가 없어서 안드로이드
  // 하드웨어 뒤로가기가 앱을 종료시켰다.
  const { route, navigate, goBack } = useRoute();

  // 기존 변수명을 그대로 유지해 아래 40여 곳의 사용처를 건드리지 않는다.
  // 값의 출처만 useState → 주소 파생으로 바뀐다.
  const activeTab = tabOf(route);
  const scheduleSeg: ScheduleSeg = route.kind === 'schedule' ? route.seg : 'schedule';

  /**
   * 담임을 맡지 않은 선생님은 학급 탭을 끌 수 있다(기기별 설정, 기본 켜짐).
   * 끈 상태에서 주소로 직접 들어오면 화면은 정상 렌더한다 — 탭에서 감췄을 뿐
   * 기능을 없앤 게 아니고, 링크가 죽으면 안 되기 때문이다.
   */
  const showHomeroomTab = useMobileViewPrefsStore((s) => s.showHomeroomTab);
  const tabs = showHomeroomTab ? ALL_TABS : ALL_TABS.filter((t) => t.key !== 'homeroom');
  const moreSub: string | null =
    route.kind === 'moreSection'
      ? route.section
      : route.kind === 'tool'
        ? toolIdToLegacyKey(route.toolId)
        : null;
  const attendanceNav: AttendanceNav | null =
    route.kind === 'attendance'
      ? {
          classId: route.classId,
          className: route.className,
          period: route.period,
          type: route.type,
        }
      : null;

  /** 탭을 누르면 그 탭의 첫 화면으로. */
  const setActiveTab = useCallback(
    (tab: MobileTab) => {
      if (tab === 'home') navigate(HOME_ROUTE);
      else if (tab === 'homeroom') navigate({ kind: 'homeroom' });
      else if (tab === 'teaching') navigate({ kind: 'teaching' });
      else if (tab === 'schedule') navigate({ kind: 'schedule', seg: 'schedule' });
      else navigate({ kind: 'more' });
    },
    [navigate],
  );

  const setScheduleSeg = useCallback(
    (seg: ScheduleSeg) => navigate({ kind: 'schedule', seg }),
    [navigate],
  );

  /**
   * 더보기 하위 화면으로 이동.
   *
   * ⚠️ 이름이 `setMoreSub` 이 아닌 이유. 예전 setMoreSub 는 "상태를 지운다"였고 null 을
   * 넣으면 그냥 목록으로 돌아갔다. 지금은 이동이 히스토리를 쌓으므로 되돌아가려면
   * 뒤로가기를 실행해야 한다 — 의미가 달라졌다. 이름을 그대로 뒀다가 남아 있던
   * `setMoreSub(null)` 호출 하나가 탭 이동을 즉시 되돌리는 버그를 냈다(탭바가 먹통).
   * 이름을 바꿔서 남은 호출처를 컴파일러가 드러내게 한다. 되돌아가려면 goBack() 을 쓴다.
   */
  const openMoreSub = useCallback(
    (sub: string) => {
      if (sub === 'settings' || sub === 'memo' || sub === 'bookmarks' || sub === 'tools') {
        navigate({ kind: 'moreSection', section: sub });
        return;
      }
      navigate({ kind: 'tool', toolId: legacyKeyToToolId(sub) });
    },
    [navigate],
  );

  /** 출결 전체화면 진입. 나가는 것은 goBack(). */
  const openAttendance = useCallback(
    (nav: AttendanceNav) => navigate({ kind: 'attendance', ...nav }),
    [navigate],
  );
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
          <img
            src="/floating-pin.png"
            alt="쌤핀이"
            className="w-20 h-20 mx-auto sp-float select-none"
            draggable={false}
          />
          <p className="text-sp-muted mt-4 text-sm">
            {isProcessingCallback ? '동기화 연결 중...' : '로딩 중...'}
          </p>
        </div>
      </div>
    );
  }

  // 출결 체크 페이지 (전체 화면, 탭바 숨김)
  if (attendanceNav) {
    if (attendanceNav.type === 'homeroom') {
      return (
        <HomeroomAttendanceView
          classId={attendanceNav.classId}
          className={attendanceNav.className}
          onBack={goBack}
        />
      );
    }
    return (
      <AttendanceCheckPage
        classId={attendanceNav.classId}
        className={attendanceNav.className}
        period={attendanceNav.period}
        type={attendanceNav.type}
        onBack={goBack}
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
            // 이동은 반드시 한 번만. 예전처럼 setMoreSub→setActiveTab→setScheduleSeg 를
            // 잇달아 부르면 히스토리가 세 칸 쌓여 뒤로가기를 세 번 눌러야 한다.
            onSelect: () => {
              navigate({ kind: 'schedule', seg: 'schedule' });
              requestUiAction('add-event');
            },
          },
          {
            key: 'add-todo',
            label: '할 일 추가',
            icon: 'check_circle',
            tone: 'bg-green-500/15 text-green-500',
            onSelect: () => {
              navigate({ kind: 'schedule', seg: 'todo' });
              requestUiAction('add-todo');
            },
          },
          {
            key: 'memo',
            label: '메모 작성',
            icon: 'sticky_note_2',
            tone: 'bg-yellow-500/15 text-yellow-500',
            onSelect: () => navigate({ kind: 'moreSection', section: 'memo' }),
          },
        ];

  // 더보기 탭 콘텐츠 — moreSub 키에 따라 하위 페이지/도구를 렌더하는 단일 지점.
  // 9개 쌤도구는 MORE_LAZY_TOOLS 레지스트리에서 조회해 Suspense 래퍼 하나로 균일 렌더한다.
  const renderMoreSub = (): React.ReactNode => {
    if (moreSub === 'settings') return <SettingsPage onBack={goBack} />;
    if (moreSub === 'memo') return <MemoPage onBack={goBack} />;
    if (moreSub === 'bookmarks') return <BookmarkPage onBack={goBack} />;
    if (moreSub === 'tools') return <ToolsOverviewPage onNavigate={openMoreSub} onBack={goBack} />;
    if (moreSub === 'tool-assignment') return <ToolAssignmentPage onBack={goBack} />;
    if (moreSub === 'tool-survey') return <ToolSurveyPage onBack={goBack} />;
    if (moreSub === 'tool-grouping') return <ToolGroupingPage onBack={goBack} />;
    if (moreSub === 'tool-rubric') return <ToolRubricPage onBack={goBack} />;
    const LazyTool = moreSub ? MORE_LAZY_TOOLS[moreSub] : undefined;
    if (LazyTool)
      return (
        <Suspense fallback={<ToolLoadingFallback />}>
          <LazyTool onBack={goBack} isFullscreen={false} />
        </Suspense>
      );
    return <MorePage onNavigate={openMoreSub} />;
  };

  return (
    <div className="flex flex-col h-dvh mobile-bg">
      {/* 인앱 브라우저 경고 배너 */}
      <InAppBrowserBanner />

      {/* Header — 공용 부품. 안전영역·높이 처리는 MobileHeader 가 책임진다. */}
      <MobileHeader
        variant="app"
        title="쌤핀"
        actions={
          auth.isAuthenticated ? (
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
          )
        }
      />

      {/* F8c(RT1) — 다른 기기의 학년도 마무리 1회 안내(동기화 다운로드가 currentTerm 전진 감지 시) */}
      <YearTransitionNotice />

      {/* Content
          글로벌 좌우 스와이프로 탭 전환하던 동작은 제거됨 (사용자 요청, 2026-05-14).
          이유: 의도치 않은 탭 전환이 잦아 UX 안티패턴. 탭 전환은 하단 탭바 버튼만으로. */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'home' && <TodayHub onNavigateAttendance={openAttendance} />}
        {/* 담임(학급)·수업이 각자 탭이 되면서 세그먼트 한 줄이 사라졌다.
            화면 위에서 그만큼(약 44px)이 명단에 돌아간다. */}
        {activeTab === 'homeroom' && <StudentsPage />}
        {activeTab === 'teaching' && <ClassListPage />}
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

      {/* 전역 스낵바(되돌리기). 화면마다 각자 마운트하면 그 화면에서만 떠서 전역으로 둔다. */}
      <Snackbar />

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
              // 탭 이동은 setActiveTab 하나로 끝난다. 주소 기반이 되면서 각 탭의 첫
              // 화면으로 가는 것이 곧 하위 화면 해제이기 때문이다. 예전처럼
              // setMoreSub(null) 을 덧붙이면 그건 이제 "뒤로가기 실행"이라 방금 한
              // 이동을 즉시 되돌린다.
              onClick={() => setActiveTab(tab.key)}
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
                <span className="text-detail font-medium leading-tight">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
