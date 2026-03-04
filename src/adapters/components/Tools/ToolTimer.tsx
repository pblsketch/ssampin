import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import { formatTime, formatTimeMs } from '@domain/rules/timerRules';
import type { AlarmSoundId } from '@domain/entities/Settings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

interface ToolTimerProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type Tab = 'timer' | 'stopwatch';
type TimerState = 'idle' | 'running' | 'paused' | 'finished';
type StopwatchState = 'idle' | 'running' | 'paused';

interface LapRecord {
  index: number;
  elapsed: number;
  diff: number;
}

const PRESETS = [
  { label: '1분', seconds: 60 },
  { label: '3분', seconds: 180 },
  { label: '5분', seconds: 300 },
  { label: '10분', seconds: 600 },
  { label: '15분', seconds: 900 },
  { label: '30분', seconds: 1800 },
];

// ─── 알람음 프리셋 정보 ───────────────────────────────────
interface AlarmPreset {
  id: AlarmSoundId;
  label: string;
  icon: string;
  description: string;
}

const ALARM_PRESETS: AlarmPreset[] = [
  { id: 'beep', label: '기본 알림', icon: 'notifications', description: '삐삐삐' },
  { id: 'school-bell', label: '학교 종', icon: 'school', description: '댕동댕동' },
  { id: 'alarm-clock', label: '알람 시계', icon: 'alarm', description: '따르릉' },
  { id: 'gentle-chime', label: '부드러운 차임', icon: 'music_note', description: '도미솔도~' },
  { id: 'buzzer', label: '버저', icon: 'campaign', description: '부우우~' },
];

// ─── Web Audio 합성 함수들 ─────────────────────────────────

function createCtx(): AudioContext {
  return new AudioContext();
}

/**
 * 볼륨 부스트를 적용한 GainNode 체인을 만든다.
 * boost > 1 이면 DynamicsCompressorNode를 추가하여 클리핑을 방지한다.
 */
function createBoostedGain(ctx: AudioContext, volume: number, boost: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.value = volume * boost;

  if (boost > 1) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.ratio.value = 4;
    compressor.knee.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    gain.connect(compressor);
    compressor.connect(ctx.destination);
  } else {
    gain.connect(ctx.destination);
  }

  return gain;
}

/** 기본 알림 — 880Hz 사각파 3연발 */
function playBeep(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume, boost);

    const playOne = (delay: number) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 880;
      osc.connect(gain);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    };
    playOne(0);
    playOne(0.4);
    playOne(0.8);

    setTimeout(() => ctx.close(), 1500);
  } catch { /* Audio not supported */ }
}

/** 학교 종 — 댕동 2음 반복 (C5 523Hz, E5 659Hz sine) */
function playSchoolBell(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.7, boost);

    const notes = [523, 659, 523, 659];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, ctx.currentTime + i * 0.5);
      env.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.5 + 0.05);
      env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.5 + 0.45);

      osc.connect(env);
      env.connect(gain);
      osc.start(ctx.currentTime + i * 0.5);
      osc.stop(ctx.currentTime + i * 0.5 + 0.5);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch { /* Audio not supported */ }
}

/** 알람 시계 — 빠른 교차 비프 (1000Hz / 800Hz) */
function playAlarmClock(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.6, boost);

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 4; i++) {
        const t = round * 1.0 + i * 0.2;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = i % 2 === 0 ? 1000 : 800;
        osc.connect(gain);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.1);
      }
    }

    setTimeout(() => ctx.close(), 3000);
  } catch { /* Audio not supported */ }
}

/** 부드러운 차임 — 도미솔도 어센딩 스케일 (sine) */
function playGentleChime(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.5, boost);

    const notes = [523, 659, 784, 1047]; // C5-E5-G5-C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const env = ctx.createGain();
      env.gain.setValueAtTime(0, ctx.currentTime + i * 0.35);
      env.gain.linearRampToValueAtTime(1, ctx.currentTime + i * 0.35 + 0.05);
      env.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.35 + 0.6);

      osc.connect(env);
      env.connect(gain);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.7);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch { /* Audio not supported */ }
}

