/**
 * IconWindow — 아이콘 모드 (v2.0.2~) 메인 컴포넌트.
 *
 * 56×56 floating 핀 캐릭터(핀이). mode=icon 쿼리 파라미터로 진입.
 *
 * v2.2.7 창 구조 재설계:
 * - 창은 평소 compact(64×64, 핀만). 말풍선·팝오버·메뉴·코치마크가 필요할 때만
 *   main 프로세스가 창을 확장(340×480)한다 — 핀의 화면 위치는 불변.
 *   (기존에는 창이 항상 64×64라 이 UI들이 전부 창 밖에 그려져 보이지 않았다.)
 * - 확장 창의 빈 영역은 클릭이 아래 창으로 통과(setIgnoreMouseEvents+forward).
 *   인터랙티브 요소(핀·팝오버·메뉴) 위에서만 마우스를 받는다.
 * - 클릭 규칙 재정의: 단일 클릭 = 오늘 요약 팝오버 토글(그 자리에서 확인),
 *   더블클릭 = 전체 앱, 우클릭 = 메뉴, 드래그 = 이동.
 *
 * 디자인 결정 (PoC #1, #3 + 사용자 결정 v0.2 + v2.2.7 재정의):
 * - 풀스크린 자동 hide 없음 — 항상 떠 있음
 * - 드래그로 위치 이동 (main process 커서 폴링 — -webkit-app-region 사용 안 함)
 * - 라운딩: rounded-xl (rounded-sp-* 금지 정책)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { IconContextMenu } from './IconContextMenu';
import { CoachMark } from './CoachMark';
import { PinDisc } from './PinDisc';
import { PinBubble } from './PinBubble';
import { PinPopover } from './PinPopover';
import {
  derivePinInfo,
  decidePeek,
  buildSummary,
  listTodayClasses,
  listTopDueTodos,
  type PinState,
} from './pinPresence';

const DOUBLE_CLICK_THRESHOLD_MS = 250;
const HOVER_TOOLTIP_DELAY_MS = 100;

// 능동 말풍선 노출 시간 / 축하 동작 지속 시간
const PEEK_VISIBLE_MS = 6000;
const CELEBRATE_MS = 4500;

interface IconLayout {
  expanded: boolean;
  anchor: { up: boolean; right: boolean };
}

/** 로컬 타임존 "YYYY-MM-DD" (빠른 추가의 오늘 마감용) */
function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function IconWindow() {
  const { settings, load: loadSettings, update: updateSettings } = useSettingsStore();
  const { teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { events, load: loadEvents } = useEventsStore();
  const { todos, load: loadTodos, addTodo, toggleTodo } = useTodoStore();
  const { load: loadMemos } = useMemoStore();
  const { loadTodayMeals, loadManualMeals, getMergedTodayMeals } = useMealStore();
  const { track } = useAnalytics();

  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showCoachMark, setShowCoachMark] = useState(false);
  // 창 확장 상태 — main 프로세스가 확정한 값(확장 여부 + UI가 열리는 방향)
  const [layout, setLayout] = useState<IconLayout>({
    expanded: false,
    anchor: { up: true, right: true },
  });

  // 펫 알림 상태 — 능동 말풍선 + 축하 동작
  const [peek, setPeek] = useState<{ state: PinState; text: string } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const lastPeekKeyRef = useRef<string | null>(null);
  const peekTimerRef = useRef<number | null>(null);
  const celebrateTimerRef = useRef<number | null>(null);
  const prevDueCountRef = useRef<number | null>(null);

  const hoverTimerRef = useRef<number | null>(null);
  const lastClickAtRef = useRef<number>(0);
  const singleClickTimerRef = useRef<number | null>(null);
  // 드래그 판정 상태. 실제 윈도우 이동은 main process가 screen.getCursorScreenPoint()를
  // 16ms 폴링으로 처리하고, renderer는 click vs drag 판정용 메타데이터만 들고 있는다.
  //
  // setPointerCapture 사용 안 함 — main의 setBounds 폴링과 결합하면 Windows가
  // WM_MOUSELEAVE를 새 클라이언트 좌표 기준으로 발사 → Chromium이 pointer hit-test
  // invariant 깨졌다고 판단해 pointercancel/lostpointercapture를 stealth하게 발사 →
  // renderer pointer-state desync(W3C/PEP issue #327, Chromium #1166044). 그 결과
  // "1~2회 드래그 후 capture가 nominally accept되지만 events가 retarget되지 않는"
  // stuck state 발생. 윈도우가 항상 커서 아래로 따라오므로 capture 없이도
  // pointermove/pointerup이 element에 정상 도달한다.
  const dragStateRef = useRef<{
    startScreenX: number;
    startScreenY: number;
    startTime: number;
    isDragging: boolean;
    pointerId: number;
  } | null>(null);

  // ─── 진단 로그 ──────────────────────────────────────────────────────────
  // v2.0.4: 사용자가 "1~2회 후 stuck" 재현 시 어디서 멈추는지 가시화.
  // 출력 경로(3중 fanout):
  //   1) 아이콘 윈도우 DevTools 콘솔 (dev 모드에서 자동 오픈)
  //   2) IPC `icon:diag` → main 프로세스 diagLog → packaged exe stdout
  //   3) 파일 `app.getPath('userData')/native-desktop-diag.log` 에 append
  //      (Win: `%APPDATA%\ssampin\native-desktop-diag.log`)
  //
  // 따라서 release exe 로 실행해도 메모장으로 로그 파일만 열면 진단이 가능.
  const diagSeqRef = useRef<number>(0);
  const diag = (event: string, extra: Record<string, unknown> = {}) => {
    const seq = ++diagSeqRef.current;
    const data = {
      state: dragStateRef.current ? 'dragging' : 'idle',
      handler: !!globalUpHandlerRef.current,
      ...extra,
    };

    console.log(`[icon-renderer] #${seq} ${event}`, data);
    // main 으로 forward — 파일 로그에 append. IPC 실패는 silently swallow.
    void window.electronAPI?.iconDiag({ event: `#${seq} ${event}`, data });
  };

  // 초기 로드 — 그리고 mount 사실 자체를 main 에 보고 (icon mode 진입 가시화)
  useEffect(() => {
    void window.electronAPI?.iconDiag({
      event: 'IconWindow:mount',
      data: { url: window.location.href, ts: Date.now() },
    });
    void loadSettings();
    void loadSchedule();
    void loadEvents();
    void loadTodos();
    void loadMemos();
    void loadManualMeals();
    return () => {
      void window.electronAPI?.iconDiag({
        event: 'IconWindow:unmount',
        data: { ts: Date.now() },
      });
    };
  }, [loadSettings, loadSchedule, loadEvents, loadTodos, loadMemos, loadManualMeals]);

  // 오늘 급식(중식) 로드 — 급식 학교 설정(mealSchool) 우선, 없으면 NEIS 학교 폴백
  // (모바일 TodayHub 와 동일 규칙). 학교 미설정이면 조용히 생략 — 급식 브리핑만 빠진다.
  const mealAtptCode = settings.mealSchool?.atptCode || settings.neis?.atptCode;
  const mealSchoolCode = settings.mealSchool?.schoolCode || settings.neis?.schoolCode;
  useEffect(() => {
    if (mealAtptCode && mealSchoolCode) {
      void loadTodayMeals(mealAtptCode, mealSchoolCode);
    }
  }, [mealAtptCode, mealSchoolCode, loadTodayMeals]);

  // body/html/#root에 transparent 강제 적용 — light 테마의 흰 배경(--sp-bg #ffffff) 무력화
  // CSS class만으로는 specificity 이슈 가능성 있어 inline style로 직접 강제 (2중 안전망)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    // CSS class
    body.classList.add('ssampin-icon-popup');

    // 이전 값 백업 후 inline style 강제 적용
    const prev = {
      htmlBg: html.style.backgroundColor,
      htmlColor: html.style.background,
      bodyBg: body.style.backgroundColor,
      bodyColor: body.style.background,
      bodyMargin: body.style.margin,
      rootBg: root?.style.backgroundColor ?? '',
      rootHeight: root?.style.height ?? '',
    };

    html.style.background = 'transparent';
    html.style.backgroundColor = 'transparent';
    body.style.background = 'transparent';
    body.style.backgroundColor = 'transparent';
    body.style.margin = '0';
    if (root) {
      root.style.background = 'transparent';
      root.style.backgroundColor = 'transparent';
      root.style.height = '100vh';
    }

    return () => {
      body.classList.remove('ssampin-icon-popup');
      html.style.backgroundColor = prev.htmlBg;
      html.style.background = prev.htmlColor;
      body.style.backgroundColor = prev.bodyBg;
      body.style.background = prev.bodyColor;
      body.style.margin = prev.bodyMargin;
      if (root) {
        root.style.backgroundColor = prev.rootBg;
        root.style.height = prev.rootHeight;
      }
    };
  }, []);

  // 1분 타이머 (현재 교시 갱신용)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // 첫 활성화 코치마크 — settings.widget.icon.showCoachMark 기준
  useEffect(() => {
    if (!settings.widget.icon) return;
    if (!settings.widget.icon.showCoachMark) return;
    setShowCoachMark(true);
    const timer = window.setTimeout(() => {
      setShowCoachMark(false);
      // 다음 진입부터는 안 띄우도록 갱신
      void updateSettings({
        widget: {
          ...settings.widget,
          icon: { ...settings.widget.icon!, showCoachMark: false },
        },
      });
    }, 5000);
    return () => clearTimeout(timer);
    // settings.widget.icon은 한 번만 평가하면 됨 (코치마크는 1회성)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.widget.icon?.showCoachMark]);

  // 오늘 급식(중식) 요약 — 수동+NEIS 병합 결과에서 반찬 3개까지
  const mergedTodayMeals = getMergedTodayMeals();
  const lunchMenu = useMemo(() => {
    const lunch = mergedTodayMeals.find((m) => m.mealType === '중식');
    if (!lunch || lunch.dishes.length === 0) return null;
    return lunch.dishes
      .slice(0, 3)
      .map((d) => d.name)
      .join(', ');
  }, [mergedTodayMeals]);

  // 펫이 알 정보(다음 수업 과목+교실 · 마감 할 일 · 다가오는 일정 · 급식) 계산
  const pinInfo = derivePinInfo({
    now,
    periodTimes: settings.periodTimes,
    teacherSchedule,
    todos,
    events,
    lunchMenu,
    ...(settings.lunchAfterPeriod !== undefined
      ? { lunchAfterPeriod: settings.lunchAfterPeriod }
      : {}),
    ...(settings.lunchStart !== undefined ? { lunchStartFallback: settings.lunchStart } : {}),
  });
  const peekCandidate = decidePeek(pinInfo);
  const dueCount = pinInfo.dueTodos.count;
  const peekKey = peekCandidate ? `${peekCandidate.state}:${peekCandidate.text}` : null;

  // 할 일을 모두 끝낸 순간(미완료 마감 > 0 → 0)에 축하 동작 1회
  useEffect(() => {
    const prev = prevDueCountRef.current;
    if (prev != null && prev > 0 && dueCount === 0) {
      setCelebrating(true);
      if (celebrateTimerRef.current) window.clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = window.setTimeout(() => setCelebrating(false), CELEBRATE_MS);
    }
    prevDueCountRef.current = dueCount;
  }, [dueCount]);

  // 능동 말풍선 — 새 알림이 생겼을 때만 먼저 띄움(같은 메시지 반복 안 함)
  useEffect(() => {
    if (!peekKey) return;
    if (lastPeekKeyRef.current === peekKey) return;
    lastPeekKeyRef.current = peekKey;
    setPeek(peekCandidate);
    if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current);
    peekTimerRef.current = window.setTimeout(() => setPeek(null), PEEK_VISIBLE_MS);
    // peekCandidate 는 peekKey 와 1:1 대응 — key 변할 때만 실행하면 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekKey]);

  // ─── 창 확장/축소 + 마우스 통과 (v2.2.7) ────────────────────────────────
  // UI(말풍선·팝오버·메뉴·코치마크)가 하나라도 필요하면 창 확장을 요청.
  // 드래그 중에는 항상 compact (main 도 드래그 시작 시 방어적으로 축소).
  const wantExpanded =
    !dragging &&
    (hovered || popoverOpen || menuOpen || showCoachMark || celebrating || peek !== null);

  useEffect(() => {
    // 조율(reconcile): 원하는 상태와 실제 창 상태가 어긋나 있으면 요청한다.
    // main 이 스스로 축소하는 경우(드래그 시작·화면 이탈 리셋)에도 layout push 로
    // 이 효과가 다시 실행되므로 어긋난 상태가 즉시 복구된다 — wantExpanded 만
    // 의존하면 "값은 그대로인데 실제 창만 축소된" 경우 재요청이 나가지 않는다
    // (실기기 확인 2026-07-02: 클릭 후 팝오버가 화면에 안 나오던 원인).
    if (wantExpanded === layout.expanded) return undefined;
    const api = window.electronAPI;
    if (api?.iconSetExpanded) {
      let cancelled = false;
      void api.iconSetExpanded(wantExpanded).then((l) => {
        if (!cancelled && l) setLayout(l);
      });
      return () => {
        cancelled = true;
      };
    }
    // 브라우저 dev 폴백 — 창 개념이 없으므로 즉시 반영 (실화면 검증용)
    setLayout({ expanded: wantExpanded, anchor: { up: true, right: true } });
    return undefined;
  }, [wantExpanded, layout.expanded]);

  // main 주도 레이아웃 변경(드래그 축소·화면 이탈 리셋 등) 구독
  useEffect(() => {
    return window.electronAPI?.onIconLayout?.((l) => setLayout(l));
  }, []);

  // 아이콘 모드 진입 통지 — UI 상태 초기화 + 진입 분석 이벤트
  useEffect(() => {
    return window.electronAPI?.onIconShown?.(() => {
      setPopoverOpen(false);
      setMenuOpen(false);
      track('icon_mode_enter');
    });
  }, [track]);

  // 인터랙티브 요소(핀·팝오버·메뉴) hover 참조 카운트로 마우스 통과 토글.
  // 확장 창의 빈 영역은 ignore=true(아래 창으로 통과), 요소 위에서만 false.
  const interactiveCountRef = useRef(0);
  const sendMouseIgnore = useCallback((ignore: boolean) => {
    void window.electronAPI?.iconSetMouseIgnore?.(ignore);
  }, []);
  const interactiveEnter = () => {
    interactiveCountRef.current += 1;
    sendMouseIgnore(false);
  };
  const interactiveLeave = () => {
    interactiveCountRef.current = Math.max(0, interactiveCountRef.current - 1);
    if (interactiveCountRef.current === 0) sendMouseIgnore(true);
  };
  useEffect(() => {
    if (!layout.expanded) {
      interactiveCountRef.current = 0;
      return;
    }
    // 확장 직후 main 은 빈 영역 클릭 통과(ignore=true)로 시작한다. 이때 포인터가
    // 이미 핀 위에 있으면(호버로 확장된 경우) 핀의 클릭·드래그까지 바탕화면으로
    // 통과돼 버리므로, 현재 hover 참조 카운트 기준으로 즉시 재동기화한다.
    // (실기기 확인 2026-07-02: 말풍선 표시 중 클릭 무반응·드래그 불가의 원인)
    sendMouseIgnore(interactiveCountRef.current === 0);
  }, [layout.expanded, sendMouseIgnore]);

  // 창 포커스 이탈(바깥 클릭 등) 시 팝오버/메뉴 닫기
  useEffect(() => {
    const onBlur = () => {
      setPopoverOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // 호버 요약 + 현재 펫 동작 결정
  const summary = buildSummary(pinInfo);
  let pinState: PinState = 'idle';
  if (hovered) pinState = 'wave';
  else if (celebrating) pinState = 'celebrate';
  else if (peek) pinState = peek.state;

  // 팝오버 데이터
  const todayClasses = listTodayClasses(
    { now, periodTimes: settings.periodTimes, teacherSchedule },
    pinInfo,
  );
  // 마감 할 일 — 최대 12개까지, 목록이 길면 팝오버 안에서 스크롤 (사용자 요청: 3개 제한 해제)
  const topTodos = listTopDueTodos(todos, now, 12);

  // 모드 전환(분석 이벤트 포함) — 더블클릭/메뉴/팝오버 푸터 공용
  const expandTo = useCallback(
    (to: 'main' | 'widget' | 'restore', via: 'double-click' | 'context-menu' | 'popover') => {
      track('icon_mode_expand', { to, via });
      setPopoverOpen(false);
      setMenuOpen(false);
      diag('iconExpand:fire', { to, via });
      void window.electronAPI?.iconExpand({ to });
    },
    [track],
  );

  const handleQuickAdd = useCallback(
    async (text: string) => {
      await addTodo(text, localToday());
      track('icon_popover_quick_add');
    },
    [addTodo, track],
  );

  const handleToggleTodo = useCallback(
    (id: string) => {
      void toggleTodo(id);
      track('icon_popover_todo_toggle');
    },
    [toggleTodo, track],
  );

  // 클릭 vs 드래그 판정 임계
  const CLICK_MAX_DURATION_MS = 250;
  const CLICK_MAX_MOVE_PX = 5;

  // 드래그는 main process가 screen.getCursorScreenPoint() 폴링으로 처리.
  // Renderer는 단순히 startDrag/endDrag IPC만 호출 — pointer capture 의존 X.
  //
  // v2.0.3 fix #1 — listener leak 으로 "10번 후 click 도 drag 도 안 됨" 회피.
  //   이전 패턴은 4개 listener 를 `{ once:true }` 로 등록했는데, 그중 1개만 발사되면
  //   나머지 3개는 listener registry 에 남는다. pointerDown 마다 누적 → DOM listener
  //   table 폭주 → 다음 release 시 stale closure 가 한꺼번에 발사 → renderer race.
  //   해법: once 제거 + 명시적 cleanup + pointerDown 진입 시 기존 handler 강제 정리.
  //
  // v2.0.4 fix #2 — capture phase race 로 "더블클릭 무반응" 회피.
  //   이전 패턴은 fallback listener 를 capture: true 로 등록했는데, 사양상 capture phase
  //   는 window→document→#root→...→target 순으로 발사되므로 document 핸들러가 React 의
  //   onPointerUp(루트 컨테이너 위임)보다 먼저 실행되어 dragStateRef 를 null 로 만든다.
  //   그 다음 발사된 React handlePointerUp 이 `if (!state) return` 가드에 막혀 click 검출
  //   분기에 도달하지 못함 → 단일/더블 클릭이 한 번도 처리되지 않는다.
  //   해법: capture phase → bubble phase(false). React 핸들러가 먼저 발사돼 정상 처리하고,
  //   normal flow 에서는 React 가 이미 cleanupGlobalListeners 를 호출하므로 document
  //   fallback 은 발사되지 않는다(removeEventListener 가 같은 dispatch 안에서 적용됨).
  //
  // v2.0.4 fix #3 — setPointerCapture 자체 제거.
  //   main 의 setBounds 폴링과 결합하면 Chromium pointer-state 가 desync 되어 1~2회 후
  //   stuck. 윈도우가 항상 커서 아래로 따라오므로 capture 없이도 events 가 element 에
  //   정상 도달한다.
  const globalUpHandlerRef = useRef<(() => void) | null>(null);

  const cleanupGlobalListeners = (h: (() => void) | null) => {
    if (!h) return;
    // capture: false 로 등록했으므로 remove 도 capture: false (혹은 third arg 생략).
    document.removeEventListener('pointerup', h);
    document.removeEventListener('pointercancel', h);
    document.removeEventListener('mouseup', h);
    window.removeEventListener('blur', h);
  };

  const sendEndDrag = (origin: string) => {
    diag('sendEndDrag', { origin });
    void window.electronAPI?.iconEndDrag();
    const h = globalUpHandlerRef.current;
    if (h) {
      cleanupGlobalListeners(h);
      globalUpHandlerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    diag('pointerDown:enter', {
      button: e.button,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      screenX: e.screenX,
      screenY: e.screenY,
    });
    if (e.button !== 0) {
      diag('pointerDown:skip-non-left');
      return;
    }
    // 이전 drag 의 누락된 fallback handler 강제 정리 (누적 leak 방지)
    if (globalUpHandlerRef.current) {
      diag('pointerDown:cleanup-stale-handler');
      cleanupGlobalListeners(globalUpHandlerRef.current);
      globalUpHandlerRef.current = null;
    }
    // setPointerCapture 호출 안 함 — main 의 setBounds 폴링이 윈도우를 커서 아래로
    // 따라오게 하므로 capture 없이도 events 가 element 에 도달한다.
    dragStateRef.current = {
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startTime: Date.now(),
      isDragging: false,
      pointerId: e.pointerId,
    };
    // main process drag 폴링은 실제 드래그 판정(5px 이동) 시점에 시작한다 —
    // pointerDown 에서 시작하면 클릭만 해도 main 이 확장 창을 방어적으로 축소해
    // 팝오버가 열리자마자 사라진다 (실기기 확인 2026-07-02). handlePointerMove 참조.

    // 글로벌 fallback — pointerup 이 어떤 경로로든 React 핸들러에 도달하지 못하는
    // edge case(window blur, alt-tab 등) 안전망. 정상 flow 에선 React handlePointerUp
    // 이 먼저 실행돼 cleanupGlobalListeners 로 본 listener 들을 떼어내므로 본 handler
    // 는 발사되지 않는다(같은 dispatch 안의 removeEventListener 는 이후 phase 에 적용됨).
    const handler = () => {
      diag('fallback-handler:fired');
      if (dragStateRef.current) {
        dragStateRef.current = null;
      }
      setDragging(false);
      cleanupGlobalListeners(handler);
      if (globalUpHandlerRef.current === handler) {
        globalUpHandlerRef.current = null;
      }
      void window.electronAPI?.iconEndDrag();
    };
    globalUpHandlerRef.current = handler;
    // capture: false (bubble phase). React 의 onPointerUp(루트 위임)이 본 document
    // 핸들러보다 먼저 발사되도록 보장 — 더블클릭 검출 가능.
    document.addEventListener('pointerup', handler);
    document.addEventListener('pointercancel', handler);
    document.addEventListener('mouseup', handler);
    window.addEventListener('blur', handler);
    diag('pointerDown:exit-ready');
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (e.pointerId !== state.pointerId) return;
    const totalMoved = Math.hypot(e.screenX - state.startScreenX, e.screenY - state.startScreenY);
    if (!state.isDragging && totalMoved > CLICK_MAX_MOVE_PX) {
      state.isDragging = true;
      // 이 시점에 main 폴링 시작 — 클릭에는 창 축소/폴링이 개입하지 않는다.
      // main 이 확장 창을 축소한 뒤(핀 위치 불변) compact 상태로 따라온다.
      void window.electronAPI?.iconStartDrag();
      setDragging(true); // 오버레이 숨김 + 창 확장 요청 억제
      setPopoverOpen(false);
      setMenuOpen(false);
      diag('pointerMove:drag-detected', { totalMoved });
    }
    // 윈도우 이동은 main이 폴링으로 처리 — 여기선 click/drag 판정만
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    diag('pointerUp:enter', {
      pointerId: e.pointerId,
      screenX: e.screenX,
      screenY: e.screenY,
    });
    const state = dragStateRef.current;
    if (!state) {
      diag('pointerUp:skip-state-null');
      return;
    }
    if (e.pointerId !== state.pointerId) {
      diag('pointerUp:skip-pointerId-mismatch', { expected: state.pointerId });
      return;
    }
    // releasePointerCapture 호출 안 함 — handlePointerDown 에서 capture 를 잡지 않았다.

    const elapsed = Date.now() - state.startTime;
    const totalMoved = Math.hypot(e.screenX - state.startScreenX, e.screenY - state.startScreenY);
    const wasDragging = state.isDragging;
    dragStateRef.current = null;
    setDragging(false);

    // main process drag 폴링 종료 + 글로벌 fallback 핸들러 정리
    sendEndDrag('pointerUp');

    if (wasDragging || elapsed > CLICK_MAX_DURATION_MS || totalMoved > CLICK_MAX_MOVE_PX) {
      diag('pointerUp:treated-as-drag', { wasDragging, elapsed, totalMoved });
      return;
    }

    // click 검출 — 단일 클릭: 오늘 요약 팝오버 토글 / 더블클릭: 전체 앱 (v2.2.7)
    const t = Date.now();
    const isDouble = t - lastClickAtRef.current < DOUBLE_CLICK_THRESHOLD_MS;
    diag('pointerUp:click-detected', { isDouble, sinceLast: t - lastClickAtRef.current });
    lastClickAtRef.current = t;
    if (isDouble) {
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      // 더블클릭 직전 단일 클릭으로 열린 팝오버는 닫힘(expandTo 내부에서 정리)
      expandTo('main', 'double-click');
      return;
    }
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setPopoverOpen((v) => {
        const next = !v;
        if (next) track('icon_popover_open');
        diag('popover:toggle', { open: next });
        return next;
      });
      singleClickTimerRef.current = null;
    }, DOUBLE_CLICK_THRESHOLD_MS + 10);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    diag('pointerCancel:enter', { pointerId: e.pointerId });
    if (dragStateRef.current?.pointerId === e.pointerId) {
      // releasePointerCapture 호출 안 함 — capture 를 잡지 않았으므로 풀 것도 없다.
      dragStateRef.current = null;
      setDragging(false);
      // 안전망 — main drag 폴링도 종료 + 글로벌 fallback 정리
      sendEndDrag('pointerCancel');
    }
  };

  // 컴포넌트 unmount 시 누수 방지 — drag 중이면 강제 종료 + 펫 알림 타이머 정리
  useEffect(() => {
    return () => {
      if (globalUpHandlerRef.current) {
        sendEndDrag('unmount');
      }
      if (peekTimerRef.current) window.clearTimeout(peekTimerRef.current);
      if (celebrateTimerRef.current) window.clearTimeout(celebrateTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setPopoverOpen(false);
    setMenuOpen(true);
  };

  const handleMouseEnter = () => {
    interactiveEnter();
    hoverTimerRef.current = window.setTimeout(() => setHovered(true), HOVER_TOOLTIP_DELAY_MS);
  };

  const handleMouseLeave = () => {
    interactiveLeave();
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(false);
  };

  // ─── 레이아웃 (v2.2.7) ──────────────────────────────────────────────────
  // compact: 창=64×64, 핀이 창 전체. expanded: 창=340×480, 핀은 anchor 모서리에
  // 고정(화면 위치 불변)되고 오버레이(말풍선/팝오버/메뉴)가 핀 반대 방향으로 열린다.
  const { up, right } = layout.anchor;
  const overlayVisible = layout.expanded && !dragging;
  // 우선순위: 팝오버 > 메뉴 > 호버 요약 > 축하 > 능동 알림 > 코치마크 (한 번에 하나)
  let overlay: JSX.Element | null = null;
  if (popoverOpen) {
    overlay = (
      <div onMouseEnter={interactiveEnter} onMouseLeave={interactiveLeave}>
        <PinPopover
          now={now}
          statusTitle={summary.title}
          classes={todayClasses}
          todos={topTodos}
          lunchMenu={lunchMenu}
          onToggleTodo={handleToggleTodo}
          onQuickAdd={handleQuickAdd}
          onOpenWidget={() => expandTo('widget', 'popover')}
          onOpenMain={() => expandTo('main', 'popover')}
        />
      </div>
    );
  } else if (menuOpen) {
    overlay = (
      <div onMouseEnter={interactiveEnter} onMouseLeave={interactiveLeave}>
        <IconContextMenu
          onClose={() => setMenuOpen(false)}
          onExpand={(to) => expandTo(to, 'context-menu')}
        />
      </div>
    );
  } else if (hovered) {
    overlay = <PinBubble title={summary.title} lines={summary.lines} />;
  } else if (celebrating) {
    overlay = <PinBubble title="할 일 다 끝냈어요! 🎉" />;
  } else if (peek) {
    overlay = <PinBubble title={peek.text} />;
  } else if (showCoachMark) {
    overlay = <CoachMark />;
  }

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/*
        Electron drag region 안에서 transform/transition이 적용된 요소는 click
        이벤트 신뢰성이 깨진다. 그래서 hover:scale-* 사용 금지.

        v0.5 (2026-05-02): 핀 아이콘만 표시 + 배경/그림자 완전 제거(캐릭터 주변).
        WebkitAppRegion: drag 사용 안 함 → pointer 이벤트로 판정, main 폴링으로 이동.
        BrowserWindow compact 64×64 (Issue #30171 회피), 캐릭터는 56×56 중앙 표시.
      */}
      <div
        className={`absolute w-16 h-16 cursor-pointer flex items-center justify-center ${
          up ? 'bottom-0' : 'top-0'
        } ${right ? 'right-0' : 'left-0'}`}
        style={{ background: 'transparent', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <PinDisc state={pinState} />
      </div>
      {overlayVisible && overlay && (
        <div
          className={`absolute flex flex-col ${right ? 'right-1 items-end' : 'left-1 items-start'} ${
            up ? 'bottom-[72px]' : 'top-[72px]'
          }`}
        >
          {overlay}
        </div>
      )}
    </div>
  );
}

// 펫 알림 로직(다음 수업·할 일·일정·급식 계산, 동작 결정)은 ./pinPresence 로 분리됨.
