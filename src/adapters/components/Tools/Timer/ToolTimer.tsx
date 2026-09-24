import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatTime } from '@domain/rules/timerRules';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';
import { useLeaveGuardStore } from '@adapters/stores/useLeaveGuardStore';
import { ToolLayout } from '../ToolLayout';
import type { KeyboardShortcut } from '../types';
import { DualToolContext } from '../DualToolContext';
import {
  useToolPopupInitial,
  useToolPopupSession,
  useToolPopupSlot,
} from '../popup/toolPopupSession';
import type { Tab } from './types';
import { TimerMode } from './TimerMode';
import { StopwatchMode } from './StopwatchMode';
import { PresentationMode } from './PresentationMode';
import { StepsMode } from './StepsMode';
import { useElementSize } from './useElementSize';
import { useWakeLock } from './useWakeLock';
import {
  IDLE_STATUS,
  TimerShellContext,
  type TimerModeStatus,
  type TimerShellValue,
  type TimerTabBadge,
  type TimerVariant,
} from './timerShellContext';

/**
 * 쌤도구 타이머 틀(ADR-139, spec 2-6·5-2·5-3·5-5·5-6, 설계 7장).
 *
 * - 네 모드(모바일은 타이머·스톱워치 둘)를 모두 그려 두고 보이는 탭만 바꾼다.
 *   숨은 모드도 계속 돌고, 끝나면 알람이 울린다. 그 탭으로 저절로 넘어가지는 않는다.
 * - 단축키는 보이는 탭의 모드만 받는다(`useTimerModeKeydown`).
 * - 모드들이 알린 상태로 탭 배지·화면 이동 안내·창 X 자동 팝업·화면 꺼짐 방지를 정한다.
 */

interface ToolTimerProps {
  onBack: () => void;
  isFullscreen: boolean;
  /** 모바일은 타이머·스톱워치만 두고 프리셋 편집·부채꼴을 숨긴다. */
  variant?: TimerVariant;
}

interface TabDef {
  readonly id: Tab;
  readonly label: string;
  readonly icon: string;
}

const TABS: readonly TabDef[] = [
  { id: 'timer', label: '타이머', icon: 'timer' },
  { id: 'stopwatch', label: '스톱워치', icon: 'av_timer' },
  { id: 'presentation', label: '발표 타이머', icon: 'co_present' },
  { id: 'steps', label: '단계 타이머', icon: 'stairs' },
];
const MOBILE_TABS: readonly Tab[] = ['timer', 'stopwatch'];

/** 이보다 좁으면 탭 이름을 숨기고 아이콘만 둔다(팝업 최소 폭 420px에서 가로 스크롤 금지). */
const TAB_LABEL_MIN_WIDTH = 520;

const INITIAL_STATUSES: Readonly<Record<Tab, TimerModeStatus>> = {
  timer: IDLE_STATUS,
  stopwatch: IDLE_STATUS,
  presentation: IDLE_STATUS,
  steps: IDLE_STATUS,
};

const CLASSROOM_SHORTCUT: KeyboardShortcut = {
  key: 'f',
  label: '교실 화면',
  description: '시간만 크게',
  handler: () => {},
};

function shortcutsFor(tab: Tab): KeyboardShortcut[] {
  const noop = (): void => {};
  switch (tab) {
    case 'timer':
      return [
        { key: ' ', label: '시작/일시정지', description: '타이머 토글', handler: noop },
        { key: 'r', label: '리셋', description: '타이머 리셋', handler: noop },
        { key: 'Enter', label: '확인', description: '종료 확인', handler: noop },
        { key: '↑', label: '+30초', description: '시간 추가', handler: noop },
        { key: '↓', label: '-30초', description: '시간 빼기', handler: noop },
        CLASSROOM_SHORTCUT,
      ];
    case 'presentation':
      return [
        { key: ' ', label: '시작/일시정지·다음 동작', description: '발표 토글', handler: noop },
        { key: '→', label: '발표 마침·다음 발표자', description: '다음 동작', handler: noop },
        { key: 'r', label: '처음으로', description: '발표 리셋', handler: noop },
        CLASSROOM_SHORTCUT,
      ];
    case 'steps':
      return [
        { key: ' ', label: '시작/일시정지', description: '단계 타이머 토글', handler: noop },
        { key: 'r', label: '처음으로', description: '단계 타이머 리셋', handler: noop },
        { key: 'Enter', label: '확인', description: '종료 확인', handler: noop },
        { key: '→', label: '다음 단계', description: '다음 단계', handler: noop },
        { key: '←', label: '이전 단계', description: '이전 단계', handler: noop },
        { key: '↑', label: '+30초', description: '현재 단계 시간 추가', handler: noop },
        { key: '↓', label: '-30초', description: '현재 단계 시간 빼기', handler: noop },
        CLASSROOM_SHORTCUT,
      ];
    case 'stopwatch':
      return [
        { key: ' ', label: '시작/일시정지', description: '스톱워치 토글', handler: noop },
        { key: 'r', label: '리셋', description: '스톱워치 리셋', handler: noop },
        { key: 'l', label: '랩', description: '랩 기록', handler: noop },
        CLASSROOM_SHORTCUT,
      ];
  }
}

