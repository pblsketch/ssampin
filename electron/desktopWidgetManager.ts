/**
 * 바탕화면 아이콘 아래 모드(native-desktop) high-level manager.
 *
 * Phase 2: no-op 구현만 제공한다.
 *   - 비Win32: 항상 ok:false, fallbackMode:'normal' 반환
 *   - Win32: 현재는 'not-implemented' 사유로 ok:false (Phase 4+에서 win32Desktop.ts로 위임)
 *
 * Manager는 main process에서 단일 인스턴스로 생성·재사용한다.
 * 라이프사이클 hook 호출 지점:
 *   - applyWidgetSettings: 'native-desktop' 진입 시 enable()
 *   - 모드 전환 (topmost/normal): disable()
 *   - 위젯 close/before-quit: disable() (정리 보장)
 */

import type { BrowserWindow } from 'electron';
import type { DesktopWidgetModeStatus } from './desktopWidgetTypes';

export interface DesktopWidgetManager {
  /**
   * native-desktop 모드 활성화 시도.
   *
   * 성공 시 mode='native-desktop' 상태로 전환되며, 위젯은 WorkerW 자식으로 attach된다.
   * 실패 시 ok:false + fallbackMode를 반환하고 호출자(main.ts)는 settings.desktopMode를
   * fallbackMode로 정정 + `desktopMode:fallback` IPC를 발사해야 한다.
   */
  enable(window: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /**
   * native-desktop 모드 해제. 부모/스타일 복구, mouse hook 해제, 메모리 정리.
   * 이미 비활성 상태에서도 안전하게 호출 가능 (idempotent).
   */
  disable(): void;

  /**
   * 위젯 위치/크기 변경 시 native bounds 동기화.
   * Phase 5에서 실제 구현. Phase 2 no-op은 무시.
   */
  updateWidgetBounds(window: BrowserWindow): void;

  /**
   * 주기적 또는 이벤트성 health check (Win+D, Explorer 재시작, 잠금 복귀 후).
   * 실패 시 ok:false → 호출자가 fallback 처리.
   */
  healthCheck(window: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /** 현재 native-desktop 모드가 active인지 */
  isEnabled(): boolean;
}

/**
 * Manager 팩토리.
 *
 * Win32 + native module 사용 가능하면 platform/win32Desktop으로 위임할 예정(PR-2 Phase 4+).
 * 그 외 모든 경우 no-op manager 반환.
 *
 * 절대 throw하지 않는다 — 비Win32, koffi 미설치, native module load 실패 모두 흡수.
 */
export function createDesktopWidgetManager(): DesktopWidgetManager {
  if (process.platform !== 'win32') {
    return createNoopManager('platform-not-win32');
  }

  // PR-2 Phase 4-1: koffi-based win32Desktop.ts를 lazy require하고, 단순 동작 검증
  // (getCurrentProcessId)을 수행한다. 검증 통과 시에도 아직 native attach는 미구현이므로
  // 'not-implemented' no-op을 반환한다. WorkerW attach는 Phase 4-2에서 추가된다.
  //
  // try/catch로 감싸 동적 require / FFI 바인딩 실패 시에도 앱이 죽지 않도록 한다.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const win32Desktop = require('./platform/win32Desktop') as typeof import('./platform/win32Desktop');
    // 골격 검증: koffi/kernel32/user32 load 가능 여부와 함수 바인딩 동작 확인.
    // 실패 시 KoffiLoadError를 throw하므로 catch로 흡수한다.
    const pidFromFFI = win32Desktop.getCurrentProcessId();
    const pidFromNode = process.pid;
    if (pidFromFFI !== pidFromNode) {
      console.warn(
        `[desktopWidgetManager] FFI PID 불일치 (ffi=${pidFromFFI}, node=${pidFromNode}) — no-op fallback`,
      );
      return createNoopManager('koffi-pid-mismatch');
    }
    // Phase 4-2에서 createWin32DesktopWidgetManager(win32Desktop)로 교체.
    return createNoopManager('not-implemented');
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    const code = e instanceof Error && e.name === 'KoffiLoadError' ? 'koffi-load-failed' : 'native-load-failed';
    console.warn(`[desktopWidgetManager] win32 native load 실패 (${code}):`, reason);
    return createNoopManager(code);
  }
}

/**
 * No-op manager. 모든 enable() 호출이 ok:false를 반환한다.
 *
 * 호출자는 fallbackMode를 적용하고 사용자에게 토스트로 안내해야 한다.
 * disable/updateWidgetBounds/healthCheck는 모두 안전하게 no-op.
 */
function createNoopManager(reason: string): DesktopWidgetManager {
  let active = false; // 항상 false. 일관성 위해 변수만 둔다.

  return {
    async enable(_window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      // active를 true로 만들지 않는다 — no-op은 실제 attach가 없으므로.
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    disable(): void {
      active = false;
    },
    updateWidgetBounds(_window: BrowserWindow): void {
      // no-op
    },
    async healthCheck(_window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    isEnabled(): boolean {
      return active;
    },
  };
}
