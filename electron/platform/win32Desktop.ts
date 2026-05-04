/**
 * Win32 FFI wrapper — 바탕화면 작업판 (native-desktop-mode) Phase 2 v2.
 *
 * 책임:
 *   1. Progman → SHELLDLL_DefView 의 부모 WorkerW + Z-order 다음(after-defview) WorkerW 식별
 *   2. 위젯 BrowserWindow HWND 를 after-defview WorkerW (또는 progman-child fallback) 의
 *      자식으로 SetParent → ScreenToClient → MoveWindow 로 좌표계 변환
 *   3. WH_MOUSE_LL low-level mouse hook + WindowFromPoint 로 위젯 영역 클릭을 PostMessageW
 *      로 위젯에 명시 전달 (위젯이 WorkerW 자식이 되면 일반 라우팅이 끊기므로)
 *   4. 모든 native handle 다중 호출 안전 cleanup + style 복구
 *
 * 참고: 외부 데스크톱 위젯(`@external-widget/desktop` v1.1.5) `desktopWidget.js` 패턴.
 * 외부 코드 복제 아닌 독립 구현, 하지만 동일한 Win32 API 표면을 사용.
 *
 * 보안: 외부 네트워크 호출 0건, user32+kernel32 만 사용.
 */

import koffi from 'koffi';
import type { BrowserWindow } from 'electron';

// ─── Win32 상수 ──────────────────────────────────────────────────────────────
const WM_SPAWN_WORKER = 0x052c;
const WH_MOUSE_LL = 14;
const HWND_TOP = 0;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_NOACTIVATE = 0x0010;
const SW_SHOW = 5;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
// Mouse messages
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;
const WM_MOUSEWHEEL = 0x020a;
const MK_LBUTTON = 0x0001;
const MK_RBUTTON = 0x0002;

// ─── DLL load ────────────────────────────────────────────────────────────────
let koffiLoaded: typeof koffi | null = null;
let user32Loaded: ReturnType<typeof koffi.load> | null = null;
let kernel32Loaded: ReturnType<typeof koffi.load> | null = null;
let api: Record<string, ReturnType<ReturnType<typeof koffi.load>['func']>> | null = null;
let hookProtoRegistered = false;

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
  SendMessageW: (hwnd: number, msg: number, wParam: number | bigint, lParam: number | bigint) => number;
  PostMessageW: (hwnd: number, msg: number, wParam: number | bigint, lParam: number | bigint) => boolean;
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
  GetClassNameW: (hwnd: number, buf: Buffer, max: number) => number;
  GetWindowLongPtrW: (hwnd: number, idx: number) => number;
  SetWindowLongPtrW: (hwnd: number, idx: number, value: number) => number;
  ScreenToClient: (hwnd: number, point: Buffer) => boolean;
  WindowFromPoint: (point: bigint) => number;
  IsWindow: (hwnd: number) => boolean;
  GetDpiForWindow: (hwnd: number) => number;
  SetWindowsHookExW: (idHook: number, fn: unknown, hMod: number, threadId: number) => number;
  UnhookWindowsHookEx: (hook: number) => boolean;
  CallNextHookEx: (hook: number, nCode: number, wParam: number | bigint, lParam: number | bigint) => number;
  GetModuleHandleW: (name: string | null) => number;
}

