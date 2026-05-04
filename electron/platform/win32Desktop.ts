/**
 * Win32 FFI wrapper — 바탕화면 작업판 (native-desktop-mode) Phase 3.0.
 *
 * 외부 데스크톱 위젯 v1.1.5 (`@external-widget/desktop` desktopWidget.js) 의 핵심 트릭을 이식한
 * 독립 구현. MIT 라이선스. koffi FFI 시그니처는 동일하나 코드 자체는 새로 작성.
 *
 * ## 핵심 트릭 (사용자가 분석 보고서로 제시)
 * 1. 위젯 BrowserWindow 를 Explorer WorkerW 자식으로 SetParent → 데스크톱 아이콘과
 *    동급 Z-order 에서 공존.
 * 2. `OpenProcess(explorer.exe, READ|WRITE|VM_OP)` + `VirtualAllocEx` 로 explorer
 *    프로세스 안에 24-byte LVHITTESTINFO 버퍼를 할당.
 * 3. 매 마우스 좌표마다 `WriteProcessMemory` 로 좌표 쓰고 `SendMessageW(listView,
 *    LVM_HITTEST, 0, remoteAddr)` 로 원격 hit-test 호출 → 그 좌표에 폴더 아이콘이
 *    있으면 hitIndex >= 0 반환.
 * 4. WH_MOUSE_LL hook 결정 트리:
 *    - 위젯 영역 밖 → CallNextHookEx (시스템 처리)
 *    - 위젯 영역 안 + 아이콘 위 → CallNextHookEx (explorer 가 폴더 클릭 처리) ⭐
 *    - 위젯 영역 안 + 빈 공간 + click → PostMessageW(widget, msg) + return 1
 * 5. externalDrag 상태 추적 — 폴더 드래그 시작 후 mouse-up 까지 위젯이 입을 닫음.
 *
 * ## Phase 2.1 의 결함 회피
 * - 모든 mouse-move 에 return 1 → OS input pipeline 죽임 → 커서 freeze. 본 구현은
 *   move 는 `webContents.send('widget-mousemove', ...)` IPC 만 보내고 시스템에 양보
 *   (return CallNextHookEx). hover 효과는 renderer 가 합성 dispatch 로 시뮬레이션
 *   (외부 데스크톱 위젯 패턴 — 후속 PR 에서 추가).
 *
 * ## 보안
 * - 외부 네트워크 0건.
 * - explorer.exe 권한 = 사용자 세션 권한, UAC 승격 불필요.
 * - 본 모듈은 user32 + kernel32 만 호출 — 새 DLL 다운로드 없음.
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
const SMTO_ABORTIFHUNG = 0x0002;

// Mouse messages
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;
const WM_MOUSEWHEEL = 0x020a;
const MK_LBUTTON = 0x0001;
const MK_RBUTTON = 0x0002;

// LVM_HITTEST + remote process flags
const LVM_HITTEST = 0x1012;
const HITTEST_BUFFER_SIZE = 24; // LVHITTESTINFO (POINT pt + UINT flags + INT iItem + INT iSubItem + INT iGroup, x64 padding 포함)
const HITTEST_CACHE_MS = 12;
const PROCESS_VM_OPERATION = 0x0008;
const PROCESS_VM_READ = 0x0010;
const PROCESS_VM_WRITE = 0x0020;
const MEM_COMMIT = 0x1000;
const MEM_RESERVE = 0x2000;
const MEM_RELEASE = 0x8000;
const PAGE_READWRITE = 0x04;

// ─── DLL load (lazy + cache) ─────────────────────────────────────────────────
interface Win32API {
  FindWindowW: (cls: string | null, name: string | null) => number;
  FindWindowExW: (parent: number, after: number, cls: string | null, name: string | null) => number;
  SendMessageTimeoutW: (
    hwnd: number,
    msg: number,
    wp: number | bigint,
    lp: number | bigint,
    flags: number,
    timeout: number,
    result: Buffer,
  ) => number;
  SendMessageW: (hwnd: number, msg: number, wp: number | bigint, lp: number | bigint) => number;
  PostMessageW: (hwnd: number, msg: number, wp: number | bigint, lp: number | bigint) => boolean;
  SetParent: (child: number, parent: number) => number;
  SetWindowPos: (
    hwnd: number,
    after: number,
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
  WindowFromPoint: (point: bigint) => number;
  IsWindow: (hwnd: number) => boolean;
  GetDpiForWindow: (hwnd: number) => number;
  GetWindowThreadProcessId: (hwnd: number, pidBuf: Buffer) => number;
  SetWindowsHookExW: (idHook: number, fn: unknown, hMod: number, threadId: number) => number;
  UnhookWindowsHookEx: (hook: number) => boolean;
  CallNextHookEx: (hook: number, nCode: number, wp: number | bigint, lp: number | bigint) => number;
  GetModuleHandleW: (name: string | null) => number;
  OpenProcess: (access: number, inherit: boolean, pid: number) => number;
  VirtualAllocEx: (
    process: number,
    addr: number | bigint,
    size: number,
    type: number,
    protect: number,
  ) => number;
  VirtualFreeEx: (process: number, addr: number, size: number, type: number) => boolean;
  WriteProcessMemory: (
    process: number,
    remote: number,
    local: Buffer,
    size: number,
    written: number | bigint,
  ) => boolean;
  CloseHandle: (h: number) => boolean;
}

let cachedApi: Win32API | null = null;
let hookProtoRegistered = false;
let koffiRef: typeof koffi | null = null;

function getApi(): Win32API {
  if (cachedApi) return cachedApi;
  koffiRef = koffi;
  if (!hookProtoRegistered) {
    koffi.proto('intptr __stdcall LLHookProc(int nCode, uintptr wParam, void* lParam)');
    hookProtoRegistered = true;
  }
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  cachedApi = {
    FindWindowW: user32.func('intptr __stdcall FindWindowW(str16, str16)') as never,
    FindWindowExW: user32.func('intptr __stdcall FindWindowExW(intptr, intptr, str16, str16)') as never,
    SendMessageTimeoutW: user32.func(
      'intptr __stdcall SendMessageTimeoutW(intptr, uint, uintptr, intptr, uint, uint, void*)',
    ) as never,
    SendMessageW: user32.func('intptr __stdcall SendMessageW(intptr, uint, uintptr, intptr)') as never,
    PostMessageW: user32.func('bool __stdcall PostMessageW(intptr, uint, uintptr, intptr)') as never,
    SetParent: user32.func('intptr __stdcall SetParent(intptr, intptr)') as never,
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(intptr, intptr, int, int, int, int, uint)') as never,
    MoveWindow: user32.func('bool __stdcall MoveWindow(intptr, int, int, int, int, bool)') as never,
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr, void*)') as never,
    ShowWindow: user32.func('bool __stdcall ShowWindow(intptr, int)') as never,
    GetWindowLongPtrW: user32.func('intptr __stdcall GetWindowLongPtrW(intptr, int)') as never,
    SetWindowLongPtrW: user32.func('intptr __stdcall SetWindowLongPtrW(intptr, int, intptr)') as never,
    ScreenToClient: user32.func('bool __stdcall ScreenToClient(intptr, void*)') as never,
    WindowFromPoint: user32.func('intptr __stdcall WindowFromPoint(int64)') as never,
    IsWindow: user32.func('bool __stdcall IsWindow(intptr)') as never,
    GetDpiForWindow: user32.func('uint __stdcall GetDpiForWindow(intptr)') as never,
    GetWindowThreadProcessId: user32.func('uint __stdcall GetWindowThreadProcessId(intptr, void*)') as never,
    SetWindowsHookExW: user32.func('intptr __stdcall SetWindowsHookExW(int, LLHookProc*, intptr, uint)') as never,
    UnhookWindowsHookEx: user32.func('bool __stdcall UnhookWindowsHookEx(intptr)') as never,
    CallNextHookEx: user32.func('intptr __stdcall CallNextHookEx(intptr, int, uintptr, void*)') as never,
    GetModuleHandleW: kernel32.func('intptr __stdcall GetModuleHandleW(str16)') as never,
    OpenProcess: kernel32.func('intptr __stdcall OpenProcess(uint, bool, uint)') as never,
    VirtualAllocEx: kernel32.func('intptr __stdcall VirtualAllocEx(intptr, intptr, uintptr, uint, uint)') as never,
    VirtualFreeEx: kernel32.func('bool __stdcall VirtualFreeEx(intptr, intptr, uintptr, uint)') as never,
    WriteProcessMemory: kernel32.func(
      'bool __stdcall WriteProcessMemory(intptr, intptr, void*, uintptr, intptr)',
    ) as never,
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr)') as never,
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

function packPoint(x: number, y: number): bigint {
  return BigInt((((y & 0xffff) << 16) | (x & 0xffff)) >>> 0);
}

// ─── Desktop layer 탐색 ──────────────────────────────────────────────────────
interface DesktopHandles {
  progman: number;
  workerW: number;
  defView: number | null;
  listView: number | null;
}

function findListViewFromDefView(defView: number): number | null {
  const a = getApi();
  return (
    a.FindWindowExW(defView, 0, 'SysListView32', 'FolderView') ||
    a.FindWindowExW(defView, 0, 'SysListView32', null) ||
    null
  );
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

  let resolvedDefView: number | null = a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null) || null;
  let resolvedListView: number | null = resolvedDefView ? findListViewFromDefView(resolvedDefView) : null;
  let shellWorkerW: number | null = null;
  let resolvedWorker: number | null = null;

  let cursor = 0;
  while (true) {
    cursor = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (!cursor) break;
    const workerDefView = a.FindWindowExW(cursor, 0, 'SHELLDLL_DefView', null);
    if (!workerDefView) continue;
    shellWorkerW = cursor;
    if (!resolvedDefView) {
      resolvedDefView = workerDefView;
      resolvedListView = findListViewFromDefView(workerDefView);
    }
    const after = a.FindWindowExW(0, cursor, 'WorkerW', null);
    if (after) {
      resolvedWorker = after;
      break;
    }
  }

  if (!resolvedWorker) {
    const progmanChild = a.FindWindowExW(progman, 0, 'WorkerW', null);
    if (progmanChild) resolvedWorker = progmanChild;
  }

  if (!resolvedDefView && shellWorkerW) {
    resolvedDefView = a.FindWindowExW(shellWorkerW, 0, 'SHELLDLL_DefView', null) || null;
    resolvedListView = resolvedDefView ? findListViewFromDefView(resolvedDefView) : null;
  }

  if (!resolvedWorker) return null;
  return {
    progman,
    workerW: resolvedWorker,
    defView: resolvedDefView,
    listView: resolvedListView,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * widget-mousemove / widget-wheel / widget-mouseleave 콜백 — main process 측에서
 * webContents.send 로 forward 한다.
 */