/** 탭 배지 — 남은(잰) 시간 또는 "종료"(설계 7-3). 채운 배경은 sp-accent 만 쓴다. */
function TabBadge({ badge, active }: { readonly badge: TimerTabBadge; readonly active: boolean }) {
  const base = 'px-1.5 py-0.5 rounded-full text-[10px] leading-none font-bold tabular-nums';
  if (badge.kind === 'finished') {
    return (
      <span
        className={`${base} border border-sp-error text-sp-error`}
        style={{ backgroundColor: 'var(--sp-card)' }}
      >
        종료
      </span>
    );
  }
  return (
    <span
      className={`${base} ${active ? 'text-sp-accent-fg' : 'bg-sp-accent text-sp-accent-fg'}`}
      style={
        active
          ? { backgroundColor: 'color-mix(in srgb, var(--sp-accent-fg) 25%, transparent)' }
          : undefined
      }
    >
      {formatTime(badge.seconds)}
    </span>
  );
}

export function ToolTimer({ onBack, isFullscreen, variant = 'desktop' }: ToolTimerProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'timer' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = useMemo(
    () => (variant === 'mobile' ? TABS.filter((t) => MOBILE_TABS.includes(t.id)) : TABS),
    [variant],
  );

  // 팝업으로 옮길 때 지금 보고 있는 탭도 함께 간다.
  const popupInitial = useToolPopupInitial<{ tab: Tab }>('timer-shell');
  const [tab, setTab] = useState<Tab>(() => {
    const initial = popupInitial?.data.tab ?? 'timer';
    return tabs.some((t) => t.id === initial) ? initial : 'timer';
  });
  useToolPopupSlot<{ tab: Tab }>('timer-shell', {
    capture: () => ({ tab }),
    resume: (snapshot) => setTab(snapshot.tab),
  });

  // ── 모드 상태 모으기 ───────────────────────────────────────────
  const [statuses, setStatuses] =
    useState<Readonly<Record<Tab, TimerModeStatus>>>(INITIAL_STATUSES);
  const reportStatus = useCallback((t: Tab, status: TimerModeStatus) => {
    setStatuses((prev) => (prev[t] === status ? prev : { ...prev, [t]: status }));
  }, []);
  const all = Object.values(statuses);
  const anyBusy = all.some((s) => s.busy);
  const anyAwaiting = all.some((s) => s.awaitingConfirm);
  const anyRunning = all.some((s) => s.running);
  const activeStatus = statuses[tab];
  const classroomReady = activeStatus.classroomReady ?? true;

  // ── 교실 화면 ─────────────────────────────────────────────────
  const [classroomOpen, setClassroomOpen] = useState(false);
  const closeClassroom = useCallback(() => setClassroomOpen(false), []);
  const toggleClassroom = useCallback(() => {
    setClassroomOpen((open) => (open ? false : classroomReady));
  }, [classroomReady]);
  // 진행 화면을 벗어나면(발표 처음으로 등) 교실 화면도 닫는다.
  useEffect(() => {
    if (classroomOpen && !classroomReady) setClassroomOpen(false);
  }, [classroomOpen, classroomReady]);

  useToolKeydown(
    (e) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      toggleClassroom();
    },
    [toggleClassroom],
  );

  // 입력칸(활동 이름·단계 이름·발표자 이름)에서 Esc 는 칸에서 빠져나오기만 한다. 도구 머리글의 Esc(뒤로)가
  // 먼저 받으면 대기 중인 타이머는 묻지 않고 도구를 떠나 적던 이름·저장 안 한 순서가 사라진다.
  useToolKeydown(
    (e) => {
      if (e.key !== 'Escape') return;
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') return;
      e.preventDefault();
      e.stopPropagation();
      el.blur();
    },
    [],
    { capture: true },
  );

  // ── 화면 꺼짐 방지(spec 5-6) ───────────────────────────────────
  useWakeLock(anyRunning || classroomOpen);

  // ── 화면 이동 안내·창 X 자동 팝업(spec 5-3·5-4) ─────────────────
  const popupSession = useToolPopupSession();
  const dualCtx = useContext(DualToolContext);
  const popupSessionRef = useRef(popupSession);
  popupSessionRef.current = popupSession;
  const canMove = popupSession?.placement === 'main' && dualCtx === null;
  const guardId = `tool-timer-${useId()}`;
  useEffect(() => {
    if (popupSession?.placement === 'popup') return;
    if (!anyBusy && !anyAwaiting) return;
    return useLeaveGuardStore.getState().register({
      id: guardId,
      blocksNavigation: anyBusy,
      canMoveToPopup: () => canMove,
      moveToPopup: async () => {
        const session = popupSessionRef.current;
        return session !== null ? session.moveToPopup() : false;
      },
    });
  }, [guardId, anyBusy, anyAwaiting, canMove, popupSession?.placement]);

  const shellValue = useMemo<TimerShellValue>(
    () => ({ activeTab: tab, variant, classroomOpen, closeClassroom, reportStatus }),
    [tab, variant, classroomOpen, closeClassroom, reportStatus],
  );

  const displayShortcuts = useMemo(() => shortcutsFor(tab), [tab]);
  const { ref: tabBarRef, size: tabBarSize } = useElementSize({ width: 800, height: 48 });
  const showLabels = variant === 'mobile' || tabBarSize.width >= TAB_LABEL_MIN_WIDTH;
  const hideChrome = classroomOpen && dualCtx !== null;

  const renderMode = (id: Tab) => {
    switch (id) {
      case 'timer':
        return <TimerMode />;
      case 'stopwatch':
        return <StopwatchMode />;
      case 'presentation':
        return <PresentationMode />;
      case 'steps':
        return <StepsMode />;
    }
  };

  return (
    <ToolLayout
      title="타이머"
      emoji="⏱️"
      onBack={onBack}
      isFullscreen={isFullscreen}
      shortcuts={displayShortcuts}
      disableZoom
      leaveGuardActive={anyBusy}
      onClassroomMode={classroomReady ? toggleClassroom : undefined}
      hideHeader={hideChrome}
    >
      <TimerShellContext.Provider value={shellValue}>
        <div className="flex flex-col items-center w-full h-full min-h-0 gap-4">
          <div
            ref={tabBarRef}
            className={`shrink-0 w-full flex justify-center ${hideChrome ? 'hidden' : ''}`}
          >
            <div
              role="tablist"
              aria-label="타이머 도구"
              className="flex max-w-full bg-sp-card rounded-xl p-1 border border-sp-border"
            >
              {tabs.map((t) => {
                const active = tab === t.id;
                const badge = statuses[t.id].badge;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`timer-tab-${t.id}`}
                    aria-selected={active}
                    aria-controls={`timer-panel-${t.id}`}
                    title={showLabels ? undefined : t.label}
                    aria-label={showLabels ? undefined : t.label}
                    onClick={() => setTab(t.id)}
                    className={`relative flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      active
                        ? 'bg-sp-accent text-sp-accent-fg shadow-sm'
                        : 'text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    <span className="material-symbols-outlined text-icon-md">{t.icon}</span>
                    {showLabels && t.label}
                    {badge !== null && <TabBadge badge={badge} active={active} />}
                  </button>
                );
              })}
            </div>
          </div>

          {tabs.map((t) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`timer-panel-${t.id}`}
              aria-labelledby={`timer-tab-${t.id}`}
              hidden={tab !== t.id}
              className={tab === t.id ? 'flex-1 min-h-0 w-full flex flex-col' : 'hidden'}
            >
              {renderMode(t.id)}
            </div>
          ))}
        </div>
      </TimerShellContext.Provider>
    </ToolLayout>
  );
}
