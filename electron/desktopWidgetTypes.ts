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
