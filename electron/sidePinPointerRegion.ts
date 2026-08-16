import type {
  SidePinPointerRegion,
  SidePinRuntimeState,
} from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinLayout, SidePinRect } from './sidePinGeometry';

const POINTER_HIT_SLOP_DIP = 2;
export const SIDE_PIN_RAIL_CLICK_TARGET_SIZE = 44;

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

  const upperTarget = railClickTarget(layout.rail, 0.25);
  if (containsPoint(upperTarget, point)) return 'rail-widget';

  const lowerTarget = railClickTarget(layout.rail, 0.75);
  return containsPoint(lowerTarget, point) ? 'rail-memo' : 'outside';
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
