import { createContext, useContext, useEffect, useRef, type DependencyList } from 'react';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';
import type { Tab } from './types';

/**
 * 타이머 탭 틀(ToolTimer)과 각 모드 사이의 약속(ADR-139).
 *
 * - 모든 모드는 탭을 바꿔도 화면 뒤에 살아 있다(spec 5-2). 그래서 단축키는
 *   **지금 보이는 탭**만 받아야 한다 — 숨은 모드가 Space 에 같이 반응하면 결함이다.
 * - 각 모드는 자기 상태(진행 중·확인 전·탭 배지)를 틀에 알린다. 틀은 그것으로 탭 배지·
 *   화면 이동 안내·창 X 자동 팝업·화면 꺼짐 방지를 정한다.
 * - 교실 화면은 틀이 켜고 끄며, 보이는 탭의 모드가 그린다.
 */

export type TimerTabBadge =
  | { readonly kind: 'remaining'; readonly seconds: number }
  /** 스톱워치 — 잰 시간. */
  | { readonly kind: 'elapsed'; readonly seconds: number }
  | { readonly kind: 'finished' };

export interface TimerModeStatus {
  /** 페이지 이동을 막을 만큼 진행 중(spec 5-3 표). */
  readonly busy: boolean;
  /** 끝났는데 아직 [확인]하지 않음 — 본문 창이 숨을 때 팝업으로 옮긴다(spec 5-4). */
  readonly awaitingConfirm: boolean;
  /** 시간이 흐르는 중 — 화면 꺼짐을 막는다(spec 5-6). */
  readonly running: boolean;
  /** 탭 배지. 없으면 null. */
  readonly badge: TimerTabBadge | null;
  /**
   * 교실 화면을 켤 수 있는 화면인가. 발표·단계 타이머는 진행 화면에서만 켠다(spec 5-5).
   * 없으면 켤 수 있다.
   */
  readonly classroomReady?: boolean;
}

export const IDLE_STATUS: TimerModeStatus = {
  busy: false,
  awaitingConfirm: false,
  running: false,
  badge: null,
};

export type TimerVariant = 'desktop' | 'mobile';

export interface TimerShellValue {
  readonly activeTab: Tab;
  readonly variant: TimerVariant;
  readonly classroomOpen: boolean;
  closeClassroom(): void;
  reportStatus(tab: Tab, status: TimerModeStatus): void;
}

export const TimerShellContext = createContext<TimerShellValue | null>(null);

/** 틀 밖(시험 등)에서 모드를 따로 그리면 늘 보이는 탭·데스크톱으로 본다. */
export function useTimerShell(): TimerShellValue | null {
  return useContext(TimerShellContext);
}

export function useIsActiveTimerTab(tab: Tab): boolean {
  const shell = useTimerShell();
  return shell === null || shell.activeTab === tab;
}

export function useTimerVariant(): TimerVariant {
  return useTimerShell()?.variant ?? 'desktop';
}

/** 이 모드가 보이는 탭이고 교실 화면이 켜져 있는가. */
export function useIsClassroomOpen(tab: Tab): boolean {
  const shell = useTimerShell();
  return shell !== null && shell.activeTab === tab && shell.classroomOpen;
}

/** 보이는 탭일 때만 단축키를 받는다. */
export function useTimerModeKeydown(
  tab: Tab,
  handler: (e: KeyboardEvent) => void,
  deps: DependencyList,
): void {
  const active = useIsActiveTimerTab(tab);
  useToolKeydown(
    (e) => {
      if (!active) return;
      handler(e);
    },
    [...deps, active],
  );
}

function sameStatus(a: TimerModeStatus, b: TimerModeStatus): boolean {
  if (
    a.busy !== b.busy ||
    a.awaitingConfirm !== b.awaitingConfirm ||
    a.running !== b.running ||
    (a.classroomReady ?? true) !== (b.classroomReady ?? true)
  ) {
    return false;
  }
  if (a.badge === null || b.badge === null) return a.badge === b.badge;
  if (a.badge.kind === 'finished' || b.badge.kind === 'finished')
    return a.badge.kind === b.badge.kind;
  return a.badge.kind === b.badge.kind && a.badge.seconds === b.badge.seconds;
}

/** 모드가 자기 상태를 틀에 알린다. 바뀌었을 때만 보낸다. 사라질 때는 '대기'로 되돌린다. */
export function useReportTimerStatus(tab: Tab, status: TimerModeStatus): void {
  // 틀의 값(보이는 탭 등)이 바뀔 때마다 '대기'로 되돌렸다 다시 보내지 않도록, 늘 같은 함수만 잡는다.
  const report = useTimerShell()?.reportStatus ?? null;
  const lastRef = useRef<TimerModeStatus | null>(null);
  useEffect(() => {
    if (report === null) return;
    if (lastRef.current !== null && sameStatus(lastRef.current, status)) return;
    lastRef.current = status;
    report(tab, status);
  });
  useEffect(() => {
    if (report === null) return;
    return () => {
      lastRef.current = null;
      report(tab, IDLE_STATUS);
    };
  }, [report, tab]);
}
