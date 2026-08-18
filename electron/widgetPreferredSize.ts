/**
 * 위젯의 "줄이기 전 크기" 기억 (DIP).
 *
 * ## 왜 필요한가 (2026-08-18 실기기 확인)
 *
 * 배율이 다른 모니터로 옮길 때 화면에 안 들어가면 화면 크기로 줄인다(ADR-053).
 * 그런데 줄인 크기가 그대로 굳어서, 원래 크기가 들어가는 넓은 화면으로 돌아와도
 * 되살아나지 않았다. 실측:
 *
 * ```
 * 보조(1920×1032)를 꽉 채움  →  주(1646×981)로 이동  →  1646×981로 축소 (여기까지는 옳다)
 *                            →  다시 보조로 이동     →  1648×983 그대로 = 화면이 남는다
 * ```
 *
 * 사용자에게는 "왕복했더니 위젯이 작아져 있다"로 보인다. **축소는 그 화면에서만 유효한
 * 임시 조치여야 하고, 들어갈 수 있는 화면으로 돌아오면 원래 크기를 되찾아야 한다.**
 *
 * ## 규칙
 *
 * - 축소가 일어날 때 **줄이기 전 크기**를 기억한다. 이미 기억된 값이 있으면 덮어쓰지 않는다
 *   (연속 축소 시 최초의 "사용자가 의도한 크기"를 지켜야 하므로).
 * - 새 화면에 그 크기가 들어가면 되살리고 기억을 비운다.
 * - 사용자가 크기를 **직접** 정하면(레이아웃 단축키·가장자리 드래그) 기억을 비운다.
 *   그러지 않으면 오래된 큰 크기가 엉뚱한 때 되살아난다.
 *
 * 상태를 이 모듈에 두는 이유: 일반 위젯 모드(main.ts)와 바탕화면 모드
 * (desktopWidgetManager.ts)가 같은 창을 다루므로 두 경로가 같은 기억을 봐야 한다.
 * 모드를 오가며 옮겨도 크기가 이어진다.
 */

export interface WidgetSize {
  readonly width: number;
  readonly height: number;
}

interface WorkAreaSize {
  readonly width: number;
  readonly height: number;
}

let preferredSize: WidgetSize | null = null;

/**
 * 축소 직전 크기를 기억한다. 이미 기억이 있으면 **덮어쓰지 않는다.**
 *
 * 덮어쓰지 않는 이유: 주 → 보조 → 주 처럼 여러 번 옮기는 동안 중간의 "이미 줄어든 크기"가
 * 원본을 밀어내면, 되살릴 크기가 매번 작아져 결국 원래 크기를 영영 잃는다.
 */
export function rememberSizeBeforeFit(size: WidgetSize): void {
  if (preferredSize) return;
  if (!(size.width > 0) || !(size.height > 0)) return;
  preferredSize = { width: size.width, height: size.height };
}

/**
 * 기억한 크기가 주어진 작업 영역에 들어가면 그 크기를 돌려주고 기억을 비운다.
 * 안 들어가면 기억을 그대로 두고 `null`을 돌려준다(더 넓은 화면에서 되살릴 기회를 남긴다).
 */
export function takePreferredSizeIfFits(workArea: WorkAreaSize): WidgetSize | null {
  if (!preferredSize) return null;
  if (preferredSize.width > workArea.width || preferredSize.height > workArea.height) {
    return null;
  }
  const size = preferredSize;
  preferredSize = null;
  return size;
}

/** 사용자가 크기를 직접 정했을 때 호출 — 오래된 기억이 되살아나지 않게 한다. */
export function clearPreferredSize(): void {
  preferredSize = null;
}

/** 진단·테스트용 — 기억 상태를 소비하지 않고 들여다본다. */
export function peekPreferredSize(): WidgetSize | null {
  return preferredSize;
}
