/**
 * 바탕화면 작업판 (native-desktop-mode) — DesktopWidgetManager.
 *
 * Phase 3.0 (외부 데스크톱 위젯 패턴 이식):
 *   - Windows: 메인 widgetWindow 자체를 Explorer WorkerW 자식으로 attach.
 *   - WH_MOUSE_LL hook + LVM_HITTEST 원격 hit-test 로 폴더 위 클릭은 explorer 양보,
 *     빈 영역 클릭은 PostMessageW 로 위젯에 전달, mousemove 는 IPC 로 renderer 에 전달.
 *   - 비Windows: no-op manager.
 *
 * 보안: 외부 통신 0건, koffi (prebuilt FFI) + user32/kernel32 만 사용.
 */

import type { BrowserWindow } from 'electron';
import type {
  DesktopIconZoneBounds,
  DesktopWidgetModeStatus,
} from './desktopIconZoneTypes';

export interface DesktopWidgetManager {
  /**
   * native-desktop 모드 진입 시도.
   * widgetWindow 를 직접 WorkerW 에 attach 하고 hook + 원격 hit-test 인프라를 설치.
   * 실패 시 호출자가 fallback 모드로 보정한다.
   */
  enable(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /**
   * native-desktop 모드 종료. SetParent(NULL) + hook 해제 + 원격 메모리 해제 + style 복구.
   * 다중 호출 안전.
   */
  disable(): void;

  /**
   * 위젯 BrowserWindow 의 bounds 가 변경됐을 때 hook 의 widgetRect 캐시를 갱신.
   */
  updateWidgetBounds(widgetWindow: BrowserWindow): void;

  /** 후방 호환 — Phase 3.0 에서는 no-op (zone hit-test 는 LVM_HITTEST 로 통합됨). */
  setPassThroughZones(zones: readonly DesktopIconZoneBounds[]): void;
  clearPassThroughZones(): void;

  /**
   * Win+D / Explorer 재시작 / 디스플레이 변경 후 attach 상태가 살아있는지 점검.
   * 깨졌으면 자동 재 enable.
   */
  healthCheck(widgetWindow: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  isEnabled(): boolean;
}

function createNoOpDesktopWidgetManager(
  reason: 'not-supported-on-platform' | 'not-implemented' | 'koffi-load-failed',
): DesktopWidgetManager {
  return {
    async enable(): Promise<DesktopWidgetModeStatus> {
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    disable(): void {},
    updateWidgetBounds(): void {},
    setPassThroughZones(): void {},
    clearPassThroughZones(): void {},
    async healthCheck(): Promise<DesktopWidgetModeStatus> {
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    isEnabled(): boolean {
      return false;
    },
  };
}

function createWin32DesktopWidgetManager(): DesktopWidgetManager {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./platform/win32Desktop') as typeof import('./platform/win32Desktop');
  const controller = mod.createWin32WidgetController();
  let enabled = false;
  let attachedWindow: import('electron').BrowserWindow | null = null;

  const buildHandlers = (window: import('electron').BrowserWindow) => ({
    onMouseMove: (clientX: number, clientY: number) => {
      // hook 콜백 안에서 직접 Electron API 호출 시 타이밍/스레드 이슈가 있어 setImmediate.
      setImmediate(() => {
        try {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send('widget-mousemove', { x: clientX, y: clientY });
          }
        } catch {
          /* swallow */
        }
      });
    },
    onMouseWheel: (clientX: number, clientY: number, deltaY: number) => {
      setImmediate(() => {
        try {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send('widget-wheel', { x: clientX, y: clientY, deltaY });
          }
        } catch {
          /* swallow */
        }
      });
    },
    onMouseLeave: () => {
      setImmediate(() => {
        try {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
            window.webContents.send('widget-mouseleave');
          }
        } catch {
          /* swallow */
        }
      });
    },
  });

  return {
    async enable(window): Promise<DesktopWidgetModeStatus> {
      if (enabled) return { ok: true, mode: 'native-desktop' };
      const result = controller.enable(window, buildHandlers(window));
      if (!result.ok) {
        const fallbackMode: 'normal' | 'topmost' =
          result.reason === 'set-parent-failed' ? 'topmost' : 'normal';
        const reasonMap: Record<
          string,
          'workerw-not-found' | 'set-parent-failed' | 'hook-install-failed' | 'unknown'
        > = {
          'workerw-not-found': 'workerw-not-found',
          'set-parent-failed': 'set-parent-failed',
          'hook-install-failed': 'hook-install-failed',
        };
        return {
          ok: false,
          reason: reasonMap[result.reason] ?? 'unknown',
          fallbackMode,
        };
      }
      enabled = true;
      attachedWindow = window;
      return { ok: true, mode: 'native-desktop' };
    },

    disable(): void {
      try {
        controller.disable(attachedWindow);
      } catch (e) {
        console.error('[desktopWidgetManager] disable() error', e);
      }
      enabled = false;
      attachedWindow = null;
    },

    updateWidgetBounds(_window): void {
      if (!enabled) return;
      try {
        controller.refreshWidgetBounds();
      } catch (e) {
        console.error('[desktopWidgetManager] updateWidgetBounds error', e);
      }
    },

    setPassThroughZones(): void {
      // Phase 3.0: zone 단위 hit-test 는 폐기 (LVM_HITTEST 가 픽셀 단위로 처리).
    },

    clearPassThroughZones(): void {
      // 동일.
    },

    async healthCheck(window): Promise<DesktopWidgetModeStatus> {
      if (!enabled) {
        return { ok: false, reason: 'unknown', fallbackMode: 'normal' };
      }
      if (controller.isAttached()) {
        return { ok: true, mode: 'native-desktop' };
      }
      console.log('[desktopWidgetManager] healthCheck: detached, retry enable');
      try {
        controller.disable(attachedWindow);
      } catch {
        /* swallow */
      }
      enabled = false;
      attachedWindow = null;
      const result = controller.enable(window, buildHandlers(window));
      if (!result.ok) {
        const fallbackMode: 'normal' | 'topmost' =
          result.reason === 'set-parent-failed' ? 'topmost' : 'normal';
        return { ok: false, reason: 'unknown', fallbackMode };
      }
      enabled = true;
      attachedWindow = window;
      return { ok: true, mode: 'native-desktop' };
    },

    isEnabled(): boolean {
      return enabled;
    },
  };
}

export function createDesktopWidgetManager(): DesktopWidgetManager {
  if (process.platform !== 'win32') {
    return createNoOpDesktopWidgetManager('not-supported-on-platform');
  }
  try {
    return createWin32DesktopWidgetManager();
  } catch (e) {
    console.error('[desktopWidgetManager] win32 manager load failed — falling back to no-op', e);
    return createNoOpDesktopWidgetManager('koffi-load-failed');
  }
}
