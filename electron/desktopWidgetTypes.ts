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
    if (
      p.x >= r.x
      && p.x < r.x + r.width
      && p.y >= r.y
      && p.y < r.y + r.height
    ) {
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