/** 버저 — 220Hz 톱니파 지속음 */
function playBuzzer(volume: number, boost: number): void {
  try {
    const ctx = createCtx();
    const gain = createBoostedGain(ctx, volume * 0.4, boost);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 220;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, ctx.currentTime);
    env.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.1);
    env.gain.setValueAtTime(1, ctx.currentTime + 1.2);
    env.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

    osc.connect(env);
    env.connect(gain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.5);

    setTimeout(() => ctx.close(), 2500);
  } catch { /* Audio not supported */ }
}

/** 커스텀 오디오 재생 */
function playCustomAudio(dataUrl: string, volume: number, boost: number): void {
  try {
    const audio = new Audio(dataUrl);
    if (boost > 1) {
      // AudioContext 경유로 시스템 볼륨 한도(1.0)를 초과하여 증폭
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const gain = createBoostedGain(ctx, volume, boost);
      source.connect(gain);
      audio.play();
      audio.addEventListener('ended', () => ctx.close());
    } else {
      audio.volume = volume;
      audio.play();
    }
  } catch { /* Audio not supported */ }
}

/** 사운드 ID로 알람 재생 */
function playAlarmSound(
  soundId: AlarmSoundId,
  volume: number,
  boost: number,
  customDataUrl: string | null,
): void {
  switch (soundId) {
    case 'beep': playBeep(volume, boost); break;
    case 'school-bell': playSchoolBell(volume, boost); break;
    case 'alarm-clock': playAlarmClock(volume, boost); break;
    case 'gentle-chime': playGentleChime(volume, boost); break;
    case 'buzzer': playBuzzer(volume, boost); break;
    case 'custom':
      if (customDataUrl) playCustomAudio(customDataUrl, volume, boost);
      else playBeep(volume, boost);
      break;
  }
}

// ─── 커스텀 오디오 저장/로드 유틸 ────────────────────────────

async function saveCustomAudio(name: string, dataUrl: string): Promise<void> {
  const json = JSON.stringify({ name, dataUrl });
  const api = window.electronAPI;
  if (api) {
    await api.writeData('custom-alarm', json);
  } else {
    localStorage.setItem('ssampin_custom-alarm', json);
  }
}

async function loadCustomAudio(): Promise<{ name: string; dataUrl: string } | null> {
  const api = window.electronAPI;
  let raw: string | null = null;
  if (api) {
    raw = await api.readData('custom-alarm');
  } else {
    raw = localStorage.getItem('ssampin_custom-alarm');
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { name: string; dataUrl: string };
  } catch {
    return null;
  }
}

async function deleteCustomAudio(): Promise<void> {
  const api = window.electronAPI;
  if (api) {
    await api.writeData('custom-alarm', '');
  } else {
    localStorage.removeItem('ssampin_custom-alarm');
  }
}

// ─── 원형 프로그레스 링 ──────────────────────────────────────

function CircleProgress({ ratio }: { ratio: number }) {
  const radius = 140;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - ratio);

  const color =
    ratio > 0.5 ? '#3b82f6' : ratio > 0.2 ? '#f59e0b' : '#ef4444';

  return (
    <svg
      className="absolute inset-0 -rotate-90"
      viewBox="0 0 300 300"
      fill="none"
    >
      <circle
        cx="150"
        cy="150"
        r={radius}
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-sp-border"
      />
      <circle
        cx="150"
        cy="150"
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        className="transition-all duration-300"
      />
    </svg>
  );
}

// ─── 직접 입력 모달 ─────────────────────────────────────────

function CustomTimeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (seconds: number) => void;
  onClose: () => void;
}) {
  const [min, setMin] = useState('5');
  const [sec, setSec] = useState('0');

  const handleConfirm = () => {
    const total = (parseInt(min, 10) || 0) * 60 + (parseInt(sec, 10) || 0);
    if (total > 0) onConfirm(total);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-sp-card border border-sp-border rounded-2xl p-6 w-80">
        <h3 className="text-lg font-bold text-white mb-4">시간 직접 입력</h3>
        <div className="flex items-center gap-3 justify-center mb-6">
          <div className="flex flex-col items-center gap-1">
            <input
              type="number"
              min={0}
              max={99}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="w-20 h-14 bg-sp-bg border border-sp-border rounded-lg text-center text-2xl font-mono text-white focus:border-sp-accent focus:outline-none"
            />
            <span className="text-xs text-sp-muted">분</span>
          </div>
          <span className="text-2xl font-bold text-sp-muted mt-[-20px]">:</span>
          <div className="flex flex-col items-center gap-1">
            <input
              type="number"
              min={0}
              max={59}
              value={sec}
              onChange={(e) => setSec(e.target.value)}
              className="w-20 h-14 bg-sp-bg border border-sp-border rounded-lg text-center text-2xl font-mono text-white focus:border-sp-accent focus:outline-none"
            />
            <span className="text-xs text-sp-muted">초</span>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-lg bg-sp-accent text-white font-medium hover:bg-sp-accent/80 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 알람음 설정 패널 ───────────────────────────────────────

const BOOST_OPTIONS = [1, 2, 3, 4] as const;

function AlarmSoundSelector({
  selectedSound,
  customAudioName,
  customDataUrl,
  volume,
  boost,
  onSelectSound,
  onImportCustom,
  onDeleteCustom,
  onVolumeChange,
  onBoostChange,
}: {
  selectedSound: AlarmSoundId;
  customAudioName: string | null;
  customDataUrl: string | null;
  volume: number;
  boost: number;
  onSelectSound: (id: AlarmSoundId) => void;
  onImportCustom: () => void;
  onDeleteCustom: () => void;
  onVolumeChange: (v: number) => void;
  onBoostChange: (b: number) => void;
}) {
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);

  const handlePreview = (id: AlarmSoundId) => {
    setPreviewPlaying(id);
    playAlarmSound(id, volume, boost, customDataUrl);
    setTimeout(() => setPreviewPlaying(null), 2000);
  };

  return (
    <div className="w-full space-y-4">
      {/* 프리셋 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        {ALARM_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelectSound(preset.id)}
            className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
              selectedSound === preset.id
                ? 'bg-sp-accent/15 border-sp-accent text-white'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">{preset.icon}</span>
            <span className="text-xs font-medium">{preset.label}</span>
            <span className="text-[10px] opacity-60">{preset.description}</span>
            {/* 미리듣기 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(preset.id);
              }}
              className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                previewPlaying === preset.id
                  ? 'bg-sp-accent text-white'
                  : 'bg-white/10 text-sp-muted hover:text-white hover:bg-white/20'
              }`}
              title="미리듣기"
            >
              <span className="material-symbols-outlined text-[14px]">
                {previewPlaying === preset.id ? 'volume_up' : 'play_arrow'}
              </span>
            </button>
          </button>
        ))}

        {/* 직접 등록 카드 */}
        <button
          onClick={() => {
            if (customDataUrl) {
              onSelectSound('custom');
            } else {
              onImportCustom();
            }
          }}
          className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
            selectedSound === 'custom'
              ? 'bg-sp-accent/15 border-sp-accent text-white'
              : 'bg-sp-card border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/40'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">
            {customDataUrl ? 'audio_file' : 'upload_file'}
          </span>
          <span className="text-xs font-medium">
            {customDataUrl ? '내 파일' : '직접 등록'}
          </span>
          <span className="text-[10px] opacity-60 truncate max-w-full px-1">
            {customAudioName || '파일 선택'}
          </span>

          {/* 커스텀: 미리듣기 & 삭제 */}
          {customDataUrl && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePreview('custom');
                }}
                className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  previewPlaying === 'custom'
                    ? 'bg-sp-accent text-white'
                    : 'bg-white/10 text-sp-muted hover:text-white hover:bg-white/20'
                }`}
                title="미리듣기"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {previewPlaying === 'custom' ? 'volume_up' : 'play_arrow'}
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteCustom();
                }}
                className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center bg-white/10 text-sp-muted hover:text-red-400 hover:bg-red-500/20 transition-all"
                title="삭제"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </>
          )}
        </button>
      </div>

      {/* 볼륨 슬라이더 */}
      <div className="flex items-center gap-3 px-1">
        <span className="material-symbols-outlined text-sp-muted text-[18px]">
          {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none bg-sp-border accent-sp-accent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sp-accent [&::-webkit-slider-thumb]:shadow-sm"
        />
        <span className="text-xs text-sp-muted w-8 text-right tabular-nums">
          {Math.round(volume * 100)}%
        </span>
      </div>

      {/* 볼륨 부스트 */}
      <div className="flex items-center gap-3 px-1">
        <span className="material-symbols-outlined text-sp-muted text-[18px]">graphic_eq</span>
        <div className="flex gap-1.5">
          {BOOST_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => onBoostChange(b)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                boost === b
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/40'
              }`}
            >
              {b}x
            </button>
          ))}
        </div>
        {boost > 1 && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">volume_up</span>
            {boost}배 증폭
          </span>
        )}
      </div>
    </div>
  );
}

