import { useState } from 'react';
import type { AlarmSoundId } from '@domain/entities/Settings';
import { ALARM_PRESETS, BOOST_OPTIONS, playAlarmSound } from './timerAudio';

export function AlarmSoundSelector({
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
                ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">{preset.icon}</span>
            <span className="text-xs font-medium">{preset.label}</span>
            <span className="text-caption opacity-60">{preset.description}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(preset.id);
              }}
              className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                previewPlaying === preset.id
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-text/10 text-sp-muted hover:text-sp-text hover:bg-sp-text/20'
              }`}
              title="미리듣기"
            >
              <span className="material-symbols-outlined text-icon-sm">
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
              ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
              : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
          }`}
        >
          <span className="material-symbols-outlined text-[22px]">
            {customDataUrl ? 'audio_file' : 'upload_file'}
          </span>
          <span className="text-xs font-medium">
            {customDataUrl ? '내 파일' : '직접 등록'}
          </span>
          <span className="text-caption opacity-60 truncate max-w-full px-1">
            {customAudioName || '파일 선택'}
          </span>

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
                    : 'bg-sp-text/10 text-sp-muted hover:text-sp-text hover:bg-sp-text/20'
                }`}
                title="미리듣기"
              >
                <span className="material-symbols-outlined text-icon-sm">
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
                <span className="material-symbols-outlined text-icon-sm">close</span>
              </button>
            </>
          )}
        </button>
      </div>

      {/* 볼륨 슬라이더 */}
      <div className="flex items-center gap-3 px-1">
        <span className="material-symbols-outlined text-sp-muted text-icon-md">
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
        <span className="material-symbols-outlined text-sp-muted text-icon-md">graphic_eq</span>
        <div className="flex gap-1.5">
          {BOOST_OPTIONS.map((b) => (
            <button
              key={b}
              onClick={() => onBoostChange(b)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border ${
                boost === b
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                  : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/40'
              }`}
            >
              {b}x
            </button>
          ))}
        </div>
        {boost > 1 && (
          <span className="text-xs text-amber-400 flex items-center gap-1">
            <span className="material-symbols-outlined text-icon-sm">volume_up</span>
            {boost}배 증폭
          </span>
        )}
      </div>
    </div>
  );
}
