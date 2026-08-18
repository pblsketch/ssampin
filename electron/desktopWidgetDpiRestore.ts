/**
 * 바탕화면 모드 — 배율이 다른 모니터로 위젯을 옮겼을 때 "보이는 크기"를 지키는 계산.
 *
 * ## 왜 필요한가 (2026-08-18 듀얼 모니터 신고, 실측 근거)
 *
 * 일반 위젯 모드에서 창을 다른 배율의 모니터로 끌면 Windows가 **DIP(논리) 크기를 유지**한 채
 * 물리 픽셀 크기만 배율비만큼 조정한다. 그래서 어느 모니터에서든 위젯이 같은 크기로 보인다.
 *
 * 바탕화면 모드의 위젯은 바탕화면(WorkerW)의 **자식 창**이고 이동을 우리가 직접
 * `SetWindowPos`로 하기 때문에 그 조정이 일어나지 않는다. 실측 결과 두 가지가 함께 어긋난다
 * (`docs/03-analysis/widget-dual-monitor-drag/widget-dual-monitor-drag.analysis.md` §13):
 *
 *   1. **물리 크기가 그대로다** — 175% 모니터에서 1232px이던 창이 100% 모니터에서도 1232px.
 *      같은 위젯이 모니터에 따라 커졌다 작아졌다 한다.
 *   2. **더 나쁜 것 — 그림이 옛 배율에 멈춘다.** Chromium은 배율 변화를 알아채지만
 *      (`devicePixelRatio` 1.75 → 1) 화면 배치는 다시 하지 않아, 1232px 창에 705px만 칠해진다.
 *      투명 창이라 나머지는 빈 공간 → 사용자에게는 **"위젯이 절반만 보인다"** 로 나타난다.
 *
 * 두 문제 모두 **Electron에 DIP 기준 크기를 다시 알려주는 것**(`BrowserWindow.setBounds`)으로
 * 한 번에 풀린다. 이 파일은 "그때 어떤 값을 넘겨야 하는가"만 순수 계산으로 담당한다.
 * (Electron/Win32 호출은 `desktopWidgetManager.ts`가 한다 — 계산과 부작용을 분리해 테스트 가능하게.)
 */

import { fitWidgetSizeToWorkArea } from './desktopWidgetBounds';
import { WIDGET_OVERFLOW_TOLERANCE } from './desktopWidgetTypes';

