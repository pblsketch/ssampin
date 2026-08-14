import type {
  SidePinPointerRegion,
  SidePinRuntimeState,
} from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinLayout, SidePinRect } from './sidePinGeometry';

const POINTER_HIT_SLOP_DIP = 2;

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

  if (!containsPoint(layout.rail, point)) return 'outside';
  return point.y < layout.rail.y + layout.rail.height / 2 ? 'rail-widget' : 'rail-memo';
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
