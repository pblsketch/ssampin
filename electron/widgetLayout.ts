/**
 * 위젯 레이아웃(전체·좌우분할·상하분할·4분할·우측사이드) 계산과 활성 상태.
 *
 * ## ★레이아웃은 "크기"가 아니라 "화면과의 관계"다 (2026-08-18 실기기 신고)
 *
 * `full`은 1645×981이 아니라 **그 모니터의 작업 영역 전체**이고, `split-h`는 822가 아니라
 * **그 모니터의 오른쪽 절반**이다. 그래서 위젯을 다른 모니터로 옮기면 **새 모니터 기준으로
 * 다시 계산**해야 한다.
 *
 * 이전 구현은 레이아웃을 적용한 순간의 **크기만** 붙들고 있었다. 그 결과:
 *
 * ```
 * 주(1645×981)에서 Ctrl+1(전체)  →  보조(1920×1032)로 이동  →  1645×981 그대로 = 안 꽉 참
 * ```
 *
 * 크기를 보존하는 규칙(`widgetPreferredSize`)은 **사용자가 직접 정한 자유 크기**에는 맞지만
 * 레이아웃에는 틀리다. 레이아웃이 켜져 있는 동안에는 크기 기억이 아니라 **레이아웃 재적용**이
 * 정답이다.
 *
 * 계산(순수 함수)과 상태를 한 파일에 두되 부작용(Electron 호출)은 호출자가 한다 —
 * `main.ts`(일반 모드)와 `desktopWidgetManager.ts`(바탕화면 모드)가 같은 규칙을 봐야 하므로
 * 상태를 공유 모듈에 둔다. 모드를 오가도 레이아웃이 이어진다.
 */

/** 위젯 레이아웃 모드. Ctrl+1~4 및 컨텍스트 메뉴가 보내는 값과 1:1. */
export type WidgetLayoutMode = 'full' | 'split-h' | 'split-v' | 'quad' | 'sidebar-right';

const LAYOUT_MODES: readonly string[] = ['full', 'split-h', 'split-v', 'quad', 'sidebar-right'];

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutSize {
  readonly width: number;
  readonly height: number;
}

/** 문자열이 알려진 레이아웃 모드인지 판정 (IPC로 임의 문자열이 들어올 수 있다). */
export function isWidgetLayoutMode(value: string): value is WidgetLayoutMode {
  return LAYOUT_MODES.includes(value);
}

/**
 * 주어진 작업 영역에 레이아웃을 적용했을 때의 창 영역을 계산한다 (순수 함수).
 *
 * 좌표는 작업 영역 기준 절대값이므로, **어느 모니터의 작업 영역을 넣느냐가 곧 목적지**다.
 */
export function computeWidgetLayoutBounds(
  mode: WidgetLayoutMode,
  workArea: LayoutRect,
): LayoutRect {
  switch (mode) {
    case 'full':
      // 전체화면: 작업 영역 전체
      return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height };
    case 'split-h':
      // 좌우 분할: 화면 우측 절반
      return {
        x: workArea.x + Math.floor(workArea.width / 2),
        y: workArea.y,
        width: Math.floor(workArea.width / 2),
        height: workArea.height,
      };
    case 'split-v':
      // 상하 분할: 화면 하단 절반
      return {
        x: workArea.x,
        y: workArea.y + Math.floor(workArea.height / 2),
        width: workArea.width,
        height: Math.floor(workArea.height / 2),
      };
    case 'quad':
      // 4분할: 화면 우하단 1/4
      return {
        x: workArea.x + Math.floor(workArea.width / 2),
        y: workArea.y + Math.floor(workArea.height / 2),
        width: Math.floor(workArea.width / 2),
        height: Math.floor(workArea.height / 2),
      };
    case 'sidebar-right':
      // 우측 사이드: 가로 4등분한 우측 1/4 (전체 높이)
      return {
        x: workArea.x + Math.floor((workArea.width * 3) / 4),
        y: workArea.y,
        width: Math.floor(workArea.width / 4),
        height: workArea.height,
      };
  }
}

/**
 * 레이아웃별로 창에 지정해야 하는 최소 크기.
 *
 * ★`sidebar-right`는 1/4 폭(예: 1920→480)이라 기본 minWidth=640에 막힌다. 그대로 두면
 *   OS가 폭을 640으로 늘리고 우측 끝을 벗어나, 화면 밖 보정이 좌측으로 밀어내면서
 *   결과적으로 ~1/3 화면을 덮는 버그가 된다. 그래서 모드별로 최소 크기를 함께 바꾼다.
 *   **레이아웃을 다른 모니터에 재적용할 때도 이 값을 같이 적용해야 한다.**
 */
export function widgetLayoutMinimumSize(mode: WidgetLayoutMode): LayoutSize {
  return mode === 'sidebar-right' ? { width: 220, height: 320 } : { width: 640, height: 480 };
}

/** 레이아웃이 해제된(자유 크기) 상태에서의 최소 크기. */
export const WIDGET_FREE_MINIMUM_SIZE: LayoutSize = { width: 640, height: 480 };

// ────────────────────────────────────────────────────────────
// 활성 레이아웃 상태 — 어떤 레이아웃이 어느 모니터에 적용돼 있는가
// ────────────────────────────────────────────────────────────

interface ActiveLayout {
  readonly mode: WidgetLayoutMode;
  /** 이 레이아웃을 적용한 모니터의 id. 여기서 벗어나면 새 모니터 기준으로 다시 적용한다. */
  readonly displayId: number;
}

let active: ActiveLayout | null = null;

export function setActiveWidgetLayout(mode: WidgetLayoutMode, displayId: number): void {
  active = { mode, displayId };
}

export function getActiveWidgetLayout(): ActiveLayout | null {
  return active;
}

/**
 * 레이아웃 해제 — 사용자가 자유 크기로 돌아갔거나 가장자리를 끌어 크기를 직접 정했을 때.
 * 해제하지 않으면 사용자가 정한 크기가 모니터를 옮길 때마다 레이아웃으로 되돌아간다.
 */
export function clearActiveWidgetLayout(): void {
  active = null;
}

/**
 * 위젯이 `displayId` 모니터에 놓였을 때 레이아웃을 다시 적용해야 하는지 판정한다.
 *
 * `null`이면 아무것도 하지 않는다:
 *   - 활성 레이아웃이 없다 (자유 크기 — 크기 기억 규칙이 담당)
 *   - 레이아웃을 적용한 모니터에 그대로 있다 (같은 모니터 안에서의 이동)
 */
export function resolveLayoutReapply(
  displayId: number,
  workArea: LayoutRect,
): { mode: WidgetLayoutMode; bounds: LayoutRect; minSize: LayoutSize } | null {
  if (!active) return null;
  if (active.displayId === displayId) return null;
  return {
    mode: active.mode,
    bounds: computeWidgetLayoutBounds(active.mode, workArea),
    minSize: widgetLayoutMinimumSize(active.mode),
  };
}
