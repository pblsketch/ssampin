/**
 * 바탕화면 아이콘 아래 모드(native-desktop) high-level manager.
 *
 * 진척도:
 *   - PR-1: 인터페이스 + no-op + IPC fallback 라우팅
 *   - Phase 4-1: koffi load 검증 (FFI 골격)
 *   - Phase 4-2 (현 단계): WorkerW attach/detach + healthCheck
 *   - Phase 5: DPI 변환 + bounds 동기화
 *   - Phase 6: LVM_HITTEST 아이콘 영역 판정
 *   - Phase 7: WH_MOUSE_LL hook + 라우팅
 *
 * Manager는 main process에서 단일 인스턴스로 생성·재사용한다.
 * 라이프사이클 hook 호출 지점:
 *   - applyWidgetSettings: 'native-desktop' 진입 시 enable()
 *   - 모드 전환 (topmost/normal): disable()
 *   - 위젯 close/before-quit: disable() (정리 보장)
 */

import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import type { DesktopWidgetModeStatus, PhysicalRect } from './desktopWidgetTypes';
import { dipToPhysical } from './desktopWidgetTypes';

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
   * Phase 5에서 실제 구현. Phase 4-2 단계에서는 no-op.
   */
  updateWidgetBounds(window: BrowserWindow): void;

  /**
   * 주기적 또는 이벤트성 health check (Win+D, Explorer 재시작, 잠금 복귀 후).
   * 실패 시 ok:false → 호출자가 fallback 처리.
   */
  healthCheck(window: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /** 현재 native-desktop 모드가 active인지 */
  isEnabled(): boolean;

  /**
   * Phase 5+ — 가장 최근 updateWidgetBounds로 캐시된 physical pixel rect.
   *
   * Phase 6/7에서 mouse hook callback이 위젯 영역 hit 판정에 사용한다.
   * 아직 호출된 적 없으면 null.
   */
  getCachedPhysicalBounds(): PhysicalRect | null;
}

/**
 * Manager 팩토리.
 *
 * Win32 + native module 사용 가능하면 win32 전용 manager 반환.
 * 그 외 모든 경우 no-op manager 반환.
 *
 * 절대 throw하지 않는다 — 비Win32, koffi 미설치, native module load 실패 모두 흡수.
 */
export function createDesktopWidgetManager(): DesktopWidgetManager {
  if (process.platform !== 'win32') {
    return createNoopManager('platform-not-win32');
  }

  // win32: koffi-based win32Desktop을 lazy require하고 동작 검증.
  // 검증 실패 시 koffi-load-failed 등 reason으로 no-op fallback.
  let win32Desktop: typeof import('./platform/win32Desktop');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    win32Desktop = require('./platform/win32Desktop') as typeof import('./platform/win32Desktop');
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    console.warn('[desktopWidgetManager] win32Desktop require 실패:', reason);
    return createNoopManager('native-load-failed');
  }

  // koffi/kernel32/user32 load 가능 여부 확인 (실패하면 KoffiLoadError throw).
  try {
    const pidFromFFI = win32Desktop.getCurrentProcessId();
    if (pidFromFFI !== process.pid) {
      console.warn(
        `[desktopWidgetManager] FFI PID 불일치 (ffi=${pidFromFFI}, node=${process.pid}) — no-op fallback`,
      );
      return createNoopManager('koffi-pid-mismatch');
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    const code = e instanceof Error && e.name === 'KoffiLoadError' ? 'koffi-load-failed' : 'native-load-failed';
    console.warn(`[desktopWidgetManager] win32 native load 실패 (${code}):`, reason);
    return createNoopManager(code);
  }

  return createWin32Manager(win32Desktop);
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
    getCachedPhysicalBounds(): PhysicalRect | null {
      return null;
    },
  };
}

/**
 * Win32 전용 manager.
 *
 * Phase 4-2 책임:
 *   - enable(): WorkerW 탐색 → SetParent attach → 핸들 캐시
 *   - disable(): detachFromWorkerW + 핸들 클리어
 *   - healthCheck(): workerW/widgetHwnd가 여전히 valid한지 IsWindow 체크.
 *     실패 시 1회 재attach 시도, 또 실패하면 disable + 'workerw-stale' 보고.
 *   - updateWidgetBounds(): Phase 5에서 추가 구현.
 *
 * 모든 throw는 흡수해 ok:false로 변환한다 (호출자 fallback).
 */
