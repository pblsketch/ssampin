import { useState, useRef, useCallback, useEffect } from 'react';
import { formatTime, shouldTriggerPreWarning } from '@domain/rules/timerRules';
import type { AlarmSoundId, PreWarningSettings } from '@domain/entities/Settings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';
import type { TimerState } from './types';
import { PRESETS } from './types';
import { CircleProgress } from './CircleProgress';
import { CustomTimeModal } from './CustomTimeModal';
import { AlarmSoundSelector } from './AlarmSoundSelector';
import {
  ALARM_PRESETS,
  PRE_WARNING_PRESETS,
  PRE_WARNING_TIMES,
  playAlarmSound,
  playPreWarningSound,
  saveCustomAudio,
  loadCustomAudio,
  deleteCustomAudio,
} from './timerAudio';

export function TimerMode() {
  const [totalSeconds, setTotalSeconds] = useState(300);
  const [remaining, setRemaining] = useState(300);
  const [state, setState] = useState<TimerState>('idle');
  const [selectedPreset, setSelectedPreset] = useState(300);
  const [showCustom, setShowCustom] = useState(false);
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [showPreWarningPanel, setShowPreWarningPanel] = useState(false);
  const [flashCount, setFlashCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ADJUST_AMOUNTS = [
    { label: '10초', seconds: 10 },
    { label: '30초', seconds: 30 },
    { label: '1분', seconds: 60 },
    { label: '5분', seconds: 300 },
  ] as const;

  const preWarningTriggeredRef = useRef(false);
  const [showPreWarningBanner, setShowPreWarningBanner] = useState(false);
  const preWarningBannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);
  const { selectedSound, customAudioName, volume, boost, preWarning } = settings.alarmSound;

  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const preWarningRef = useRef(preWarning);
  preWarningRef.current = preWarning;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const boostRef = useRef(boost);
  boostRef.current = boost;

  const start = useCallback(() => {
    if (remaining <= 0) return;
    setState('running');
    setShowSoundPanel(false);

    if (remaining <= preWarningRef.current.secondsBefore) {
      preWarningTriggeredRef.current = true;
    }

    let lastTick = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const delta = Math.floor((now - lastTick) / 1000);
      if (delta >= 1) {
        lastTick = now - ((now - lastTick) % 1000);
        setRemaining((prev) => {
          const next = prev - delta;

          const pw = preWarningRef.current;
          if (
            pw.enabled &&
            shouldTriggerPreWarning(next, pw.secondsBefore, preWarningTriggeredRef.current)
          ) {
            preWarningTriggeredRef.current = true;
            playPreWarningSound(pw.sound, volumeRef.current, boostRef.current);
            setShowPreWarningBanner(true);
            if (preWarningBannerTimeoutRef.current) {
              clearTimeout(preWarningBannerTimeoutRef.current);
            }
            preWarningBannerTimeoutRef.current = setTimeout(() => setShowPreWarningBanner(false), 5000);
          }

          if (next <= 0) {
            setState('finished');
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            playAlarmSound(selectedSound, volume, boost, customDataUrl);
            setFlashCount(6);
            setShowPreWarningBanner(false);
            return 0;
          }
          return next;
        });
      }
    }, 100);
  }, [remaining, selectedSound, volume, boost, customDataUrl]);

  const pause = useCallback(() => {
    setState('paused');
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setState('idle');
    setRemaining(totalSeconds);
    setFlashCount(0);
    preWarningTriggeredRef.current = false;
    setShowPreWarningBanner(false);
  }, [totalSeconds, clearTimer]);

  const selectPreset = useCallback((seconds: number) => {
    clearTimer();
    setState('idle');
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setSelectedPreset(seconds);
    setFlashCount(0);
    preWarningTriggeredRef.current = false;
    setShowPreWarningBanner(false);
  }, [clearTimer]);

  const handleCustomTime = useCallback((seconds: number) => {
    setShowCustom(false);
    clearTimer();
    setState('idle');
    setTotalSeconds(seconds);
    setRemaining(seconds);
    setSelectedPreset(-1);
    setFlashCount(0);
    preWarningTriggeredRef.current = false;
    setShowPreWarningBanner(false);
  }, [clearTimer]);

  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  const adjustTime = useCallback((delta: number) => {
    setRemaining((prev) => {
      const next = Math.max(1, Math.min(5999, prev + delta));
      if (next > preWarningRef.current.secondsBefore) {
        preWarningTriggeredRef.current = false;
        setShowPreWarningBanner(false);
      }
      return next;
    });
    setTotalSeconds((prev) => {
      const next = prev + delta;
      return Math.max(1, Math.min(5999, next));
    });
  }, []);

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

  const handlePreWarningChange = useCallback(async (pw: PreWarningSettings) => {
    await updateSettings({
      alarmSound: { ...settings.alarmSound, preWarning: pw },
    });
  }, [updateSettings, settings.alarmSound]);

  const handleImportCustom = useCallback(async () => {
    const api = window.electronAPI;
    if (api) {
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
      fileInputRef.current?.click();
    }
  }, [updateSettings, settings.alarmSound]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_AUDIO_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_AUDIO_SIZE) {
      showToast('파일 크기가 너무 큽니다. 5MB 이하의 파일을 사용해주세요.', 'error');
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
    e.target.value = '';
  }, [updateSettings, settings.alarmSound, showToast]);

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
    return () => {
      clearTimer();
      if (preWarningBannerTimeoutRef.current) {
        clearTimeout(preWarningBannerTimeoutRef.current);
      }
    };
  }, [clearTimer]);

  useEffect(() => {
    if (flashCount > 0) {
      const t = setTimeout(() => setFlashCount((c) => c - 1), 300);
      return () => clearTimeout(t);
    }
  }, [flashCount]);

  useToolKeydown((e) => {
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
    } else if (e.key === 'ArrowUp' && (state === 'running' || state === 'paused')) {
      e.preventDefault();
      adjustTime(30);
    } else if (e.key === 'ArrowDown' && (state === 'running' || state === 'paused')) {
      e.preventDefault();
      adjustTime(-30);
    }
  }, [state, start, pause, reset, dismiss, adjustTime]);

  const ratio = totalSeconds > 0 ? remaining / totalSeconds : 0;
  const isFlashing = flashCount > 0 && flashCount % 2 === 0;

  return (
    <div className="relative flex flex-col items-center gap-6 w-full max-w-lg mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,.webm"
        className="hidden"
        onChange={handleFileInputChange}
      />

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
                : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
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
              : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          직접 입력
        </button>
      </div>

      {/* 시간 조정 + 프로그레스 링 영역 */}
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-2">
          {ADJUST_AMOUNTS.map((adj) => (
            <button
              key={`minus-${adj.seconds}`}
              onClick={() => adjustTime(-adj.seconds)}
              disabled={state === 'idle' || state === 'finished' || remaining <= adj.seconds}
              className="group flex items-center gap-1 px-3 py-1.5 rounded-lg
                bg-sp-card border border-sp-border text-sp-muted
                hover:text-red-400 hover:border-red-400/40 hover:bg-red-400/5
                disabled:opacity-20 disabled:cursor-not-allowed
                transition-all text-xs font-medium"
              title={`${adj.label} 빼기`}
            >
              <span className="material-symbols-outlined text-icon-sm group-hover:text-red-400">remove</span>
              {adj.label}
            </button>
          ))}
        </div>

        <div className="relative w-[300px] h-[300px] flex items-center justify-center">
          {showPreWarningBanner && state === 'running' && (
            <div className="absolute -top-2 left-0 right-0 z-30 flex justify-center animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500 shadow-md">
                <span className="material-symbols-outlined text-white text-icon-lg">
                  notifications_active
                </span>
                <span className="text-sm font-bold text-white">
                  {remaining >= 60 ? `${Math.ceil(remaining / 60)}분` : `${remaining}초`} 남았어요! 마무리 준비~
                </span>
              </div>
            </div>
          )}
          <CircleProgress ratio={ratio} preWarningActive={showPreWarningBanner && state === 'running'} />
          <span className="text-7xl md:text-8xl font-mono font-bold text-sp-text z-10 select-none">
            {formatTime(remaining)}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {ADJUST_AMOUNTS.map((adj) => (
            <button
              key={`plus-${adj.seconds}`}
              onClick={() => adjustTime(adj.seconds)}
              disabled={state === 'idle' || state === 'finished' || remaining + adj.seconds > 5999}
              className="group flex items-center gap-1 px-3 py-1.5 rounded-lg
                bg-sp-card border border-sp-border text-sp-muted
                hover:text-emerald-400 hover:border-emerald-400/40 hover:bg-emerald-400/5
                disabled:opacity-20 disabled:cursor-not-allowed
                transition-all text-xs font-medium"
              title={`${adj.label} 추가`}
            >
              <span className="material-symbols-outlined text-icon-sm group-hover:text-emerald-400">add</span>
              {adj.label}
            </button>
          ))}
        </div>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-6">
        <button
          onClick={reset}
          disabled={state === 'idle'}
          className="w-16 h-16 rounded-full bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
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
            <span className="material-symbols-outlined text-4xl">pause</span>
          </button>
        ) : (
          <button
            onClick={start}
            disabled={remaining <= 0}
            className="w-20 h-20 rounded-full bg-sp-accent text-white flex items-center justify-center hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 disabled:opacity-30 disabled:cursor-not-allowed"
            title="시작"
          >
            <span className="material-symbols-outlined text-4xl">play_arrow</span>
          </button>
        )}
        <div className="w-16 h-16" />
      </div>

      {/* 알람음 / 예고 알림 토글 버튼 */}
      {state !== 'running' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSoundPanel((v) => !v); setShowPreWarningPanel(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              showSoundPanel
                ? 'bg-sp-accent/15 text-sp-accent border border-sp-accent/30'
                : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">
              {volume === 0 ? 'volume_off' : 'volume_up'}
            </span>
            <span>
              알람음: {selectedSound === 'custom' && customAudioName
                ? customAudioName
                : ALARM_PRESETS.find((p) => p.id === selectedSound)?.label ?? '기본 알림'}
            </span>
            <span className="material-symbols-outlined text-icon">
              {showSoundPanel ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          <button
            onClick={() => { setShowPreWarningPanel((v) => !v); setShowSoundPanel(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              showPreWarningPanel
                ? 'bg-amber-500 text-white border border-amber-500'
                : preWarning.enabled
                  ? 'bg-sp-card border border-amber-500/50 text-sp-text hover:border-amber-500'
                  : 'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-amber-500/40'
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">notifications_active</span>
            <span>예고 알림{preWarning.enabled ? `: ${preWarning.secondsBefore < 60 ? `${preWarning.secondsBefore}초` : `${preWarning.secondsBefore / 60}분`} 전` : ' (꺼짐)'}</span>
            <span className="material-symbols-outlined text-icon">
              {showPreWarningPanel ? 'expand_less' : 'expand_more'}
            </span>
          </button>
        </div>
      )}

      {/* 알람음 설정 패널 */}
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

      {/* 예고 알림 설정 패널 */}
      {showPreWarningPanel && state !== 'running' && (
        <div className="w-full animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-icon-md">
                notifications_active
              </span>
              <span className="text-sm font-medium text-sp-text">종료 전 예고 알림</span>
            </div>
            <button
              onClick={() => handlePreWarningChange({ ...preWarning, enabled: !preWarning.enabled })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                preWarning.enabled ? 'bg-amber-500' : 'bg-sp-border'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  preWarning.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {preWarning.enabled && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <p className="text-xs text-sp-muted mb-2">알림 시점</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-sp-muted">종료</span>
                  {PRE_WARNING_TIMES.map((sec) => (
                    <button
                      key={sec}
                      onClick={() => handlePreWarningChange({ ...preWarning, secondsBefore: sec })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        preWarning.secondsBefore === sec
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      {sec < 60 ? `${sec}초` : `${sec / 60}분`}
                    </button>
                  ))}
                  <span className="text-xs text-sp-muted">전</span>
                </div>
              </div>

              <div>
                <p className="text-xs text-sp-muted mb-2">알림음</p>
                <div className="flex gap-2">
                  {PRE_WARNING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        handlePreWarningChange({ ...preWarning, sound: preset.id });
                        playPreWarningSound(preset.id, volume, boost);
                      }}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        preWarning.sound === preset.id
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-amber-500/40'
                      }`}
                    >
                      <span className="material-symbols-outlined text-icon-lg">{preset.icon}</span>
                      <span className="text-xs font-medium">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!preWarning.enabled && (
            <p className="text-xs text-sp-muted text-center py-2">
              활성화하면 타이머 종료 전 미리 알림을 받을 수 있어요
            </p>
          )}
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
