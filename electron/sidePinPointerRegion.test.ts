import { describe, expect, test } from 'vitest';
import type { SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinLayout } from './sidePinGeometry';
import { resolveSidePinPointerRegion, shouldRecoverSidePinRail } from './sidePinPointerRegion';

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

  test('접힌 손잡이의 위·아래 영역을 각각 위젯과 메모로 구분한다', () => {
    expect(resolveSidePinPointerRegion({ x: 1900, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1900, y: 580 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-memo',
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
    expect(resolveSidePinPointerRegion({ x: 1922, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe(
      'rail-widget',
    );
    expect(resolveSidePinPointerRegion({ x: 1923, y: 500 }, LAYOUT, ACTIVE_STATE)).toBe('outside');
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
