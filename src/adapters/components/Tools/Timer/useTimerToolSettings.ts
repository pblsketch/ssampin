import { useCallback, useMemo } from 'react';
import type { TimerToolSettings } from '@domain/entities/Settings';
import {
  DEFAULT_TIMER_TOOL_SETTINGS,
  normalizeTimerToolSettings,
} from '@domain/rules/timerSettings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTimerVariant } from './timerShellContext';

/**
 * 쌤도구 타이머 설정(동기화되는 `timerTool`)을 읽고 쓴다(ADR-139, spec 6-1).
 *
 * 모바일은 PC 설정 저장소를 불러오지 않으므로 `timerTool` 을 쓰지 않는다(spec 1-1).
 * 모바일에서는 늘 기본값이고, 고치는 함수는 아무 일도 하지 않는다.
 */
export function useTimerToolSettings(): {
  readonly timerTool: TimerToolSettings;
  readonly editable: boolean;
  update(patch: Partial<TimerToolSettings>): Promise<void>;
} {
  const variant = useTimerVariant();
  const raw = useSettingsStore((s) => s.settings.timerTool);
  const updateSettings = useSettingsStore((s) => s.update);
  const timerTool = useMemo(
    () => (variant === 'mobile' ? DEFAULT_TIMER_TOOL_SETTINGS : normalizeTimerToolSettings(raw)),
    [raw, variant],
  );
  const update = useCallback(
    async (patch: Partial<TimerToolSettings>) => {
      if (variant === 'mobile') return;
      // 최신 저장값에서 합친다 — 다른 창이 막 바꾼 칸을 덮지 않게.
      const latest = normalizeTimerToolSettings(useSettingsStore.getState().settings.timerTool);
      await updateSettings({ timerTool: { ...latest, ...patch } });
    },
    [updateSettings, variant],
  );
  return { timerTool, editable: variant !== 'mobile', update };
}