export interface WidgetMouseEventHandlers {
  onMouseMove: (clientX: number, clientY: number) => void;
  onMouseWheel: (clientX: number, clientY: number, deltaY: number) => void;
  onMouseLeave: () => void;
  /**
   * 위젯 헤더 드래그가 종료될 때 호출 — main 측에서 새 bounds 저장 트리거에 사용.
   * SetParent 후 widgetWindow.on('move') 가 발동하지 않으므로 직접 통지가 필요하다.
   */
  onDragEnd?: () => void;
}

export interface Win32WidgetController {
  enable(window: BrowserWindow, handlers: WidgetMouseEventHandlers): { ok: true } | { ok: false; reason: string };
  disable(window: BrowserWindow | null): void;
  isAttached(): boolean;
  /** 위젯이 이동/리사이즈 됐을 때 caching 된 widget rect 갱신을 강제. */
  refreshWidgetBounds(): void;
  /**
   * 위젯이 WorkerW 자식인 상태에서 screen 좌표로 이동/리사이즈.
   * Electron BrowserWindow.setBounds() 와 동일한 logical pixel 단위로 받아
   * 내부에서 DPI 스케일 + ScreenToClient(workerW) + MoveWindow 로 적용한다.
   * attach 상태가 아니면 false 반환 (caller 가 일반 setBounds 로 폴백).
   */
  setWidgetBoundsScreen(x: number, y: number, width: number, height: number): boolean;
  /**
   * 현재 위젯의 screen rect 를 logical pixel 로 반환. attach 상태가 아니면 null.
   * GetWindowRect 는 부모 관계와 무관하게 screen 좌표를 돌려주므로, 단순히 캐시된
   * widgetRect 를 DPI 로 나눠 logical 값으로 환산한다.
   */
  getWidgetBoundsScreen(): { x: number; y: number; width: number; height: number } | null;
}

