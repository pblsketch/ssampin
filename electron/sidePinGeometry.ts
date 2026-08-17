/**
 * 옆핀 창을 화면 어디에 그릴지 계산한다 — 순수 함수.
 *
 * Electron을 import하지 않고 모니터 정보를 값으로만 받는다. 그래야 모니터 두 대,
 * 음수 좌표 보조 모니터, 125%·150% 배율 같은 경우를 실제 장비 없이 시험할 수 있다.
 * 다중 모니터에서 창이 화면 밖으로 밀리는 것은 이 기능의 가장 큰 위험이라,
 * 계산을 창 조작에서 떼어 두는 것이 중요하다.
 *
 * 좌표는 저장하지 않는다. 펼칠 때마다 지금의 작업 영역을 받아 오른쪽 끝을 다시 계산한다.
 * 모니터를 뺐다 꽂으면 좌표가 통째로 달라지기 때문이다.
 */

/** Windows가 프레임 없는 창에도 적용하는 실측 최소 물리 폭. */
export const SIDE_PIN_RAIL_MIN_PHYSICAL_WIDTH = 52;
/** 화면 배율 정보가 없을 때 쓰는 안전한 손잡이 너비 (DIP). */
export const SIDE_PIN_RAIL_WIDTH = 52;
/** 아이콘이 잘리지 않는 최소 논리 폭. */
const SIDE_PIN_RAIL_MIN_DIP_WIDTH = 30;

/**
 * 접힌 손잡이 높이 (DIP).
 *
 * 작업 영역 전체 높이로 하지 않는 이유가 중요하다. 손잡이 창은 항상 위에 떠 있으므로,
 * 화면 오른쪽 가장자리 전체를 덮으면 **그 줄 전체가 클릭을 가로채는 죽은 구역**이 된다.
 * 최대화한 창의 스크롤바가 바로 거기 있어서, 사용자는 스크롤바를 못 누르게 된다.
 * (v2.3.8 위젯 손잡이 사고 — "겹쳐 보이는 것보다 안 눌리는 게 컸다"와 같은 계열)
 *
 * 그래서 세로 가운데에 짧은 탭으로 둔다. 위젯 구역과 메모 구역을 절반씩 나눠 갖는다.
 */
export const SIDE_PIN_RAIL_HEIGHT = 168;

export interface SidePinRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SidePinDisplayInfo {
  readonly id: string;
  readonly scaleFactor?: number;
  /** 작업 표시줄 등을 뺀 실제로 쓸 수 있는 영역 (DIP) */
  readonly workArea: SidePinRect;
}

export function resolveSidePinRailWidth(scaleFactor: number | undefined): number {
  const scale =
    scaleFactor !== undefined && Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return Math.max(SIDE_PIN_RAIL_MIN_DIP_WIDTH, Math.ceil(SIDE_PIN_RAIL_MIN_PHYSICAL_WIDTH / scale));
}

export interface SidePinLayoutInput {
  readonly displays: readonly SidePinDisplayInfo[];
  readonly primaryDisplayId: string;
  /** 사용자가 고른 모니터. 고르지 않았으면 null */
  readonly preferredDisplayId: string | null;
  /** 이미 360~460으로 정규화된 패널 너비 */
  readonly panelWidth: number;
  /** 0은 맨 위, 1은 맨 아래인 손잡이 위치 (쓸 수 있는 높이 대비 비율) */
  readonly railPosition: number;
}

export interface SidePinLayout {
  readonly displayId: string;
  readonly rail: SidePinRect;
  readonly panel: SidePinRect;
  /**
   * 사용자가 고른 모니터를 찾지 못해 다른 모니터로 대체했는가.
   *
   * 조용히 대체하면 사용자는 "왜 저쪽 화면에 뜨지?"를 알 수 없고, 저장된 설정도
   * 언제 고쳐야 할지 판단할 수 없다. 그래서 대체 여부를 값으로 돌려준다.
   */
  readonly usedFallbackDisplay: boolean;
}

/**
 * 배율이 125%·150%면 작업 영역이 소수로 들어올 수 있다.
 * 창 좌표는 정수여야 경계가 1px씩 어긋나지 않는다.
 */
