/**
 * Win32 FFI wrapper — 바탕화면 작업판 (native-desktop-mode) Phase 2.2 (옵션 B).
 *
 * Phase 2.1 의 두 결함:
 *   1. WH_MOUSE_LL 의 `return 1n` 이 OS input pipeline 을 죽여 커서가 위젯 영역으로
 *      진입조차 못 함 (visual freeze)
 *   2. PostMessageW 합성 메시지는 Chromium pointer pipeline 을 깨우지 못함
 *
 * Phase 2.2 해결:
 *   - **메인 위젯은 attach 하지 않는다.** 별도 `desktopZoneWindow` (BrowserWindow,
 *     transparent fullscreen) 를 만들어 거기에만 attach.
 *   - 그 BrowserWindow 는 일반 React 인스턴스이므로 마우스 hover/클릭이 정상 동작.
 *   - WH_MOUSE_LL global hook **제거**. zone 영역의 클릭은 Z-order 자연 라우팅으로
 *     Explorer 가 받음 (icon 드래그/선택). 비-zone 영역은 zone window 자체가 받음.
 *
 * 책임 (간소화):
 *   1. Progman → SHELLDLL_DefView → after-defview WorkerW (또는 progman-child) 탐색
 *   2. 대상 BrowserWindow HWND 를 WorkerW 자식으로 SetParent
 *   3. ScreenToClient + MoveWindow 좌표 변환
 *   4. GWL_STYLE / GWL_EXSTYLE 저장·복구 (disable 시)
 *
 * 보안: 외부 네트워크 0건. user32 + kernel32 만 사용.
 * 의존: koffi (prebuilt FFI). lazy require 로 비Windows 빌드 안전.
 */

import koffi from 'koffi';
import type { BrowserWindow } from 'electron';

// ─── Win32 상수 ──────────────────────────────────────────────────────────────
const WM_SPAWN_WORKER = 0x052c;
const HWND_TOP = 0;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_NOACTIVATE = 0x0010;
const SW_SHOW = 5;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const SMTO_ABORTIFHUNG = 0x0002;

// ─── DLL load (lazy + cache) ─────────────────────────────────────────────────
interface Win32API {
  FindWindowW: (className: string | null, windowName: string | null) => number;
  FindWindowExW: (
    parent: number,
    childAfter: number,
    className: string | null,
    windowName: string | null,
  ) => number;
  SendMessageTimeoutW: (
    hwnd: number,
    msg: number,
    wParam: number | bigint,
    lParam: number | bigint,
    flags: number,
    timeout: number,
    result: Buffer,
  ) => number;
  SetParent: (child: number, parent: number) => number;
  SetWindowPos: (
    hwnd: number,
    insertAfter: number,
    x: number,
    y: number,
    cx: number,
    cy: number,
    flags: number,
  ) => boolean;
  MoveWindow: (hwnd: number, x: number, y: number, w: number, h: number, repaint: boolean) => boolean;
  GetWindowRect: (hwnd: number, rect: Buffer) => boolean;
  ShowWindow: (hwnd: number, cmd: number) => boolean;
  GetWindowLongPtrW: (hwnd: number, idx: number) => number;
  SetWindowLongPtrW: (hwnd: number, idx: number, value: number) => number;
  ScreenToClient: (hwnd: number, point: Buffer) => boolean;
  IsWindow: (hwnd: number) => boolean;
  GetDpiForWindow: (hwnd: number) => number;
}

let cachedApi: Win32API | null = null;