function getApi(): Win32API {
  if (api) return api as unknown as Win32API;
  koffiLoaded = koffi;
  if (!hookProtoRegistered) {
    koffiLoaded.proto('intptr __stdcall LLHookProc(int nCode, uintptr wParam, void* lParam)');
    hookProtoRegistered = true;
  }
  user32Loaded = koffiLoaded.load('user32.dll');
  kernel32Loaded = koffiLoaded.load('kernel32.dll');
  api = {
    FindWindowW: user32Loaded.func('intptr __stdcall FindWindowW(str16, str16)'),
    FindWindowExW: user32Loaded.func('intptr __stdcall FindWindowExW(intptr, intptr, str16, str16)'),
    SendMessageTimeoutW: user32Loaded.func(
      'intptr __stdcall SendMessageTimeoutW(intptr, uint, uintptr, intptr, uint, uint, void*)',
    ),
    SendMessageW: user32Loaded.func('intptr __stdcall SendMessageW(intptr, uint, uintptr, intptr)'),
    PostMessageW: user32Loaded.func('bool __stdcall PostMessageW(intptr, uint, uintptr, intptr)'),
    SetParent: user32Loaded.func('intptr __stdcall SetParent(intptr, intptr)'),
    SetWindowPos: user32Loaded.func(
      'bool __stdcall SetWindowPos(intptr, intptr, int, int, int, int, uint)',
    ),
    MoveWindow: user32Loaded.func('bool __stdcall MoveWindow(intptr, int, int, int, int, bool)'),
    GetWindowRect: user32Loaded.func('bool __stdcall GetWindowRect(intptr, void*)'),
    ShowWindow: user32Loaded.func('bool __stdcall ShowWindow(intptr, int)'),
    GetClassNameW: user32Loaded.func('int __stdcall GetClassNameW(intptr, char16*, int)'),
    GetWindowLongPtrW: user32Loaded.func('intptr __stdcall GetWindowLongPtrW(intptr, int)'),
    SetWindowLongPtrW: user32Loaded.func('intptr __stdcall SetWindowLongPtrW(intptr, int, intptr)'),
    ScreenToClient: user32Loaded.func('bool __stdcall ScreenToClient(intptr, void*)'),
    WindowFromPoint: user32Loaded.func('intptr __stdcall WindowFromPoint(int64)'),
    IsWindow: user32Loaded.func('bool __stdcall IsWindow(intptr)'),
    GetDpiForWindow: user32Loaded.func('uint __stdcall GetDpiForWindow(intptr)'),
    SetWindowsHookExW: user32Loaded.func(
      'intptr __stdcall SetWindowsHookExW(int, LLHookProc*, intptr, uint)',
    ),
    UnhookWindowsHookEx: user32Loaded.func('bool __stdcall UnhookWindowsHookEx(intptr)'),
    CallNextHookEx: user32Loaded.func(
      'intptr __stdcall CallNextHookEx(intptr, int, uintptr, void*)',
    ),
    GetModuleHandleW: kernel32Loaded.func('intptr __stdcall GetModuleHandleW(str16)'),
  } as unknown as Record<string, ReturnType<ReturnType<typeof koffi.load>['func']>>;
  return api as unknown as Win32API;
}

// ─── HWND helpers ────────────────────────────────────────────────────────────
/**
 * Electron BrowserWindow.getNativeWindowHandle() Buffer 에서 HWND(int32) 추출.
 *
 * 주의: 64-bit Windows 에서도 HWND 값은 32-bit 영역에 들어가므로(Microsoft 공식 문서 §
 * "Interprocess Communication Between 32-bit and 64-bit Applications") readInt32LE 사용.
 * 64-bit pointer 로 변환 시 koffi 의 `intptr` 와 호환 안 되는 경우가 있어 외부 데스크톱 위젯 도
 * 동일한 방식을 사용한다.
 */
function decodeHwndFromBuffer(buf: Buffer): number {
  return buf.readInt32LE(0);
}

function getClassName(hwnd: number): string {
  const a = getApi();
  const buf = Buffer.alloc(256 * 2);
  const len = a.GetClassNameW(hwnd, buf, 256);
  if (len <= 0) return '';
  return buf.toString('utf16le', 0, len * 2);
}

// ─── Desktop layer 탐색 ──────────────────────────────────────────────────────

interface DesktopHandles {
  progman: number;
  workerW: number; // 위젯이 attach 될 WorkerW (after-defview 또는 progman-child)
  defView: number | null;
  listView: number | null;
  source: 'after-defview' | 'progman-child' | 'unresolved';
}

function findListView(defView: number): number | null {
  const a = getApi();
  return (
    a.FindWindowExW(defView, 0, 'SysListView32', 'FolderView') ||
    a.FindWindowExW(defView, 0, 'SysListView32', null) ||
    null
  );
}

/**
 * 데스크톱 핸들 스냅샷.
 *
 * - progman: 항상 최상위 데스크톱 컨테이너
 * - WorkerW chain: SHELLDLL_DefView 를 자식으로 가진 WorkerW 가 식별 대상.
 *   그 *다음* WorkerW (Z-order 상 아래) 가 attach 대상이며, 이 레이어에 자식을
 *   넣으면 wallpaper 위 / 데스크톱 아이콘 아래에 렌더링된다.
 * - after-defview 가 없으면 progman 의 직속 WorkerW 자식으로 fallback
 *   (Windows 11 일부 환경에서만 등장).
 *
 * 외부 데스크톱 위젯 와 동일한 트릭이지만 본 함수는 독립 구현.
 */