/** 다시 지정할 DIP 기준 창 영역. `BrowserWindow.setBounds`에 그대로 넘긴다. */
export interface DpiRestoreBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DpiRestoreInput {
  /** 드래그를 시작한 모니터의 배율 (예: 1.75) */
  readonly startScale: number;
  /** 드래그가 끝난 지점 모니터의 배율 (예: 1) */
  readonly endScale: number;
  /** 드래그 시작 시점의 DIP 크기 — 이 크기를 그대로 지켜 준다 */
  readonly startDipSize: { readonly width: number; readonly height: number };
  /** 드래그가 끝난 위치(창 좌상단)를 DIP로 환산한 값 */
  readonly finalDipOrigin: { readonly x: number; readonly y: number };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * 배율이 바뀐 경우에만 "다시 지정할 DIP 영역"을 돌려준다.
 *
 * `null`을 돌려주는 경우 = **아무것도 하지 않아야 하는 경우**:
 *   - 출발·도착 배율이 같다 (같은 모니터 안에서의 이동 — 대부분의 드래그)
 *   - 값이 비정상이다 (0·음수·NaN — 화면 정보를 못 읽은 상황)
 *
 * 아무것도 하지 않는 쪽을 기본값으로 둔 이유: 드래그가 끝날 때마다 `setBounds`를 부르면
 * 소수 배율(예: 175%)에서 `DIP→물리→DIP` 반올림이 한 방향으로 쌓여 위젯이 조금씩 커진다
 * (같은 문서 §10-4의 래칫). 배율이 실제로 바뀐 드래그에서만 개입한다.
 */
export function resolveDpiRestoreBounds(input: DpiRestoreInput): DpiRestoreBounds | null {
  const { startScale, endScale, startDipSize, finalDipOrigin } = input;

  if (!isPositiveFinite(startScale) || !isPositiveFinite(endScale)) return null;
  if (!isPositiveFinite(startDipSize.width) || !isPositiveFinite(startDipSize.height)) return null;
  if (!Number.isFinite(finalDipOrigin.x) || !Number.isFinite(finalDipOrigin.y)) return null;

  // 부동소수 비교 — 1.75 같은 값이 경로에 따라 1.7500000000000002로 들어올 수 있다.
  if (Math.abs(startScale - endScale) < 1e-6) return null;

  return {
    x: Math.round(finalDipOrigin.x),
    y: Math.round(finalDipOrigin.y),
    width: Math.round(startDipSize.width),
    height: Math.round(startDipSize.height),
  };
}

// ────────────────────────────────────────────────────────────
// 드래그 종료 시 최종 크기 결정 — DPI 복구 + "안 들어가면 축소"
// ────────────────────────────────────────────────────────────

export interface DragEndBoundsInput extends DpiRestoreInput {
  /** 드래그가 끝난 시점의 창 영역 (DIP). 배율이 안 바뀐 경우의 기준값이 된다. */
  readonly currentBounds: DpiRestoreBounds;
  /** 도착한 모니터의 작업 영역 (DIP) */
  readonly workArea: DpiRestoreBounds;
  /** OS/앱이 강제하는 최소 창 크기 (DIP) */
  readonly minSize: { readonly width: number; readonly height: number };
  /**
   * 이전에 화면에 안 들어가 줄이기 전의 크기 (DIP). 이번 화면에 들어가면 되살린다.
   * 호출자가 `takePreferredSizeIfFits`로 "들어가는 경우"만 넘겨준다.
   */
  readonly preferredSize?: { readonly width: number; readonly height: number } | null;
}

/** `resolveDragEndBounds` 결과. `bounds`가 null이면 아무것도 하지 않는다. */
export interface DragEndDecision {
  /** 창에 다시 지정할 DIP 영역. null이면 개입하지 않는다. */
  readonly bounds: DpiRestoreBounds | null;
  /**
   * 축소가 일어났다면 **줄이기 전 크기**. 호출자가 이 값을 기억해 두었다가
   * 더 넓은 화면으로 돌아왔을 때 되살린다. 축소가 없었으면 null.
   */
  readonly shrunkFrom: { readonly width: number; readonly height: number } | null;
}

/**
 * 드래그가 끝났을 때 창에 다시 지정할 DIP 영역을 결정한다. `null`이면 아무것도 하지 않는다.
 *
 * 두 가지를 한 번에 처리한다 (setBounds를 두 번 부르면 창이 두 번 튄다):
 *   1. **DPI 복구** — 배율이 바뀐 모니터로 옮겼으면 시작할 때의 DIP 크기를 지킨다
 *      (`resolveDpiRestoreBounds`). 이걸 안 하면 그림이 옛 배율에 멈춰 위젯이 절반만 칠해진다.
 *   2. **안 들어가면 축소** — DIP 크기를 지키면 배율이 높은 모니터에서 실제 크기가 배율비만큼
 *      커진다. 도착 모니터보다 커지면 화면 밖으로 넘쳐 크기 조절 손잡이까지 전부 사라진다.
 *
 * ★배율이 안 바뀐 드래그에도 축소 검사는 한다 — 같은 배율이라도 더 작은 모니터로 옮기면
 *   (2560×1440 → 1920×1080) 똑같이 넘친다.
 * ★넘치지 않고 배율도 그대로면 `null`. 매 드래그마다 setBounds를 부르면 소수 배율에서
 *   DIP→물리→DIP 반올림이 한 방향으로 쌓여 위젯이 조금씩 커진다(래칫).
 */
export function resolveDragEndBounds(input: DragEndBoundsInput): DragEndDecision {
  const { currentBounds, workArea, minSize, preferredSize } = input;

  const restore = resolveDpiRestoreBounds(input);
  const afterRestore = restore ?? currentBounds;

  // 줄이기 전 크기를 되살린다 — 호출자가 "이번 화면에 들어간다"고 확인한 값만 넘어온다.
  // 축소는 그 화면에서만 유효한 임시 조치이므로, 넓은 화면으로 돌아오면 원래 크기를 되찾아야 한다.
  const usedPreferred = Boolean(preferredSize);
  const base = preferredSize
    ? { ...afterRestore, width: preferredSize.width, height: preferredSize.height }
    : afterRestore;

  // ★"넘쳤는가"는 fit 결과 비교가 아니라 **초과량**으로 판정한다.
  //   소수 배율에서는 setBounds가 요청보다 1px 크게 잡히므로(실측), 1px 초과에도 개입하면
  //   줄이려던 보정이 다음 1px을 만들어 창이 계속 커진다(래칫). 상수 주석 참조.
  const overflowWidth = base.width - workArea.width;
  const overflowHeight = base.height - workArea.height;
  const needsShrink =
    overflowWidth > WIDGET_OVERFLOW_TOLERANCE || overflowHeight > WIDGET_OVERFLOW_TOLERANCE;

  if (!needsShrink) {
    if (!restore && !usedPreferred) return { bounds: null, shrunkFrom: null };
    // 크기를 되살린 경우 창이 커졌으므로 화면 밖으로 밀려나지 않게 안으로 넣는다.
    return { bounds: usedPreferred ? containWithin(base, workArea) : base, shrunkFrom: null };
  }

  const sized = fitWidgetSizeToWorkArea(base, workArea, minSize);
  return {
    bounds: containWithin({ ...base, width: sized.width, height: sized.height }, workArea),
    shrunkFrom: { width: base.width, height: base.height },
  };
}

/**
 * 창을 작업 영역 **안에 전부** 들어오도록 위치만 옮긴다.
 *
 * ★`clampWidgetBoundsToWorkArea`(ADR-051)를 쓰면 안 된다. 그 함수의 정책은
 *   "최소 가시량(헤더 40 · 가로 100)만 남으면 통과"라서, 화면 크기로 줄인 창이
 *   여전히 300px쯤 화면 밖에 걸친 채 통과한다(그물에서 실측으로 잡았다).
 *   크기를 화면에 맞춘 상황은 전부 보이게 놓는 것이 옳다.
 */
function containWithin(bounds: DpiRestoreBounds, workArea: DpiRestoreBounds): DpiRestoreBounds {
  const maxX = workArea.x + workArea.width - bounds.width;
  const maxY = workArea.y + workArea.height - bounds.height;
  return {
    x: Math.round(Math.max(workArea.x, Math.min(maxX, bounds.x))),
    y: Math.round(Math.max(workArea.y, Math.min(maxY, bounds.y))),
    width: bounds.width,
    height: bounds.height,
  };
}
