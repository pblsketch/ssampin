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
export function resolveDragEndBounds(input: DragEndBoundsInput): DpiRestoreBounds | null {
  const { currentBounds, workArea, minSize } = input;

  const restore = resolveDpiRestoreBounds(input);
  const base = restore ?? currentBounds;

  const sized = fitWidgetSizeToWorkArea(base, workArea, minSize);
  const needsShrink = sized.width !== base.width || sized.height !== base.height;

  if (!restore && !needsShrink) return null;
  if (!needsShrink) return base;

  // 축소했으면 위치도 **화면 안으로 완전히** 되돌린다.
  //
  // ★여기서 `clampWidgetBoundsToWorkArea`를 쓰면 안 된다. 그 함수의 정책은
  //   "최소 가시량(헤더 40 · 가로 100)만 남으면 통과"라서, 화면 크기로 줄인 창이
  //   여전히 300px쯤 화면 밖에 걸친 채 통과한다(그물 `resolveDragEndBounds` 1번 케이스에서 실측).
  //   축소까지 한 상황은 "이 화면에 겨우 들어가는 크기"이므로 전부 보이게 놓는 것이 옳다.
  const maxX = workArea.x + workArea.width - sized.width;
  const maxY = workArea.y + workArea.height - sized.height;
  return {
    x: Math.round(Math.max(workArea.x, Math.min(maxX, sized.x))),
    y: Math.round(Math.max(workArea.y, Math.min(maxY, sized.y))),
    width: sized.width,
    height: sized.height,
  };
}
