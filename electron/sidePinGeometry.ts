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

import type { SidePinDisplayHint } from './sidePinDeviceState';

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
  /**
   * 모니터 이름 (Electron `Display.label`).
   *
   * 번호가 바뀌었을 때 같은 모니터를 알아보는 데 쓴다. Windows에서는 비어 있거나
   * 기계적인 이름이 오기도 해서 **있으면 쓰고 없으면 자리로 가른다.**
   */
  readonly label?: string;
  /**
   * 작업 표시줄을 포함한 전체 화면 영역 (DIP). 없으면 작업 영역으로 대신한다.
   *
   * 대조에 작업 영역이 아니라 이쪽을 쓰는 이유가 있다. 작업 표시줄을 숨김으로
   * 바꾸기만 해도 작업 영역은 달라지는데, 그렇다고 모니터가 바뀐 것은 아니다.
   */
  readonly bounds?: SidePinRect;
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
  /**
   * 고른 모니터를 번호 없이 다시 찾기 위한 단서. 없으면 번호로만 찾는다.
   *
   * 번호는 재부팅·케이블 재연결로 바뀔 수 있다. 이것이 없으면 같은 모니터가
   * 그대로 꽂혀 있는데도 "사라졌다"고 판정해 주 모니터로 밀려난다.
   */
  readonly preferredDisplayHint?: SidePinDisplayHint | null;
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
   *
   * ⚠️ 대체했다고 해서 **저장값을 고치면 안 된다**(ADR-075). 케이블을 뽑을 때마다
   * 사용자의 선택이 지워진다. 대체는 이번 실행에만 적용한다.
   */
  readonly usedFallbackDisplay: boolean;
  /**
   * 저장된 번호로는 못 찾았지만 단서로 **같은 모니터를 다시 찾은** 경우의 새 번호.
   * 그런 일이 없었으면 null.
   *
   * 이때는 가리키는 대상이 그대로이므로 저장된 번호를 갱신해도 선택을 잃지 않는다.
   * 위의 `usedFallbackDisplay`(다른 모니터로 밀려난 경우)와 반드시 구분해야 한다.
   */
  readonly rematchedDisplayId: string | null;
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

/** 대조 기준이 되는 영역 — 전체 화면 영역이 있으면 그것, 없으면 작업 영역. */
function displayArea(display: SidePinDisplayInfo): SidePinRect {
  return roundRect(display.bounds ?? display.workArea);
}

/**
 * 지금 이 모니터를 나중에 다시 찾기 위한 단서로 만든다.
 *
 * 사용자가 모니터를 고르는 순간 한 번 만들어 저장하고, 그 뒤로는 이 값으로만 대조한다.
 */
export function buildSidePinDisplayHint(display: SidePinDisplayInfo): SidePinDisplayHint {
  const area = displayArea(display);
  return {
    label: (display.label ?? '').trim(),
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  };
}

/** 크기와 자리가 단서와 같은가 */
function matchesHintGeometry(display: SidePinDisplayInfo, hint: SidePinDisplayHint): boolean {
  const area = displayArea(display);
  return (
    area.width === hint.width &&
    area.height === hint.height &&
    area.x === hint.x &&
    area.y === hint.y
  );
}

/**
 * 번호가 바뀌었을 때 단서로 같은 모니터를 다시 찾는다.
 *
 * **후보가 둘 이상이면 포기한다(null).** 같은 모델을 두 대 쓰면 이름도 크기도 같아서
 * 구별할 수 없는데, 그때 아무거나 고르면 사용자는 자기가 고르지 않은 화면에 옆핀이
 * 뜬 이유를 알 수 없다. 못 찾아도 저장값은 그대로 남으므로, 다음에 제대로 가려지면
 * 원래 모니터로 돌아온다 — 조용히 틀리는 것보다 낫다.
 */
function findDisplayByHint(
  displays: readonly SidePinDisplayInfo[],
  hint: SidePinDisplayHint,
): SidePinDisplayInfo | null {
  const onlyOne = (candidates: readonly SidePinDisplayInfo[]): SidePinDisplayInfo | null =>
    candidates.length === 1 ? (candidates[0] ?? null) : null;

  if (hint.label !== '') {
    const byLabel = displays.filter((d) => (d.label ?? '') === hint.label);
    const unique = onlyOne(byLabel);
    if (unique !== null) return unique;
    // 이름이 같은 모니터가 여럿이면(같은 모델 두 대) 자리로 한 번 더 가른다.
    if (byLabel.length > 1) return onlyOne(byLabel.filter((d) => matchesHintGeometry(d, hint)));
  }

  return onlyOne(displays.filter((d) => matchesHintGeometry(d, hint)));
}

interface PickedDisplay {
  readonly display: SidePinDisplayInfo;
  readonly usedFallbackDisplay: boolean;
  readonly rematchedDisplayId: string | null;
}

function pickDisplay(input: SidePinLayoutInput): PickedDisplay | null {
  const { displays, primaryDisplayId, preferredDisplayId } = input;
  if (displays.length === 0) return null;

  if (preferredDisplayId !== null) {
    const preferred = displays.find((d) => d.id === preferredDisplayId);
    if (preferred !== undefined) {
      return { display: preferred, usedFallbackDisplay: false, rematchedDisplayId: null };
    }

    // 번호가 안 맞는다고 곧바로 "사라졌다"로 보지 않는다. 생김새로 한 번 더 찾는다.
    const hint = input.preferredDisplayHint ?? null;
    if (hint !== null) {
      const rematched = findDisplayByHint(displays, hint);
      if (rematched !== null) {
        return { display: rematched, usedFallbackDisplay: false, rematchedDisplayId: rematched.id };
      }
    }
  }

  const primary = displays.find((d) => d.id === primaryDisplayId);
  const display = primary ?? displays[0];
  if (display === undefined) return null;

  // 고른 모니터가 있었는데 못 찾은 경우에만 "대체했다"고 본다.
  return {
    display,
    usedFallbackDisplay: preferredDisplayId !== null,
    rematchedDisplayId: null,
  };
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
    rematchedDisplayId: picked.rematchedDisplayId,
  };
}
