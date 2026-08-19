/**
 * 위젯 크기 래칫 방지 — 2026-08-19 실측을 그대로 코드로 옮긴 그물.
 *
 * 175% 배율 화면에서 `setBounds(W)` 직후 `getBounds()` 는 `W+1` 을 돌려준다. 그 값을 다시
 * 지정하면 또 +1 이다. 그래서 "재서 → 고쳐서 → 다시 지정"하는 코드는 부를 때마다 위젯을
 * 키운다. 아래 `createDriftingWindow` 가 그 OS 동작을 흉내 낸다.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import {
  applyWidgetWindowBounds,
  readWidgetWindowBounds,
  readWidgetSizeIntent,
  reconcileMeasuredSize,
  rememberWidgetSizeIntent,
  resetWidgetSizeIntent,
  WIDGET_MEASUREMENT_NOISE,
  type WidgetBoundsWindow,
  type WidgetRect,
} from './widgetGeometryIntent';

/**
 * 소수 배율 창 흉내 — 지정한 크기를 그대로 갖고 있다가, 읽을 때 1px 크게 돌려준다.
 * (실측: 요구 1646x981 -> 1647x982 -> 1648x983 -> ... 멈추지 않음)
 */
function createDriftingWindow(initial: WidgetRect): WidgetBoundsWindow & { raw(): WidgetRect } {
  let held: WidgetRect = { ...initial };
  return {
    isDestroyed: () => false,
    getBounds: () => ({ ...held, width: held.width + 1, height: held.height + 1 }),
    setBounds: (b: WidgetRect) => {
      held = { ...b };
    },
    raw: () => ({ ...held }),
  };
}

