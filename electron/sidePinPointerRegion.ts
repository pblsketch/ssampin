import type {
  SidePinPointerRegion,
  SidePinRuntimeState,
} from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinLayout, SidePinRect } from './sidePinGeometry';

const POINTER_HIT_SLOP_DIP = 2;
export const SIDE_PIN_RAIL_CLICK_TARGET_SIZE = 44;
/**
 * 손잡이를 끌어 옮기는 자리의 높이.
 *
 * 위·아래 버튼(각 44)은 rail 높이의 25%·75%에 놓이므로, 기본 168 높이에서 둘 사이에
 * 40 DIP가 빈다. 그 안에 32를 잡아 버튼과 겹치지 않게 한다.
 */
export const SIDE_PIN_RAIL_GRIP_HEIGHT = 32;

type PointerState = Pick<SidePinRuntimeState, 'enabled' | 'protectedReason' | 'surface'>;

type RailHealthState = Pick<
  SidePinRuntimeState,
  'enabled' | 'pendingHostOperations' | 'protectedReason' | 'surface'
>;

export function shouldRecoverSidePinRail(
  state: RailHealthState,
  railExists: boolean,
  railVisible: boolean,
): boolean {
  return (
    state.enabled &&
    state.protectedReason === null &&
    state.surface === 'collapsed' &&
    !state.pendingHostOperations.some((operation) => operation.kind === 'ensure-rail') &&
    (!railExists || !railVisible)
  );
}

export function resolveSidePinPointerRegion(
  point: { readonly x: number; readonly y: number },
  layout: SidePinLayout | null,
  state: PointerState,
): SidePinPointerRegion {
  if (!state.enabled || state.protectedReason !== null || layout === null) return 'outside';

  if (state.surface !== 'collapsed') {
    return containsPoint(layout.panel, point) ? 'panel-widget' : 'outside';
  }

  // 버튼을 먼저 본다. 슬롭(2 DIP) 때문에 버튼과 끌기 자리의 경계가 맞닿는데,
  // 그 한 줄에서는 여는 쪽이 이겨야 한다 — 옮기기보다 여는 일이 훨씬 잦다.
  const upperTarget = railClickTarget(layout.rail, 0.25);
  if (containsPoint(upperTarget, point)) return 'rail-widget';

  const lowerTarget = railClickTarget(layout.rail, 0.75);
  if (containsPoint(lowerTarget, point)) return 'rail-memo';

  const gripTarget = railGripTarget(layout.rail);
  if (gripTarget !== null && containsPoint(gripTarget, point)) return 'rail-grip';

  return 'outside';
}

/** 접힌 손잡이의 실제 버튼 밖에서는 아래 창이 클릭을 받는다. */
export function shouldIgnoreSidePinRailMouse(
  state: PointerState,
  region: SidePinPointerRegion,
  dragging: boolean,
): boolean {
  return (
    !dragging &&
    state.enabled &&
    state.protectedReason === null &&
    state.surface === 'collapsed' &&
    region === 'outside'
  );
}

/**
 * 위·아래 버튼 사이에 남는 공간에 놓는 끌기 자리.
 *
 * 남는 공간이 없을 만큼 손잡이가 짧으면 `null`을 돌려준다 — 그때는 끌기 자리가
 * 아예 없고, 버튼 밖은 전부 아래 창으로 클릭이 통과한다.
 */
function railGripTarget(rail: SidePinRect): SidePinRect | null {
  const buttonHeight = Math.min(SIDE_PIN_RAIL_CLICK_TARGET_SIZE, rail.height / 2);
  const available = rail.height / 2 - buttonHeight;
  if (available <= 0) return null;

  const width = Math.min(SIDE_PIN_RAIL_CLICK_TARGET_SIZE, rail.width);
  const height = Math.min(SIDE_PIN_RAIL_GRIP_HEIGHT, available);
  return {
    x: rail.x + (rail.width - width) / 2,
    y: rail.y + rail.height / 2 - height / 2,
    width,
    height,
  };
}

function railClickTarget(rail: SidePinRect, verticalRatio: number): SidePinRect {
  const width = Math.min(SIDE_PIN_RAIL_CLICK_TARGET_SIZE, rail.width);
  const height = Math.min(SIDE_PIN_RAIL_CLICK_TARGET_SIZE, rail.height / 2);
  return {
    x: rail.x + (rail.width - width) / 2,
    y: rail.y + rail.height * verticalRatio - height / 2,
    width,
    height,
  };
}

function containsPoint(
  bounds: SidePinRect,
  point: { readonly x: number; readonly y: number },
): boolean {
  return (
    point.x >= bounds.x - POINTER_HIT_SLOP_DIP &&
    point.x <= bounds.x + bounds.width + POINTER_HIT_SLOP_DIP &&
    point.y >= bounds.y - POINTER_HIT_SLOP_DIP &&
    point.y <= bounds.y + bounds.height + POINTER_HIT_SLOP_DIP
  );
}
