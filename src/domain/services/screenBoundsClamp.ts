/**
 * 위젯 윈도우 화면 경계 제한(Clamping) 및 가시성 검증 순수 도메인 서비스.
 *
 * 외부 의존성(Electron/Win32) 없는 순수 계산 로직.
 * 다중 모니터, 음수 좌표계(좌측/상단 모니터), 작업표시줄 제외 작업 영역(workArea)을 지원한다.
 */

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenClampOptions {
  /**
   * 화면 상단/하단 경계에서 최소한 보여야 하는 위젯 상단 헤더의 높이 (기본값: 40px).
   * 이 값보다 아래로 밀려나면 헤더를 마우스로 잡을 수 없게 되므로 clamping한다.
   */
  readonly minVisibleHeaderHeight: number;
  /**
   * 화면 좌측/우측 경계에서 최소한 화면에 걸쳐 있어야 하는 위젯의 가로 폭 (기본값: 100px).
   */
  readonly minVisibleWidth: number;
}

export const DEFAULT_SCREEN_CLAMP_OPTIONS: ScreenClampOptions = {
  minVisibleHeaderHeight: 40,
  minVisibleWidth: 100,
};

/**
 * 위젯이 주어진 화면 작업 영역(WorkArea)을 벗어나지 않도록 좌표를 clamp한다.
 *
 * 규칙:
 * 1. 상단: 위젯 상단이 workArea 상단 위로 뚫고 나가지 않도록 `y >= workArea.y` 보장.
 * 2. 하단: 위젯 상단(헤더)이 workArea 하단에서 최소 `minVisibleHeaderHeight`만큼 남도록 `y <= workArea.y + workArea.height - minVisibleHeaderHeight` 보장.
 * 3. 좌측: 위젯의 오른쪽 끝이 workArea 좌측에서 최소 `minVisibleWidth`만큼 남도록 `x >= workArea.x - bounds.width + minVisibleWidth` 보장.
 * 4. 우측: 위젯의 왼쪽 끝이 workArea 우측에서 최소 `minVisibleWidth`만큼 남도록 `x <= workArea.x + workArea.width - minVisibleWidth` 보장.
 */
export function clampWidgetBoundsToWorkArea(
  bounds: ScreenRect,
  workArea: ScreenRect,
  options?: Partial<ScreenClampOptions>,
): ScreenRect {
  const minHeaderHeight =
    options?.minVisibleHeaderHeight ?? DEFAULT_SCREEN_CLAMP_OPTIONS.minVisibleHeaderHeight;
  const minWidth = options?.minVisibleWidth ?? DEFAULT_SCREEN_CLAMP_OPTIONS.minVisibleWidth;

  const effectiveMinWidth = Math.min(minWidth, bounds.width, workArea.width);
  const effectiveMinHeaderHeight = Math.min(minHeaderHeight, bounds.height, workArea.height);

  const minX = workArea.x - bounds.width + effectiveMinWidth;
  const maxX = workArea.x + workArea.width - effectiveMinWidth;
  const clampedX = Math.max(minX, Math.min(maxX, bounds.x));

  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - effectiveMinHeaderHeight;
  const clampedY = Math.max(minY, Math.min(maxY, bounds.y));

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: bounds.width,
    height: bounds.height,
  };
}

/**
 * 위젯이 화면 작업 영역보다 크면 작업 영역 크기로 축소한다 (위치는 건드리지 않음).
 *
 * ★이 축소가 없으면 위젯이 "크기를 되돌릴 수 없는 상태"로 고착된다:
 *   크기 조절 손잡이는 위젯 우측·하단 모서리에 있는데, 위젯이 화면보다 크면 두 손잡이가
 *   모두 화면 밖에 놓인다. 손잡이를 화면 안으로 끌어오려면 위젯을 위/왼쪽으로 밀어야 하지만
 *   clamp가 `y >= workArea.y`를 강제하므로 하단 손잡이는 영원히 화면 밖에 남는다.
 *   (해상도 하향, 큰 모니터 분리 시 실제로 도달 가능한 상태다.)
 *
 * @param minSize OS/앱이 강제하는 최소 창 크기. 작업 영역이 최소 크기보다 작아도
 *                최소 크기 아래로는 줄이지 않는다(setBounds가 어차피 되돌리므로).
 */
export function fitWidgetSizeToWorkArea(
  bounds: ScreenRect,
  workArea: ScreenRect,
  minSize?: { readonly width: number; readonly height: number },
): ScreenRect {
  const minWidth = Math.max(0, minSize?.width ?? 0);
  const minHeight = Math.max(0, minSize?.height ?? 0);

  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(minWidth, Math.min(bounds.width, workArea.width)),
    height: Math.max(minHeight, Math.min(bounds.height, workArea.height)),
  };
}

/**
 * 위젯을 작업 영역 안에 **통째로** 들여놓는다 (크기는 건드리지 않음).
 *
 * ★`clampWidgetBoundsToWorkArea`와 목적이 다르다. 그쪽은 "최소 가시량만 남으면 통과"라
 *   드래그 중 화면 가장자리에 붙이는 것을 허용하는 느슨한 규칙이다. 그래서 **복구용으로
 *   쓰면 안 된다** — 화면 밖으로 나간 위젯을 넣어 봐야 헤더 40px짜리 띠만 화면 바닥에
 *   남고, 사용자에게는 여전히 "위젯이 안 보인다"이다.
 *   (2026-08-19 신고 실측: 저장값 (-295,1063,1923x1024) → 느슨한 clamp 결과 (-295,992)로
 *    가로는 295px 밖에 나간 채, 세로는 40px만 걸친 채 "복구 완료"가 됐다.)
 *
 * 위젯이 작업 영역보다 큰 경우에는 좌상단에 맞춘다 — 헤더를 잡을 수 있는 쪽을 살린다.
 * 크기 축소가 필요하면 호출 전에 `fitWidgetSizeToWorkArea`를 거칠 것.
 */
