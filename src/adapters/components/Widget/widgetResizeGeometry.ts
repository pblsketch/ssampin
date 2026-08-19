/**
 * 위젯 창 크기 조절 손잡이의 기하 — **화면(DOM)과 main 프로세스가 함께 쓰는 단일 정본**.
 *
 * ## 왜 한 곳으로 모았나
 *
 * 예전에는 같은 좌표가 두 군데에 각각 하드코딩돼 있었다: 손잡이 `<div>` 의 style 과,
 * 바탕화면 모드용으로 main 에 등록하는 `setWidgetResizeRegion` 의 rect. 코드에도
 * "정확히 일치해야 함"이라는 주석이 붙어 있었는데, 사람이 지키는 규칙은 언젠가 어긋난다.
 * 어긋나면 **눈에 보이는 자리와 실제로 잡히는 자리가 달라져** 원인 찾기가 매우 어렵다.
 *
 * ## 두께를 왜 키웠나 (2026-08-19 사용자 신고)
 *
 * "테두리를 잡아 크기를 조절하려는데 잘 안 잡혀." 가장자리가 6px 이었다. Windows 기본 창이
 * 대략 8px 안팎을 쓰고, 바탕화면 모드에서는 커서가 ↔ 로 바뀌지 못해(z-order 제약,
 * `desktopWidgetManager.ts` 의 7-D 주석 참조) **띠가 어디 있는지 눈으로 알 수 없다.**
 * 신호가 약할수록 표적은 커야 한다.
 */

/** 위·아래·좌·우 가장자리 띠의 두께 (DIP). */
export const WIDGET_RESIZE_EDGE_THICKNESS = 10;

/** 네 모서리 정사각형의 한 변 (DIP). 대각선 조절은 표적이 더 커야 잡힌다. */
export const WIDGET_RESIZE_CORNER_SIZE = 16;

export const WIDGET_RESIZE_EDGES = [
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;

export type WidgetResizeEdge = (typeof WIDGET_RESIZE_EDGES)[number];

export interface WidgetResizeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 위젯 client 영역(w×h DIP) 안에서 손잡이 8개가 차지하는 자리.
 *
 * 가장자리 띠는 모서리 크기만큼 양끝을 비워 모서리와 겹치지 않게 한다 — 겹치면 대각선
 * 조절을 노렸는데 한 축만 잡히는 일이 생긴다.
 *
 * ★창이 손잡이보다 작아지는 극단(최소 크기 제약이 풀린 환경)에서도 음수 폭을 만들지 않는다.
 */
export function computeWidgetResizeRects(
  width: number,
  height: number,
): Record<WidgetResizeEdge, WidgetResizeRect> {
  const edge = WIDGET_RESIZE_EDGE_THICKNESS;
  const corner = WIDGET_RESIZE_CORNER_SIZE;
  const spanX = Math.max(0, width - corner * 2);
  const spanY = Math.max(0, height - corner * 2);

  return {
    top: { x: corner, y: 0, width: spanX, height: edge },
    bottom: { x: corner, y: height - edge, width: spanX, height: edge },
    left: { x: 0, y: corner, width: edge, height: spanY },
    right: { x: width - edge, y: corner, width: edge, height: spanY },
    'top-left': { x: 0, y: 0, width: corner, height: corner },
    'top-right': { x: width - corner, y: 0, width: corner, height: corner },
    'bottom-left': { x: 0, y: height - corner, width: corner, height: corner },
    'bottom-right': { x: width - corner, y: height - corner, width: corner, height: corner },
  };
}

/** 손잡이별 커서 모양. 일반 위젯 모드에서는 이 값이 그대로 먹는다(바탕화면 모드는 못 먹음). */
export const WIDGET_RESIZE_CURSORS: Record<WidgetResizeEdge, string> = {
  top: 'ns-resize',
  bottom: 'ns-resize',
  left: 'ew-resize',
  right: 'ew-resize',
  'top-left': 'nwse-resize',
  'top-right': 'nesw-resize',
  'bottom-left': 'nesw-resize',
  'bottom-right': 'nwse-resize',
};
