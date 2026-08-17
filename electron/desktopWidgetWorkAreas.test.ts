import { describe, expect, it } from 'vitest';
import { computePhysicalWorkAreas, type WorkAreaSource } from './desktopWidgetManager';
import { clampWidgetBoundsToWorkArea, findBestWorkAreaForBounds } from './desktopWidgetBounds';
import type { DipRect } from './desktopWidgetTypes';

/**
 * 드래그 경계 제한(ADR-051)의 좌표 변환 회귀 테스트.
 *
 * 배경: 최초 구현은 모니터 작업 영역을 `workArea.x * scaleFactor`로 환산했다.
 * 이 단순 곱셈은 per-monitor DPI 환경에서 틀리며, 그 결과 clamp가 실제 바탕화면
 * 바깥까지 위젯을 허용해 기능의 목적(화면 이탈 방지) 자체가 무너졌다.
 * 아래 테스트는 그 실패를 실제 숫자로 고정한다.
 */

// 시나리오: primary 1920×1080 @100% + 우측 보조 2560×1440 @200%
//   - primary  workArea DIP {0,0,1920,1040}  (작업표시줄 40 DIP)  → physical 동일
//   - 보조     workArea DIP {1920,0,1280,720}                     → physical {1920,0,2560,1440}
// 바탕화면 전체 physical 우측 끝 = 1920 + 2560 = 4480
const MIXED_DPI_DISPLAYS: readonly WorkAreaSource[] = [
  { workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 },
  { workArea: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 2 },
];

const DESKTOP_PHYSICAL_RIGHT = 4480;