export function placeWidgetFullyInsideWorkArea(
  bounds: ScreenRect,
  workArea: ScreenRect,
): ScreenRect {
  const maxX = workArea.x + workArea.width - bounds.width;
  const maxY = workArea.y + workArea.height - bounds.height;

  return {
    x: Math.round(Math.max(workArea.x, Math.min(maxX, bounds.x))),
    y: Math.round(Math.max(workArea.y, Math.min(maxY, bounds.y))),
    width: bounds.width,
    height: bounds.height,
  };
}

/** 기본 위치의 화면 가장자리 여백(px). */
export const WIDGET_DEFAULT_MARGIN = 16;

/**
 * "위젯 위치 초기화"가 되돌릴 자리를 계산한다 — 작업 영역 우측 상단, 여백 `WIDGET_DEFAULT_MARGIN`.
 *
 * ★크기를 한 번만 정하고 그 값으로 위치까지 계산하는 것이 이 함수의 존재 이유다.
 *   예전 구현은 위치를 "현재 위젯 폭"으로 계산하고 실제로는 다른 폭을 적용해서,
 *   폭 1923짜리 위젯을 초기화하면 x = 1920 - 1923 - 16 = -19가 나왔다.
 *   되돌린 자리부터 화면 왼쪽 밖이었다는 뜻이다 (2026-08-19 신고).
 *
 * @param preferredSize 설정에 저장된 위젯 크기. 화면에 안 들어가면 줄인다 — 되돌린 위젯이
 *                      다시 화면 밖으로 삐져나오면 초기화를 한 의미가 없다.
 */
export function resolveWidgetResetBounds(
  preferredSize: { readonly width: number; readonly height: number },
  workArea: ScreenRect,
  minSize?: { readonly width: number; readonly height: number },
): ScreenRect {
  const sized = fitWidgetSizeToWorkArea(
    { x: 0, y: 0, width: preferredSize.width, height: preferredSize.height },
    workArea,
    minSize,
  );

  return placeWidgetFullyInsideWorkArea(
    {
      x: workArea.x + workArea.width - sized.width - WIDGET_DEFAULT_MARGIN,
      y: workArea.y + WIDGET_DEFAULT_MARGIN,
      width: sized.width,
      height: sized.height,
    },
    workArea,
  );
}

/**
 * 위젯이 특정 화면 작업 영역(WorkArea) 내에서 충분히 조작 가능한 상태(가시 영역에 헤더가 존재)인지 검사.
 */
export function isWidgetVisibleInWorkArea(
  bounds: ScreenRect,
  workArea: ScreenRect,
  options?: Partial<ScreenClampOptions>,
): boolean {
  const minHeaderHeight =
    options?.minVisibleHeaderHeight ?? DEFAULT_SCREEN_CLAMP_OPTIONS.minVisibleHeaderHeight;
  const minWidth = options?.minVisibleWidth ?? DEFAULT_SCREEN_CLAMP_OPTIONS.minVisibleWidth;

  // 헤더가 workArea의 y 범위 안에 들어와 있는지 검사
  const headerMinY = workArea.y;
  const headerMaxY = workArea.y + workArea.height - Math.min(minHeaderHeight, bounds.height);
  if (bounds.y < headerMinY || bounds.y > headerMaxY) {
    return false;
  }

  // 가로 방향 교차 영역 폭 계산
  const overlapLeft = Math.max(bounds.x, workArea.x);
  const overlapRight = Math.min(bounds.x + bounds.width, workArea.x + workArea.width);
  const overlapWidth = overlapRight - overlapLeft;

  return overlapWidth >= Math.min(minWidth, bounds.width);
}

/**
 * 위젯과 화면 작업 영역 사이의 교차 면적(Intersection Area)을 계산.
 */
export function getIntersectionArea(rectA: ScreenRect, rectB: ScreenRect): number {
  const left = Math.max(rectA.x, rectB.x);
  const right = Math.min(rectA.x + rectA.width, rectB.x + rectB.width);
  const top = Math.max(rectA.y, rectB.y);
  const bottom = Math.min(rectA.y + rectA.height, rectB.y + rectB.height);

  if (right <= left || bottom <= top) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

/**
 * 다중 모니터 환경에서 위젯과 가장 많이 겹치거나 가장 가까운 작업 영역을 선택한다.
 */
export function findBestWorkAreaForBounds<T extends ScreenRect>(
  bounds: ScreenRect,
  workAreas: readonly T[],
): T | null {
  if (workAreas.length === 0) return null;
  if (workAreas.length === 1) return workAreas[0]!;

  // 1차: 교차 면적이 가장 큰 작업 영역
  let bestArea: T | null = null;
  let maxOverlap = 0;

  for (const wa of workAreas) {
    const overlap = getIntersectionArea(bounds, wa);
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestArea = wa;
    }
  }

  if (bestArea && maxOverlap > 0) {
    return bestArea;
  }

  // 2차: 교차하지 않는 경우 위젯 중심과 가장 가까운 작업 영역 선택
  const widgetCenterX = bounds.x + bounds.width / 2;
  const widgetCenterY = bounds.y + bounds.height / 2;

  let minDistanceSq = Number.POSITIVE_INFINITY;
  let closestArea: T = workAreas[0]!;

  for (const wa of workAreas) {
    const waCenterX = wa.x + wa.width / 2;
    const waCenterY = wa.y + wa.height / 2;
    const dx = widgetCenterX - waCenterX;
    const dy = widgetCenterY - waCenterY;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      closestArea = wa;
    }
  }

  return closestArea;
}
