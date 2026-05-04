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
import { PinDisc } from './PinDisc';

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
  // Pointer Events 기반 드래그 — setPointerCapture로 윈도우 밖에서도 이벤트 유지
  // 절대 좌표 계산 (mouseDown 시점 offset을 기록하여 매 move마다 newPos = mouseScreen - offset)
  const dragStateRef = useRef<{
    startScreenX: number;
    startScreenY: number;
    offsetX: number;     // mouseDown 시점 mouse가 윈도우 내에서 어디인지
    offsetY: number;
    startTime: number;
    isDragging: boolean;
    pointerId: number;
  } | null>(null);

  // 초기 로드
  useEffect(() => {
    void loadSettings();
    void loadSchedule();
    void loadEvents();
    void loadTodos();
    void loadMemos();
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

  // 클릭 vs 드래그 판정 임계
  const CLICK_MAX_DURATION_MS = 250;
  const CLICK_MAX_MOVE_PX = 5;

  // 드래그는 main process가 screen.getCursorScreenPoint() 폴링으로 처리.
  // Renderer는 단순히 startDrag/endDrag IPC만 호출 — pointer capture 의존 X.
  // mouse가 윈도우 밖으로 나가도, 어떤 OS race가 있어도 안정적.
  //
  // v2.0.3 fix — "처음엔 되다가 갑자기 안 됨" 버그 대응.
  //   원인: 마우스를 64×64 아이콘 영역 밖에서 release 하면 transparent/frameless
  //   윈도우의 setPointerCapture 가 stale 되어 pointerup/cancel 이 안 발사되는 경우가
  //   있다. → endDrag IPC 누락 → main 의 5초 safety timer 가 발동할 때까지 stale
  //   iconDragState 가 남아 다음 드래그 시 시작 좌표가 어긋남.
  //   해법: pointerDown 시 document 레벨 pointerup/cancel/mouseup 핸들러를
  //   { once, capture:true } 로 등록 → 어떤 경로로든 release 가 발생하면 100%
  //   endDrag IPC 발사.
  const globalUpHandlerRef = useRef<((e: PointerEvent | MouseEvent) => void) | null>(null);

  const sendEndDrag = () => {
    void window.electronAPI?.iconEndDrag();
    if (globalUpHandlerRef.current) {
      const h = globalUpHandlerRef.current;
      document.removeEventListener('pointerup', h as EventListener, true);
      document.removeEventListener('pointercancel', h as EventListener, true);
      document.removeEventListener('mouseup', h as EventListener, true);
      window.removeEventListener('blur', h as EventListener, true);
      globalUpHandlerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // 좌클릭만
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    dragStateRef.current = {
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      offsetX: 0,
      offsetY: 0,
      startTime: Date.now(),
      isDragging: false,
      pointerId: e.pointerId,
    };
    // main process drag 폴링 시작
    void window.electronAPI?.iconStartDrag();

    // 글로벌 fallback — pointer release 가 어떤 경로로든 발생하면 endDrag 강제 발사
    const handler = () => {
      // dragStateRef 정리는 handlePointerUp 또는 여기서. 양쪽 idempotent.
      if (dragStateRef.current) {
        dragStateRef.current = null;
      }
      sendEndDrag();
    };
    globalUpHandlerRef.current = handler;
    document.addEventListener('pointerup', handler, { once: true, capture: true });
    document.addEventListener('pointercancel', handler, { once: true, capture: true });
    document.addEventListener('mouseup', handler, { once: true, capture: true });
    // 윈도우 focus 가 빠져도 drag 종료
    window.addEventListener('blur', handler, { once: true, capture: true });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (e.pointerId !== state.pointerId) return;
    const totalMoved = Math.hypot(e.screenX - state.startScreenX, e.screenY - state.startScreenY);
    if (!state.isDragging && totalMoved > CLICK_MAX_MOVE_PX) {
      state.isDragging = true;
    }
    // 윈도우 이동은 main이 폴링으로 처리 — 여기선 click/drag 판정만
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (!state) return;
    if (e.pointerId !== state.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const elapsed = Date.now() - state.startTime;
    const totalMoved = Math.hypot(e.screenX - state.startScreenX, e.screenY - state.startScreenY);
    const wasDragging = state.isDragging;
    dragStateRef.current = null;

    // main process drag 폴링 종료 + 글로벌 fallback 핸들러 정리
    sendEndDrag();

    if (wasDragging || elapsed > CLICK_MAX_DURATION_MS || totalMoved > CLICK_MAX_MOVE_PX) {
      return;
    }

    // click 검출
    const t = Date.now();
    const isDouble = t - lastClickAtRef.current < DOUBLE_CLICK_THRESHOLD_MS;
    lastClickAtRef.current = t;
    if (isDouble) {
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      void window.electronAPI?.iconExpand({ to: 'main' });
      return;
    }
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = window.setTimeout(() => {
      void window.electronAPI?.iconExpand({ to: 'restore' });
      singleClickTimerRef.current = null;
    }, DOUBLE_CLICK_THRESHOLD_MS + 10);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === e.pointerId) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      dragStateRef.current = null;
      // 안전망 — main drag 폴링도 종료 + 글로벌 fallback 정리
      sendEndDrag();
    }
  };

  // 컴포넌트 unmount 시 누수 방지 — drag 중이면 강제 종료
  useEffect(() => {
    return () => {
      if (globalUpHandlerRef.current) {
        sendEndDrag();
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
        <PinDisc hasAlert={hasAlert} hovered={hovered} />
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
