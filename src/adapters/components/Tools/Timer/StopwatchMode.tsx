import { useState, useRef, useCallback, useEffect } from 'react';
import { formatTimeMs } from '@domain/rules/timerRules';
import type { StopwatchState, LapRecord } from './types';

export function StopwatchMode() {
  const [elapsed, setElapsed] = useState(0);
  const [state, setState] = useState<StopwatchState>('idle');
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const accumulatedRef = useRef(0);

  const clearSW = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setState('running');
    startTimeRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(accumulatedRef.current + (Date.now() - startTimeRef.current));
    }, 30);
  }, []);

  const pause = useCallback(() => {
    accumulatedRef.current += Date.now() - startTimeRef.current;
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

  const lap = useCallback(() => {
    const current = elapsed;
    const firstLap = laps[0];
    const prevTotal = firstLap !== undefined ? firstLap.elapsed : 0;
    const diff = current - prevTotal;
    setLaps((prev) => [
      { index: prev.length + 1, elapsed: current, diff },
      ...prev,
    ]);
  }, [elapsed, laps]);

  useEffect(() => {
    return clearSW;
  }, [clearSW]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (state === 'running') pause();
        else start();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        reset();
      } else if ((e.key === 'l' || e.key === 'L') && state === 'running') {
        e.preventDefault();
        lap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, start, pause, reset, lap]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      <div className="text-8xl font-mono font-bold text-sp-text select-none tabular-nums">
        {formatTimeMs(elapsed)}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          disabled={state === 'idle'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="리셋"
        >
          <span className="material-symbols-outlined text-icon-xl">restart_alt</span>
        </button>

        {state === 'running' ? (
          <button
            onClick={pause}
            className="w-20 h-20 rounded-full bg-sp-highlight text-white flex items-center justify-center hover:bg-sp-highlight/80 transition-colors shadow-lg shadow-sp-highlight/20"
            title="일시정지"
          >
            <span className="material-symbols-outlined text-4xl">pause</span>
          </button>
        ) : (
          <button
            onClick={start}
            className="w-20 h-20 rounded-full bg-sp-accent text-white flex items-center justify-center hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20"
            title="시작"
          >
            <span className="material-symbols-outlined text-4xl">play_arrow</span>
          </button>
        )}

        <button
          onClick={lap}
          disabled={state !== 'running'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="랩"
        >
          <span className="material-symbols-outlined text-icon-xl">flag</span>
        </button>
      </div>

      {laps.length > 0 && (
        <div className="w-full max-h-48 overflow-y-auto rounded-xl bg-sp-card border border-sp-border">
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
                <tr
                  key={l.index}
                  className="border-b border-sp-border/50 last:border-0"
                >
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
    </div>
  );
}
