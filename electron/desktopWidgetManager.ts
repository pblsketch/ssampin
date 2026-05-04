/**
 * 바탕화면 작업판 (native-desktop-mode) — DesktopWidgetManager.
 *
 * Phase 1 (현재): no-op manager 만 제공. 비Windows + Windows 모두 즉시 fallback 을
 * 반환하며, 위젯의 alwaysOnTop / 일반 동작은 단 한 줄도 변경하지 않는다.
 * 이로써 Phase 1 코드를 모든 플랫폼에 안전하게 출하할 수 있다.
 *
 * Phase 2 (Windows native, 후속 PR):
 *   - electron/platform/win32Desktop.ts 에 koffi 기반 Win32 FFI wrapper 추가
 *   - createWin32DesktopWidgetManager() 가 WorkerW attach + WH_MOUSE_LL hook 수행
 *   - 본 파일의 createDesktopWidgetManager() 가 process.platform 기준으로 분기
 *
 * 보안:
 *   - 외부 통신 0건. 자격증명 수집 0건.
 *   - 본 manager 는 사용자 데이터(파일, 아이콘)를 직접 보지 않으며,
 *     DOM rect 좌표만 수신해 hit-test 결정에 사용한다 (Phase 2).
 */

import type { BrowserWindow } from 'electron';
import type {
  DesktopIconZoneBounds,
  DesktopWidgetModeStatus,
} from './desktopIconZoneTypes';

export interface DesktopWidgetManager {
  /**
   * native-desktop 모드 진입 시도.
   * 실패하면 ok=false 를 반환하고 위젯은 호출자가 책임지고 fallback 모드로 보정한다.
   * 본 메서드는 widgetWindow.setAlwaysOnTop 등 윈도우 자체를 수정하지 않는다.
   */
  enable(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /**
   * native-desktop 모드 종료. WorkerW detach + hook 해제 + cache clear.
   * 다중 호출 안전(Phase 2 win32 구현 단계에서도 동일 보장).
   * 비활성 상태에서 호출해도 예외를 던지지 않는다.
   */
  disable(): void;

  /**
   * 위젯 BrowserWindow 의 bounds 가 변경됐을 때 manager 의 캐시를 갱신한다.
   * Phase 2: hook 콜백이 widget bounds 캐시를 hit-test 에 사용하므로 즉시 갱신 필요.
   * Phase 1 (no-op): 호출만 받고 무시.
   */
  updateWidgetBounds(widgetWindow: BrowserWindow): void;

  /**
   * desktop-icon-zone 카드의 pass-through 영역을 갱신한다.
   * renderer 에서 throttle 30Hz 로 들어오며, invalid rect (width/height ≤ 0) 는 호출자가 거른다.
   */
  setPassThroughZones(zones: readonly DesktopIconZoneBounds[]): void;

  /**
   * 모든 zone 을 pass-through 대상에서 해제한다.
   * 위젯이 hide/destroy 되거나 모드를 전환할 때 호출.
   */
  clearPassThroughZones(): void;

  /**
   * Win+D / Explorer 재시작 / 디스플레이 변경 등 후 attach 상태가 살아있는지 점검.
   * 깨졌으면 enable() 을 다시 시도하며, 그래도 실패하면 ok=false 를 반환한다.
   */
  healthCheck(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /** 현재 manager 가 활성 상태인지. UI 가 토글 상태 표시 용도로 사용. */
  isEnabled(): boolean;
}

/**
 * 비Windows / Phase 1 에서 사용하는 no-op manager.
 *
 * 모든 메서드가 즉시 안전하게 종료되며, enable / healthCheck 는 ok=false 를 반환해
 * 호출자가 fallback 모드로 보정하도록 신호한다.
 */
function createNoOpDesktopWidgetManager(
  reason: 'not-supported-on-platform' | 'not-implemented',
): DesktopWidgetManager {
  return {
    async enable(): Promise<DesktopWidgetModeStatus> {
      return {
        ok: false,
        reason,
        fallbackMode: 'normal',
      };
    },

    disable(): void {
      // no-op (Phase 2 에서 attach/hook 정리)
    },

    updateWidgetBounds(): void {
      // no-op
    },

    setPassThroughZones(): void {
      // no-op (Phase 2 에서 cache 갱신)
    },

    clearPassThroughZones(): void {
      // no-op
    },

    async healthCheck(): Promise<DesktopWidgetModeStatus> {
      return {
        ok: false,
        reason,
        fallbackMode: 'normal',
      };
    },

    isEnabled(): boolean {
      return false;
    },
  };
}

/**
 * 플랫폼·구현 단계에 맞는 DesktopWidgetManager 인스턴스를 만든다.
 *
 * - 비Windows: 항상 no-op('not-supported-on-platform')
 * - Windows + Phase 1: no-op('not-implemented') — Phase 2 PR 에서 win32 구현으로 교체
 * - Windows + Phase 2 (TODO): require('./platform/win32Desktop') 를 통해 win32 manager 로딩
 */
export function createDesktopWidgetManager(): DesktopWidgetManager {
  if (process.platform !== 'win32') {
    return createNoOpDesktopWidgetManager('not-supported-on-platform');
  }
  // Phase 2 진입점:
  //   try {
  //     const { createWin32DesktopWidgetManager } = require('./platform/win32Desktop');
  //     return createWin32DesktopWidgetManager();
  //   } catch (e) {
  //     console.error('[desktopWidgetManager] win32 manager load failed', e);
  //     return createNoOpDesktopWidgetManager('not-implemented');
  //   }
  return createNoOpDesktopWidgetManager('not-implemented');
}