function roundRect(rect: SidePinRect): SidePinRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

function pickDisplay(input: SidePinLayoutInput): {
  display: SidePinDisplayInfo;
  usedFallbackDisplay: boolean;
} | null {
  const { displays, primaryDisplayId, preferredDisplayId } = input;
  if (displays.length === 0) return null;

  if (preferredDisplayId !== null) {
    const preferred = displays.find((d) => d.id === preferredDisplayId);
    if (preferred !== undefined) return { display: preferred, usedFallbackDisplay: false };
  }

  const primary = displays.find((d) => d.id === primaryDisplayId);
  const display = primary ?? displays[0];
  if (display === undefined) return null;

  // 고른 모니터가 있었는데 못 찾은 경우에만 "대체했다"고 본다.
  return { display, usedFallbackDisplay: preferredDisplayId !== null };
}

/** 오른쪽 끝에 붙이되 작업 영역을 벗어나지 않는 사각형 */
function rightEdgeRect(area: SidePinRect, desiredWidth: number): SidePinRect {
  const width = Math.min(Math.max(1, Math.round(desiredWidth)), area.width);
  return {
    x: area.x + area.width - width,
    y: area.y,
    width,
    height: area.height,
  };
}

/** 오른쪽 끝, 정해진 높이 비율에 놓이는 짧은 탭 */
function rightEdgeTab(
  area: SidePinRect,
  desiredWidth: number,
  desiredHeight: number,
  railPosition: number,
): SidePinRect {
  const width = Math.min(Math.max(1, Math.round(desiredWidth)), area.width);
  const height = Math.min(Math.max(1, Math.round(desiredHeight)), area.height);
  const ratio = Number.isFinite(railPosition) ? Math.min(1, Math.max(0, railPosition)) : 0;
  return {
    x: area.x + area.width - width,
    y: area.y + Math.round((area.height - height) * ratio),
    width,
    height,
  };
}

/**
 * 끌고 있는 동안의 손잡이 윗변을 작업 영역 안에 가둔다.
 *
 * 끄는 중에도 놓을 때도 반올림하지 않는다. 예전에는 8단계로 맞췄는데, 한 칸이
 * 124 DIP라 손을 뗄 때 창이 커서 밑에서 최대 반 칸 빠져나갔다. 그러면 끌기 자리가
 * 손 밑에 없어 **두 번째 끌기가 시작되지 않는다**(2026-08-17 실기기).
 */
export function clampSidePinRailTop(
  workArea: SidePinRect,
  railTop: number,
  railHeight = SIDE_PIN_RAIL_HEIGHT,
): number {
  const area = roundRect(workArea);
  if (!Number.isFinite(railTop)) return area.y;
  const height = Math.min(Math.max(1, Math.round(railHeight)), area.height);
  const maxTop = area.y + Math.max(0, area.height - height);
  return Math.min(maxTop, Math.max(area.y, Math.round(railTop)));
}

/**
 * 놓은 손잡이 윗변을 저장할 비율(0~1)로 바꾼다.
 *
 * `rightEdgeTab`의 역함수다. 반올림이 없으므로 놓은 자리를 그대로 다시 그린다 —
 * 창이 손 밑에서 튀지 않아야 곧바로 다시 끌 수 있다.
 */
export function resolveSidePinRailPositionFromTop(
  workArea: SidePinRect,
  railTop: number,
  railHeight = SIDE_PIN_RAIL_HEIGHT,
): number {
  const area = roundRect(workArea);
  const height = Math.min(Math.max(1, Math.round(railHeight)), area.height);
  const travel = Math.max(0, area.height - height);
  if (travel === 0 || !Number.isFinite(railTop)) return 0;
  const relativeTop = Math.min(travel, Math.max(0, railTop - area.y));
  return relativeTop / travel;
}