function getApi(): Win32API {
  if (cachedApi) return cachedApi;
  const user32 = koffi.load('user32.dll');
  cachedApi = {
    FindWindowW: user32.func('intptr __stdcall FindWindowW(str16, str16)') as unknown as Win32API['FindWindowW'],
    FindWindowExW: user32.func(
      'intptr __stdcall FindWindowExW(intptr, intptr, str16, str16)',
    ) as unknown as Win32API['FindWindowExW'],
    SendMessageTimeoutW: user32.func(
      'intptr __stdcall SendMessageTimeoutW(intptr, uint, uintptr, intptr, uint, uint, void*)',
    ) as unknown as Win32API['SendMessageTimeoutW'],
    SetParent: user32.func('intptr __stdcall SetParent(intptr, intptr)') as unknown as Win32API['SetParent'],
    SetWindowPos: user32.func(
      'bool __stdcall SetWindowPos(intptr, intptr, int, int, int, int, uint)',
    ) as unknown as Win32API['SetWindowPos'],
    MoveWindow: user32.func(
      'bool __stdcall MoveWindow(intptr, int, int, int, int, bool)',
    ) as unknown as Win32API['MoveWindow'],
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr, void*)') as unknown as Win32API['GetWindowRect'],
    ShowWindow: user32.func('bool __stdcall ShowWindow(intptr, int)') as unknown as Win32API['ShowWindow'],
    GetWindowLongPtrW: user32.func(
      'intptr __stdcall GetWindowLongPtrW(intptr, int)',
    ) as unknown as Win32API['GetWindowLongPtrW'],
    SetWindowLongPtrW: user32.func(
      'intptr __stdcall SetWindowLongPtrW(intptr, int, intptr)',
    ) as unknown as Win32API['SetWindowLongPtrW'],
    ScreenToClient: user32.func('bool __stdcall ScreenToClient(intptr, void*)') as unknown as Win32API['ScreenToClient'],
    IsWindow: user32.func('bool __stdcall IsWindow(intptr)') as unknown as Win32API['IsWindow'],
    GetDpiForWindow: user32.func('uint __stdcall GetDpiForWindow(intptr)') as unknown as Win32API['GetDpiForWindow'],
  };
  return cachedApi;
}

// ─── HWND helpers ────────────────────────────────────────────────────────────
function decodeHwndFromBuffer(buf: Buffer): number {
  return buf.readInt32LE(0);
}

function getWindowScreenRect(
  hwnd: number,
): { x: number; y: number; width: number; height: number } | null {
  const a = getApi();
  const rect = Buffer.alloc(16);
  if (!a.GetWindowRect(hwnd, rect)) return null;
  const left = rect.readInt32LE(0);
  const top = rect.readInt32LE(4);
  const right = rect.readInt32LE(8);
  const bottom = rect.readInt32LE(12);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createPointBuffer(x: number, y: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeInt32LE(x, 0);
  buf.writeInt32LE(y, 4);
  return buf;
}

// ─── Desktop layer 탐색 ──────────────────────────────────────────────────────

interface DesktopHandles {
  progman: number;
  workerW: number;
  defView: number | null;
  source: 'after-defview' | 'progman-child' | 'unresolved';
}

function findDesktopHandles(ensureWorkerLayer: boolean): DesktopHandles | null {
  const a = getApi();
  const progman = a.FindWindowW('Progman', null);
  if (!progman) return null;

  if (ensureWorkerLayer) {
    const result = Buffer.alloc(8);
    a.SendMessageTimeoutW(
      progman,
      WM_SPAWN_WORKER,
      BigInt(0x0d),
      BigInt(0x01),
      SMTO_ABORTIFHUNG,
      1000,
      result,
    );
  }

  let resolvedDefView: number | null =
    a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null) || null;
  let shellWorkerW: number | null = null;
  let resolvedWorker: number | null = null;
  let source: DesktopHandles['source'] = 'unresolved';

  let cursor = 0;
  while (true) {
    cursor = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (!cursor) break;
    const workerDefView = a.FindWindowExW(cursor, 0, 'SHELLDLL_DefView', null);
    if (!workerDefView) continue;
    shellWorkerW = cursor;
    if (!resolvedDefView) {
      resolvedDefView = workerDefView;
    }
    const after = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (after) {
      resolvedWorker = after;
      source = 'after-defview';
      break;
    }
  }

  // fallback: progman 직속 WorkerW 자식 (Windows 11 일부 환경)
  if (!resolvedWorker) {
    const progmanChild = a.FindWindowExW(progman, 0, 'WorkerW', null);
    if (progmanChild) {
      resolvedWorker = progmanChild;
      source = 'progman-child';
    }
  }

  if (!resolvedDefView && shellWorkerW) {
    resolvedDefView = a.FindWindowExW(shellWorkerW, 0, 'SHELLDLL_DefView', null) || null;
  }

  if (!resolvedWorker) return null;
  return {
    progman,
    workerW: resolvedWorker,
    defView: resolvedDefView,
    source,
  };
}