function createWin32Manager(
  win32: typeof import('./platform/win32Desktop'),
): DesktopWidgetManager {
  let handles: import('./platform/win32Desktop').Win32DesktopHandles | null = null;
  let cachedPhysicalBounds: PhysicalRect | null = null;

  function clearHandles(): void {
    if (handles) {
      try {
        win32.detachFromWorkerW(handles);
      } catch (e) {
        // detach는 best-effort — 실패해도 무시
        console.warn('[desktopWidgetManager] detach 중 예외 (무시):', e);
      }
    }
    handles = null;
    cachedPhysicalBounds = null;
  }

  function recalcPhysicalBounds(window: BrowserWindow): PhysicalRect | null {
    if (!window || window.isDestroyed()) {
      return null;
    }
    const dipBounds = window.getBounds();
    // 위젯 중심에 가장 가까운 디스플레이 — 멀티모니터 환경에서 정확한 scaleFactor 선택.
    const display = screen.getDisplayMatching(dipBounds);
    const scaleFactor = display.scaleFactor || 1;
    return dipToPhysical(dipBounds, scaleFactor);
  }

  return {
    async enable(window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      // 중복 호출 방어: 이미 attach 상태면 healthCheck로 위임.
      if (handles) {
        const valid = win32.isWindowAlive(handles.workerW)
          && win32.isWindowAlive(handles.widgetHwnd);
        if (valid) {
          return { ok: true, mode: 'native-desktop' };
        }
        // 핸들 stale → 정리 후 재시도
        clearHandles();
      }

      // 1. 위젯 HWND
      let widgetHwnd: bigint;
      try {
        widgetHwnd = win32.getWidgetHwnd(window);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'getWidgetHwnd-failed';
        console.warn('[desktopWidgetManager] getWidgetHwnd 실패:', reason);
        return { ok: false, reason: 'widget-hwnd-failed', fallbackMode: 'normal' };
      }

      // 2. WorkerW 탐색 (필요 시 spawn 유도)
      let workerW: bigint;
      try {
        workerW = win32.findOrCreateWorkerW();
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'findOrCreateWorkerW-failed';
        console.warn('[desktopWidgetManager] WorkerW 탐색 실패:', reason);
        return { ok: false, reason: 'workerw-not-found', fallbackMode: 'normal' };
      }

      // 3. SetParent attach
      try {
        handles = win32.attachToWorkerW(widgetHwnd, workerW);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'attach-failed';
        console.warn('[desktopWidgetManager] attachToWorkerW 실패:', reason);
        // SetParent는 UAC/무결성 차이로 실패하는 경우가 가장 흔함 → topmost fallback이 더 안전.
        const fallback = e instanceof Error && e.name === 'AttachFailedError' ? 'topmost' : 'normal';
        return { ok: false, reason: 'setparent-denied', fallbackMode: fallback };
      }

      // 4. 초기 physical bounds 캐시 (Phase 5)
      cachedPhysicalBounds = recalcPhysicalBounds(window);

      return { ok: true, mode: 'native-desktop' };
    },

    disable(): void {
      clearHandles();
    },

    updateWidgetBounds(window: BrowserWindow): void {
      // attach 상태가 아니면 캐시 갱신할 의미 없음.
      if (!handles) return;
      cachedPhysicalBounds = recalcPhysicalBounds(window);
    },

    async healthCheck(window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      if (!handles) {
        return { ok: false, reason: 'not-enabled', fallbackMode: 'normal' };
      }

      const workerWAlive = win32.isWindowAlive(handles.workerW);
      const widgetAlive = win32.isWindowAlive(handles.widgetHwnd);

      if (workerWAlive && widgetAlive) {
        return { ok: true, mode: 'native-desktop' };
      }

      // workerW만 stale → Explorer 재시작 흔적. 재attach 시도.
      // widgetHwnd가 stale이면 위젯 창 자체가 destroy된 상황 → disable.
      if (!widgetAlive) {
        clearHandles();
        return { ok: false, reason: 'widget-destroyed', fallbackMode: 'normal' };
      }

      // workerW stale: 1회 재attach
      console.log('[desktopWidgetManager] workerW stale — 재attach 시도');
      clearHandles();

      let widgetHwnd: bigint;
      try {
        widgetHwnd = win32.getWidgetHwnd(window);
      } catch {
        return { ok: false, reason: 'widget-hwnd-failed', fallbackMode: 'normal' };
      }

      try {
        const newWorkerW = win32.findOrCreateWorkerW();
        handles = win32.attachToWorkerW(widgetHwnd, newWorkerW);
        return { ok: true, mode: 'native-desktop' };
      } catch (e) {
        const reason = e instanceof Error ? e.message : 're-attach-failed';
        console.warn('[desktopWidgetManager] healthCheck 재attach 실패:', reason);
        const fallback = e instanceof Error && e.name === 'AttachFailedError' ? 'topmost' : 'normal';
        return { ok: false, reason: 'workerw-stale', fallbackMode: fallback };
      }
    },

    isEnabled(): boolean {
      return handles !== null;
    },

    getCachedPhysicalBounds(): PhysicalRect | null {
      return cachedPhysicalBounds;
    },
  };
}
