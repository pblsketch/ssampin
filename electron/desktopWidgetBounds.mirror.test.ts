import { describe, expect, it } from 'vitest';
import * as domain from '../src/domain/services/screenBoundsClamp';
import * as electronMirror from './desktopWidgetBounds';

describe('desktopWidgetBounds mirror parity', () => {
  const fhdWorkArea: electronMirror.WidgetScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

  it('clampWidgetBoundsToWorkArea 결과가 도메인과 100% 일치한다', () => {
    const testCases: electronMirror.WidgetScreenRect[] = [
      { x: 100, y: 100, width: 920, height: 700 },
      { x: -500, y: 1063, width: 1923, height: 1024 },
      { x: 2000, y: -200, width: 920, height: 700 },
    ];

    for (const tc of testCases) {
      const domainResult = domain.clampWidgetBoundsToWorkArea(tc, fhdWorkArea);
      const electronResult = electronMirror.clampWidgetBoundsToWorkArea(tc, fhdWorkArea);
      expect(electronResult).toEqual(domainResult);
    }
  });

  it('isWidgetVisibleInWorkArea 결과가 도메인과 100% 일치한다', () => {
    const testCases: electronMirror.WidgetScreenRect[] = [
      { x: 100, y: 100, width: 920, height: 700 },
      { x: 100, y: 1050, width: 920, height: 700 },
      { x: 100, y: -10, width: 920, height: 700 },
    ];

    for (const tc of testCases) {
      const domainResult = domain.isWidgetVisibleInWorkArea(tc, fhdWorkArea);
      const electronResult = electronMirror.isWidgetVisibleInWorkArea(tc, fhdWorkArea);
      expect(electronResult).toBe(domainResult);
    }
  });

  it('findBestWorkAreaForBounds 결과가 도메인과 100% 일치한다', () => {
    const workAreas = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ];
    const bounds = { x: 1800, y: 100, width: 920, height: 700 };

    const domainResult = domain.findBestWorkAreaForBounds(bounds, workAreas);
    const electronResult = electronMirror.findBestWorkAreaForBounds(bounds, workAreas);
    expect(electronResult).toEqual(domainResult);
  });

  it('fitWidgetSizeToWorkArea 결과가 도메인과 100% 일치한다', () => {
    const testCases: electronMirror.WidgetScreenRect[] = [
      { x: 100, y: 100, width: 920, height: 700 }, // 축소 불필요
      { x: 300, y: 200, width: 2400, height: 1500 }, // 양축 초과
      { x: 0, y: 0, width: 920, height: 1500 }, // 세로만 초과
      { x: -500, y: 0, width: 3000, height: 400 }, // 가로만 초과
    ];
    const minSizes = [undefined, { width: 640, height: 480 }];

    for (const tc of testCases) {
      for (const min of minSizes) {
        const domainResult = domain.fitWidgetSizeToWorkArea(tc, fhdWorkArea, min);
        const electronResult = electronMirror.fitWidgetSizeToWorkArea(tc, fhdWorkArea, min);
        expect(electronResult).toEqual(domainResult);
      }
    }
  });

  it('[UltraQA] 멀티 모니터, 상단 작업표시줄, 초고해상도 등 극단적 케이스에서 도메인과 100% 동일하다', () => {
    const multiDisplays = [
      { x: -1920, y: 0, width: 1920, height: 1080 },
      { x: 0, y: 60, width: 1920, height: 1020 },
      { x: 1920, y: 0, width: 3840, height: 2160 },
    ];
    const testBounds = [
      { x: -2500, y: 1500, width: 920, height: 700 },
      { x: 50, y: 0, width: 920, height: 700 },
      { x: 4000, y: 2150, width: 1200, height: 900 },
      { x: -50, y: 100, width: 920, height: 700 },
    ];

    for (const b of testBounds) {
      const dBest = domain.findBestWorkAreaForBounds(b, multiDisplays);
      const eBest = electronMirror.findBestWorkAreaForBounds(b, multiDisplays);
      expect(eBest).toEqual(dBest);

      if (dBest && eBest) {
        const dClamp = domain.clampWidgetBoundsToWorkArea(b, dBest);
        const eClamp = electronMirror.clampWidgetBoundsToWorkArea(b, eBest);
        expect(eClamp).toEqual(dClamp);

        const dVis = domain.isWidgetVisibleInWorkArea(b, dBest);
        const eVis = electronMirror.isWidgetVisibleInWorkArea(b, eBest);
        expect(eVis).toBe(dVis);
      }
    }
  });
});
