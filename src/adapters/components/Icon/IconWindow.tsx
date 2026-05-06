/**
 * IconWindow — 아이콘 모드 (v2.0.2~) 메인 컴포넌트.
 *
 * 56×56 floating 아이콘. 사용자 클릭 시 fade로 위젯/풀앱 확장.
 * mode=icon 쿼리 파라미터로 진입.
 *
 * 디자인 결정 (PoC #1, #3 + 사용자 결정 v0.2 반영):
 * - 우상단 뱃지 없음 (정보 표시는 호버 툴팁만)
 * - 풀스크린 자동 hide 없음 — 항상 떠 있음
 * - 단일 클릭 → restore (lastUserMode 복원), 더블클릭 → 풀앱 직행
 * - 드래그로 위치 이동 (-webkit-app-region: drag)
 * - 라운딩: rounded-2xl (rounded-sp-* 금지 정책)
 */
import { useEffect, useRef, useState } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { getCurrentPeriod, getDayOfWeek } from '@domain/rules/periodRules';
import { IconTooltip } from './IconTooltip';
import { IconContextMenu } from './IconContextMenu';
import { CoachMark } from './CoachMark';
import { SsampinIconSvg, type IconState } from './SsampinIconSvg';

const DOUBLE_CLICK_THRESHOLD_MS = 250;
const HOVER_TOOLTIP_DELAY_MS = 100;

interface PeriodInfo {
  number: number;
  subject: string;
}

