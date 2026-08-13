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

/** 접힌 손잡이 너비 (DIP) — 기획서 §5.1 */
export const SIDE_PIN_RAIL_WIDTH = 16;

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
  /** 작업 표시줄 등을 뺀 실제로 쓸 수 있는 영역 (DIP) */
  readonly workArea: SidePinRect;
}

export interface SidePinLayoutInput {
  readonly displays: readonly SidePinDisplayInfo[];
  readonly primaryDisplayId: string;
  /** 사용자가 고른 모니터. 고르지 않았으면 null */
  readonly preferredDisplayId: string | null;
  /** 이미 360~460으로 정규화된 패널 너비 */
  readonly panelWidth: number;
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

/** 오른쪽 끝, 세로 가운데에 놓이는 짧은 탭 */
function rightEdgeTab(area: SidePinRect, desiredWidth: number, desiredHeight: number): SidePinRect {
  const width = Math.min(Math.max(1, Math.round(desiredWidth)), area.width);
  const height = Math.min(Math.max(1, Math.round(desiredHeight)), area.height);
  return {
    x: area.x + area.width - width,
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
  };
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

  return {
    displayId: picked.display.id,
    rail: rightEdgeTab(area, SIDE_PIN_RAIL_WIDTH, SIDE_PIN_RAIL_HEIGHT),
    panel: rightEdgeRect(area, input.panelWidth),
    usedFallbackDisplay: picked.usedFallbackDisplay,
  };
}