/**
 * OS가 창을 요청보다 크게 만들었을 때, **오른쪽 끝을 원래 자리에 고정**하도록 좌표를 고친다.
 *
 * Windows는 창의 최소 폭을 물리 52픽셀로 강제한다(실측: 배율 175%에서 30 DIP, 100%에서
 * 52 DIP). 무엇을 요청하든 그 아래로 내려가지 않으므로 16 DIP짜리 손잡이 창은 만들 수 없다.
 *
 * 손잡이는 화면 오른쪽 끝에 붙으므로, 창이 커지면 **오른쪽으로 넘쳐 옆 모니터를 침범한다.**
 * 커진 만큼 왼쪽으로 밀어 오른쪽 경계를 지킨다.
 */
export function anchorRightEdge(
  requested: SidePinRect,
  actual: { readonly width: number; readonly height: number },
): SidePinRect {
  return {
    x: requested.x + requested.width - actual.width,
    y: requested.y,
    width: actual.width,
    height: actual.height,
  };
}

/**
 * 옆에 다른 모니터가 붙어 있을 때 오른쪽 끝에서 물러나는 여백 (DIP).
 *
 * Electron이 알려주는 작업 영역 너비는 실제 픽셀을 배율로 나눠 **반올림한** 값이다.
 * 배율 175%에서 실제 2880픽셀은 1645.71인데 1646으로 올라온다. 그 1646에 오른쪽 끝을
 * 맞추면 되돌릴 때 2880.5가 되어, 옆 모니터의 첫 칸을 정확히 한 칸 침범한다.
 * (실측 2026-08-14: 창 오른쪽 끝 2881 vs 주 모니터 끝 2880)
 *
 * 배율이 얼마든 이 오차는 1 DIP를 넘지 않으므로 1만큼 물러나면 충분하다.
 */
const NEIGHBOR_SAFETY_INSET = 1;

/**
 * 이 화면의 오른쪽 끝에 다른 모니터가 맞닿아 있는가.
 *
 * 맞닿아 있을 때만 물러나는 이유가 있다. 화면 오른쪽 끝은 원래 커서를 끝까지 밀기만 하면
 * 잡히는 자리라 조준이 필요 없는데, 물러나면 그 이점이 사라진다. 다만 **모니터가 맞닿은
 * 경계에서는 커서가 멈추지 않고 옆 화면으로 그냥 넘어가므로** 애초에 그 이점이 없다.
 * 그러니 한 대만 쓰거나 이 화면이 맨 오른쪽이면 끝까지 붙이고, 맞닿았을 때만 물러난다.
 */
function hasDisplayToTheRight(displays: readonly SidePinDisplayInfo[], area: SidePinRect): boolean {
  const right = area.x + area.width;
  return displays.some((d) => {
    const other = roundRect(d.workArea);
    // 우리 오른쪽 경계 바로 그 자리를 다른 화면이 차지하고 있는가
    if (other.x > right || other.x + other.width <= right) return false;
    // 위아래로 완전히 어긋난 화면은 옆에 있다고 보지 않는다
    return other.y < area.y + area.height && other.y + other.height > area.y;
  });
}

/**
 * 손잡이와 패널의 위치·크기를 계산한다.
 *
 * 쓸 수 있는 모니터가 하나도 없으면 null을 돌려준다. 이때 창을 띄우면 어디에 그릴지
 * 모르는 채로 화면 밖에 남을 수 있으므로, 호출자는 창을 숨겨야 한다.
 */
export function resolveSidePinLayout(input: SidePinLayoutInput): SidePinLayout | null {
  const picked = pickDisplay(input);
  if (picked === null) return null;

  const area = roundRect(picked.display.workArea);
  if (area.width <= 0 || area.height <= 0) return null;

  // 옆 모니터를 침범하지 않도록 오른쪽 경계만 안쪽으로 당긴다 (위치·높이는 그대로).
  const inset = hasDisplayToTheRight(input.displays, area) ? NEIGHBOR_SAFETY_INSET : 0;
  const usable: SidePinRect = { ...area, width: Math.max(1, area.width - inset) };

  return {
    displayId: picked.display.id,
    rail: rightEdgeTab(
      usable,
      resolveSidePinRailWidth(picked.display.scaleFactor),
      SIDE_PIN_RAIL_HEIGHT,
      input.railPosition,
    ),
    panel: rightEdgeRect(usable, input.panelWidth),
    usedFallbackDisplay: picked.usedFallbackDisplay,
  };
}
