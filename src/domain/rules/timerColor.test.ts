import { describe, it, expect } from 'vitest';
import { PRESET_THEMES } from '../entities/DashboardTheme';
import { hexHueSaturation, needsTimerRingOverride } from './timerColor';

function isLightBackground(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

describe('needsTimerRingOverride — 평소 원 색이 경고색과 헷갈리는 테마', () => {
  it('13개 테마 중 주황 계열·흑백 테마만 바꾼다 (spec 2-3)', () => {
    const overridden = PRESET_THEMES.filter((t) =>
      needsTimerRingOverride(t.colors.accent, isLightBackground(t.colors.bg)),
    ).map((t) => t.id);
    expect(overridden.sort()).toEqual(
      ['kraft-dark', 'kraft-light', 'mono', 'neutral-dark', 'neutral-light', 'sunset'].sort(),
    );
  });

  it('파랑 테마는 그대로', () => {
    expect(needsTimerRingOverride('#3b82f6', false)).toBe(false);
    expect(needsTimerRingOverride('#2563eb', true)).toBe(false);
  });

  it('읽을 수 없는 색은 그대로 둔다', () => {
    expect(needsTimerRingOverride('rgb(1,2,3)', true)).toBe(false);
  });
});

describe('hexHueSaturation', () => {
  it('3자리·6자리 HEX', () => {
    expect(hexHueSaturation('#f00')?.hue).toBe(0);
    expect(hexHueSaturation('#00ff00')?.hue).toBeCloseTo(120);
    expect(hexHueSaturation('#808080')?.saturation).toBe(0);
  });
});