function findDesktopHandles(ensureWorkerLayer: boolean): DesktopHandles | null {
  const a = getApi();
  const progman = a.FindWindowW('Progman', null);
  if (!progman) return null;

  // Progman 에 WM_SPAWN_WORKER 메시지를 보내 WorkerW 생성을 유도 (이미 있으면 무해).
  if (ensureWorkerLayer) {
    const result = Buffer.alloc(8);
    a.SendMessageTimeoutW(progman, WM_SPAWN_WORKER, BigInt(0x0d), BigInt(0x01), 0x0002, 1000, result);
  }

  let resolvedDefView: number | null =
    a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null) || null;
  let resolvedListView: number | null = resolvedDefView ? findListView(resolvedDefView) : null;
  let shellWorkerW: number | null = null;
  let resolvedWorker: number | null = null;
  let source: DesktopHandles['source'] = 'unresolved';

  // EnumWindows 대신 FindWindowExW 체인으로 WorkerW 들 순회
  let cursor = 0;
  while (true) {
    cursor = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (!cursor) break;
    const workerDefView = a.FindWindowExW(cursor, 0, 'SHELLDLL_DefView', null);
    if (!workerDefView) continue;
    shellWorkerW = cursor;
    if (!resolvedDefView) {
      resolvedDefView = workerDefView;
      resolvedListView = findListView(workerDefView);
    }
    // 핵심: shellWorkerW *다음* WorkerW 가 attach 대상.
    const after = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (after) {
      resolvedWorker = after;
      source = 'after-defview';
      break;
    }
  }

  // fallback: progman 의 직속 WorkerW 자식.
  if (!resolvedWorker) {
    const progmanChild = a.FindWindowExW(progman, 0, 'WorkerW', null);
    if (progmanChild) {
      resolvedWorker = progmanChild;
      source = 'progman-child';
    }
  }

  if (!resolvedDefView && shellWorkerW) {
    resolvedDefView = a.FindWindowExW(shellWorkerW, 0, 'SHELLDLL_DefView', null) || null;
    resolvedListView = resolvedDefView ? findListView(resolvedDefView) : null;
  }

  if (!resolvedWorker) {
    return null;
  }
  return {
    progman,
    workerW: resolvedWorker,
    defView: resolvedDefView,
    listView: resolvedListView,
    source,
  };
}

// ─── Coord helpers ───────────────────────────────────────────────────────────
function createPointBuffer(x: number, y: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeInt32LE(x, 0);
  buf.writeInt32LE(y, 4);
  return buf;
}

