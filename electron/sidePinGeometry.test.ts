/**
 * 옆핀 창 위치 계산 테스트 — 기획서 AC-17·AC-18.
 *
 * 실제 장비 없이 다중 모니터·음수 좌표·배율을 시험하기 위해 모니터 정보를 값으로 넣는다.
 */
import { describe, expect, test } from 'vitest';
import {
  anchorRightEdge,
  clampSidePinRailTop,
  SIDE_PIN_RAIL_HEIGHT,
  SIDE_PIN_RAIL_WIDTH,
  resolveSidePinRailPositionFromTop,
  resolveSidePinLayout,
  type SidePinDisplayInfo,
  type SidePinRect,
} from './sidePinGeometry';

/** 1920×1080, 작업 표시줄 40px */
const PRIMARY: SidePinDisplayInfo = {
  id: '1',
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

/** 주 모니터 왼쪽에 놓인 보조 모니터 — 좌표가 음수다 */
const LEFT_SECONDARY: SidePinDisplayInfo = {
  id: '2',
  workArea: { x: -1600, y: 0, width: 1600, height: 860 },
};

function layoutOf(overrides: Partial<Parameters<typeof resolveSidePinLayout>[0]> = {}) {
  return resolveSidePinLayout({
    displays: [PRIMARY],
    primaryDisplayId: '1',
    preferredDisplayId: null,
    panelWidth: 400,
    railPosition: 3 / 7,
    ...overrides,
  });
}

/** 사각형이 작업 영역 안에 완전히 들어가는가 */
function isInside(rect: SidePinRect, area: SidePinRect): boolean {
  return (
    rect.x >= area.x &&
    rect.y >= area.y &&
    rect.x + rect.width <= area.x + area.width &&
    rect.y + rect.height <= area.y + area.height
  );
}

describe('resolveSidePinLayout — 오른쪽 가장자리 배치', () => {
  test('손잡이는 오른쪽 끝, 저장된 높이 비율에 짧은 탭으로 놓인다', () => {
    const layout = layoutOf();

    expect(layout?.rail).toEqual({
      x: 1920 - SIDE_PIN_RAIL_WIDTH,
      y: Math.round((1040 - SIDE_PIN_RAIL_HEIGHT) * (3 / 7)),
      width: SIDE_PIN_RAIL_WIDTH,
      height: SIDE_PIN_RAIL_HEIGHT,
    });
  });

  test('0은 맨 위, 1은 맨 아래에 놓인다', () => {
    expect(layoutOf({ railPosition: 0 })?.rail.y).toBe(0);
    expect(layoutOf({ railPosition: 1 })?.rail.y).toBe(1040 - SIDE_PIN_RAIL_HEIGHT);
  });

  test('범위 밖 비율이 들어와도 화면 안에 놓는다', () => {
    expect(layoutOf({ railPosition: -5 })?.rail.y).toBe(0);
    expect(layoutOf({ railPosition: 9 })?.rail.y).toBe(1040 - SIDE_PIN_RAIL_HEIGHT);
    expect(layoutOf({ railPosition: Number.NaN })?.rail.y).toBe(0);
  });

  test('★놓은 윗변 → 비율 → 다시 윗변이 그대로 돌아온다', () => {
    // 이 왕복이 어긋나면 손을 뗄 때 창이 커서 밑에서 빠져나가, 끌기 자리가 손
    // 밑에 없어 두 번째 끌기가 시작되지 않는다(2026-08-17 실기기).
    for (const top of [0, 1, 373, 500, 501, 871, 1040 - SIDE_PIN_RAIL_HEIGHT]) {
      const position = resolveSidePinRailPositionFromTop(PRIMARY.workArea, top);
      expect(layoutOf({ railPosition: position })?.rail.y).toBe(top);
    }
  });

  test('놓은 윗변을 0~1 비율로 바꾼다', () => {
    expect(resolveSidePinRailPositionFromTop(PRIMARY.workArea, 0)).toBe(0);
    expect(resolveSidePinRailPositionFromTop(PRIMARY.workArea, 1040)).toBe(1);
    expect(resolveSidePinRailPositionFromTop(PRIMARY.workArea, Number.NaN)).toBe(0);
  });

  test('끄는 동안에는 작업 영역 안에만 가둔다', () => {
    expect(clampSidePinRailTop(PRIMARY.workArea, 500)).toBe(500);
    expect(clampSidePinRailTop(PRIMARY.workArea, 503)).toBe(503);
    expect(clampSidePinRailTop(PRIMARY.workArea, -200)).toBe(0);
    expect(clampSidePinRailTop(PRIMARY.workArea, 5_000)).toBe(1040 - SIDE_PIN_RAIL_HEIGHT);
    expect(clampSidePinRailTop(PRIMARY.workArea, Number.NaN)).toBe(PRIMARY.workArea.y);
  });

  test('음수 좌표 모니터에서도 그 화면 안에 가둔다', () => {
    expect(clampSidePinRailTop(LEFT_SECONDARY.workArea, -10_000)).toBe(LEFT_SECONDARY.workArea.y);
  });

  test('손잡이가 화면 가장자리를 위아래로 막지 않는다', () => {
    // 손잡이 창은 항상 위에 떠 있다. 가장자리 전체를 덮으면 그 줄이 통째로
    // 클릭을 가로채, 최대화한 창의 스크롤바를 누를 수 없게 된다.
    const layout = layoutOf();
    const rail = layout!.rail;

    expect(rail.y).toBeGreaterThan(PRIMARY.workArea.y);
    expect(rail.y + rail.height).toBeLessThan(PRIMARY.workArea.y + PRIMARY.workArea.height);
  });

  test('손잡이보다 짧은 화면에서는 화면 높이에 맞춘다', () => {
    const short: SidePinDisplayInfo = {
      id: 's',
      workArea: { x: 0, y: 0, width: 800, height: 100 },
    };
    const layout = layoutOf({ displays: [short], primaryDisplayId: 's' });

    expect(layout?.rail.height).toBe(100);
    expect(isInside(layout!.rail, short.workArea)).toBe(true);
  });

  test('패널도 같은 오른쪽 경계를 공유한다', () => {
    const layout = layoutOf();
    const rail = layout!.rail;
    const panel = layout!.panel;

    expect(panel.x + panel.width).toBe(rail.x + rail.width);
    expect(panel.width).toBe(400);
  });

  test('작업 영역 높이를 그대로 쓴다 — 작업 표시줄을 덮지 않는다', () => {
    const layout = layoutOf();

    expect(layout?.panel.height).toBe(1040);
    expect(layout?.panel.y).toBe(0);
  });
});

describe('AC-17 — 화면 밖으로 나가지 않는다', () => {
  test('음수 좌표 보조 모니터에서도 그 화면 안에 배치된다', () => {
    const layout = layoutOf({
      displays: [PRIMARY, LEFT_SECONDARY],
      preferredDisplayId: '2',
    });

    expect(layout?.displayId).toBe('2');
    // 이 화면의 오른쪽 끝(0)에 주 모니터가 맞닿아 있으므로 1 DIP 물러난다.
    expect(layout!.rail.x + layout!.rail.width).toBe(-1);
    expect(isInside(layout!.rail, LEFT_SECONDARY.workArea)).toBe(true);
    expect(isInside(layout!.panel, LEFT_SECONDARY.workArea)).toBe(true);
  });

  test.each([
    ['100%', { x: 0, y: 0, width: 1920, height: 1040 }],
    ['125%', { x: 0, y: 0, width: 1536, height: 824 }],
    ['150%', { x: 0, y: 0, width: 1280, height: 686.6666666666666 }],
  ])('배율 %s 에서도 작업 영역 안에 들어간다', (_label, workArea) => {
    const display: SidePinDisplayInfo = { id: 'scaled', workArea };
    const layout = layoutOf({
      displays: [display],
      primaryDisplayId: 'scaled',
    });

    const rounded = {
      x: Math.round(workArea.x),
      y: Math.round(workArea.y),
      width: Math.round(workArea.width),
      height: Math.round(workArea.height),
    };
    expect(isInside(layout!.rail, rounded)).toBe(true);
    expect(isInside(layout!.panel, rounded)).toBe(true);
  });

  test('배율이 섞인 실제 배치(주 175% + 보조 100%)에서 손잡이가 주 모니터 안에 있다', () => {
    // 2026-08-14 실기기 배치. Electron이 주는 DIP 좌표에서 주 모니터는 0~1646,
    // 보조 모니터는 정확히 1646에서 시작한다 — 손잡이가 그 경계에 딱 붙는다.
    // 배율이 섞이면 이 경계에서 좌표 변환이 어긋나 옆 모니터로 넘어가는 일이 있어,
    // 계산 자체는 경계 안쪽에 있음을 못박아 둔다(넘어가면 계산이 아니라 배치 문제).
    const mainDisplay: SidePinDisplayInfo = {
      id: '3183574757',
      workArea: { x: 0, y: 0, width: 1646, height: 981 },
    };
    const subDisplay: SidePinDisplayInfo = {
      id: '748019706',
      workArea: { x: 1646, y: 0, width: 1920, height: 1032 },
    };

    const layout = layoutOf({
      displays: [mainDisplay, subDisplay],
      primaryDisplayId: '3183574757',
      preferredDisplayId: null,
    });

    expect(layout?.displayId).toBe('3183574757');
    expect(isInside(layout!.rail, mainDisplay.workArea)).toBe(true);
    // 보조 모니터 영역을 한 칸도 침범하지 않는다
    expect(layout!.rail.x + layout!.rail.width).toBeLessThanOrEqual(subDisplay.workArea.x);
  });

  test('소수 좌표는 정수로 맞춘다 — 경계가 1px 어긋나지 않도록', () => {
    const layout = layoutOf({
      displays: [{ id: 'f', workArea: { x: 0.4, y: 0.6, width: 1279.5, height: 686.7 } }],
      primaryDisplayId: 'f',
    });

    for (const value of Object.values(layout!.rail)) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const value of Object.values(layout!.panel)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  test('패널이 화면보다 넓으면 화면 너비까지만 쓴다', () => {
    const narrow: SidePinDisplayInfo = {
      id: 'narrow',
      workArea: { x: 0, y: 0, width: 320, height: 480 },
    };
    const layout = layoutOf({ displays: [narrow], primaryDisplayId: 'narrow', panelWidth: 460 });

    expect(layout?.panel.width).toBe(320);
    expect(layout?.panel.x).toBe(0);
    expect(isInside(layout!.panel, narrow.workArea)).toBe(true);
  });

  test('손잡이보다 좁은 화면에서도 밖으로 나가지 않는다', () => {
    const tiny: SidePinDisplayInfo = { id: 't', workArea: { x: 0, y: 0, width: 10, height: 40 } };
    const layout = layoutOf({ displays: [tiny], primaryDisplayId: 't' });

    expect(layout?.rail.width).toBe(10);
    expect(isInside(layout!.rail, tiny.workArea)).toBe(true);
  });
});

describe('맞닿은 옆 모니터를 침범하지 않는다 (배율 반올림)', () => {
  /** 실기기 배치: 주 175%(물리 2880 → DIP 1646으로 올림), 보조 100%가 오른쪽에 붙음 */
  const MAIN: SidePinDisplayInfo = {
    id: 'main',
    workArea: { x: 0, y: 0, width: 1646, height: 981 },
  };
  const RIGHT: SidePinDisplayInfo = {
    id: 'right',
    workArea: { x: 1646, y: 0, width: 1920, height: 1032 },
  };

  test('오른쪽에 모니터가 맞닿아 있으면 경계에서 1 DIP 물러난다', () => {
    // 1646에 딱 붙이면 물리로 되돌릴 때 2880.5가 되어 옆 화면 첫 칸을 침범한다.
    const layout = layoutOf({ displays: [MAIN, RIGHT], primaryDisplayId: 'main' });

    expect(layout!.rail.x + layout!.rail.width).toBe(1645);
    expect(layout!.panel.x + layout!.panel.width).toBe(1645);
  });

  test('오른쪽이 비어 있으면 끝까지 붙인다 — 가장자리 조준을 지킨다', () => {
    // 커서를 오른쪽 끝까지 밀면 그냥 잡히는 이점은 옆에 화면이 없을 때만 성립한다.
    const layout = layoutOf({ displays: [MAIN], primaryDisplayId: 'main' });

    expect(layout!.rail.x + layout!.rail.width).toBe(1646);
  });

  test('왼쪽에 있는 모니터는 물러날 이유가 없다', () => {
    const layout = layoutOf({ displays: [PRIMARY, LEFT_SECONDARY], primaryDisplayId: '1' });

    expect(layout!.rail.x + layout!.rail.width).toBe(1920);
  });

  test('사이가 떨어져 있으면 맞닿은 것이 아니다', () => {
    const far: SidePinDisplayInfo = {
      id: 'far',
      workArea: { x: 2000, y: 0, width: 1920, height: 1032 },
    };
    const layout = layoutOf({ displays: [MAIN, far], primaryDisplayId: 'main' });

    expect(layout!.rail.x + layout!.rail.width).toBe(1646);
  });

  test('위아래로 완전히 어긋난 모니터도 맞닿은 것이 아니다', () => {
    const above: SidePinDisplayInfo = {
      id: 'above',
      workArea: { x: 1646, y: -1032, width: 1920, height: 1032 },
    };
    const layout = layoutOf({ displays: [MAIN, above], primaryDisplayId: 'main' });

    expect(layout!.rail.x + layout!.rail.width).toBe(1646);
  });
});

describe('OS가 창을 요청보다 크게 만들 때 (실기기 재현)', () => {
  test('넘친 만큼 왼쪽으로 밀어 오른쪽 끝을 지킨다', () => {
    // Windows는 창 최소 폭을 물리 52픽셀로 강제한다. 배율 175%에서 16 DIP를 요청하면
    // 30 DIP가 되고, 오른쪽 끝에 붙인 손잡이는 그만큼 옆 모니터를 침범한다.
    const requested = { x: 1630, y: 407, width: 16, height: 168 };

    const fixed = anchorRightEdge(requested, { width: 30, height: 168 });

    expect(fixed.x).toBe(1616);
    // 오른쪽 끝(1646)은 그대로 — 옆 모니터를 침범하지 않는다
    expect(fixed.x + fixed.width).toBe(requested.x + requested.width);
  });

  test('배율 100% 모니터(최소 52 DIP)에서도 오른쪽 끝을 지킨다', () => {
    const requested = { x: 3550, y: 432, width: 16, height: 168 };

    const fixed = anchorRightEdge(requested, { width: 52, height: 168 });

    expect(fixed.x + fixed.width).toBe(3566);
  });

  test('세로 위치는 건드리지 않는다 — 넘침은 가로에서만 생긴다', () => {
    const requested = { x: 1630, y: 407, width: 16, height: 168 };

    expect(anchorRightEdge(requested, { width: 30, height: 168 }).y).toBe(407);
  });

  test('패널처럼 요청대로 만들어진 창은 그대로 둔다', () => {
    const requested = { x: 1246, y: 0, width: 400, height: 981 };

    expect(anchorRightEdge(requested, { width: 400, height: 981 })).toEqual(requested);
  });
});

describe('AC-18 — 모니터가 사라졌을 때', () => {
  test('고른 모니터가 없으면 주 모니터로 옮기고 대체했다고 알린다', () => {
    const layout = layoutOf({
      displays: [PRIMARY],
      preferredDisplayId: '뽑혀버린-모니터',
    });

    expect(layout?.displayId).toBe('1');
    expect(layout?.usedFallbackDisplay).toBe(true);
  });

  test('고른 모니터가 그대로 있으면 대체가 아니다', () => {
    const layout = layoutOf({
      displays: [PRIMARY, LEFT_SECONDARY],
      preferredDisplayId: '2',
    });

    expect(layout?.usedFallbackDisplay).toBe(false);
  });

  test('고른 적이 없으면 주 모니터를 쓰되 대체로 치지 않는다', () => {
    const layout = layoutOf({ preferredDisplayId: null });

    expect(layout?.displayId).toBe('1');
    expect(layout?.usedFallbackDisplay).toBe(false);
  });

  test('주 모니터 id가 목록에 없어도 남은 모니터로 그린다', () => {
    const layout = layoutOf({
      displays: [LEFT_SECONDARY],
      primaryDisplayId: '없는-주모니터',
      preferredDisplayId: null,
    });

    expect(layout?.displayId).toBe('2');
  });

  test('쓸 수 있는 모니터가 하나도 없으면 null — 호출자는 창을 숨겨야 한다', () => {
    expect(layoutOf({ displays: [] })).toBeNull();
  });

  test('크기가 0인 작업 영역도 null로 거른다', () => {
    const broken: SidePinDisplayInfo = { id: 'b', workArea: { x: 0, y: 0, width: 0, height: 0 } };

    expect(layoutOf({ displays: [broken], primaryDisplayId: 'b' })).toBeNull();
  });
});