// ─── Public API (Phase 2.2 — hook 제거된 버전) ───────────────────────────────

export interface Win32WidgetController {
  /**
   * 대상 BrowserWindow 를 데스크톱 WorkerW 레이어에 attach 한다.
   *
   * 호출자 책임:
   *   - 일반적으로 desktopZoneWindow (transparent fullscreen) 를 전달.
   *   - 메인 widgetWindow 는 전달하지 않는다 (Phase 2.1 의 커서 freeze 결함 때문).
   */
  enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string };
  disable(window: BrowserWindow | null): void;
  isAttached(): boolean;
}

export function createWin32WidgetController(): Win32WidgetController {
  let attachedHwnd: number | null = null;
  let workerWHwnd: number | null = null;
  let savedStyle: number | null = null;
  let savedExStyle: number | null = null;

  return {
    enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string } {
      try {
        getApi();
      } catch {
        return { ok: false, reason: 'koffi-load-failed' };
      }
      try {
        const handles = findDesktopHandles(true);
        if (!handles) {
          return { ok: false, reason: 'workerw-not-found' };
        }
        workerWHwnd = handles.workerW;

        const buf = window.getNativeWindowHandle();
        const hwnd = decodeHwndFromBuffer(buf);
        if (!hwnd) {
          return { ok: false, reason: 'widget-not-ready' };
        }
        const a = getApi();
        savedStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_STYLE));
        savedExStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));

        // attach 전 screen rect
        const beforeRect = getWindowScreenRect(hwnd);

        // SetParent → 좌표계가 WorkerW client 로 변경
        const setParentResult = a.SetParent(hwnd, workerWHwnd);
        if (!setParentResult) {
          return { ok: false, reason: 'set-parent-failed' };
        }
        a.ShowWindow(hwnd, SW_SHOW);

        // WorkerW client 좌표로 위치 보정
        if (beforeRect) {
          const point = createPointBuffer(beforeRect.x, beforeRect.y);
          if (a.ScreenToClient(workerWHwnd, point)) {
            const clientX = point.readInt32LE(0);
            const clientY = point.readInt32LE(4);
            a.MoveWindow(hwnd, clientX, clientY, beforeRect.width, beforeRect.height, true);
          }
        }
        // workerW 안에서 최상단 → 데스크톱 아이콘은 그 위 WorkerW(DefView)에 있어 자연스럽게 떠 보임
        a.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

        attachedHwnd = hwnd;
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[win32Desktop] enable error', e);
        return { ok: false, reason: `exception: ${msg}` };
      }
    },

    disable(window: BrowserWindow | null): void {
      if (!attachedHwnd) {
        workerWHwnd = null;
        savedStyle = null;
        savedExStyle = null;
        return;
      }
      const a = getApi();
      try {
        const screenRect = getWindowScreenRect(attachedHwnd);
        a.SetParent(attachedHwnd, 0);
        if (savedStyle !== null) a.SetWindowLongPtrW(attachedHwnd, GWL_STYLE, savedStyle);
        if (savedExStyle !== null) a.SetWindowLongPtrW(attachedHwnd, GWL_EXSTYLE, savedExStyle);
        a.ShowWindow(attachedHwnd, SW_SHOW);
        if (window && !window.isDestroyed() && screenRect) {
          let dpi = 96;
          try {
            dpi = a.GetDpiForWindow(attachedHwnd) || 96;
          } catch {
            /* swallow */
          }
          const sf = dpi > 0 ? dpi / 96 : 1;
          window.setBounds({
            x: Math.round(screenRect.x / sf),
            y: Math.round(screenRect.y / sf),
            width: Math.round(screenRect.width / sf),
            height: Math.round(screenRect.height / sf),
          });
        }
      } catch (e) {
        console.error('[win32Desktop] disable error', e);
      }
      attachedHwnd = null;
      workerWHwnd = null;
      savedStyle = null;
      savedExStyle = null;
    },

    isAttached(): boolean {
      return attachedHwnd !== null && workerWHwnd !== null;
    },
  };
}
