/*
  쌤도구 타이머 설정(`timerTool`)이 불러오기에서 살아남는지 지킨다(ADR-139, spec 6-1).

  - 저장값에 timerTool 이 있으면 그대로 불러온다(읽는 쪽이 normalizeTimerToolSettings 로 바로잡는다).
  - 없으면 기본값이다.
  - 모르는 칸(다음 버전이 더할 칸)도 지우지 않는다 — 옛 버전·새 버전 PC 가 같은 settings 를
    번갈아 쓰기 때문이다.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSettings = vi.fn();
vi.mock('@adapters/di/container', () => ({
  settingsRepository: {
    getSettings: () => getSettings(),
    saveSettings: vi.fn(() => Promise.resolve()),
  },
}));

const { useSettingsStore } = await import('./useSettingsStore');
const { normalizeTimerToolSettings, DEFAULT_TIMER_TOOL_SETTINGS } =
  await import('@domain/rules/timerSettings');

beforeEach(() => {
  getSettings.mockReset();
  useSettingsStore.setState({ loaded: false });
});

describe('useSettingsStore.load — timerTool', () => {
  it('저장된 timerTool 을 그대로 불러온다', async () => {
    getSettings.mockResolvedValue({
      timerTool: { presets: [120, 420], displayStyle: 'pie', futureField: 'keep-me' },
    });
    await useSettingsStore.getState().load();
    const raw = useSettingsStore.getState().settings.timerTool as unknown as Record<
      string,
      unknown
    >;
    expect(raw['futureField']).toBe('keep-me');
    const normalized = normalizeTimerToolSettings(raw);
    expect(normalized.presets).toEqual([120, 420]);
    expect(normalized.displayStyle).toBe('pie');
  });

  it('모르는 최상위 칸도 지우지 않는다', async () => {
    getSettings.mockResolvedValue({ someNewerFeature: { on: true } });
    await useSettingsStore.getState().load();
    const settings = useSettingsStore.getState().settings as unknown as Record<string, unknown>;
    expect(settings['someNewerFeature']).toEqual({ on: true });
  });

  it('timerTool 이 없는 옛 저장값은 기본값', async () => {
    getSettings.mockResolvedValue({});
    await useSettingsStore.getState().load();
    expect(normalizeTimerToolSettings(useSettingsStore.getState().settings.timerTool)).toEqual(
      DEFAULT_TIMER_TOOL_SETTINGS,
    );
  });
});
