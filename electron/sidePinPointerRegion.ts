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

/**
 * 손잡이를 놓은 직후에는 그 자리에서 펼치지 않는다.
 *
 * 놓는 순간 창은 가장 가까운 8단계 자리로 맞춰지므로, 손이 있던 곳과 창이 최대
 * 반 칸(수십 DIP) 어긋난다. 그러면 커서가 여는 버튼 위에 남아 **옮길 때마다
 * 패널이 열린다.** 커서가 손잡이를 완전히 벗어나야 다시 열 수 있게 한다.
 *
 * 여는 버튼 자리를 `rail-grip`으로 바꿔 돌려주므로, 창은 계속 마우스를 받아
 * 클릭으로 여는 길과 다시 끄는 길은 그대로 열려 있다.
 */
export function resolveSidePinHoverArm(
  armed: boolean,
  region: SidePinPointerRegion,
): { readonly region: SidePinPointerRegion; readonly armed: boolean } {
  if (armed) return { region, armed: true };
  if (isSidePinRailRegion(region)) return { region: 'rail-grip', armed: false };
  return { region, armed: true };
}

function isSidePinRailRegion(region: SidePinPointerRegion): boolean {
  return region === 'rail-widget' || region === 'rail-memo' || region === 'rail-grip';
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

  const height = Math.min(SIDE_PIN_RAIL_GRIP_HEIGHT, available);
  return {
    x: rail.x,
    y: rail.y + rail.height / 2 - height / 2,
    width: rail.width,
    height,
  };
}

/**
 * 여닫는 버튼과 끌기 자리는 **손잡이 폭을 통째로** 쓴다.
 *
 * 예전에는 44 DIP만 받고 좌우 4 DIP씩을 클릭 통과로 뒀는데, 그 오른쪽 4 DIP가
 * 하필 **화면의 맨 끝**이다. 가장자리 손잡이는 마우스를 화면 끝까지 밀어 잡는 것이
 * 자연스러운 동작이라, 가장 자주 노리는 자리가 안 눌렸다(2026-08-17 실기기).
 *
 * 클릭 통과의 이득은 어차피 세로 여백에서 나온다 — 스크롤바는 이미 44 DIP 판정에
 * 가려져 있었으므로 폭을 넓혀도 잃는 것이 없다.
 */
function railClickTarget(rail: SidePinRect, verticalRatio: number): SidePinRect {
  const height = Math.min(SIDE_PIN_RAIL_CLICK_TARGET_SIZE, rail.height / 2);
  return {
    x: rail.x,
    y: rail.y + rail.height * verticalRatio - height / 2,
    width: rail.width,
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
