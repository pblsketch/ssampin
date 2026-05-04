/**
 * 바탕화면 작업판 (native-desktop-mode) — main / preload / renderer 공유 순수 타입.
 *
 * Electron / Node / DOM / React 의존성을 두지 않는다. 본 파일은 IPC 페이로드 모양만을
 * 정의하며, BrowserWindow 같은 런타임 객체는 desktopWidgetManager 측에서 다룬다.
 */

/**
 * 1개 desktop-icon-zone 카드의 화면 위치(physical screen px 기준).
 * renderer 가 ResizeObserver 로 측정한 DOM rect 를 디스플레이 scaleFactor 로 환산해 보낸다.
 *
 * - x/y 는 가상 데스크톱 절대 좌표 (모니터 #1 좌상단을 (0,0) 으로).
 * - width/height 는 항상 양수.
 * - id 는 영속 식별자 — 카드 이름 변경/순서 변경에도 보존된다.
 * - name 은 디버깅/로그용. main 측 라우팅 결정에는 사용하지 않는다.
 */
export interface DesktopIconZoneBounds {
  readonly id: string;
  readonly name: string;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * desktopWidgetManager.enable() / healthCheck() 결과.
 *
 * - ok=true 이면 위젯이 WorkerW 에 정상 attach 된 상태.
 * - ok=false 이면 reason 으로 사용자 토스트를 띄우고 fallbackMode 로 자동 전환된다.
 *   fallbackMode 는 Settings 의 desktopMode 값을 자동으로 갱신하는 용도가 아니라
 *   현재 위젯 BrowserWindow 의 alwaysOnTop 을 즉시 보정하는 데에만 쓰인다.
 */
export type DesktopWidgetModeStatus =
  | { readonly ok: true; readonly mode: 'native-desktop' }
  | {
      readonly ok: false;
      readonly reason: DesktopWidgetEnableFailureReason;
      readonly fallbackMode: 'normal' | 'topmost';
    };

/**
 * enable() / healthCheck() 가 실패할 수 있는 사유.
 * 사용자에게는 한국어 메시지로 변환해 토스트로 노출한다 (UI 측 책임).
 */
export type DesktopWidgetEnableFailureReason =
  | 'not-supported-on-platform' // 비Windows
  | 'not-implemented' // Phase 1 — 아직 win32 manager 미구현 상태
  | 'koffi-load-failed' // Phase 2 진입 후 등장
  | 'workerw-not-found'
  | 'set-parent-failed'
  | 'hook-install-failed'
  | 'widget-not-ready'
  | 'unknown';

/**
 * desktopMode 'native-desktop' 진입 실패 시 main → renderer 알림 페이로드.
 * preload 의 onDesktopModeFallback 이 이 모양으로 dispatch 한다.
 */
export interface DesktopModeFallbackPayload {
  readonly reason: DesktopWidgetEnableFailureReason;
  readonly fallbackMode: 'normal' | 'topmost';
}
