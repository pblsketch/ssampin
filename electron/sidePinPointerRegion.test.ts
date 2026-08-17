import { describe, expect, test } from 'vitest';
import type { SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinLayout } from './sidePinGeometry';
import {
  resolveSidePinHoverArm,
  resolveSidePinPointerRegion,
  shouldIgnoreSidePinRailMouse,
  shouldRecoverSidePinRail,
} from './sidePinPointerRegion';

const LAYOUT: SidePinLayout = {
  displayId: 'primary',
  rail: { x: 1868, y: 456, width: 52, height: 168 },
  panel: { x: 1520, y: 0, width: 400, height: 1080 },
  usedFallbackDisplay: false,
};

const ACTIVE_STATE: Pick<SidePinRuntimeState, 'enabled' | 'protectedReason' | 'surface'> = {
  enabled: true,
  protectedReason: null,
  surface: 'collapsed',
};

describe('resolveSidePinPointerRegion', () => {
  test('비활성화되었거나 보호 중이면 항상 바깥으로 판정한다', () => {
    const point = { x: 1900, y: 500 };

    expect(resolveSidePinPointerRegion(point, LAYOUT, { ...ACTIVE_STATE, enabled: false })).toBe(
      'outside',
    );
    expect(
      resolveSidePinPointerRegion(point, LAYOUT, {
        ...ACTIVE_STATE,
        protectedReason: 'lock',
      }),
    ).toBe('outside');
    expect(resolveSidePinPointerRegion(point, null, ACTIVE_STATE)).toBe('outside');
  });

  test('접힌 손잡이의 위·아래 버튼을 각각 위젯과 메모로 구분한다', () => {
    expect(resolveSidePinPointerRegion({ x: 1900, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1900, y: 580 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-memo',
    );
  });

  test('손잡이 창 안이어도 버튼·끌기 자리 밖의 투명 영역은 바깥으로 판정한다', () => {
    // 위 끝(456~474)과 아래 끝(606~624)은 아무것도 없는 투명 영역이다
    expect(resolveSidePinPointerRegion({ x: 1900, y: 460 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
    expect(resolveSidePinPointerRegion({ x: 1900, y: 470 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
    expect(resolveSidePinPointerRegion({ x: 1900, y: 610 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
  });

  test('두 버튼 사이 가운데는 끌어 옮기는 자리다', () => {
    // rail 456~624, 가운데 540. 끌기 자리는 32 높이라 524~556.
    expect(resolveSidePinPointerRegion({ x: 1900, y: 540 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-grip',
    );
    expect(resolveSidePinPointerRegion({ x: 1900, y: 526 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-grip',
    );
    expect(resolveSidePinPointerRegion({ x: 1900, y: 554 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-grip',
    );
  });

  test('★버튼과 끌기 자리는 손잡이 폭을 통째로 받는다 — 화면 맨 끝이 죽으면 안 된다', () => {
    // 예전에는 가운데 44 DIP만 받아 좌우 4 DIP씩이 클릭 통과였다. 그 오른쪽 4 DIP가
    // 하필 화면의 맨 끝이라, 마우스를 끝까지 밀어 잡는 가장 자연스러운 동작이
    // 안 먹었다(2026-08-17 실기기).
    const rightEdge = LAYOUT.rail.x + LAYOUT.rail.width - 1; // 1919
    expect(resolveSidePinPointerRegion({ x: rightEdge, y: 540 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-grip',
    );
    expect(resolveSidePinPointerRegion({ x: rightEdge, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: LAYOUT.rail.x, y: 580 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-memo',
    );
  });

  test('버튼과 끌기 자리의 슬롭이 겹치는 한 줄에서는 여는 쪽이 이긴다', () => {
    // 위 버튼 슬롭은 474~522, 끌기 자리 슬롭은 522~558. 522는 둘 다에 걸린다.
    expect(resolveSidePinPointerRegion({ x: 1900, y: 522 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1900, y: 558 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-memo',
    );
  });

  test('손잡이가 짧아 버튼 사이에 여유가 없으면 끌기 자리를 만들지 않는다', () => {
    const shortRail: SidePinLayout = { ...LAYOUT, rail: { ...LAYOUT.rail, height: 80 } };

    // 버튼 두 개가 40씩 맞물려 손잡이를 가득 채운다 — 가운데에 남는 공간이 없다
    expect(resolveSidePinPointerRegion({ x: 1900, y: 496 }, shortRail, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
  });

  test.each(['opening', 'expanded', 'closing'] as const)(
    '%s 중에는 창 표시 여부와 무관하게 고정된 패널 영역을 사용한다',
    (surface) => {
      expect(
        resolveSidePinPointerRegion({ x: 1900, y: 500 }, LAYOUT, {
          ...ACTIVE_STATE,
          surface,
        }),
      ).toBe('panel-widget');
    },
  );

  test('열린 패널 영역을 벗어나면 바깥으로 판정한다', () => {
    expect(
      resolveSidePinPointerRegion({ x: 1400, y: 500 }, LAYOUT, {
        ...ACTIVE_STATE,
        surface: 'expanded',
      }),
    ).toBe('outside');
  });

  test('화면 배율 반올림으로 생기는 2 DIP 경계 오차만 흡수한다', () => {
    // 손잡이는 1868~1920. 슬롭 2를 더해 1866~1922까지만 받는다.
    expect(resolveSidePinPointerRegion({ x: 1922, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1923, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
    expect(resolveSidePinPointerRegion({ x: 1866, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1865, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
  });
});

describe('shouldIgnoreSidePinRailMouse', () => {
  test('접힌 손잡이의 버튼·끌기 자리 밖에서만 클릭을 통과시킨다', () => {
    expect(shouldIgnoreSidePinRailMouse(ACTIVE_STATE, 'outside', false)).toBe(true);
    expect(shouldIgnoreSidePinRailMouse(ACTIVE_STATE, 'rail-widget', false)).toBe(false);
    expect(shouldIgnoreSidePinRailMouse(ACTIVE_STATE, 'rail-memo', false)).toBe(false);
    // 끌기 자리는 펼침을 예약하지 않지만 마우스는 받아야 한다 — 여기서 끌기가 시작된다
    expect(shouldIgnoreSidePinRailMouse(ACTIVE_STATE, 'rail-grip', false)).toBe(false);
  });

  test('드래그 중이거나 보호·비활성·패널 상태이면 클릭 통과를 켜지 않는다', () => {
    expect(shouldIgnoreSidePinRailMouse(ACTIVE_STATE, 'outside', true)).toBe(false);
    expect(
      shouldIgnoreSidePinRailMouse({ ...ACTIVE_STATE, enabled: false }, 'outside', false),
    ).toBe(false);
    expect(
      shouldIgnoreSidePinRailMouse({ ...ACTIVE_STATE, protectedReason: 'lock' }, 'outside', false),
    ).toBe(false);
    expect(
      shouldIgnoreSidePinRailMouse({ ...ACTIVE_STATE, surface: 'expanded' }, 'outside', false),
    ).toBe(false);
  });
});

describe('resolveSidePinHoverArm', () => {
  test('평소에는 판정을 그대로 넘긴다', () => {
    expect(resolveSidePinHoverArm(true, 'rail-widget')).toEqual({
      region: 'rail-widget',
      armed: true,
    });
  });

  test('놓은 직후 손잡이 위에 남은 커서로는 펼치지 않는다', () => {
    // 놓는 순간 창이 가장 가까운 칸으로 맞춰지며 커서가 여는 버튼 위에 남는다.
    // 그대로 두면 손잡이를 옮길 때마다 패널이 열린다.
    expect(resolveSidePinHoverArm(false, 'rail-widget')).toEqual({
      region: 'rail-grip',
      armed: false,
    });
    expect(resolveSidePinHoverArm(false, 'rail-memo')).toEqual({
      region: 'rail-grip',
      armed: false,
    });
  });

  test('커서가 손잡이를 완전히 벗어나면 다시 열 수 있게 무장한다', () => {
    expect(resolveSidePinHoverArm(false, 'outside')).toEqual({ region: 'outside', armed: true });
  });

  test('패널이 열려 있는 상태의 판정은 가로채지 않는다', () => {
    expect(resolveSidePinHoverArm(false, 'panel-widget')).toEqual({
      region: 'panel-widget',
      armed: true,
    });
  });
});

describe('shouldRecoverSidePinRail', () => {
  const state = {
    ...ACTIVE_STATE,
    pendingHostOperations: [],
  };

  test('접힌 상태에서 손잡이 창이 숨거나 파괴되면 복구한다', () => {
    expect(shouldRecoverSidePinRail(state, true, false)).toBe(true);
    expect(shouldRecoverSidePinRail(state, false, false)).toBe(true);
  });

  test('정상 표시·패널 열림·보호 상태·이미 복구 중일 때는 중복 복구하지 않는다', () => {
    expect(shouldRecoverSidePinRail(state, true, true)).toBe(false);
    expect(shouldRecoverSidePinRail({ ...state, surface: 'expanded' }, true, false)).toBe(false);
    expect(shouldRecoverSidePinRail({ ...state, protectedReason: 'lock' }, true, false)).toBe(
      false,
    );
    expect(
      shouldRecoverSidePinRail(
        {
          ...state,
          pendingHostOperations: [
            {
              operationId: 'recovering',
              kind: 'ensure-rail',
              requestedRevision: 1,
            },
          ],
        },
        false,
        false,
      ),
    ).toBe(false);
  });
});
