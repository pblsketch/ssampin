import { describe, it, expect } from 'vitest';
import {
  computeTimerGeometry,
  DIGIT_RATIO_TARGET,
  DIGIT_WIDTH_EM,
  MAX_DIAMETER,
  MIN_DIAMETER,
} from '../timerGeometry';

/** 숫자 "00:00" 폭 ÷ 원 안지름 */
function digitRatio(g: { digitFontSize: number; innerDiameter: number }): number {
  return (g.digitFontSize * DIGIT_WIDTH_EM) / g.innerDiameter;
}

describe('computeTimerGeometry — 숫자가 원을 뚫지 않는다 (spec 2-1 B안)', () => {
  it.each([
    [220, 220],
    [320, 480],
    [520, 700],
    [900, 700],
    [2000, 1200],
  ])('스테이지 %i×%i 에서 숫자 폭은 안지름의 60~65%%', (w, h) => {
    const g = computeTimerGeometry({ width: w, height: h }, 'ring');
    expect(digitRatio(g)).toBeGreaterThanOrEqual(0.6);
    expect(digitRatio(g)).toBeLessThanOrEqual(0.65);
    expect(DIGIT_RATIO_TARGET).toBeCloseTo(0.625);
  });

  it('옛 300px 자리에서는 숫자가 지금(96px)보다 훨씬 작아진다', () => {
    const g = computeTimerGeometry({ width: 300, height: 300 }, 'ring');
    expect(g.diameter).toBeCloseTo(276, 0);
    expect(g.digitFontSize).toBeLessThan(70);
  });

  it('최소 200px, 최대 640px(교실 화면은 따로 키운다)', () => {
    expect(computeTimerGeometry({ width: 100, height: 100 }, 'ring').diameter).toBe(MIN_DIAMETER);
    expect(computeTimerGeometry({ width: 3000, height: 3000 }, 'ring').diameter).toBe(MAX_DIAMETER);
    expect(computeTimerGeometry({ width: 3000, height: 3000 }, 'ring', 960).diameter).toBe(960);
  });

  it('원 두께는 지름에 비례해 지금(6px)보다 굵다', () => {
    const g = computeTimerGeometry({ width: 520, height: 520 }, 'ring');
    expect(g.strokeWidth).toBeGreaterThan(6);
    expect(g.strokeWidth).toBeLessThanOrEqual(24);
  });

  it('좁은 스테이지(560px 미만)는 ± 단추를 원 아래로', () => {
    expect(computeTimerGeometry({ width: 420, height: 600 }, 'ring').isNarrow).toBe(true);
    expect(computeTimerGeometry({ width: 800, height: 600 }, 'ring').isNarrow).toBe(false);
  });

  it('부채꼴은 숫자 줄 높이만큼 원이 작다', () => {
    const ring = computeTimerGeometry({ width: 800, height: 500 }, 'ring');
    const pie = computeTimerGeometry({ width: 800, height: 500 }, 'pie');
    expect(pie.diameter).toBeLessThan(ring.diameter);
  });
});