// ─── 타이머 모드 ────────────────────────────────────────────

function TimerMode() {
  const [totalSeconds, setTotalSeconds] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [state, setState] = useState<TimerState>('idle');
  const [selectedPreset, setSelectedPreset] = useState(300);
  const [showCustom, setShowCustom] = useState(false);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [flashCount, setFlashCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 알람음 설정 (from store)
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const { selectedSound, customAudioName, volume, boost } = settings.alarmSound;

  // 커스텀 오디오 dataUrl (메모리)
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 마운트 시 커스텀 오디오 로드
  useEffect(() => {
    loadCustomAudio().then((data) => {
      if (data?.dataUrl) setCustomDataUrl(data.dataUrl);
    });
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (remaining <= 0) return;
    setState('running');
    setShowSoundPanel(false);
    const startTime = Date.now();
    const startRemaining = remaining;
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const next = startRemaining - elapsed;
      if (next <= 0) {
        setRemaining(0);
        setState('finished');
        clearTimer();
        playAlarmSound(selectedSound, volume, boost, customDataUrl);
        setFlashCount(6);
      } else {
        setRemaining(next);
      }
    }, 100);
  }, [remaining, clearTimer, selectedSound, volume, boost, customDataUrl]);

  const pause = useCallback(() => {
    setState('paused');
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setState('idle');
    setRemaining(totalSeconds);
    setFlashCount(0);
  }, [totalSeconds, clearTimer]);

  const selectPreset = useCallback((seconds: number) => {
    clearTimer();
    setState('idle');
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setSelectedPreset(seconds);
    setFlashCount(0);
  }, [clearTimer]);

  const handleCustomTime = useCallback((seconds: number) => {
    setShowCustom(false);
    clearTimer();
    setState('idle');
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setSelectedPreset(-1);
    setFlashCount(0);
  }, [clearTimer]);

  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  const handleSelectSound = useCallback(async (id: AlarmSoundId) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, selectedSound: id },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleVolumeChange = useCallback(async (v: number) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, volume: v },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleBoostChange = useCallback(async (b: number) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, boost: b },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleImportCustom = useCallback(async () => {
    const api = window.electronAPI;
    if (api) {
      // Electron — IPC 대화상자
      const result = await api.importAlarmAudio();
      if (result) {
        setCustomDataUrl(result.dataUrl);
        await saveCustomAudio(result.name, result.dataUrl);
        await updateSettings({
          alarmSound: {
            ...settings.alarmSound,
            selectedSound: 'custom',
            customAudioName: result.name,
          },
        });
      }
    } else {
      // 브라우저 — file input
      fileInputRef.current?.click();
    }
  }, [updateSettings, settings.alarmSound]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('5MB 이하의 파일만 등록할 수 있습니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCustomDataUrl(dataUrl);
      await saveCustomAudio(file.name, dataUrl);
      await updateSettings({
        alarmSound: {
          ...settings.alarmSound,
          selectedSound: 'custom',
          customAudioName: file.name,
        },
      });
    };
    reader.readAsDataURL(file);
    // reset input
    e.target.value = '';
  }, [updateSettings, settings.alarmSound]);

  const handleDeleteCustom = useCallback(async () => {
    setCustomDataUrl(null);
    await deleteCustomAudio();
    await updateSettings({
      alarmSound: {
        ...settings.alarmSound,
        selectedSound: 'beep',
        customAudioName: null,
      },
    });
  }, [updateSettings, settings.alarmSound]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  // 깜빡임 카운트다운
  useEffect(() => {
    if (flashCount > 0) {
      const t = setTimeout(() => setFlashCount((c) => c - 1), 300);
      return () => clearTimeout(t);
    }
  }, [flashCount]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (state === 'finished') return;
        if (state === 'running') pause();
        else start();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        reset();
      } else if (e.key === 'Enter' && state === 'finished') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, start, pause, reset, dismiss]);

  const ratio = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const isFlashing = flashCount > 0 && flashCount % 2 === 0;

  return (
    <div className="relative flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      {/* 숨겨진 file input (브라우저용) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* 종료 오버레이 — 타이머 영역 내부에 표시 */}
      {state === 'finished' && (
        <div
          className={`absolute inset-0 z-40 rounded-2xl flex flex-col items-center justify-center transition-colors duration-200 ${
            isFlashing ? 'bg-red-600/30' : 'bg-sp-bg/90'
          }`}
        >
          <p className="text-5xl md:text-7xl font-bold text-red-400 mb-8 animate-pulse">
            시간 종료!
          </p>
          <button
            onClick={dismiss}
            className="px-10 py-4 rounded-xl bg-sp-accent text-white text-xl font-bold hover:bg-sp-accent/80 transition-colors"
          >
            확인
          </button>
        </div>
      )}

      {/* 프리셋 */}
      <div className="flex flex-wrap justify-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.seconds}
            onClick={() => selectPreset(p.seconds)}
            disabled={state === 'running'}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedPreset === p.seconds
                ? 'bg-sp-accent text-white'
                : 'bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(true)}
          disabled={state === 'running'}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
            selectedPreset === -1
              ? 'bg-sp-accent text-white'
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          직접 입력
        </button>
      </div>

      {/* 프로그레스 링 + 시간 */}
      <div className="relative w-[300px] h-[300px] flex items-center justify-center">
        <CircleProgress ratio={ratio} />
        <span className="text-7xl md:text-8xl font-mono font-bold text-white z-10 select-none">
          {formatTime(remaining)}
        </span>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-6">
        <button
          onClick={reset}
          disabled={state === 'idle'}
          className="w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="리셋"
        >
          <span className="material-symbols-outlined text-[28px]">restart_alt</span>
        </button>
        {state === 'running' ? (
          <button
            onClick={pause}
            className="w-20 h-20 rounded-full bg-sp-highlight text-white flex items-center justify-center hover:bg-sp-highlight/80 transition-colors shadow-lg shadow-sp-highlight/20"
            title="일시정지"
          >
            <span className="material-symbols-outlined text-[36px]">pause</span>
          </button>
        ) : (
          <button
            onClick={start}
            disabled={remaining <= 0}
            className="w-20 h-20 rounded-full bg-sp-accent text-white flex items-center justify-center hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
            title="시작"
          >
            <span className="material-symbols-outlined text-[36px]">play_arrow</span>
          </button>
        )}
        <div className="w-16 h-16" />
      </div>

      {/* 알람음 토글 버튼 */}
      {state !== 'running' && (
        <button
          onClick={() => setShowSoundPanel((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
            showSoundPanel
              ? 'bg-sp-accent/15 text-sp-accent border border-sp-accent/30'
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:border-sp-accent/40'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {volume === 0 ? 'volume_off' : 'volume_up'}
          </span>
          <span>
            알람음: {selectedSound === 'custom' && customAudioName
              ? customAudioName
              : ALARM_PRESETS.find((p) => p.id === selectedSound)?.label ?? '기본 알림'}
          </span>
          <span className="material-symbols-outlined text-[16px]">
            {showSoundPanel ? 'expand_less' : 'expand_more'}
          </span>
        </button>
      )}

      {/* 알람음 설정 패널 (접힘/펼침) */}
      {showSoundPanel && state !== 'running' && (
        <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <AlarmSoundSelector
            selectedSound={selectedSound}
            customAudioName={customAudioName}
            customDataUrl={customDataUrl}
            volume={volume}
            boost={boost}
            onSelectSound={handleSelectSound}
            onImportCustom={handleImportCustom}
            onDeleteCustom={handleDeleteCustom}
            onVolumeChange={handleVolumeChange}
            onBoostChange={handleBoostChange}
          />
        </div>
      )}

      {showCustom && (
        <CustomTimeModal
          onConfirm={handleCustomTime}
          onClose={() => setShowCustom(false)}
        />
      )}
    </div>
  );
}

// ─── 스톱워치 모드 ──────────────────────────────────────────

function StopwatchMode() {
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

  // Keyboard shortcuts
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
      {/* 경과 시간 */}
      <div className="text-8xl font-mono font-bold text-white select-none tabular-nums">
        {formatTimeMs(elapsed)}
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-4">
        <button
          onClick={reset}
          disabled={state === 'idle'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="리셋"
        >
          <span className="material-symbols-outlined text-[24px]">restart_alt</span>
        </button>

        {state === 'running' ? (
          <button
            onClick={pause}
            className="w-20 h-20 rounded-full bg-sp-highlight text-white flex items-center justify-center hover:bg-sp-highlight/80 transition-colors shadow-lg shadow-sp-highlight/20"
            title="일시정지"
          >
            <span className="material-symbols-outlined text-[36px]">pause</span>
          </button>
        ) : (
          <button
            onClick={start}
            className="w-20 h-20 rounded-full bg-sp-accent text-white flex items-center justify-center hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20"
            title="시작"
          >
            <span className="material-symbols-outlined text-[36px]">play_arrow</span>
          </button>
        )}

        <button
          onClick={lap}
          disabled={state !== 'running'}
          className="w-14 h-14 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
          title="랩"
        >
          <span className="material-symbols-outlined text-[24px]">flag</span>
        </button>
      </div>

      {/* 랩 타임 리스트 */}
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
                  <td className="py-2 px-4 text-right font-mono text-white">
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

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export function ToolTimer({ onBack, isFullscreen }: ToolTimerProps) {
  const [tab, setTab] = useState<Tab>('timer');

  const displayShortcuts = useMemo<KeyboardShortcut[]>(() => {
    if (tab === 'timer') {
      return [
        { key: ' ', label: '시작/일시정지', description: '타이머 토글', handler: () => {} },
        { key: 'r', label: '리셋', description: '타이머 리셋', handler: () => {} },
        { key: 'Enter', label: '확인', description: '종료 확인', handler: () => {} },
      ];
    }
    return [
      { key: ' ', label: '시작/일시정지', description: '스톱워치 토글', handler: () => {} },
      { key: 'r', label: '리셋', description: '스톱워치 리셋', handler: () => {} },
      { key: 'l', label: '랩', description: '랩 기록', handler: () => {} },
    ];
  }, [tab]);

  return (
    <ToolLayout title="타이머" emoji="⏱️" onBack={onBack} isFullscreen={isFullscreen} shortcuts={displayShortcuts}>
      <div className="flex flex-col items-center w-full max-w-xl mx-auto gap-8">
        {/* 탭 */}
        <div className="flex bg-sp-card rounded-xl p-1 border border-sp-border">
          <button
            onClick={() => setTab('timer')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'timer'
                ? 'bg-sp-accent text-white shadow-sm'
                : 'text-sp-muted hover:text-white'
            }`}
          >
            ⏱️ 타이머
          </button>
          <button
            onClick={() => setTab('stopwatch')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === 'stopwatch'
                ? 'bg-sp-accent text-white shadow-sm'
                : 'text-sp-muted hover:text-white'
            }`}
          >
            ⏱️ 스톱워치
          </button>
        </div>

        {/* 탭 콘텐츠 */}
        {tab === 'timer' ? <TimerMode /> : <StopwatchMode />}
      </div>
    </ToolLayout>
  );
}
