/**
 * 바탕화면 아이콘 아래 모드(native-desktop) 관련 메인 프로세스 타입.
 *
 * Phase 1: 타입 정의만. 실제 manager 구현은 Phase 2(no-op) → PR-2 Phase 4+(win32).
 *
 * 이 파일은 electron/ 하위 main process 코드만 사용한다.
 * renderer 측은 preload.ts가 노출하는 IPC payload 타입을 통해 간접 접근한다.
 */

/** native-desktop 모드 진입/health-check 결과 */
export type DesktopWidgetModeStatus =
  | { ok: true; mode: 'native-desktop' }
  | { ok: false; reason: string; fallbackMode: 'normal' | 'topmost' };

/**
 * native-desktop 모드 fallback 시 renderer로 보내는 IPC payload.
 * 채널: `desktopMode:fallback`.
 */
export interface DesktopModeFallbackEvent {
  /** 진단 로그용 사유 (i18n 미지원, 영문 식별자 권장) */
  readonly reason: string;
  /** 적용된 fallback 모드 */
  readonly fallbackMode: 'normal' | 'topmost';
}

/**
 * Electron DIP(device-independent pixel) 좌표.
 *
 * BrowserWindow.getBounds()가 반환하는 좌표계.
 * scaleFactor로 곱하면 physical pixel이 된다.
 */
export interface DipRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Win32 physical pixel 좌표.
 *
 * LVM_HITTEST 등 Win32 API에 전달되는 좌표계.
 * Math.round로 정수화한 값을 사용한다.
 */
export interface PhysicalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 드래그 경계 제한용 모니터 작업 영역 (physical pixel) + 그 모니터에 적용할 최소 가시량.
 *
 * ★최소 가시량을 rect에 같이 실어 두는 이유: 기준값(헤더 40 · 가로 100)은 **DIP**로 정의되는데
 *   드래그 핫패스는 physical pixel로만 계산한다. 모니터마다 배율이 다르면 환산값도 달라지므로
 *   "어느 모니터의 작업 영역인가"와 "그 모니터에서 몇 physical px인가"는 반드시 함께 다녀야 한다.
 *   (분리해 두면 핫패스에서 배열 인덱스를 맞추다 어긋나기 쉽다.)
 */
export interface PhysicalWorkArea extends PhysicalRect {
  /** 이 모니터에서 헤더가 최소로 남아야 하는 높이 — DIP 기준값을 배율로 환산한 physical px */
  readonly minVisibleHeaderHeight: number;
  /** 이 모니터에서 최소로 걸쳐 있어야 하는 가로 폭 — DIP 기준값을 배율로 환산한 physical px */
  readonly minVisibleWidth: number;
}

/**
 * Phase 7-C — 헤더 드래그 진행 상태.
 *
 * WS_CHILD가 된 widget은 nc drag가 부모(WorkerW)로 흘러 작동 안 함. WH_MOUSE_LL hook
 * callback이 LBUTTONDOWN을 헤더 영역에서 감지하면 본 state를 활성화하고 MOUSEMOVE마다
 * delta를 계산해 SetWindowPos로 widget을 이동시킨다. LBUTTONUP에서 해제.
 *
 * 좌표계:
 *   - startMouse: drag 시작 시점의 physical screen mouse position
 *   - startWidget: drag 시작 시점의 physical screen widget origin
 *   - startBounds: drag 시작 시점의 physical bounds (width/height 보존용)
 *
 * drag 중에는 hook callback이 click 라우팅을 차단해야 함 — sendInputEvent로 가지 않게
 * manager가 분기 처리.
 */
