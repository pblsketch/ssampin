import { useCallback, useRef, useState } from 'react';
import type { AlarmSoundId, PreWarningSettings, Settings } from '@domain/entities/Settings';
import { PRESENTATION_PRE_WARNING_TIMES } from '@domain/rules/timerSettings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { AlarmSoundSelector } from './AlarmSoundSelector';
import {
  ALARM_PRESETS,
  PRE_WARNING_PRESETS,
  PRE_WARNING_TIMES,
  playPreWarningSound,
} from './timerAudio';
import { TimerSegmented, TimerSwitch } from './TimerControls';
import { useCustomAlarmAudioStore } from './useTimerAlarm';
import { useTimerToolSettings } from './useTimerToolSettings';

/**
 * 알람음·예고 알림 설정(타이머·단계·발표 공통, ADR-139).
 *
 * - `preWarning='timer'`: 타이머·단계 타이머가 함께 쓰는 예고 알림(`alarmSound.preWarning`).
 * - `preWarning='presentation'`: 발표 타이머 전용 예고 알림(`timerTool.presentationPreWarning`).
 *   알림음은 타이머 탭 예고 알림음을 함께 쓴다(spec 4-3).
 * - 표시 방식(원/부채꼴)·알람 반복은 데스크톱에서만 보인다(모바일은 timerTool 을 쓰지 않는다).
 * - 🔊 가 꺼져 있으면 "소리 꺼짐 — 알람이 울리지 않아요"를 늘 보인다(spec 5-1).
 */

const MAX_AUDIO_SIZE = 5 * 1024 * 1024;

function secondsLabel(sec: number): string {
  return sec < 60 ? `${sec}초` : `${sec / 60}분`;
}

export function MuteNotice(): JSX.Element | null {
  const muted = useSoundStore((s) => !s.settings.enabled);
  if (!muted) return null;
  return (
    // visible — 타이머가 도는 동안 설정 줄은 자리만 남기고 숨기지만(invisible), 이 안내는 계속 보여야 한다(spec 5-1).
    <span className="visible flex items-center gap-1 text-xs text-sp-error" role="status">
      <span className="material-symbols-outlined text-icon-sm">volume_off</span>
      소리 꺼짐 — 알람이 울리지 않아요
    </span>
  );
}

