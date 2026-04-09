import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useToolSound } from '@adapters/hooks/useToolSound';

type LightColor = 'red' | 'yellow' | 'green' | null;
type Mode = 'manual' | 'auto';

interface ToolTrafficLightProps {
  onBack: () => void;
  isFullscreen: boolean;
}

const LIGHT_CONFIG = {
  red: {
    active: '#ef4444',
    glow: 'rgba(239,68,68,0.7)',
    label: '멈춤',
    statusText: '멈추세요! ✋',
    statusColor: '#ef4444',
    bgTint: 'rgba(239,68,68,0.08)',
  },
  yellow: {
    active: '#f59e0b',
    glow: 'rgba(245,158,11,0.7)',
    label: '준비',
    statusText: '준비하세요... 🙌',
    statusColor: '#f59e0b',
    bgTint: 'rgba(245,158,11,0.08)',
  },
  green: {
    active: '#22c55e',
    glow: 'rgba(34,197,94,0.7)',
    label: '시작',
    statusText: '시작! 🏃',
    statusColor: '#22c55e',
    bgTint: 'rgba(34,197,94,0.08)',
  },
} as const;

const DURATION_PRESETS = [
  { label: '1분', seconds: 60 },
  { label: '3분', seconds: 180 },
  { label: '5분', seconds: 300 },
  { label: '10분', seconds: 600 },
];