export function IconWindow() {
  const { settings, load: loadSettings, update: updateSettings } = useSettingsStore();
  const { teacherSchedule, load: loadSchedule } = useScheduleStore();
  const { events, load: loadEvents } = useEventsStore();
  const { todos, load: loadTodos } = useTodoStore();
  const { load: loadMemos } = useMemoStore();

  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [now, setNow] = useState(new Date());
  const [showCoachMark, setShowCoachMark] = useState(false);

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
    // eslint-disable-next-line no-console
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
    return () => {
      void window.electronAPI?.iconDiag({
        event: 'IconWindow:unmount',
        data: { ts: Date.now() },
      });
    };
  }, [loadSettings, loadSchedule, loadEvents, loadTodos, loadMemos]);

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

  // 현재 교시 + 다음 교시 계산
  const periodInfo = computePeriodInfo(now, settings, teacherSchedule);

  // 알림: 미확인 일정 + 미완료 할일 (간단 휴리스틱)
  const hasAlert =
    events.some((e) => isUpcomingWithinMinutes(e.date, now, 5)) ||
    todos.some((t) => !t.completed && t.dueDate && isPast(t.dueDate, now));

  // 아이콘 마스코트 상태: alert > active(수업 중) > sleep(방과후) > idle
  const iconState: IconState = (() => {
    if (hasAlert) return 'alert';
    if (periodInfo?.current) return 'active';
    const lastPeriod = settings.periodTimes?.[settings.periodTimes.length - 1];
    if (lastPeriod) {
      const [h, m] = lastPeriod.end.split(':').map(Number);
      if (h !== undefined && m !== undefined) {
        const endMinutes = h * 60 + m;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (nowMinutes > endMinutes) return 'sleep';
      }
    }
    return 'idle';
  })();

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
    // main process drag 폴링 시작
    void window.electronAPI?.iconStartDrag();

    // 글로벌 fallback — pointerup 이 어떤 경로로든 React 핸들러에 도달하지 못하는
    // edge case(window blur, alt-tab 등) 안전망. 정상 flow 에선 React handlePointerUp
    // 이 먼저 실행돼 cleanupGlobalListeners 로 본 listener 들을 떼어내므로 본 handler
    // 는 발사되지 않는다(같은 dispatch 안의 removeEventListener 는 이후 phase 에 적용됨).
    const handler = () => {
      diag('fallback-handler:fired');
      if (dragStateRef.current) {
        dragStateRef.current = null;
      }
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

    // main process drag 폴링 종료 + 글로벌 fallback 핸들러 정리
    sendEndDrag('pointerUp');

    if (wasDragging || elapsed > CLICK_MAX_DURATION_MS || totalMoved > CLICK_MAX_MOVE_PX) {
      diag('pointerUp:treated-as-drag', { wasDragging, elapsed, totalMoved });
      return;
    }

    // click 검출
    const t = Date.now();
    const isDouble = t - lastClickAtRef.current < DOUBLE_CLICK_THRESHOLD_MS;
    diag('pointerUp:click-detected', { isDouble, sinceLast: t - lastClickAtRef.current });
    lastClickAtRef.current = t;
    if (isDouble) {
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      diag('iconExpand:fire', { to: 'main' });
      void window.electronAPI?.iconExpand({ to: 'main' });
      return;
    }
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = window.setTimeout(() => {
      diag('iconExpand:fire', { to: 'restore' });
      void window.electronAPI?.iconExpand({ to: 'restore' });
      singleClickTimerRef.current = null;
    }, DOUBLE_CLICK_THRESHOLD_MS + 10);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    diag('pointerCancel:enter', { pointerId: e.pointerId });
    if (dragStateRef.current?.pointerId === e.pointerId) {
      // releasePointerCapture 호출 안 함 — capture 를 잡지 않았으므로 풀 것도 없다.
      dragStateRef.current = null;
      // 안전망 — main drag 폴링도 종료 + 글로벌 fallback 정리
      sendEndDrag('pointerCancel');
    }
  };

  // 컴포넌트 unmount 시 누수 방지 — drag 중이면 강제 종료
  useEffect(() => {
    return () => {
      if (globalUpHandlerRef.current) {
        sendEndDrag('unmount');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleMouseEnter = () => {
    hoverTimerRef.current = window.setTimeout(() => setHovered(true), HOVER_TOOLTIP_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHovered(false);
  };

  return (
    <>
      {/*
        Electron drag region 안에서 transform/transition이 적용된 요소는 click
        이벤트 신뢰성이 깨진다. 그래서 hover:scale-* 사용 금지.
        대신 brightness/border 변화로 hover 효과 표현.

        구조: 외곽 컨테이너 = drag, 내부 img = no-drag (click 보장).
        56×56 컨테이너 - 40×40 img = 외곽 8px ring이 drag handle.
      */}
      {/*
        v0.5 (2026-05-02): 사용자 결정 반영
        - 핀 아이콘만 표시 + 배경/그림자 완전 제거 (transparent 윈도우 알파 합성 이슈 회피)
        - WebkitAppRegion: drag 사용 안 함 → JS로 mousemove 캡처해 IPC 'icon:drag-by'로 윈도우 이동
          이렇게 하면 어디를 잡아도 드래그 + click/double-click 정상 동작
        - 알림 펄스만 ring-only로 표시 (배경 박스 없음)
      */}
      {/*
        BrowserWindow 64×64 (Issue #30171 회피)이지만 캐릭터는 56×56로 중앙 표시.
        외곽 4px은 transparent — 시각적으로 캐릭터만 보임.
      */}
      <div
        className="relative w-16 h-16 cursor-pointer flex items-center justify-center"
        style={{ background: 'transparent', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <SsampinIconSvg
          state={iconState}
          size={56}
          className="select-none pointer-events-none"
        />
      </div>
      {hovered && periodInfo && (
        <IconTooltip current={periodInfo.current} next={periodInfo.next} />
      )}
      {contextMenu && (
        <IconContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
      {showCoachMark && <CoachMark />}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface PeriodInfoResult {
  current: PeriodInfo | null;
  next: PeriodInfo | null;
}

function computePeriodInfo(
  now: Date,
  settings: ReturnType<typeof useSettingsStore.getState>['settings'],
  teacherSchedule: ReturnType<typeof useScheduleStore.getState>['teacherSchedule'],
): PeriodInfoResult | null {
  const day = getDayOfWeek(now);
  if (day === null) return { current: null, next: null }; // 주말

  const periodTimes = settings.periodTimes;
  if (!periodTimes || periodTimes.length === 0) return null;

  const currentPeriodNum = getCurrentPeriod(periodTimes, now);

  // teacher schedule에서 해당 일·교시의 과목 추출
  // TeacherScheduleData = { [day: '월'~'금'~'토'~'일']: readonly (TeacherPeriod | null)[] }
  const getSubject = (period: number): string => {
    if (!teacherSchedule) return '';
    const daySlots = teacherSchedule[day];
    if (!daySlots) return '';
    const slot = daySlots[period - 1];
    return slot?.subject ?? '';
  };

  const current: PeriodInfo | null = currentPeriodNum
    ? { number: currentPeriodNum, subject: getSubject(currentPeriodNum) }
    : null;

  // 다음 교시 — currentPeriodNum + 1, 또는 (현재 쉬는 시간이면) 다음 시작 교시
  let nextPeriodNum: number | null = null;
  if (currentPeriodNum) {
    nextPeriodNum = currentPeriodNum + 1;
  } else {
    // 현재 어떤 교시도 진행 중이 아니면, 가장 가까운 미래 교시 찾기
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (let i = 0; i < periodTimes.length; i++) {
      const pt = periodTimes[i];
      if (!pt) continue;
      const [h, m] = pt.start.split(':').map(Number);
      if (h === undefined || m === undefined) continue;
      if (h * 60 + m > nowMinutes) {
        nextPeriodNum = i + 1;
        break;
      }
    }
  }

  const next: PeriodInfo | null =
    nextPeriodNum && nextPeriodNum <= periodTimes.length
      ? { number: nextPeriodNum, subject: getSubject(nextPeriodNum) }
      : null;

  return { current, next };
}

function isUpcomingWithinMinutes(startDate: string | Date, now: Date, minutes: number): boolean {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  if (Number.isNaN(start.getTime())) return false;
  const diff = start.getTime() - now.getTime();
  return diff >= 0 && diff <= minutes * 60 * 1000;
}

function isPast(dueDate: string | Date, now: Date): boolean {
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}
