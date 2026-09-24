import { useState, useRef, useCallback, useEffect } from 'react';
import { formatTimeMs } from '@domain/rules/timerRules';
import { advanceStopwatch } from '@domain/rules/toolPopupSession';
import { useToolPopupInitial, useToolPopupSlot } from '../popup/toolPopupSession';
import { ClassroomOverlay } from './ClassroomOverlay';
import { computeDigitsOnlyFontSize } from './timerGeometry';
import {
  useIsClassroomOpen,
  useReportTimerStatus,
  useTimerModeKeydown,
  useTimerShell,
} from './timerShellContext';
import { useElementSize } from './useElementSize';
import type { StopwatchState, LapRecord } from './types';

/** "00:00.00" 글자 수 — 숫자 크기 계산용. */
const STOPWATCH_CHARS = 8;

/** 팝업으로 옮길 때 함께 가는 스톱워치 상태. */
export interface StopwatchSnapshot {
  readonly elapsedMs: number;
  readonly state: StopwatchState;
  readonly laps: readonly LapRecord[];
}

export function StopwatchMode() {
  const shell = useTimerShell();
  const popupInitial = useToolPopupInitial<StopwatchSnapshot>('timer-stopwatch');
  // 옮기는 사이에도 스톱워치는 흐른다 — 찍은 시각부터 지금까지를 더해 복원한다.
  const [restoredInitial] = useState(() =>
    popupInitial
      ? advanceStopwatch(
          {
            state: popupInitial.data.state,
            elapsedMs: popupInitial.data.elapsedMs,
            capturedAt: popupInitial.capturedAt,
          },
          Date.now(),
        )
      : null,
  );

  const [elapsed, setElapsed] = useState(() => restoredInitial?.elapsedMs ?? 0);
  const [state, setState] = useState<StopwatchState>(() => restoredInitial?.state ?? 'idle');
  const [laps, setLaps] = useState<LapRecord[]>(() => [...(popupInitial?.data.laps ?? [])]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(restoredInitial?.elapsedMs ?? 0);

  const clearSW = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearSW();
    setState('running');
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, 30);
  }, [clearSW]);

  const pause = useCallback(() => {
    accumulatedRef.current += Date.now() - startTimeRef.current;
    setElapsed(accumulatedRef.current);
    setState('paused');
    clearSW();
  }, [clearSW]);

  const reset = useCallback(() => {
    clearSW();
    setState('idle');
    setElapsed(0);
    setLaps([]);
    accumulatedRef.current = 0;
  }, [clearSW]);

  const toggle = useCallback(() => {
    if (state === 'running') pause();
    else start();
  }, [state, start, pause]);

  const lap = useCallback(() => {
    const current = elapsed;
    const firstLap = laps[0];
    const prevTotal = firstLap !== undefined ? firstLap.elapsed : 0;
    const diff = current - prevTotal;
    setLaps((prev) => [{ index: prev.length + 1, elapsed: current, diff }, ...prev]);
  }, [elapsed, laps]);

  // ── 쌤도구 팝업 이관 ────────────────────────────────────────────
  const captureForPopup = useCallback((): StopwatchSnapshot => {
    // ★먼저 멈춘다. 멈춘 시점까지의 경과를 담아야 두 창에서 각자 흐르지 않는다.
    const total =
      state === 'running' ? accumulatedRef.current + (Date.now() - startTimeRef.current) : elapsed;
    clearSW();
    return { elapsedMs: total, state, laps };
  }, [clearSW, elapsed, state, laps]);

  const resumeFromPopup = useCallback(
    (snapshot: StopwatchSnapshot, capturedAt: number) => {
      const restored = advanceStopwatch(
        { state: snapshot.state, elapsedMs: snapshot.elapsedMs, capturedAt },
        Date.now(),
      );
      clearSW();
      setLaps([...snapshot.laps]);
      setElapsed(restored.elapsedMs);
      setState(restored.state);
      accumulatedRef.current = restored.elapsedMs;
      if (restored.state === 'running') start();
    },
    [clearSW, start],
  );

  useToolPopupSlot<StopwatchSnapshot>('timer-stopwatch', {
    capture: captureForPopup,
    resume: resumeFromPopup,
  });

  // 넘겨받은 스톱워치가 돌고 있었으면 이 창에서 이어서 돌린다.
  useEffect(() => {
    if (restoredInitial?.state === 'running') start();
    // 마운트 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return clearSW;
  }, [clearSW]);

  // ── 틀에 알리기 — 도는 중, 또는 멈췄지만 잰 시간이 있으면 진행 중(spec 5-3) ──
  const elapsedSeconds = Math.floor(elapsed / 1000);
  const busy = state === 'running' || (state === 'paused' && elapsed > 0);
  useReportTimerStatus('stopwatch', {
    busy,
    awaitingConfirm: false,
    running: state === 'running',
    badge: busy ? { kind: 'elapsed', seconds: elapsedSeconds } : null,
  });

  useTimerModeKeydown(
    'stopwatch',
    (e) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        reset();
      } else if ((e.key === 'l' || e.key === 'L') && state === 'running') {
        e.preventDefault();
        lap();
      }
    },
    [state, toggle, reset, lap],
  );

  // 숫자는 빈 공간에 맞춰 크게(설계 13장 — 원은 없다).
  const { ref: stageRef, size: stageSize } = useElementSize({ width: 640, height: 240 });
  const digitFontSize = computeDigitsOnlyFontSize(stageSize, STOPWATCH_CHARS);
  const classroomOpen = useIsClassroomOpen('stopwatch');

  return (
    <div className="relative flex flex-col items-center w-full h-full min-h-0 gap-6 max-w-3xl mx-auto">
      <div ref={stageRef} className="flex-1 min-h-[140px] w-full flex items-center justify-center">
        <div
          className="font-mono font-bold text-sp-text select-none tabular-nums leading-none"
          style={{ fontSize: `${digitFontSize}px` }}
        >
          {formatTimeMs(elapsed)}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-4">
        <button
          type="button"
          onClick={reset}
          disabled={state === 'idle'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="리셋 (R)"
          aria-label="리셋"
        >
          <span className="material-symbols-outlined text-icon-xl">restart_alt</span>
        </button>

        <button
          type="button"
          onClick={toggle}
          className="w-20 h-20 rounded-full bg-sp-accent text-sp-accent-fg flex items-center justify-center hover:brightness-110 transition shadow-lg"
          title={state === 'running' ? '일시정지 (Space)' : '시작 (Space)'}
          aria-label={state === 'running' ? '일시정지' : '시작'}
        >
          <span className="material-symbols-outlined text-4xl">
            {state === 'running' ? 'pause' : 'play_arrow'}
          </span>
        </button>

        <button
          type="button"
          onClick={lap}
          disabled={state !== 'running'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent transition-colors flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="랩 (L)"
          aria-label="랩"
        >
          <span className="material-symbols-outlined text-icon-xl">flag</span>
        </button>
      </div>

      {laps.length > 0 && (
        <div className="shrink-0 w-full max-w-lg max-h-48 overflow-y-auto rounded-xl bg-sp-card border border-sp-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-sp-muted border-b border-sp-border">
                <th className="py-2 px-4 text-left font-medium">#</th>
                <th className="py-2 px-4 text-right font-medium">경과</th>
                <th className="py-2 px-4 text-right font-medium">구간</th>
              </tr>
            </thead>
            <tbody>
              {laps.map((l) => (
                <tr key={l.index} className="border-b border-sp-border last:border-0">
                  <td className="py-2 px-4 text-sp-muted">#{l.index}</td>
                  <td className="py-2 px-4 text-right font-mono text-sp-text">
                    {formatTimeMs(l.elapsed)}
                  </td>
                  <td className="py-2 px-4 text-right font-mono text-sp-accent">
                    +{formatTimeMs(l.diff)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {classroomOpen && shell !== null && (
        <ClassroomOverlay
          onExit={shell.closeClassroom}
          displayStyle="ring"
          renderStage={(_g, size) => (
            <div
              className="font-mono font-bold text-sp-text select-none tabular-nums leading-none"
              style={{ fontSize: `${computeDigitsOnlyFontSize(size, STOPWATCH_CHARS)}px` }}
            >
              {formatTimeMs(elapsed)}
            </div>
          )}
          pause={{ paused: state !== 'running', onToggle: toggle }}
        />
      )}
    </div>
  );
}
