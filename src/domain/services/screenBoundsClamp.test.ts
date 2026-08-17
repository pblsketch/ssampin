import { describe, expect, it } from 'vitest';
import {
  clampWidgetBoundsToWorkArea,
  findBestWorkAreaForBounds,
  fitWidgetSizeToWorkArea,
  getIntersectionArea,
  isWidgetVisibleInWorkArea,
  type ScreenRect,
} from './screenBoundsClamp';

describe('screenBoundsClamp', () => {
  const fhdWorkArea: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 }; // 1080p - 40px taskbar

  describe('clampWidgetBoundsToWorkArea', () => {
    it('정상 범위 내의 위젯 위치는 변경되지 않는다', () => {
      const bounds: ScreenRect = { x: 100, y: 100, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, fhdWorkArea);
      expect(clamped).toEqual(bounds);
    });

    it('화면 아래쪽으로 과도하게 밀린 위젯은 헤더 최소 높이(40px)를 남기고 clamp된다 (사용자 로그 사례 재현)', () => {
      // Y=1063으로 밀렸던 위젯 (높이 1024)
      const bounds: ScreenRect = { x: 100, y: 1063, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, fhdWorkArea, {
        minVisibleHeaderHeight: 40,
      });

      // maxY = 0 + 1040 - 40 = 1000
      expect(clamped.y).toBe(1000);
      expect(clamped.x).toBe(100);
      expect(clamped.width).toBe(920);
      expect(clamped.height).toBe(700);
    });

    it('화면 위쪽으로 벗어난 위젯은 상단 경계(y >= workArea.y)에 맞춘다', () => {
      const bounds: ScreenRect = { x: 100, y: -200, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, fhdWorkArea);
      expect(clamped.y).toBe(0);
      expect(clamped.x).toBe(100);
    });

    it('화면 좌측으로 과도하게 밀린 위젯은 최소 가로폭(100px)을 남긴다', () => {
      const bounds: ScreenRect = { x: -900, y: 100, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, fhdWorkArea, { minVisibleWidth: 100 });
      // minX = 0 - 920 + 100 = -820
      expect(clamped.x).toBe(-820);
    });

    it('화면 우측으로 과도하게 밀린 위젯은 최소 가로폭(100px)을 남긴다', () => {
      const bounds: ScreenRect = { x: 1900, y: 100, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, fhdWorkArea, { minVisibleWidth: 100 });
      // maxX = 0 + 1920 - 100 = 1820
      expect(clamped.x).toBe(1820);
    });

    it('좌측 보조 모니터(음수 좌표계)에서도 정상적으로 clamp된다', () => {
      const leftDisplay: ScreenRect = { x: -1920, y: 0, width: 1920, height: 1080 };
      const bounds: ScreenRect = { x: -2500, y: 1200, width: 920, height: 700 };
      const clamped = clampWidgetBoundsToWorkArea(bounds, leftDisplay, {
        minVisibleHeaderHeight: 50,
        minVisibleWidth: 100,
      });

      // minX = -1920 - 920 + 100 = -2740
      // maxX = -1920 + 1920 - 100 = -100
      // minY = 0, maxY = 0 + 1080 - 50 = 1030
      expect(clamped.x).toBe(-2500); // -2500 is within [-2740, -100]
      expect(clamped.y).toBe(1030); // 1200 was clamped to 1030
    });
  });

  describe('isWidgetVisibleInWorkArea', () => {
    it('가시 영역 내에 완전히 들어온 경우 true를 반환한다', () => {
      const bounds: ScreenRect = { x: 200, y: 200, width: 920, height: 700 };
      expect(isWidgetVisibleInWorkArea(bounds, fhdWorkArea)).toBe(true);
    });

    it('헤더가 화면 아래로 내려가 사라진 경우 false를 반환한다', () => {
      const bounds: ScreenRect = { x: 200, y: 1050, width: 920, height: 700 };
      expect(isWidgetVisibleInWorkArea(bounds, fhdWorkArea, { minVisibleHeaderHeight: 40 })).toBe(
        false,
      );
    });

    it('헤더가 화면 위로 벗어난 경우 false를 반환한다', () => {
      const bounds: ScreenRect = { x: 200, y: -10, width: 920, height: 700 };
      expect(isWidgetVisibleInWorkArea(bounds, fhdWorkArea)).toBe(false);
    });
  });

  describe('getIntersectionArea', () => {
    it('겹치지 않는 사각형은 0을 반환한다', () => {
      const rectA: ScreenRect = { x: 0, y: 0, width: 100, height: 100 };
      const rectB: ScreenRect = { x: 200, y: 200, width: 100, height: 100 };
      expect(getIntersectionArea(rectA, rectB)).toBe(0);
    });

    it('교차 영역의 면적을 정확히 계산한다', () => {
      const rectA: ScreenRect = { x: 0, y: 0, width: 100, height: 100 };
      const rectB: ScreenRect = { x: 50, y: 50, width: 100, height: 100 };
      expect(getIntersectionArea(rectA, rectB)).toBe(2500); // 50 * 50
    });
  });

  describe('findBestWorkAreaForBounds', () => {
    const mainDisplay: ScreenRect = { x: 0, y: 0, width: 1920, height: 1080 };
    const rightDisplay: ScreenRect = { x: 1920, y: 0, width: 1920, height: 1080 };

    it('가장 많이 겹치는 디스플레이를 선택한다', () => {
      // 우측 모니터에 더 많이 걸쳐 있는 위젯
      const bounds: ScreenRect = { x: 1800, y: 100, width: 920, height: 700 };
      const best = findBestWorkAreaForBounds(bounds, [mainDisplay, rightDisplay]);
      expect(best).toEqual(rightDisplay);
    });

    it('어느 모니터와도 겹치지 않는 경우 가장 가까운 디스플레이를 선택한다', () => {
      const bounds: ScreenRect = { x: 4500, y: 100, width: 920, height: 700 };
      const best = findBestWorkAreaForBounds(bounds, [mainDisplay, rightDisplay]);
      expect(best).toEqual(rightDisplay);
    });
  });

  describe('UltraQA Extreme Edge Cases', () => {
    it('[UltraQA #1] 위젯 크기가 모니터 작업 영역보다 큰 경우에도 clamp가 유효한 영역을 반환한다', () => {
      const smallDisplay: ScreenRect = { x: 0, y: 0, width: 800, height: 600 };
      const hugeWidget: ScreenRect = { x: -100, y: -100, width: 1200, height: 900 };
      const clamped = clampWidgetBoundsToWorkArea(hugeWidget, smallDisplay);

      expect(clamped.y).toBe(0);
      expect(clamped.x).toBeGreaterThanOrEqual(smallDisplay.x - hugeWidget.width);
      expect(clamped.x).toBeLessThanOrEqual(smallDisplay.x + smallDisplay.width);
    });

    it('[UltraQA #2] 작업표시줄이 상단이나 좌측에 있어 workArea 원점이 (0,0)이 아닌 경우 정확히 clamp된다', () => {
      // 상단 작업표시줄(높이 60px) 환경: y=60, height=1020
      const topTaskbarArea: ScreenRect = { x: 0, y: 60, width: 1920, height: 1020 };
      const outTopBounds: ScreenRect = { x: 100, y: 0, width: 920, height: 700 };
      const clampedTop = clampWidgetBoundsToWorkArea(outTopBounds, topTaskbarArea);
      expect(clampedTop.y).toBe(60);

      // 좌측 작업표시줄(폭 80px) 환경: x=80, width=1840
      const leftTaskbarArea: ScreenRect = { x: 80, y: 0, width: 1840, height: 1080 };
      const outLeftBounds: ScreenRect = { x: -900, y: 100, width: 920, height: 700 };
      const clampedLeft = clampWidgetBoundsToWorkArea(outLeftBounds, leftTaskbarArea, {
        minVisibleWidth: 100,
      });
      // minX = 80 - 920 + 100 = -740
      expect(clampedLeft.x).toBe(-740);
    });

    it('[UltraQA #3] 세로 배치(상/하) 멀티 모니터 환경에서 음수/양수 y 좌표를 정확히 처리한다', () => {
      const topDisplay: ScreenRect = { x: 0, y: -1080, width: 1920, height: 1080 };
      const bottomDisplay: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

      // 상단 모니터 위로 튀어나간 위젯
      const overTopBounds: ScreenRect = { x: 100, y: -1500, width: 920, height: 700 };
      const bestForOverTop = findBestWorkAreaForBounds(overTopBounds, [topDisplay, bottomDisplay]);
      expect(bestForOverTop).toEqual(topDisplay);

      const clampedTop = clampWidgetBoundsToWorkArea(overTopBounds, topDisplay);
      expect(clampedTop.y).toBe(-1080);
    });

    it('[UltraQA #4] 4K 초고해상도(3840x2160) 디스플레이에서 정상 동작한다', () => {
      const display4K: ScreenRect = { x: 0, y: 0, width: 3840, height: 2100 };
      const bounds: ScreenRect = { x: 3800, y: 2090, width: 1200, height: 900 };

      const isVis = isWidgetVisibleInWorkArea(bounds, display4K, { minVisibleHeaderHeight: 40 });
      expect(isVis).toBe(false);

      const clamped = clampWidgetBoundsToWorkArea(bounds, display4K, {
        minVisibleHeaderHeight: 40,
      });
      expect(clamped.y).toBe(2100 - 40); // 2060
    });

    it('[UltraQA #5] 3대 모니터 가로 배치(-1920, 0, 1920)에서 중앙 모니터와 좌/우 경계 전환이 매끄럽다', () => {
      const displays: ScreenRect[] = [
        { x: -1920, y: 0, width: 1920, height: 1080 },
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 1920, y: 0, width: 1920, height: 1080 },
      ];

      // 좌측 모니터와 중앙 모니터 사이에 걸쳐 있는 위젯 (중앙에 70% 걸침)
      const spanningLeftCenter: ScreenRect = { x: -200, y: 100, width: 920, height: 700 };
      const best = findBestWorkAreaForBounds(spanningLeftCenter, displays);
      expect(best).toEqual(displays[1]); // 중앙 모니터 선택
    });
  });

  describe('fitWidgetSizeToWorkArea — 화면보다 큰 위젯 축소', () => {
    it('작업 영역 안에 들어가는 위젯은 크기를 바꾸지 않는다', () => {
      const bounds: ScreenRect = { x: 100, y: 100, width: 920, height: 700 };
      expect(fitWidgetSizeToWorkArea(bounds, fhdWorkArea)).toEqual(bounds);
    });

    it('작업 영역보다 큰 위젯을 작업 영역 크기로 줄인다 (위치는 유지)', () => {
      // 4K에서 크게 키운 뒤 FHD로 해상도를 낮춘 상황
      const oversized: ScreenRect = { x: 300, y: 200, width: 2400, height: 1500 };
      const fitted = fitWidgetSizeToWorkArea(oversized, fhdWorkArea);

      expect(fitted).toEqual({ x: 300, y: 200, width: 1920, height: 1040 });
    });

    it('★핵심: 축소 후에는 하단 크기 조절 손잡이가 화면 안으로 돌아온다', () => {
      const oversized: ScreenRect = { x: 0, y: 0, width: 2400, height: 1500 };
      const workAreaBottom = fhdWorkArea.y + fhdWorkArea.height;

      // 축소 전: 하단 손잡이(y + height)가 화면 밖 → 잡을 수 없다
      expect(oversized.y + oversized.height).toBeGreaterThan(workAreaBottom);

      // 축소 + clamp 후: 하단 손잡이가 화면 안
      const fitted = fitWidgetSizeToWorkArea(oversized, fhdWorkArea);
      const clamped = clampWidgetBoundsToWorkArea(fitted, fhdWorkArea);
      expect(clamped.y + clamped.height).toBeLessThanOrEqual(workAreaBottom);
    });

    it('최소 창 크기 아래로는 줄이지 않는다 (작업 영역이 최소 크기보다 작아도)', () => {
      const tinyWorkArea: ScreenRect = { x: 0, y: 0, width: 400, height: 300 };
      const bounds: ScreenRect = { x: 0, y: 0, width: 920, height: 700 };

      const fitted = fitWidgetSizeToWorkArea(bounds, tinyWorkArea, { width: 640, height: 480 });
      expect(fitted.width).toBe(640);
      expect(fitted.height).toBe(480);
    });

    it('한쪽 축만 초과하면 그 축만 줄인다', () => {
      const bounds: ScreenRect = { x: 0, y: 0, width: 920, height: 1500 };
      const fitted = fitWidgetSizeToWorkArea(bounds, fhdWorkArea);

      expect(fitted.width).toBe(920); // 그대로
      expect(fitted.height).toBe(1040); // 축소
    });
  });
});
