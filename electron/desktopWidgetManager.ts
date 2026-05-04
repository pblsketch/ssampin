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

import { screen, type BrowserWindow } from 'electron';
import type {
  DesktopIconZoneBounds,
  DesktopWidgetModeStatus,
} from './desktopIconZoneTypes';
import type { WidgetDragStartInfo } from './platform/win32Desktop';
import { getMouseApi } from './platform/win32Mouse';

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

  /**
   * native-desktop attach 상태에서 screen 좌표 (Electron logical pixel) 로 위젯 이동/리사이즈.
   * 일반 setBounds() 가 SetParent 후 client 좌표로 해석돼 drift 가 나는 문제를 우회.
   * attach 상태가 아니거나 실패 시 false → caller 가 setBounds 로 fallback.
   */
  setWidgetBoundsScreen(x: number, y: number, width: number, height: number): boolean;

  /**
   * native-desktop attach 상태에서 screen 좌표 (Electron logical pixel) 의 현재 위젯 rect 반환.
   * attach 상태가 아니면 null → caller 가 widgetWindow.getBounds() 사용.
   */
  getWidgetBoundsScreen(): { x: number; y: number; width: number; height: number } | null;

  /**
   * 헤더 드래그 종료 시 호출될 콜백 등록 (예: scheduleWidgetBoundsSave).
   * SetParent 후 widgetWindow.on('move') 가 발동하지 않으므로 직접 통지가 필요하다.
   */
  onDragEnd(callback: (() => void) | null): void;

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
    setWidgetBoundsScreen(): boolean {
      return false;
    },
    getWidgetBoundsScreen(): { x: number; y: number; width: number; height: number } | null {
      return null;
    },
    onDragEnd(): void {},
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
  let dragEndCallback: (() => void) | null = null;

  // ─── Polling drag/resize 매니저 (icon-mode 패턴) ───
  // hook 이 헤더/엣지 LBUTTONDOWN 을 감지해 onDragStart 로 전달하면 16ms setInterval 로
  // win32Mouse.isLeftButtonDown 으로 release 감지 + screen.getCursorScreenPoint 로 cursor 추적
  // → setWidgetBoundsScreen 으로 위젯 이동/리사이즈. release 감지 시 자동 종료.
  const MIN_WIDGET_W = 300;
  const MIN_WIDGET_H = 200;
  let dragInterval: ReturnType<typeof setInterval> | null = null;
  let activeDrag: WidgetDragStartInfo | null = null;

  function computeDragBounds(
    info: WidgetDragStartInfo,
    cursorX: number,
    cursorY: number,
  ): { x: number; y: number; width: number; height: number } {
    const dx = cursorX - info.startScreenX;
    const dy = cursorY - info.startScreenY;
    let left = info.startRect.x;
    let top = info.startRect.y;
    let right = info.startRect.x + info.startRect.width;
    let bottom = info.startRect.y + info.startRect.height;
    switch (info.kind) {
      case 'move':
        left += dx;
        top += dy;
        right += dx;
        bottom += dy;
        break;
      case 'resize-n':
        top += dy;
        break;
      case 'resize-s':
        bottom += dy;
        break;
      case 'resize-e':
        right += dx;
        break;
      case 'resize-w':
        left += dx;
        break;
      case 'resize-ne':
        top += dy;
        right += dx;
        break;
      case 'resize-nw':
        top += dy;
        left += dx;
        break;
      case 'resize-se':
        bottom += dy;
        right += dx;
        break;
      case 'resize-sw':
        bottom += dy;
        left += dx;
        break;
    }
    // 최소 크기 강제
    if (right - left < MIN_WIDGET_W) {
      if (info.kind.includes('w')) left = right - MIN_WIDGET_W;
      else right = left + MIN_WIDGET_W;
    }
    if (bottom - top < MIN_WIDGET_H) {
      if (info.kind.includes('n')) top = bottom - MIN_WIDGET_H;
      else bottom = top + MIN_WIDGET_H;
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function stopDragPolling(reason: string): void {
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
    activeDrag = null;
    console.log('[desktopWidgetManager] drag polling stopped:', reason);
    const cb = dragEndCallback;
    if (cb) {
      try {
        cb();
      } catch (e) {
        console.error('[desktopWidgetManager] dragEnd callback error', e);
      }
    }
  }

  function startDragPolling(info: WidgetDragStartInfo): void {
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
    activeDrag = info;
    console.log('[desktopWidgetManager] drag polling start:', info);
    const mouseApi = getMouseApi();
    dragInterval = setInterval(() => {
      if (!activeDrag) {
        if (dragInterval) clearInterval(dragInterval);
        dragInterval = null;
        return;
      }
      // ★ 결정적 release 감지: Win32 GetAsyncKeyState 가 truth source.
      if (!mouseApi.isLeftButtonDown()) {
        stopDragPolling('mouseup-detected');
        return;
      }
      try {
        const cur = screen.getCursorScreenPoint();
        const next = computeDragBounds(activeDrag, cur.x, cur.y);
        controller.setWidgetBoundsScreen(next.x, next.y, next.width, next.height);
      } catch (e) {
        console.error('[desktopWidgetManager] drag tick error', e);
        stopDragPolling('tick-error');
      }
    }, 16);
  }

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
    onDragStart: (info: WidgetDragStartInfo) => {
      // hook 콜백 스레드에서 startDragPolling 직접 호출 가능. (이미 setImmediate 로 dispatch 됨.)
      startDragPolling(info);
    },
    onDragEnd: () => {
      // hook 이 LBUTTONUP 감지 시 호출 — polling 매니저에 즉시 전달 + dragEndCallback 호출.
      // (polling 매니저도 win32Mouse 로 자체 release 감지하므로 양쪽 어느 쪽이 먼저 와도 OK)
      if (activeDrag !== null) {
        stopDragPolling('hook-buttonup');
        return;
      }
      const cb = dragEndCallback;
      if (!cb) return;
      setImmediate(() => {
        try {
          cb();
        } catch (e) {
          console.error('[desktopWidgetManager] onDragEnd error', e);
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
      // 진행 중 polling drag 가 있으면 먼저 정리
      if (dragInterval) {
        clearInterval(dragInterval);
        dragInterval = null;
      }
      activeDrag = null;
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

    setWidgetBoundsScreen(x: number, y: number, width: number, height: number): boolean {
      if (!enabled) return false;
      try {
        return controller.setWidgetBoundsScreen(x, y, width, height);
      } catch (e) {
        console.error('[desktopWidgetManager] setWidgetBoundsScreen error', e);
        return false;
      }
    },

    getWidgetBoundsScreen(): { x: number; y: number; width: number; height: number } | null {
      if (!enabled) return null;
      try {
        return controller.getWidgetBoundsScreen();
      } catch (e) {
        console.error('[desktopWidgetManager] getWidgetBoundsScreen error', e);
        return null;
      }
    },

    onDragEnd(callback: (() => void) | null): void {
      dragEndCallback = callback;
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