export function TimerSoundSettings({
  preWarning: preWarningKind,
  showRepeat,
}: {
  readonly preWarning: 'timer' | 'presentation';
  /** 알람 반복 선택을 보일지(발표 타이머는 늘 한 번이라 숨긴다). */
  readonly showRepeat: boolean;
}): JSX.Element {
  const [open, setOpen] = useState<'sound' | 'prewarning' | null>(null);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const showToast = useToastStore((s) => s.show);
  const { timerTool, editable, update: updateTimerTool } = useTimerToolSettings();
  const customDataUrl = useCustomAlarmAudioStore((s) => s.dataUrl);
  const saveCustom = useCustomAlarmAudioStore((s) => s.save);
  const clearCustom = useCustomAlarmAudioStore((s) => s.clear);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selectedSound, customAudioName, volume, boost, preWarning } = settings.alarmSound;

  const setAlarm = useCallback(
    (patch: Partial<Settings['alarmSound']>) =>
      updateSettings({
        alarmSound: { ...useSettingsStore.getState().settings.alarmSound, ...patch },
      }),
    [updateSettings],
  );

  const handleImportCustom = useCallback(async () => {
    const api = window.electronAPI;
    if (api) {
      const result = await api.importAlarmAudio();
      if (result === null) return;
      if ('tooLarge' in result) {
        showToast('파일 크기가 너무 큽니다. 5MB 이하의 파일을 사용해주세요.', 'error');
        return;
      }
      await saveCustom(result.name, result.dataUrl);
      await setAlarm({ selectedSound: 'custom', customAudioName: result.name });
    } else {
      fileInputRef.current?.click();
    }
  }, [saveCustom, setAlarm, showToast]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > MAX_AUDIO_SIZE) {
        showToast('파일 크기가 너무 큽니다. 5MB 이하의 파일을 사용해주세요.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        void saveCustom(file.name, dataUrl).then(() =>
          setAlarm({ selectedSound: 'custom', customAudioName: file.name }),
        );
      };
      reader.readAsDataURL(file);
    },
    [saveCustom, setAlarm, showToast],
  );

  const isPresentation = preWarningKind === 'presentation';
  const pw = isPresentation ? timerTool.presentationPreWarning : preWarning;
  const pwTimes: readonly number[] = isPresentation
    ? PRESENTATION_PRE_WARNING_TIMES
    : PRE_WARNING_TIMES;
  const pwLabel = pw.enabled ? `${secondsLabel(pw.secondsBefore)} 전` : '꺼짐';

  const setPreWarning = (patch: { enabled?: boolean; secondsBefore?: number }): void => {
    if (isPresentation) {
      const next = { ...timerTool.presentationPreWarning, ...patch };
      void updateTimerTool({
        presentationPreWarning: {
          enabled: next.enabled,
          secondsBefore: next.secondsBefore as 10 | 30 | 60,
        },
      });
    } else {
      void setAlarm({ preWarning: { ...preWarning, ...patch } as PreWarningSettings });
    }
  };

  const toggleBase =
    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors border';

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.m4a,.webm"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          aria-expanded={open === 'sound'}
          onClick={() => setOpen((v) => (v === 'sound' ? null : 'sound'))}
          className={`${toggleBase} ${
            open === 'sound'
              ? 'bg-sp-card border-sp-accent text-sp-accent'
              : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
          }`}
        >
          <span className="material-symbols-outlined text-icon-md">
            {volume === 0 ? 'volume_off' : 'volume_up'}
          </span>
          <span>
            알람음:{' '}
            {selectedSound === 'custom' && customAudioName
              ? customAudioName
              : (ALARM_PRESETS.find((p) => p.id === selectedSound)?.label ?? '기본 알림')}
          </span>
          <span className="material-symbols-outlined text-icon">
            {open === 'sound' ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        <button
          type="button"
          aria-expanded={open === 'prewarning'}
          onClick={() => setOpen((v) => (v === 'prewarning' ? null : 'prewarning'))}
          className={`${toggleBase} ${
            open === 'prewarning' || pw.enabled
              ? 'bg-sp-card border-sp-warning text-sp-text'
              : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
          }`}
        >
          <span
            className={`material-symbols-outlined text-icon-md ${pw.enabled ? 'text-sp-warning' : ''}`}
          >
            notifications_active
          </span>
          <span>
            {isPresentation ? '발표용 예고 알림' : '예고 알림'}: {pwLabel}
          </span>
          <span className="material-symbols-outlined text-icon">
            {open === 'prewarning' ? 'expand_less' : 'expand_more'}
          </span>
        </button>
        <MuteNotice />
      </div>

      {open === 'sound' && (
        <div className="w-full max-w-lg space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlarmSoundSelector
            selectedSound={selectedSound}
            customAudioName={customAudioName}
            customDataUrl={customDataUrl}
            volume={volume}
            boost={boost}
            onSelectSound={(id: AlarmSoundId) => void setAlarm({ selectedSound: id })}
            onImportCustom={() => void handleImportCustom()}
            onDeleteCustom={() =>
              void clearCustom().then(() =>
                setAlarm({ selectedSound: 'beep', customAudioName: null }),
              )
            }
            onVolumeChange={(v) => void setAlarm({ volume: v })}
            onBoostChange={(b) => void setAlarm({ boost: b })}
          />
          {editable && (
            <div className="space-y-3 pt-1 border-t border-sp-border">
              <div className="pt-3">
                <TimerSegmented
                  label="표시"
                  value={timerTool.displayStyle}
                  onChange={(displayStyle) => void updateTimerTool({ displayStyle })}
                  options={[
                    { id: 'ring', label: '원' },
                    { id: 'pie', label: '부채꼴' },
                  ]}
                />
              </div>
              {showRepeat && (
                <TimerSegmented
                  label="알람 반복"
                  value={timerTool.alarmRepeat}
                  onChange={(alarmRepeat) => void updateTimerTool({ alarmRepeat })}
                  options={[
                    { id: 'once', label: '한 번' },
                    { id: 'three', label: '3번' },
                    { id: 'untilConfirm', label: '확인할 때까지' },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}

      {open === 'prewarning' && (
        <div className="w-full max-w-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sp-warning text-icon-md">
                notifications_active
              </span>
              <span className="text-sm font-medium text-sp-text">
                {isPresentation ? '발표용 예고 알림' : '종료 전 예고 알림'}
              </span>
            </div>
            <TimerSwitch
              checked={pw.enabled}
              label={isPresentation ? '발표용 예고 알림 켜기' : '예고 알림 켜기'}
              onChange={(enabled) => setPreWarning({ enabled })}
            />
          </div>
          {pw.enabled ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-sp-muted mb-2">알림 시점</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-sp-muted">종료</span>
                  {pwTimes.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      aria-pressed={pw.secondsBefore === sec}
                      onClick={() => setPreWarning({ secondsBefore: sec })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        pw.secondsBefore === sec
                          ? 'bg-sp-card border-sp-warning text-sp-warning'
                          : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      {secondsLabel(sec)}
                    </button>
                  ))}
                  <span className="text-xs text-sp-muted">전</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-sp-muted mb-2">
                  알림음{isPresentation ? ' (타이머 탭과 같은 소리)' : ''}
                </p>
                <div className="flex gap-2">
                  {PRE_WARNING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={preWarning.sound === preset.id}
                      onClick={() => {
                        void setAlarm({ preWarning: { ...preWarning, sound: preset.id } });
                        playPreWarningSound(preset.id, volume, boost, { ignoreMute: true });
                      }}
                      className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors ${
                        preWarning.sound === preset.id
                          ? 'bg-sp-card border-sp-warning text-sp-warning'
                          : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      <span className="material-symbols-outlined text-icon-lg">{preset.icon}</span>
                      <span className="text-xs font-medium">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-sp-muted text-center py-2">
              켜면 {isPresentation ? '발표' : '타이머'}가 끝나기 전에 미리 알려 줘요
            </p>
          )}
        </div>
      )}
    </div>
  );
}