export interface DragState {
  /** drag 활성화 플래그 — false면 모든 drag 분기 skip */
  readonly active: boolean;
  /** drag 시작 시점의 physical screen mouse position */
  readonly startMouse: { readonly x: number; readonly y: number };
  /** drag 시작 시점의 physical screen widget origin (좌상단) */
  readonly startWidget: { readonly x: number; readonly y: number };
  /** drag 시작 시점의 widget physical bounds. width/height 변경 없이 위치만 이동 */
  readonly startBounds: PhysicalRect;
  /** drag 진행 중 MOUSEMOVE 진입 카운트 (진단용 sampling). hot path mutate. */
  moveCount?: number;
  /** 드래그 시 위젯 이탈 방지를 위한 디스플레이 작업 영역들 (physical screen rect) */
  readonly physicalWorkAreas?: readonly PhysicalWorkArea[];
}

/**
 * Phase 7-D — 위젯 가장자리 resize edge 식별자.
 *
 * Widget.tsx의 8개 resize handle DOM과 1:1 매칭. main.ts의 `window:resizeWidget` IPC가
 * 이미 같은 문자열을 받으므로(`edge.includes('right')` 패턴) 동일 컨벤션 유지.
 */
export type ResizeEdge =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/**
 * Phase 7-D — renderer가 main에 등록하는 resize region.
 *
 * dipRect는 widget client area 좌상단 기준 DIP 좌표.
 * manager가 enable/updateWidgetBounds 시점에 PhysicalRect로 변환해 hook callback에서
 * isInsideAnyRect로 즉시 판정 가능하게 한다.
 */
export interface ResizeRegion {
  readonly edge: ResizeEdge;
  readonly dipRect: DipRect;
}

/**
 * Phase 7-D — resize 진행 상태.
 *
 * WS_CHILD가 된 widget은 nc resize가 부모(WorkerW)로 흘러 작동 안 함. WH_MOUSE_LL hook
 * callback이 LBUTTONDOWN을 resize edge에서 감지하면 본 state를 활성화하고 MOUSEMOVE마다
 * delta를 계산해 SetWindowPos로 widget 크기를 조절한다. LBUTTONUP에서 해제.
 *
 * 좌표계:
 *   - startMouse: resize 시작 시점의 physical screen mouse position
 *   - startBounds: resize 시작 시점의 physical bounds (delta 누적 base)
 *   - edge: 어느 가장자리/모서리에서 시작했는가 (방향에 따라 dx/dy 적용 방식 다름)
 *
 * resize 중에는 hook callback이 click 라우팅을 차단해야 함 (drag와 동일).
 */
export interface ResizeState {
  readonly active: boolean;
  readonly edge: ResizeEdge;
  readonly startMouse: { readonly x: number; readonly y: number };
  readonly startBounds: PhysicalRect;
  /** resize 진행 중 MOUSEMOVE 진입 카운트 (진단용 sampling). hot path mutate. */
  moveCount?: number;
}

/**
 * Phase 7-C — DipRect 좌표가 widget client 안의 어느 사각형 안에 있는지 판정.
 *
 * physical screen coordinate p가 PhysicalRect들 중 하나라도 포함하면 true.
 * 빈 배열이면 false. 본 함수는 hot path(MOUSEMOVE)에서 호출되므로 단순 for 루프 inline.
 */
export function isInsideAnyRect(
  p: { readonly x: number; readonly y: number },
  rects: readonly PhysicalRect[],
): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]!;
    if (p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height) {
      return true;
    }
  }
  return false;
}

/**
 * DipRect를 PhysicalRect로 변환한다.
 *
 * - scaleFactor === 1 일 때는 항등 변환.
 * - 모든 결과는 Math.round로 정수화 (1px 이내 오차).
 * - x/y는 좌상단 anchor 기준. width/height는 round(x+w) - round(x)로 누적 오차 최소화.
 *
 * 의존성 없는 순수 함수 — 단위 테스트 가능.
 */
export function dipToPhysical(dip: DipRect, scaleFactor: number): PhysicalRect {
  const x = Math.round(dip.x * scaleFactor);
  const y = Math.round(dip.y * scaleFactor);
  // 우/하단 좌표를 먼저 round한 뒤 차이를 폭/높이로 사용하면 누적 오차가 줄어든다.
  const right = Math.round((dip.x + dip.width) * scaleFactor);
  const bottom = Math.round((dip.y + dip.height) * scaleFactor);
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}