describe('widgetGeometryIntent', () => {
  beforeEach(() => {
    resetWidgetSizeIntent();
  });

  describe('그물이 흉내 내는 OS 동작이 실제로 위험하다', () => {
    test('보정 없이 되먹이면 크기가 끝없이 자란다 — 이게 실제로 난 사고다', () => {
      const win = createDriftingWindow({ x: 0, y: 0, width: 845, height: 981 });

      // 아무것도 안 바꾸고 "재서 그대로 다시 지정"만 20번 반복한다.
      for (let i = 0; i < 20; i++) {
        win.setBounds(win.getBounds());
      }

      expect(win.raw().width, '가짜 창이 실제 OS처럼 자라지 않는다 — 그물이 무의미하다').toBe(865);
      expect(win.raw().height).toBe(1001);
    });
  });

  describe('reconcileMeasuredSize', () => {
    test('의도값이 없으면 잰 값이 곧 의도다', () => {
      expect(reconcileMeasuredSize({ width: 845, height: 981 }, null)).toEqual({
        width: 845,
        height: 981,
      });
    });

    test('잡음 범위 안이면 의도값을 지킨다 — 여기가 래칫을 끊는 지점', () => {
      const intended = { width: 845, height: 981 };
      for (let drift = 0; drift <= WIDGET_MEASUREMENT_NOISE; drift++) {
        const measured = { width: 845 + drift, height: 981 + drift };
        expect(reconcileMeasuredSize(measured, intended), `드리프트 ${drift}`).toEqual(intended);
      }
    });

    test('잡음보다 크게 달라지면 사용자가 진짜 바꾼 것 — 잰 값이 새 의도다', () => {
      const intended = { width: 845, height: 981 };
      const measured = { width: 845 + WIDGET_MEASUREMENT_NOISE + 1, height: 981 };
      expect(reconcileMeasuredSize(measured, intended)).toEqual(measured);
    });

    test('한 축만 크게 바뀌어도 두 축을 함께 갱신한다 — 잡종 크기를 만들지 않는다', () => {
      // 손잡이 하나를 끌면 한 축만 변한다. 축별로 섞으면 폭은 새 값, 높이는 옛 값이 된다.
      const intended = { width: 845, height: 981 };
      const measured = { width: 600, height: 982 };
      expect(reconcileMeasuredSize(measured, intended)).toEqual(measured);
    });

    test('줄어드는 방향의 드리프트도 흡수한다', () => {
      const intended = { width: 845, height: 981 };
      expect(reconcileMeasuredSize({ width: 843, height: 979 }, intended)).toEqual(intended);
    });
  });

  describe('applyWidgetWindowBounds / readWidgetWindowBounds', () => {
    test('★되먹임을 반복해도 크기가 자라지 않는다', () => {
      const win = createDriftingWindow({ x: 0, y: 0, width: 845, height: 981 });
      applyWidgetWindowBounds(win, { x: 0, y: 0, width: 845, height: 981 });

      for (let i = 0; i < 50; i++) {
        const bounds = readWidgetWindowBounds(win);
        expect(bounds).not.toBeNull();
        applyWidgetWindowBounds(win, bounds as WidgetRect);
      }

      const final = readWidgetWindowBounds(win) as WidgetRect;
      expect(final.width, '50번 되먹였는데 폭이 자랐다').toBe(845);
      expect(final.height, '50번 되먹였는데 높이가 자랐다').toBe(981);
    });

    test('위치는 잰 값을 그대로 쓴다 — 드리프트는 크기에서만 관측됐다', () => {
      const win = createDriftingWindow({ x: 100, y: 50, width: 845, height: 981 });
      applyWidgetWindowBounds(win, { x: 100, y: 50, width: 845, height: 981 });

      // 네이티브 드래그가 물리 좌표로 창을 옮긴 상황
      win.setBounds({ x: 700, y: 300, width: 845, height: 981 });

      const bounds = readWidgetWindowBounds(win) as WidgetRect;
      expect(bounds.x).toBe(700);
      expect(bounds.y).toBe(300);
      expect(bounds.width).toBe(845);
    });

    test('사용자가 진짜 크기를 바꾸면 그 크기를 새 기준으로 삼는다', () => {
      const win = createDriftingWindow({ x: 0, y: 0, width: 845, height: 981 });
      applyWidgetWindowBounds(win, { x: 0, y: 0, width: 845, height: 981 });

      // 손잡이로 크게 줄임 (네이티브 리사이즈는 setBounds 를 안 거친다)
      win.setBounds({ x: 0, y: 0, width: 600, height: 700 });

      const after = readWidgetWindowBounds(win) as WidgetRect;
      expect(after.width).toBe(601); // 잰 값 그대로 (드리프트 포함)
      expect(readWidgetSizeIntent()).toEqual({ width: 601, height: 701 });

      // 새 기준이 잡혔으니 그 뒤로는 다시 안정된다
      for (let i = 0; i < 20; i++) {
        applyWidgetWindowBounds(win, readWidgetWindowBounds(win) as WidgetRect);
      }
      expect((readWidgetWindowBounds(win) as WidgetRect).width).toBe(601);
    });

    test('창이 없으면 안전하게 넘어간다', () => {
      expect(readWidgetWindowBounds(null)).toBeNull();
      expect(() =>
        applyWidgetWindowBounds(null, { x: 0, y: 0, width: 10, height: 10 }),
      ).not.toThrow();

      const destroyed: WidgetBoundsWindow = {
        isDestroyed: () => true,
        getBounds: () => {
          throw new Error('파괴된 창을 읽으면 안 된다');
        },
        setBounds: () => {
          throw new Error('파괴된 창에 쓰면 안 된다');
        },
      };
      expect(readWidgetWindowBounds(destroyed)).toBeNull();
      expect(() =>
        applyWidgetWindowBounds(destroyed, { x: 0, y: 0, width: 10, height: 10 }),
      ).not.toThrow();
    });

    test('창을 새로 만들면 의도를 지운다 — 옛 창의 크기가 새 창에 새지 않는다', () => {
      rememberWidgetSizeIntent({ width: 845, height: 981 });
      resetWidgetSizeIntent();
      expect(readWidgetSizeIntent()).toBeNull();

      const win = createDriftingWindow({ x: 0, y: 0, width: 400, height: 300 });
      expect((readWidgetWindowBounds(win) as WidgetRect).width).toBe(401);
    });
  });
});
