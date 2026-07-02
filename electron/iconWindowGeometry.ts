/**
 * iconWindowGeometry — 아이콘 모드 창의 확장/축소 기하 계산 (순수 함수).
 *
 * 배경(v2.2.7 창 구조 재설계):
 *   아이콘 창은 평소 64×64(핀만)로 떠 있지만, 말풍선·팝오버·메뉴 같은 UI는
 *   그보다 크다. 기존에는 창이 항상 64×64라 이 UI들이 전부 창 밖에 그려져
 *   보이지 않는 잠복 버그가 있었다(2026-07-02 실화면 진단).
 *   해법: UI가 필요할 때만 창을 확장한다. 이때 핀의 "화면상 위치"는 절대
 *   움직이지 않아야 하므로, 확장 방향은 화면 여유 공간에 따라 결정하고
 *   핀은 확장된 창의 한쪽 모서리에 고정된다.
 *
 * 좌표계: Electron screen 좌표 (workArea 기준 클램프).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 확장 시 UI가 열리는 방향.
 * - up=true    : 핀이 창 하단에 위치, UI는 핀 위쪽으로 열림 (기본)
 * - right=true : 핀이 창 우측에 위치, UI는 왼쪽으로 정렬 (기본)
 */
export interface IconAnchor {
  up: boolean;
  right: boolean;
}

/** 확장 창 크기 — 팝오버(약 300×460, 수업·할일 목록 스크롤 포함) + 핀(64) + 여백 */
export const ICON_EXPANDED_W = 340;
export const ICON_EXPANDED_H = 560;

/**
 * 핀(compact) 사각형을 기준으로 확장 창 사각형과 열림 방향을 계산.
 * 핀의 화면 위치는 불변 — 창이 핀 반대 방향으로 자라난다.
 * 화면(workArea) 밖으로 나가면 방향을 뒤집는다.
 */
export function computeExpandedBounds(
  pin: Rect,
  workArea: Rect,
): { bounds: Rect; anchor: IconAnchor } {
  // 기본: 위로 + 오른쪽 정렬 (핀 = 창의 우하단)
  let up = true;
  let right = true;

  // 위로 확장할 공간이 부족하면 아래로
  if (pin.y + pin.height - ICON_EXPANDED_H < workArea.y) {
    // 아래로 확장 가능 여부까지 보고, 둘 다 부족하면 그나마 여유가 큰 쪽
    const spaceAbove = pin.y + pin.height - workArea.y;
    const spaceBelow = workArea.y + workArea.height - pin.y;
    up = spaceAbove >= spaceBelow;
  }
  // 왼쪽으로 확장할 공간이 부족하면 오른쪽으로
  if (pin.x + pin.width - ICON_EXPANDED_W < workArea.x) {
    const spaceLeft = pin.x + pin.width - workArea.x;
    const spaceRight = workArea.x + workArea.width - pin.x;
    right = spaceLeft >= spaceRight;
  }

  const bounds: Rect = {
    x: right ? pin.x + pin.width - ICON_EXPANDED_W : pin.x,
    y: up ? pin.y + pin.height - ICON_EXPANDED_H : pin.y,
    width: ICON_EXPANDED_W,
    height: ICON_EXPANDED_H,
  };

  return { bounds, anchor: { up, right } };
}

/**
 * 확장 창 사각형 + 방향에서 핀(compact) 사각형을 역산.
 * 확장 상태에서 위치 저장/화면 이탈 검사를 할 때 "진짜 핀 위치"가 필요하다.
 */
export function pinFromExpanded(expanded: Rect, anchor: IconAnchor, pinSize: number): Rect {
  return {
    x: anchor.right ? expanded.x + expanded.width - pinSize : expanded.x,
    y: anchor.up ? expanded.y + expanded.height - pinSize : expanded.y,
    width: pinSize,
    height: pinSize,
  };
}