export function createWin32WidgetController(): Win32WidgetController {
  let attachedHwnd: number | null = null;
  let workerWHwnd: number | null = null;
  let progmanHwnd: number | null = null;
  let defViewHwnd: number | null = null;
  let listViewHwnd: number | null = null;
  let savedStyle: number | null = null;
  let savedExStyle: number | null = null;
  let mouseHook: number | null = null;
  let hookCbToken: unknown = null;
  let widgetRect = { left: 0, top: 0, right: 0, bottom: 0 };
  let buttonMask = 0;
  let externalDrag = false;
  let widgetHovering = false;
  let boundsTimer: ReturnType<typeof setInterval> | null = null;
  let handlersRef: WidgetMouseEventHandlers | null = null;

  // explorer.exe 원격 메모리 (LVM_HITTEST 용)
  let explorerProcessHandle = 0;
  let remoteHitTestInfo = 0;
  let lastHitTest = { x: 0, y: 0, result: false, ts: 0, valid: false };

  // 헤더 드래그 + 8-방향 리사이즈 시뮬레이션 상태 (PR-3c+).
  // SetParent 후 DWM NC drag / browser 의 onPointerDown 둘 다 attach 상태에서 무효화되므로,
  // 헤더(상단 60 logical-px) + 가장자리(8 logical-px) 클릭을 hook 이 가로채 직접 MoveWindow 시뮬레이션.
  const HEADER_HEIGHT_LOGICAL_PX = 60;
  const RESIZE_EDGE_LOGICAL_PX = 8;
  const MIN_WIDGET_W_LOGICAL = 300;
  const MIN_WIDGET_H_LOGICAL = 200;
  type DragKind =
    | 'move'
    | 'resize-n'
    | 'resize-s'
    | 'resize-e'
    | 'resize-w'
    | 'resize-ne'
    | 'resize-nw'
    | 'resize-se'
    | 'resize-sw';
  let dragKind: DragKind | null = null;
  let dragStartScreenX = 0;
  let dragStartScreenY = 0;
  // 시작 시점 widget rect (screen physical px)
  let dragStartLeft = 0;
  let dragStartTop = 0;
  let dragStartRight = 0;
  let dragStartBottom = 0;

  const refreshBounds = (): void => {
    if (!attachedHwnd) return;
    const a = getApi();
    const rect = Buffer.alloc(16);
    if (!a.GetWindowRect(attachedHwnd, rect)) return;
    widgetRect.left = rect.readInt32LE(0);
    widgetRect.top = rect.readInt32LE(4);
    widgetRect.right = rect.readInt32LE(8);
    widgetRect.bottom = rect.readInt32LE(12);
  };

  const isPointInWidget = (x: number, y: number): boolean =>
    x >= widgetRect.left && x < widgetRect.right && y >= widgetRect.top && y < widgetRect.bottom;

  const isDesktopOrWidgetHwnd = (hwnd: number): boolean => {
    if (!hwnd) return true;
    if (hwnd === attachedHwnd) return true;
    if (hwnd === progmanHwnd || hwnd === workerWHwnd) return true;
    if (hwnd === defViewHwnd || hwnd === listViewHwnd) return true;
    return false;
  };

  const ensureHitTestResources = (): boolean => {
    if (!listViewHwnd) return false;
    if (explorerProcessHandle && remoteHitTestInfo) return true;
    const a = getApi();
    const pidBuf = Buffer.alloc(4);
    a.GetWindowThreadProcessId(listViewHwnd, pidBuf);
    const pid = pidBuf.readUInt32LE(0);
    if (!pid) return false;
    const proc = a.OpenProcess(
      PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE,
      false,
      pid,
    );
    if (!proc) return false;
    const remote = a.VirtualAllocEx(
      proc,
      0,
      HITTEST_BUFFER_SIZE,
      MEM_COMMIT | MEM_RESERVE,
      PAGE_READWRITE,
    );
    if (!remote) {
      a.CloseHandle(proc);
      return false;
    }
    explorerProcessHandle = proc;
    remoteHitTestInfo = remote;
    return true;
  };

  const cleanupHitTestResources = (): void => {
    const a = getApi();
    if (remoteHitTestInfo && explorerProcessHandle) {
      try {
        a.VirtualFreeEx(explorerProcessHandle, remoteHitTestInfo, 0, MEM_RELEASE);
      } catch {
        /* swallow */
      }
    }
    if (explorerProcessHandle) {
      try {
        a.CloseHandle(explorerProcessHandle);
      } catch {
        /* swallow */
      }
    }
    explorerProcessHandle = 0;
    remoteHitTestInfo = 0;
    lastHitTest.valid = false;
  };

  const isDesktopIconAtPoint = (screenX: number, screenY: number): boolean => {
    if (!listViewHwnd) return false;
    if (!ensureHitTestResources()) return false;
    const now = Date.now();
    if (lastHitTest.valid && lastHitTest.x === screenX && lastHitTest.y === screenY && now - lastHitTest.ts < HITTEST_CACHE_MS) {
      return lastHitTest.result;
    }
    const a = getApi();
    // ListView client 좌표로 변환
    const point = createPointBuffer(screenX, screenY);
    if (!a.ScreenToClient(listViewHwnd, point)) return false;
    const clientX = point.readInt32LE(0);
    const clientY = point.readInt32LE(4);
    // LVHITTESTINFO 작성 (POINT pt, 나머지는 ZeroMemory)
    const info = Buffer.alloc(HITTEST_BUFFER_SIZE);
    info.writeInt32LE(clientX, 0);
    info.writeInt32LE(clientY, 4);
    if (!a.WriteProcessMemory(explorerProcessHandle, remoteHitTestInfo, info, HITTEST_BUFFER_SIZE, BigInt(0))) {
      return false;
    }
    const hitIndex = Number(a.SendMessageW(listViewHwnd, LVM_HITTEST, BigInt(0), BigInt(remoteHitTestInfo)));
    const result = hitIndex >= 0;
    lastHitTest = { x: screenX, y: screenY, result, ts: now, valid: true };
    return result;
  };

  const installHook = (): boolean => {
    if (mouseHook) return true;
    if (!koffiRef) return false;
    const a = getApi();

    const hookFn = (nCode: number, wParam: bigint, lParam: bigint): bigint => {
      const passThrough = (): bigint => BigInt(a.CallNextHookEx(mouseHook ?? 0, nCode, wParam, lParam));
      try {
        if (nCode < 0 || !attachedHwnd) return passThrough();
        const msg = Number(wParam);
        const isMove = msg === WM_MOUSEMOVE;
        const isDown = msg === WM_LBUTTONDOWN || msg === WM_RBUTTONDOWN;
        const isUp = msg === WM_LBUTTONUP || msg === WM_RBUTTONUP;
        const isWheel = msg === WM_MOUSEWHEEL;
        if (!isMove && !isDown && !isUp && !isWheel) return passThrough();

        const screenX = koffiRef!.decode(lParam, 0, 'int32') as number;
        const screenY = koffiRef!.decode(lParam, 4, 'int32') as number;
        const mouseData = koffiRef!.decode(lParam, 8, 'uint32') as number;
        const inWidget = isPointInWidget(screenX, screenY);

        if (isDown && msg === WM_LBUTTONDOWN) buttonMask |= MK_LBUTTON;
        if (isDown && msg === WM_RBUTTONDOWN) buttonMask |= MK_RBUTTON;
        if (isUp && msg === WM_LBUTTONUP) buttonMask &= ~MK_LBUTTON;
        if (isUp && msg === WM_RBUTTONUP) buttonMask &= ~MK_RBUTTON;

        // ── 진행 중 드래그/리사이즈가 있으면 우선 처리 (모든 mouse 메시지 외부 차단)
        if (dragKind !== null) {
          if (isMove && workerWHwnd) {
            const dx = screenX - dragStartScreenX;
            const dy = screenY - dragStartScreenY;
            // 새 screen rect 계산 (kind 별)
            let newLeft = dragStartLeft;
            let newTop = dragStartTop;
            let newRight = dragStartRight;
            let newBottom = dragStartBottom;
            switch (dragKind) {
              case 'move':
                newLeft = dragStartLeft + dx;
                newTop = dragStartTop + dy;
                newRight = dragStartRight + dx;
                newBottom = dragStartBottom + dy;
                break;
              case 'resize-n':
                newTop = dragStartTop + dy;
                break;
              case 'resize-s':
                newBottom = dragStartBottom + dy;
                break;
              case 'resize-e':
                newRight = dragStartRight + dx;
                break;
              case 'resize-w':
                newLeft = dragStartLeft + dx;
                break;
              case 'resize-ne':
                newTop = dragStartTop + dy;
                newRight = dragStartRight + dx;
                break;
              case 'resize-nw':
                newTop = dragStartTop + dy;
                newLeft = dragStartLeft + dx;
                break;
              case 'resize-se':
                newBottom = dragStartBottom + dy;
                newRight = dragStartRight + dx;
                break;
              case 'resize-sw':
                newBottom = dragStartBottom + dy;
                newLeft = dragStartLeft + dx;
                break;
            }
            // 최소 크기 강제 (physical px 로 변환)
            let sf = 1;
            try {
              const dpi = a.GetDpiForWindow(attachedHwnd) || 96;
              sf = dpi > 0 ? dpi / 96 : 1;
            } catch {
              /* swallow */
            }
            const minW = Math.round(MIN_WIDGET_W_LOGICAL * sf);
            const minH = Math.round(MIN_WIDGET_H_LOGICAL * sf);
            if (newRight - newLeft < minW) {
              if (dragKind.includes('w')) newLeft = newRight - minW;
              else newRight = newLeft + minW;
            }
            if (newBottom - newTop < minH) {
              if (dragKind.includes('n')) newTop = newBottom - minH;
              else newBottom = newTop + minH;
            }
            // screen → workerW client
            const tlBuf = createPointBuffer(newLeft, newTop);
            if (a.ScreenToClient(workerWHwnd, tlBuf)) {
              const cx = tlBuf.readInt32LE(0);
              const cy = tlBuf.readInt32LE(4);
              a.MoveWindow(attachedHwnd, cx, cy, newRight - newLeft, newBottom - newTop, true);
              refreshBounds();
            }
            return 1n;
          }
          if (isUp && msg === WM_LBUTTONUP) {
            dragKind = null;
            const cb = handlersRef?.onDragEnd;
            if (cb) {
              try {
                cb();
              } catch {
                /* swallow */
              }
            }
            return 1n;
          }
          // 드래그/리사이즈 중 다른 버튼/휠 — 모두 차단
          return 1n;
        }

        // externalDrag: explorer 가 드래그 중이면 mouse-up 까지 위젯이 입을 닫음
        if (isUp && externalDrag) {
          externalDrag = false;
          return passThrough();
        }
        if (externalDrag) return passThrough();

        if (!inWidget) {
          if (widgetHovering) {
            widgetHovering = false;
            handlersRef?.onMouseLeave();
          }
          return passThrough();
        }

        // ── LBUTTONDOWN — 가장자리(리사이즈) → 헤더(이동) 우선 감지
        if (isDown && msg === WM_LBUTTONDOWN && workerWHwnd) {
          let sf = 1;
          try {
            const dpi = a.GetDpiForWindow(attachedHwnd) || 96;
            sf = dpi > 0 ? dpi / 96 : 1;
          } catch {
            /* swallow */
          }
          const edgePx = Math.round(RESIZE_EDGE_LOGICAL_PX * sf);
          const headerPx = Math.round(HEADER_HEIGHT_LOGICAL_PX * sf);
          const relX = screenX - widgetRect.left;
          const relY = screenY - widgetRect.top;
          const widthPx = widgetRect.right - widgetRect.left;
          const heightPx = widgetRect.bottom - widgetRect.top;
          const onLeft = relX >= 0 && relX < edgePx;
          const onRight = relX <= widthPx && relX > widthPx - edgePx;
          const onTop = relY >= 0 && relY < edgePx;
          const onBottom = relY <= heightPx && relY > heightPx - edgePx;

          let kind: DragKind | null = null;
          if (onTop && onLeft) kind = 'resize-nw';
          else if (onTop && onRight) kind = 'resize-ne';
          else if (onBottom && onLeft) kind = 'resize-sw';
          else if (onBottom && onRight) kind = 'resize-se';
          else if (onTop) kind = 'resize-n';
          else if (onBottom) kind = 'resize-s';
          else if (onLeft) kind = 'resize-w';
          else if (onRight) kind = 'resize-e';
          else if (relY >= 0 && relY < headerPx && !isDesktopIconAtPoint(screenX, screenY)) {
            kind = 'move';
          }

          if (kind !== null) {
            dragStartScreenX = screenX;
            dragStartScreenY = screenY;
            dragStartLeft = widgetRect.left;
            dragStartTop = widgetRect.top;
            dragStartRight = widgetRect.right;
            dragStartBottom = widgetRect.bottom;
            dragKind = kind;
            return 1n;
          }
        }

        // 위젯 영역 안 — 폴더 hit-test
        if (isDesktopIconAtPoint(screenX, screenY)) {
          if (isDown) {
            externalDrag = true;
          }
          if (widgetHovering) {
            widgetHovering = false;
            handlersRef?.onMouseLeave();
          }
          return passThrough(); // explorer 가 폴더 클릭/드래그 처리 ⭐
        }

        // 위젯 영역 + 빈 공간
        const cpBuf = createPointBuffer(screenX, screenY);
        if (!a.ScreenToClient(attachedHwnd, cpBuf)) return passThrough();
        const cx = cpBuf.readInt32LE(0);
        const cy = cpBuf.readInt32LE(4);

        if (isMove) {
          widgetHovering = true;
          handlersRef?.onMouseMove(cx, cy);
          // move 는 시스템에 양보 (return 1 하면 OS pipeline 죽어 커서 freeze)
          return passThrough();
        }
        if (isWheel) {
          // wheel data 의 high word 가 deltaY (signed)
          const rawDelta = (mouseData >>> 16) & 0xffff;
          const deltaY = rawDelta > 32767 ? rawDelta - 65536 : rawDelta;
          handlersRef?.onMouseWheel(cx, cy, deltaY);
          // wheel 도 시스템에 양보 (재차)
          return passThrough();
        }
        // click — PostMessage 로 위젯에 강제 전달 (위젯이 WorkerW 자식이라 일반 라우팅 끊김)
        // WindowFromPoint 검증으로 다른 앱 창이 위에 있으면 양보
        const hwndAt = a.WindowFromPoint(packPoint(screenX, screenY));
        if (!isDesktopOrWidgetHwnd(hwndAt)) {
          return passThrough();
        }
        a.PostMessageW(attachedHwnd, msg, BigInt(buttonMask & 0xffff), packPoint(cx, cy));
        return 1n; // 시스템 처리 차단 — 같은 click 이 두 번 가지 않게
      } catch {
        return passThrough();
      }
    };

    hookCbToken = koffiRef.register(hookFn, koffiRef.pointer('LLHookProc'));
    mouseHook = a.SetWindowsHookExW(WH_MOUSE_LL, hookCbToken, 0, 0);
    if (!mouseHook) {
      try {
        koffiRef.unregister(hookCbToken as never);
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
    if (hookCbToken && koffiRef) {
      try {
        koffiRef.unregister(hookCbToken as never);
      } catch {
        /* swallow */
      }
      hookCbToken = null;
    }
    buttonMask = 0;
    externalDrag = false;
    widgetHovering = false;
    dragKind = null;
  };

  return {
    enable(window: BrowserWindow, handlers: WidgetMouseEventHandlers): { ok: true } | { ok: false; reason: string } {
      try {
        getApi();
      } catch {
        return { ok: false, reason: 'koffi-load-failed' };
      }
      try {
        const handles = findDesktopHandles(true);
        if (!handles) return { ok: false, reason: 'workerw-not-found' };
        progmanHwnd = handles.progman;
        workerWHwnd = handles.workerW;
        defViewHwnd = handles.defView;
        listViewHwnd = handles.listView;

        const buf = window.getNativeWindowHandle();
        const hwnd = decodeHwndFromBuffer(buf);
        if (!hwnd) return { ok: false, reason: 'widget-not-ready' };

        const a = getApi();
        savedStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_STYLE));
        savedExStyle = Number(a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));

        const beforeRect = getWindowScreenRect(hwnd);

        const setParentResult = a.SetParent(hwnd, workerWHwnd);
        if (!setParentResult) return { ok: false, reason: 'set-parent-failed' };
        a.ShowWindow(hwnd, SW_SHOW);

        if (beforeRect) {
          const point = createPointBuffer(beforeRect.x, beforeRect.y);
          if (a.ScreenToClient(workerWHwnd, point)) {
            const clientX = point.readInt32LE(0);
            const clientY = point.readInt32LE(4);
            a.MoveWindow(hwnd, clientX, clientY, beforeRect.width, beforeRect.height, true);
          }
        }
        a.SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);

        attachedHwnd = hwnd;
        handlersRef = handlers;
        refreshBounds();
        // explorer 원격 메모리 lazy 할당 — 첫 hit-test 호출 시 ensureHitTestResources 가 자동
        if (!installHook()) {
          a.SetParent(hwnd, 0);
          if (savedStyle !== null) a.SetWindowLongPtrW(hwnd, GWL_STYLE, savedStyle);
          if (savedExStyle !== null) a.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, savedExStyle);
          a.ShowWindow(hwnd, SW_SHOW);
          attachedHwnd = null;
          workerWHwnd = null;
          defViewHwnd = null;
          listViewHwnd = null;
          progmanHwnd = null;
          savedStyle = null;
          savedExStyle = null;
          handlersRef = null;
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
      cleanupHitTestResources();
      if (!attachedHwnd) {
        progmanHwnd = null;
        workerWHwnd = null;
        defViewHwnd = null;
        listViewHwnd = null;
        savedStyle = null;
        savedExStyle = null;
        handlersRef = null;
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
      defViewHwnd = null;
      listViewHwnd = null;
      progmanHwnd = null;
      savedStyle = null;
      savedExStyle = null;
      handlersRef = null;
      widgetRect = { left: 0, top: 0, right: 0, bottom: 0 };
    },

    isAttached(): boolean {
      return attachedHwnd !== null && workerWHwnd !== null;
    },

    refreshWidgetBounds(): void {
      refreshBounds();
    },

    setWidgetBoundsScreen(x: number, y: number, width: number, height: number): boolean {
      if (!attachedHwnd || !workerWHwnd) return false;
      const a = getApi();
      let sf = 1;
      try {
        const dpi = a.GetDpiForWindow(attachedHwnd) || 96;
        sf = dpi > 0 ? dpi / 96 : 1;
      } catch {
        /* swallow */
      }
      const physScreenX = Math.round(x * sf);
      const physScreenY = Math.round(y * sf);
      const physW = Math.max(1, Math.round(width * sf));
      const physH = Math.max(1, Math.round(height * sf));
      const point = createPointBuffer(physScreenX, physScreenY);
      if (!a.ScreenToClient(workerWHwnd, point)) return false;
      const clientX = point.readInt32LE(0);
      const clientY = point.readInt32LE(4);
      if (!a.MoveWindow(attachedHwnd, clientX, clientY, physW, physH, true)) return false;
      refreshBounds();
      return true;
    },

    getWidgetBoundsScreen(): { x: number; y: number; width: number; height: number } | null {
      if (!attachedHwnd) return null;
      const a = getApi();
      refreshBounds();
      let sf = 1;
      try {
        const dpi = a.GetDpiForWindow(attachedHwnd) || 96;
        sf = dpi > 0 ? dpi / 96 : 1;
      } catch {
        /* swallow */
      }
      return {
        x: Math.round(widgetRect.left / sf),
        y: Math.round(widgetRect.top / sf),
        width: Math.round((widgetRect.right - widgetRect.left) / sf),
        height: Math.round((widgetRect.bottom - widgetRect.top) / sf),
      };
    },
  };
}