function getWindowScreenRect(hwnd: number): { x: number; y: number; width: number; height: number } | null {
  const a = getApi();
  const rect = Buffer.alloc(16);
  if (!a.GetWindowRect(hwnd, rect)) return null;
  const left = rect.readInt32LE(0);
  const top = rect.readInt32LE(4);
  const right = rect.readInt32LE(8);
  const bottom = rect.readInt32LE(12);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function packPoint(x: number, y: number): bigint {
  return BigInt(((y & 0xffff) << 16) | (x & 0xffff)) >> 0n;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface Win32WidgetController {
  enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string };
  disable(window: BrowserWindow | null): void;
  updateWidgetBounds(window: BrowserWindow): void;
  setHitTestZones(zones: ReadonlyArray<{
    id: string;
    rect: { x: number; y: number; width: number; height: number };
  }>): void;
  isAttached(): boolean;
  /** 디버그/healthCheck 용 — 현재 attach 한 WorkerW HWND. */
  getAttachedWorkerW(): number | null;
}

/**
 * 위젯을 바탕화면 레이어에 부착·해제하는 컨트롤러.
 *
 * 호출 흐름 (외부 데스크톱 위젯 `enable()` 패턴):
 *   1. 데스크톱 핸들 탐색 (progman / WorkerW / DefView / ListView)
 *   2. 위젯 HWND 의 GWL_STYLE / GWL_EXSTYLE 저장
 *   3. SetParent(widget, workerW) — 좌표계가 WorkerW client 로 바뀜
 *   4. ScreenToClient(workerW, savedScreenRect) → MoveWindow → bringToTop
 *   5. WH_MOUSE_LL hook 설치 (PostMessage 라우팅)
 *
 * disable 시 reverse 순서로 정리 + style 복구.
 */
export function createWin32WidgetController(options?: {
  onMouseEvent?: (event: {
    type: 'move' | 'down' | 'up' | 'wheel';
    button?: 'left' | 'right';
    clientX: number;
    clientY: number;
    deltaY?: number;
    inWidget: boolean;
    inZone: boolean;
  }) => void;
}): Win32WidgetController {
  let widgetHwnd: number | null = null;
  let workerWHwnd: number | null = null;
  let defViewHwnd: number | null = null;
  let listViewHwnd: number | null = null;
  let progmanHwnd: number | null = null;
  let savedStyle: number | null = null;
  let savedExStyle: number | null = null;
  let mouseHook: number | null = null;
  let hookCbToken: unknown = null;
  let widgetRect: { left: number; top: number; right: number; bottom: number } = {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  };
  let zonesCache: ReadonlyArray<{
    id: string;
    rect: { x: number; y: number; width: number; height: number };
  }> = [];
  let buttonMask = 0;
  let boundsTimer: ReturnType<typeof setInterval> | null = null;

  const onMouseEvent = options?.onMouseEvent;

  const refreshBounds = (): void => {
    if (!widgetHwnd) return;
    const a = getApi();
    const rect = Buffer.alloc(16);
    if (!a.GetWindowRect(widgetHwnd, rect)) return;
    widgetRect.left = rect.readInt32LE(0);
    widgetRect.top = rect.readInt32LE(4);
    widgetRect.right = rect.readInt32LE(8);
    widgetRect.bottom = rect.readInt32LE(12);
  };

  const isPointInWidget = (x: number, y: number): boolean =>
    x >= widgetRect.left && x < widgetRect.right && y >= widgetRect.top && y < widgetRect.bottom;

  const isPointInZone = (x: number, y: number): boolean => {
    for (const z of zonesCache) {
      if (
        x >= z.rect.x &&
        x < z.rect.x + z.rect.width &&
        y >= z.rect.y &&
        y < z.rect.y + z.rect.height
      ) {
        return true;
      }
    }
    return false;
  };

  const isDesktopOrWidgetHwnd = (hwnd: number): boolean => {
    if (!hwnd) return true;
    if (hwnd === widgetHwnd) return true;
    if (hwnd === progmanHwnd || hwnd === workerWHwnd) return true;
    if (hwnd === defViewHwnd || hwnd === listViewHwnd) return true;
    return false;
  };

  const toClient = (hwnd: number, screenX: number, screenY: number): { x: number; y: number } | null => {
    const a = getApi();
    const buf = createPointBuffer(screenX, screenY);
    if (!a.ScreenToClient(hwnd, buf)) return null;
    return { x: buf.readInt32LE(0), y: buf.readInt32LE(4) };
  };

  const installHook = (): boolean => {
    if (mouseHook) return true;
    const a = getApi();
    if (!koffiLoaded) return false;

    const hookFn = (nCode: number, wParam: bigint, lParam: bigint): bigint => {
      try {
        if (nCode < 0 || !widgetHwnd) {
          return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
        }
        const msg = Number(wParam);
        const isMove = msg === WM_MOUSEMOVE;
        const isDown = msg === WM_LBUTTONDOWN || msg === WM_RBUTTONDOWN;
        const isUp = msg === WM_LBUTTONUP || msg === WM_RBUTTONUP;
        const isWheel = msg === WM_MOUSEWHEEL;
        if (!isMove && !isDown && !isUp && !isWheel) {
          return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
        }

        // MSLLHOOKSTRUCT 디코드: 첫 8 byte = POINT pt, 다음 4 = mouseData
        const screenX = koffiLoaded!.decode(lParam, 0, 'int32') as number;
        const screenY = koffiLoaded!.decode(lParam, 4, 'int32') as number;
        const mouseData = koffiLoaded!.decode(lParam, 8, 'uint32') as number;
        const inWidget = isPointInWidget(screenX, screenY);
        const inZone = inWidget ? isPointInZone(screenX, screenY) : false;

        if (isDown && msg === WM_LBUTTONDOWN) buttonMask |= MK_LBUTTON;
        if (isDown && msg === WM_RBUTTONDOWN) buttonMask |= MK_RBUTTON;
        if (isUp && msg === WM_LBUTTONUP) buttonMask &= ~MK_LBUTTON;
        if (isUp && msg === WM_RBUTTONUP) buttonMask &= ~MK_RBUTTON;

        if (onMouseEvent) {
          const cp = toClient(widgetHwnd, screenX, screenY);
          if (cp) {
            if (isMove) {
              onMouseEvent({ type: 'move', clientX: cp.x, clientY: cp.y, inWidget, inZone });
            } else if (isDown) {
              onMouseEvent({
                type: 'down',
                button: msg === WM_LBUTTONDOWN ? 'left' : 'right',
                clientX: cp.x,
                clientY: cp.y,
                inWidget,
                inZone,
              });
            } else if (isUp) {
              onMouseEvent({
                type: 'up',
                button: msg === WM_LBUTTONUP ? 'left' : 'right',
                clientX: cp.x,
                clientY: cp.y,
                inWidget,
                inZone,
              });
            } else if (isWheel) {
              const rawDelta = (mouseData >>> 16) & 0xffff;
              const deltaY = rawDelta > 32767 ? rawDelta - 65536 : rawDelta;
              onMouseEvent({
                type: 'wheel',
                clientX: cp.x,
                clientY: cp.y,
                deltaY,
                inWidget,
                inZone,
              });
            }
          }
        }

        // 라우팅 정책:
        // - 위젯 영역 밖: 그대로 통과 (Explorer 가 처리)
        // - 위젯 영역 안 + zone 안: 그대로 통과 (바탕화면 아이콘 조작 — Z-order 상 ListView 가 위에 있어 자연 라우팅)
        // - 위젯 영역 안 + zone 밖 + WindowFromPoint 가 위젯이면: PostMessage 로 위젯에 전달 + 차단
        if (!inWidget) {
          return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
        }
        if (inZone) {
          return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
        }
        // zone 밖 위젯 영역 — WindowFromPoint 로 실제 hit window 확인
        const hwndAt = a.WindowFromPoint(packPoint(screenX, screenY));
        if (!isDesktopOrWidgetHwnd(hwndAt)) {
          // 다른 앱 창이 위에 떠 있음 — pass-through
          return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
        }
        // 위젯 영역 안의 헤더/편집 등 클릭 — PostMessage 로 위젯에 명시 전달
        const cp = toClient(widgetHwnd, screenX, screenY);
        if (cp) {
          if (isMove) {
            a.PostMessageW(widgetHwnd, msg, BigInt(buttonMask & 0xffff), packPoint(cp.x, cp.y));
          } else if (isDown || isUp) {
            a.PostMessageW(widgetHwnd, msg, BigInt(buttonMask & 0xffff), packPoint(cp.x, cp.y));
          } else if (isWheel) {
            a.PostMessageW(widgetHwnd, msg, BigInt(mouseData), packPoint(cp.x, cp.y));
          }
        }
        // 위젯이 받았으니 시스템 처리는 차단
        return 1n;
      } catch {
        return BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
      }
    };

    hookCbToken = koffiLoaded.register(hookFn, koffiLoaded.pointer('LLHookProc'));
    mouseHook = a.SetWindowsHookExW(WH_MOUSE_LL, hookCbToken, 0, 0);
    if (!mouseHook) {
      try {
        koffiLoaded.unregister(hookCbToken as never);
      } catch {
        /* swallow */
      }
      hookCbToken = null;
      return false;
    }
    boundsTimer = setInterval(refreshBounds, 120);
    return true;
  };

  const uninstallHook = (): void => {
    const a = getApi();
    if (boundsTimer) {
      clearInterval(boundsTimer);
      boundsTimer = null;
    }
    if (mouseHook) {
      try {
        a.UnhookWindowsHookEx(mouseHook);
      } catch {
        /* swallow */
      }
      mouseHook = null;
    }
    if (hookCbToken && koffiLoaded) {
      try {
        koffiLoaded.unregister(hookCbToken as never);
      } catch {
        /* swallow */
      }
      hookCbToken = null;
    }
    buttonMask = 0;
  };

  return {
    enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string } {
      try {
        getApi(); // koffi load
      } catch (e) {
        return { ok: false, reason: 'koffi-load-failed' };
      }
      try {
        const handles = findDesktopHandles(true);
        if (!handles) {
          return { ok: false, reason: 'workerw-not-found' };
        }
        progmanHwnd = handles.progman;
        workerWHwnd = handles.workerW;
        defViewHwnd = handles.defView;
        listViewHwnd = handles.listView;

        const buf = window.getNativeWindowHandle();
        const hwnd = decodeHwndFromBuffer(buf);
        if (!hwnd) {
          return { ok: false, reason: 'widget-not-ready' };
        }
        widgetHwnd = hwnd;
        const a = getApi();
        savedStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_STYLE));
        savedExStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));

        // attach 전 screen rect 저장 (DIP → physical 보정 없이 GetWindowRect 가 physical 반환)
        const beforeRect = getWindowScreenRect(hwnd);

        // SetParent 후 widget 좌표계가 workerW client 기준으로 변경됨
        const setParentResult = a.SetParent(hwnd, workerWHwnd);
        if (!setParentResult) {
          // SetParent 가 NULL 을 반환하면 실패 — Windows 11 일부 환경에서 권한 문제
          return { ok: false, reason: 'set-parent-failed' };
        }
        a.ShowWindow(hwnd, SW_SHOW);

        // workerW client 좌표계로 위치 보정 — 이게 빠지면 위젯이 화면 밖이나 잘못된 위치에 그려진다
        if (beforeRect) {
          const point = createPointBuffer(beforeRect.x, beforeRect.y);
          if (a.ScreenToClient(workerWHwnd, point)) {
            const clientX = point.readInt32LE(0);
            const clientY = point.readInt32LE(4);
            a.MoveWindow(hwnd, clientX, clientY, beforeRect.width, beforeRect.height, true);
          }
        }
        // workerW 안에서 widget 을 최상단(== 아이콘 ListView 와 동일 레벨이지만 ListView 가 보다 상위 WorkerW 의 자식이라 시각적으로 아이콘이 위에 보임)
        a.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        refreshBounds();

        if (!installHook()) {
          // hook 실패 — attach 는 유지 (zone 시각화는 동작, 마우스 PostMessage 라우팅만 비활성)
          // 그래도 zone 카드 시각화는 가치 있으므로 ok 로 진행. 단, hook 없으면 위젯 헤더 클릭 불가 — 사용자에게 noticeable 하면 hook-install-failed 로 fallback 권장
          // 보수적으로 fail 로 처리해서 fallback 토스트 띄우는 게 안전
          a.SetParent(hwnd, 0);
          if (savedStyle !== null) a.SetWindowLongPtrW(hwnd, GWL_STYLE, savedStyle);
          if (savedExStyle !== null) a.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, savedExStyle);
          a.ShowWindow(hwnd, SW_SHOW);
          widgetHwnd = null;
          workerWHwnd = null;
          defViewHwnd = null;
          listViewHwnd = null;
          progmanHwnd = null;
          savedStyle = null;
          savedExStyle = null;
          return { ok: false, reason: 'hook-install-failed' };
        }
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[win32Desktop] enable error', e);
        return { ok: false, reason: `exception: ${msg}` };
      }
    },

    disable(window: BrowserWindow | null): void {
      uninstallHook();
      if (!widgetHwnd) {
        progmanHwnd = null;
        workerWHwnd = null;
        defViewHwnd = null;
        listViewHwnd = null;
        savedStyle = null;
        savedExStyle = null;
        return;
      }
      const a = getApi();
      try {
        // 현재 screen rect 보존
        const screenRect = getWindowScreenRect(widgetHwnd);
        a.SetParent(widgetHwnd, 0);
        if (savedStyle !== null) a.SetWindowLongPtrW(widgetHwnd, GWL_STYLE, savedStyle);
        if (savedExStyle !== null) a.SetWindowLongPtrW(widgetHwnd, GWL_EXSTYLE, savedExStyle);
        a.ShowWindow(widgetHwnd, SW_SHOW);
        if (window && !window.isDestroyed() && screenRect) {
          // physical → DIP 변환은 Electron screen API 가 가장 정확
          // 단순 설정: setBounds 는 DIP 를 받음. screenRect 는 physical px.
          // scaleFactor 추정: GetDpiForWindow(widget) / 96
          let dpi = 96;
          try {
            dpi = a.GetDpiForWindow(widgetHwnd) || 96;
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
      widgetHwnd = null;
      workerWHwnd = null;
      defViewHwnd = null;
      listViewHwnd = null;
      progmanHwnd = null;
      savedStyle = null;
      savedExStyle = null;
      zonesCache = [];
      widgetRect = { left: 0, top: 0, right: 0, bottom: 0 };
    },

    updateWidgetBounds(_window: BrowserWindow): void {
      refreshBounds();
    },

    setHitTestZones(zones): void {
      zonesCache = zones.filter((z) => z.rect.width > 0 && z.rect.height > 0);
    },

    isAttached(): boolean {
      return widgetHwnd !== null && workerWHwnd !== null;
    },

    getAttachedWorkerW(): number | null {
      return workerWHwnd;
    },
  };
}
