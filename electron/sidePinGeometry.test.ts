/**
 * 옆핀 창 위치 계산 테스트 — 기획서 AC-17·AC-18.
 *
 * 실제 장비 없이 다중 모니터·음수 좌표·배율을 시험하기 위해 모니터 정보를 값으로 넣는다.
 */
import { describe, expect, test } from 'vitest';
import {
  SIDE_PIN_RAIL_HEIGHT,
  SIDE_PIN_RAIL_WIDTH,
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
  test('손잡이는 오른쪽 끝, 세로 가운데에 짧은 탭으로 놓인다', () => {
    const layout = layoutOf();

    expect(layout?.rail).toEqual({
      x: 1920 - SIDE_PIN_RAIL_WIDTH,
      y: Math.round((1040 - SIDE_PIN_RAIL_HEIGHT) / 2),
      width: SIDE_PIN_RAIL_WIDTH,
      height: SIDE_PIN_RAIL_HEIGHT,
    });
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
    expect(layout?.rail.x).toBe(-1600 + 1600 - SIDE_PIN_RAIL_WIDTH);
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
