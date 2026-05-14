import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getToolRandomnessOn, type ToolRandomnessKey } from '@adapters/stores/useSettingsStore';

interface Props {
  tool: ToolRandomnessKey;
  className?: string;
}

/**
 * 5개 쌤도구(랜덤뽑기·조정·룰렛·동전·주사위) 공용 "골고루 모드" 토글.
 * Settings.toolRandomness 에 저장 → settingsRepository 영속화 + Google Drive sync 무료.
 */
export function RandomnessToggle({ tool, className }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const isOn = getToolRandomnessOn(settings, tool);

  const handleToggle = () => {
    void update({
      toolRandomness: {
        ...(settings.toolRandomness ?? {}),
        [tool]: !isOn,
      },
    });
  };

  return (
    <label className={`flex items-center gap-2 text-xs text-sp-muted cursor-pointer select-none ${className ?? ''}`}>
      <span>골고루 모드</span>
      <button
        type="button"
        onClick={handleToggle}
        className={`relative w-8 h-4 rounded-full transition-colors ${
          isOn ? 'bg-sp-accent' : 'bg-sp-border'
        }`}
        aria-pressed={isOn}
        aria-label={`골고루 모드 ${isOn ? '켜짐' : '꺼짐'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            isOn ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <span
        className="text-sp-muted/60 cursor-help"
        title="최근에 나온 결과를 잠시 덜 뽑습니다. 확률 학습 용도라면 끄세요."
      >
        ⓘ
      </span>
    </label>
  );
}