/** 실제 Electron screen.dipToScreenRect(null, r)의 동작을 모사한 변환기. */
function fakeDipToScreenRect(r: DipRect): DipRect {
  // 보조 모니터(DIP x >= 1920)의 physical origin은 primary의 physical 폭(1920) 뒤에 붙는다.
  if (r.x >= 1920) {
    return { x: 1920 + (r.x - 1920) * 2, y: r.y * 2, width: r.width * 2, height: r.height * 2 };
  }
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** 회귀 전 구현(단순 곱셈)을 그대로 재현 — 비교 기준용. */
function naiveMultiply(displays: readonly WorkAreaSource[]) {
  return displays.map((d) => {
    const sf = d.scaleFactor || 1;
    return {
      x: Math.round(d.workArea.x * sf),
      y: Math.round(d.workArea.y * sf),
      width: Math.round(d.workArea.width * sf),
      height: Math.round(d.workArea.height * sf),
    };
  });
}

/** rect 부분만 비교 — 최소 가시량 필드는 별도 테스트에서 검증. */
function rectsOf(areas: readonly { x: number; y: number; width: number; height: number }[]) {
  return areas.map((a) => ({ x: a.x, y: a.y, width: a.width, height: a.height }));
}

describe('computePhysicalWorkAreas', () => {
  it('per-monitor DPI 환경에서 보조 모니터의 physical origin을 정확히 계산한다', () => {
    const result = computePhysicalWorkAreas(MIXED_DPI_DISPLAYS, fakeDipToScreenRect);

    expect(rectsOf(result)).toEqual([
      { x: 0, y: 0, width: 1920, height: 1040 },
      { x: 1920, y: 0, width: 2560, height: 1440 },
    ]);
  });

  it('★회귀 가드: 단순 scaleFactor 곱셈과 결과가 달라야 한다 (곱셈은 960px 어긋남)', () => {
    const correct = computePhysicalWorkAreas(MIXED_DPI_DISPLAYS, fakeDipToScreenRect);
    const naive = naiveMultiply(MIXED_DPI_DISPLAYS);

    expect(naive[1]!.x).toBe(3840); // 1920 * 2 — 틀린 값
    expect(correct[1]!.x).toBe(1920); // 실제 physical origin
    expect(rectsOf(correct)).not.toEqual(naive);
  });

  it('단일 모니터(배율 무관)에서는 곱셈 결과와 동일하다', () => {
    const single: readonly WorkAreaSource[] = [
      { workArea: { x: 0, y: 0, width: 1280, height: 660 }, scaleFactor: 1.5 },
    ];
    const result = computePhysicalWorkAreas(single, (r) => ({
      x: r.x * 1.5,
      y: r.y * 1.5,
      width: r.width * 1.5,
      height: r.height * 1.5,
    }));

    expect(rectsOf(result)).toEqual([{ x: 0, y: 0, width: 1920, height: 990 }]);
    expect(rectsOf(result)).toEqual(naiveMultiply(single));
  });

  it('변환기가 실패하면 해당 모니터만 scaleFactor 곱셈으로 폴백한다', () => {
    const result = computePhysicalWorkAreas(MIXED_DPI_DISPLAYS, () => {
      throw new Error('dipToScreenRect unavailable');
    });

    expect(rectsOf(result)).toEqual(naiveMultiply(MIXED_DPI_DISPLAYS));
  });

  it('디스플레이 목록이 비면 빈 배열을 반환한다', () => {
    expect(computePhysicalWorkAreas([], fakeDipToScreenRect)).toEqual([]);
  });
});

describe('최소 가시량 단위 — DIP 기준을 모니터 배율로 환산한다', () => {
  it('모니터마다 자기 배율로 환산된 physical 최소값을 갖는다', () => {
    const result = computePhysicalWorkAreas(MIXED_DPI_DISPLAYS, fakeDipToScreenRect);

    // 100% 모니터: DIP 값 그대로
    expect(result[0]!.minVisibleHeaderHeight).toBe(40);
    expect(result[0]!.minVisibleWidth).toBe(100);

    // 200% 모니터: 2배
    expect(result[1]!.minVisibleHeaderHeight).toBe(80);
    expect(result[1]!.minVisibleWidth).toBe(200);
  });

  it('150% 배율에서 헤더 보장량이 40 DIP를 유지한다 (환산 전에는 약 27 DIP였다)', () => {
    const [area] = computePhysicalWorkAreas(
      [{ workArea: { x: 0, y: 0, width: 1280, height: 660 }, scaleFactor: 1.5 }],
      (r) => ({ x: r.x * 1.5, y: r.y * 1.5, width: r.width * 1.5, height: r.height * 1.5 }),
    );

    expect(area!.minVisibleHeaderHeight).toBe(60); // 40 DIP × 1.5
    expect(area!.minVisibleHeaderHeight / 1.5).toBe(40); // 다시 DIP로 환산하면 40
  });

  it('★회귀 가드: 고배율 모니터에서 헤더가 화면 밑으로 더 잠기지 않는다', () => {
    const [area] = computePhysicalWorkAreas(
      [{ workArea: { x: 0, y: 0, width: 1280, height: 660 }, scaleFactor: 1.5 }],
      (r) => ({ x: r.x * 1.5, y: r.y * 1.5, width: r.width * 1.5, height: r.height * 1.5 }),
    );
    const dragged = { x: 100, y: 99999, width: 920, height: 700 }; // 화면 맨 밑으로 끌기

    const fixed = clampWidgetBoundsToWorkArea(dragged, area!, {
      minVisibleHeaderHeight: area!.minVisibleHeaderHeight,
      minVisibleWidth: area!.minVisibleWidth,
    });
    // 환산 전 동작(physical 40 고정)
    const before = clampWidgetBoundsToWorkArea(dragged, area!);

    const workAreaBottom = area!.y + area!.height; // 990
    expect(fixed.y).toBe(workAreaBottom - 60); // 헤더 60 physical = 40 DIP 노출
    expect(before.y).toBe(workAreaBottom - 40); // 헤더 40 physical ≈ 27 DIP 노출

    // 고친 쪽이 항상 더 많이 남긴다
    expect(workAreaBottom - fixed.y).toBeGreaterThan(workAreaBottom - before.y);
  });
});

describe('드래그 경계 제한 통합 — 화면 이탈이 실제로 막히는가', () => {
  const widget = { x: 5200, y: 300, width: 920, height: 700 }; // 우측 끝까지 밀어낸 드래그

  /** clamp 후 위젯이 바탕화면 안에 남긴 가로 가시 폭(physical px). */
  function visibleWidthAfterClamp(
    workAreas: readonly { x: number; y: number; width: number; height: number }[],
    minima?: { minVisibleHeaderHeight: number; minVisibleWidth: number },
  ) {
    const best = findBestWorkAreaForBounds(widget, workAreas);
    expect(best).not.toBeNull();
    const clamped = clampWidgetBoundsToWorkArea(widget, best!, minima);
    return {
      x: clamped.x,
      visible: Math.max(0, Math.min(clamped.x + clamped.width, DESKTOP_PHYSICAL_RIGHT) - clamped.x),
    };
  }

  it('올바른 작업 영역에서는 100 DIP가 화면에 남는다 (200% 모니터 → 200 physical px)', () => {
    const correct = computePhysicalWorkAreas(MIXED_DPI_DISPLAYS, fakeDipToScreenRect);
    const best = findBestWorkAreaForBounds(widget, correct)!;
    const { x, visible } = visibleWidthAfterClamp(correct, {
      minVisibleHeaderHeight: best.minVisibleHeaderHeight,
      minVisibleWidth: best.minVisibleWidth,
    });

    expect(x).toBe(4280); // 4480 - 200
    expect(visible).toBe(200); // = 100 DIP on a 200% display
  });

  it('★회귀 가드: 단순 곱셈 작업 영역이면 위젯이 통째로 화면 밖에 남는다', () => {
    const { x, visible } = visibleWidthAfterClamp(naiveMultiply(MIXED_DPI_DISPLAYS));

    expect(x).toBe(5200); // clamp가 전혀 걸리지 않음
    expect(visible).toBe(0); // 바탕화면 우측 끝(4480) 너머 — 사용자가 위젯을 찾을 수 없다
  });
});