function playBeep(audioCtx: AudioContext): void {
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.6, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.5);

  // Second beep
  const osc2 = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(660, audioCtx.currentTime + 0.6);
  gain2.gain.setValueAtTime(0.6, audioCtx.currentTime + 0.6);
  gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.1);
  osc2.start(audioCtx.currentTime + 0.6);
  osc2.stop(audioCtx.currentTime + 1.1);

  // Third beep
  const osc3 = audioCtx.createOscillator();
  const gain3 = audioCtx.createGain();
  osc3.connect(gain3);
  gain3.connect(audioCtx.destination);
  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(880, audioCtx.currentTime + 1.2);
  gain3.gain.setValueAtTime(0.8, audioCtx.currentTime + 1.2);
  gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.8);
  osc3.start(audioCtx.currentTime + 1.2);
  osc3.stop(audioCtx.currentTime + 1.8);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ToolTrafficLight({ onBack, isFullscreen }: ToolTrafficLightProps) {
  const { track } = useAnalytics();
  const { playResult: playStateSound } = useToolSound('trafficLight');
  useEffect(() => {
    track('tool_use', { tool: 'traffic_light' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [mode, setMode] = useState<Mode>('manual');
  const [activeLight, setActiveLightRaw] = useState<LightColor>(null);

  const setActiveLight = useCallback((color: LightColor | ((prev: LightColor) => LightColor)) => {
    setActiveLightRaw(color);
    playStateSound();
  }, [playStateSound]);

  // Auto mode state
  const [selectedDuration, setSelectedDuration] = useState<number>(180);
  const [customDuration, setCustomDuration] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Keyboard shortcuts — delegated to ToolLayout via shortcuts prop
  const cycleLight = useCallback(() => {
    setActiveLight((prev) => {
      if (prev === null || prev === 'red') return 'yellow';
      if (prev === 'yellow') return 'green';
      return 'red';
    });
  }, []);

  const shortcuts = useMemo<KeyboardShortcut[]>(() => {
    if (mode !== 'manual') return [];
    return [
      { key: '1', label: '멈춤', description: '빨간불', handler: () => setActiveLight('red') },
      { key: '2', label: '준비', description: '노란불', handler: () => setActiveLight('yellow') },
      { key: '3', label: '시작', description: '초록불', handler: () => setActiveLight('green') },
      { key: ' ', label: '순환', description: '신호 순환', handler: cycleLight },
    ];
  }, [mode, cycleLight]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const getEffectiveDuration = useCallback((): number => {
    if (isCustom) {
      const parsed = parseInt(customDuration, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed * 60;
      return 60;
    }
    return selectedDuration;
  }, [isCustom, customDuration, selectedDuration]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const startTimer = useCallback(() => {
    const duration = getEffectiveDuration();
    setTimeLeft(duration);
    setActiveLight('green');
    setIsRunning(true);

    if (intervalRef.current) clearInterval(intervalRef.current);

    let remaining = duration;

    intervalRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);

      if (remaining <= 10 && remaining > 0) {
        setActiveLight('yellow');
      }

      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setActiveLight('red');
        setIsRunning(false);
        setTimeLeft(0);

        // Play alarm
        try {
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
          }
          playBeep(audioCtxRef.current);
        } catch {
          // Audio not available
        }
      }
    }, 1000);
  }, [getEffectiveDuration]);

  const resetTimer = useCallback(() => {
    stopTimer();
    setActiveLight(null);
    setTimeLeft(0);
  }, [stopTimer]);

  const switchMode = useCallback((newMode: Mode) => {
    stopTimer();
    setActiveLight(null);
    setTimeLeft(0);
    setMode(newMode);
  }, [stopTimer]);

  // Computed styles
  const bgTint = activeLight && isFullscreen ? LIGHT_CONFIG[activeLight].bgTint : 'transparent';

  const getLightStyle = (color: 'red' | 'yellow' | 'green'): React.CSSProperties => {
    const isActive = activeLight === color;
    const cfg = LIGHT_CONFIG[color];
    return {
      backgroundColor: isActive ? cfg.active : '#1e293b',
      boxShadow: isActive ? `0 0 40px ${cfg.glow}, 0 0 80px ${cfg.glow}` : 'none',
      opacity: isActive ? 1 : 0.2,
      transition: 'all 0.3s ease',
    };
  };

  const circleBase = 'rounded-full cursor-pointer';

  const circleSizeStyle = isFullscreen
    ? { width: 'min(15vh, 11rem)', height: 'min(15vh, 11rem)' }
    : { width: 'min(13vh, 8rem)', height: 'min(13vh, 8rem)' };

  const statusTextSize = isFullscreen ? 'text-5xl md:text-6xl' : 'text-2xl';
  const frameScale = isFullscreen ? 'scale-110' : 'scale-100';

  return (
    <ToolLayout title="신호등" emoji="🚦" onBack={onBack} isFullscreen={isFullscreen} shortcuts={shortcuts}>
      <div
        className={`w-full h-full flex flex-col items-center justify-center transition-colors duration-500 ${isFullscreen ? 'gap-6' : 'gap-3'}`}
        style={{ backgroundColor: bgTint }}
      >
        {/* Mode Tabs */}
        <div className={`flex gap-2 bg-sp-card border border-sp-border rounded-xl p-1 ${isFullscreen ? 'mb-4' : ''}`}>
          <button
            onClick={() => switchMode('manual')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'manual'
                ? 'bg-sp-accent text-white shadow'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            🖱️ 수동
          </button>
          <button
            onClick={() => switchMode('auto')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === 'auto'
                ? 'bg-sp-accent text-white shadow'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            ⏱️ 자동
          </button>
        </div>

        {/* Traffic Light Frame */}
        <div
          className={`flex flex-col items-center ${isFullscreen ? 'gap-4' : 'gap-4'} bg-sp-card border border-sp-border rounded-3xl ${isFullscreen ? 'px-8 py-6' : 'px-8 py-6'} transition-transform duration-300 ${frameScale}`}
        >
          {/* Red */}
          <div
            className={`${circleBase}`}
            style={{ ...getLightStyle('red'), ...circleSizeStyle }}
            onClick={() => mode === 'manual' && setActiveLight('red')}
          />
          {/* Yellow */}
          <div
            className={`${circleBase}`}
            style={{ ...getLightStyle('yellow'), ...circleSizeStyle }}
            onClick={() => mode === 'manual' && setActiveLight('yellow')}
          />
          {/* Green */}
          <div
            className={`${circleBase}`}
            style={{ ...getLightStyle('green'), ...circleSizeStyle }}
            onClick={() => mode === 'manual' && setActiveLight('green')}
          />

          {/* Countdown inside frame (auto mode) */}
          {mode === 'auto' && (isRunning || timeLeft > 0) && (
            <div
              className="text-4xl font-mono font-bold tabular-nums"
              style={{ color: activeLight ? LIGHT_CONFIG[activeLight].active : '#e2e8f0' }}
            >
              {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Status Text */}
        <div className={`${isFullscreen ? 'h-12' : 'h-8'} flex items-center justify-center`}>
          {activeLight && (
            <span
              className={`font-bold ${statusTextSize} transition-all duration-300`}
              style={{ color: LIGHT_CONFIG[activeLight].statusColor }}
            >
              {LIGHT_CONFIG[activeLight].statusText}
            </span>
          )}
        </div>

        {/* Manual Mode Controls */}
        {mode === 'manual' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => setActiveLight('red')}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all border ${
                  activeLight === 'red'
                    ? 'bg-red-500 border-red-400 text-white shadow-lg'
                    : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-red-500'
                }`}
              >
                🔴 멈춤
              </button>
              <button
                onClick={() => setActiveLight('yellow')}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all border ${
                  activeLight === 'yellow'
                    ? 'bg-amber-500 border-amber-400 text-white shadow-lg'
                    : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-amber-500'
                }`}
              >
                🟡 준비
              </button>
              <button
                onClick={() => setActiveLight('green')}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all border ${
                  activeLight === 'green'
                    ? 'bg-green-500 border-green-400 text-white shadow-lg'
                    : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-green-500'
                }`}
              >
                🟢 시작
              </button>
            </div>
            <p className="text-xs text-sp-muted">
              키보드 단축키는 우측 상단 <kbd className="px-1 py-0.5 rounded bg-sp-card border border-sp-border font-mono text-caption">⌨</kbd> 버튼을 참고하세요
            </p>
          </div>
        )}

        {/* Auto Mode Controls */}
        {mode === 'auto' && (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            {/* Duration Presets */}
            <div className="flex flex-wrap justify-center gap-2">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.seconds}
                  onClick={() => {
                    setSelectedDuration(preset.seconds);
                    setIsCustom(false);
                  }}
                  disabled={isRunning}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                    !isCustom && selectedDuration === preset.seconds
                      ? 'bg-sp-accent border-blue-400 text-white'
                      : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setIsCustom(true)}
                disabled={isRunning}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                  isCustom
                    ? 'bg-sp-accent border-blue-400 text-white'
                    : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
                }`}
              >
                직접 입력
              </button>
            </div>

            {/* Custom Duration Input */}
            {isCustom && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="분"
                  disabled={isRunning}
                  className="w-20 px-3 py-2 rounded-lg bg-sp-card border border-sp-border text-sp-text text-center text-sm focus:outline-none focus:border-sp-accent disabled:opacity-40"
                />
                <span className="text-sp-muted text-sm">분</span>
              </div>
            )}

            {/* Start / Restart Buttons */}
            <div className="flex gap-3">
              {!isRunning && timeLeft === 0 && (
                <button
                  onClick={startTimer}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-all shadow"
                >
                  ▶ 시작
                </button>
              )}
              {(isRunning || timeLeft > 0) && (
                <button
                  onClick={resetTimer}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-sp-card border border-sp-border hover:border-sp-accent text-sp-muted hover:text-sp-text font-medium text-sm transition-all"
                >
                  ⟲ 다시 시작
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
