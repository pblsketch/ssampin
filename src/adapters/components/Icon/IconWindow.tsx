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
import appIconUrl from '/build/icon.png?url';
import { IconTooltip } from './IconTooltip';
import { IconContextMenu } from './IconContextMenu';
import { CoachMark } from './CoachMark';

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

  // 초기 로드
  useEffect(() => {
    void loadSettings();
    void loadSchedule();
    void loadEvents();
    void loadTodos();
    void loadMemos();
  }, [loadSettings, loadSchedule, loadEvents, loadTodos, loadMemos]);

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

  const handleClick = () => {
    const t = Date.now();
    const isDouble = t - lastClickAtRef.current < DOUBLE_CLICK_THRESHOLD_MS;
    lastClickAtRef.current = t;

    if (isDouble) {
      // 더블클릭 — 풀앱으로 직행
      if (singleClickTimerRef.current) {
        clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      void window.electronAPI?.iconExpand({ to: 'main' });
      return;
    }

    // 단일 클릭 — 약간 기다렸다가 (더블클릭이 아니라고 확정되면) restore
    if (singleClickTimerRef.current) clearTimeout(singleClickTimerRef.current);
    singleClickTimerRef.current = window.setTimeout(() => {
      void window.electronAPI?.iconExpand({ to: 'restore' });
      singleClickTimerRef.current = null;
    }, DOUBLE_CLICK_THRESHOLD_MS + 10);
  };

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
      <div
        className={`relative w-14 h-14 rounded-2xl bg-sp-card border border-sp-border/60 shadow-lg flex items-center justify-center cursor-pointer transition-transform duration-150 hover:scale-105 ${
          hasAlert ? 'ring-2 ring-sp-accent ring-offset-2 ring-offset-transparent animate-pulse' : ''
        }`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <img
          src={appIconUrl}
          alt="쌤핀"
          className="w-10 h-10 select-none pointer-events-none"
          draggable={false}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
