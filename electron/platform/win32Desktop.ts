/**
 * Win32 FFI wrapper — 바탕화면 작업판 (native-desktop-mode) Phase 2.
 *
 * 책임:
 *   1. Progman → WorkerW → SHELLDLL_DefView 계층을 탐색·생성한다.
 *   2. 위젯 BrowserWindow 의 HWND 를 적절한 WorkerW 의 자식으로 SetParent 한다.
 *   3. WH_MOUSE_LL low-level mouse hook 을 설치하고 콜백에 결정 전달한다.
 *   4. 모든 native handle 을 다중 호출 안전하게 cleanup 한다.
 *
 * 사용처: electron/desktopWidgetManager.ts (Win32 분기). 본 모듈은 직접 import 하지 않고
 * desktopWidgetManager 가 process.platform === 'win32' 인 경우에만 require 한다.
 *
 * 보안:
 *   - 외부 네트워크 호출 0건.
 *   - 자격증명 수집 0건.
 *   - user32.dll / kernel32.dll 만 호출 — 새 DLL 다운로드 없음.
 *
 * 안티바이러스 false-positive:
 *   - WH_MOUSE_LL 은 일부 EDR 솔루션이 키로거 패턴으로 오탐할 수 있다. 사용자에게
 *     설정 토글로 즉시 OFF 가능함을 안내한다 (UI 책임).
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
const SWP_SHOWWINDOW = 0x0040;
const SMTO_ABORTIFHUNG = 0x0002;

// koffi opaque types
const HWND = 'void *';
const HHOOK = 'void *';
const HINSTANCE = 'void *';
const LPARAM = 'long long';
const WPARAM = 'unsigned long long';
const LRESULT = 'long long';

// ─── DLL load ────────────────────────────────────────────────────────────────
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');

// MSLLHOOKSTRUCT — WH_MOUSE_LL 콜백이 받는 lParam 가 가리키는 구조체.
// 상세: https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-msllhookstruct
const POINT = koffi.struct('POINT', {
  x: 'int32',
  y: 'int32',
});

const MSLLHOOKSTRUCT = koffi.struct('MSLLHOOKSTRUCT', {
  pt: POINT,
  mouseData: 'uint32',
  flags: 'uint32',
  time: 'uint32',
  dwExtraInfo: 'uintptr_t',
});

// ─── Function bindings ───────────────────────────────────────────────────────
const FindWindowW = user32.func('FindWindowW', HWND, ['str16', 'str16']);
const FindWindowExW = user32.func('FindWindowExW', HWND, [HWND, HWND, 'str16', 'str16']);
const SendMessageTimeoutW = user32.func('SendMessageTimeoutW', LRESULT, [
  HWND,
  'uint32',
  WPARAM,
  LPARAM,
  'uint32',
  'uint32',
  'void *',
]);
const SetParent = user32.func('SetParent', HWND, [HWND, HWND]);
const SetWindowPos = user32.func('SetWindowPos', 'bool', [
  HWND,
  HWND,
  'int32',
  'int32',
  'int32',
  'int32',
  'uint32',
]);
const EnumWindows = user32.func('EnumWindows', 'bool', ['void *', LPARAM]);
const GetClassNameW = user32.func('GetClassNameW', 'int32', [HWND, 'char16 *', 'int32']);
const SetWindowsHookExW = user32.func('SetWindowsHookExW', HHOOK, [
  'int32',
  'void *',
  HINSTANCE,
  'uint32',
]);
const CallNextHookEx = user32.func('CallNextHookEx', LRESULT, [HHOOK, 'int32', WPARAM, LPARAM]);
const UnhookWindowsHookEx = user32.func('UnhookWindowsHookEx', 'bool', [HHOOK]);
const GetModuleHandleW = kernel32.func('GetModuleHandleW', HINSTANCE, ['str16']);

// EnumWindows callback proto: BOOL CALLBACK (HWND hwnd, LPARAM lParam)
const EnumWindowsProc = koffi.proto('EnumWindowsProc', 'bool', [HWND, LPARAM]);

// LowLevelMouseProc: LRESULT CALLBACK (int nCode, WPARAM wParam, LPARAM lParam)
const LowLevelMouseProc = koffi.proto('LowLevelMouseProc', LRESULT, ['int32', WPARAM, LPARAM]);

// ─── Types exported to manager ──────────────────────────────────────────────
export type Win32Handle = unknown; // koffi 가 native pointer 를 unknown 으로 다룸

export interface MouseHookDecision {
  /** 'pass-through': 시스템 기본 동작에 맡김 (Explorer 가 받음) */
  /** 'electron-handles': Electron 위젯이 받도록 둠 (현재는 동일하게 pass-through 처리) */
  readonly action: 'pass-through' | 'electron-handles';
}

export interface Win32DesktopAPI {
  /**
   * Progman 에 WM_SPAWN_WORKER 메시지를 보내 WorkerW 를 강제 생성하고,
   * SHELLDLL_DefView 를 자식으로 가진 적절한 WorkerW HWND 를 반환한다.
   * 실패 시 null.
   */
  findOrCreateWorkerW(): Win32Handle | null;

  /**
   * widgetHwnd 를 workerW 의 자식으로 SetParent. 성공 시 true.
   */
  attachWidgetToWorkerW(widgetHwnd: Win32Handle, workerW: Win32Handle): boolean;

  /**
   * SetParent(NULL) 로 WorkerW 에서 detach. 다중 호출 안전.
   */
  detachWidgetFromWorkerW(widgetHwnd: Win32Handle): void;

  /**
   * BrowserWindow.getNativeWindowHandle() 가 돌려주는 Buffer 에서 HWND 추출.
   */
  decodeHwndFromBuffer(buf: Buffer): Win32Handle;

  /**
   * WH_MOUSE_LL 후크 설치. 콜백은 매우 자주 호출되므로 가벼워야 한다.
   * 콜백이 'pass-through' 를 반환하면 CallNextHookEx 로 위임 (Explorer 가 처리).
   * 'electron-handles' 도 현재는 동일 (Phase 3 에서 차별화 시도 예정).
   */
  installLowLevelMouseHook(
    callback: (point: { x: number; y: number }) => MouseHookDecision,
  ): Win32Handle | null;

  /**
   * SetWindowsHookEx 로 받은 HHOOK 해제. 다중 호출 안전.
   */
  uninstallMouseHook(hook: Win32Handle): void;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Buffer (Electron getNativeWindowHandle 결과) 에서 HWND 추출.
 * Windows x64 는 8 bytes pointer.
 */
function decodeHwndFromBuffer(buf: Buffer): Win32Handle {
  if (buf.length < 8) {
    // Win32 (32-bit) — 사용 가능하지만 쌤핀 빌드는 x64 only.
    const ptr = buf.readUInt32LE(0);
    return koffi.as(BigInt(ptr), HWND);
  }
  const ptr = buf.readBigUInt64LE(0);
  return koffi.as(ptr, HWND);
}

function getClassName(hwnd: Win32Handle): string {
  const buf = Buffer.alloc(256 * 2); // wide char
  const len = GetClassNameW(hwnd, buf, 256);
  if (len <= 0) return '';
  return buf.toString('utf16le', 0, len * 2);
}

function findOrCreateWorkerW(): Win32Handle | null {
  const progman = FindWindowW('Progman', null);
  if (!progman) return null;

  // Progman 에 WM_SPAWN_WORKER 메시지(0x052C, wParam=0x0D, lParam=0x01) 를 보내면
  // Windows 가 WorkerW 를 생성한다. 이 트릭은 Windows 7~11 에서 동작하지만
  // 일부 Explorer 상태에서는 이미 WorkerW 가 존재한다.
  const resultBuf = Buffer.alloc(8);
  SendMessageTimeoutW(
    progman,
    WM_SPAWN_WORKER,
    BigInt(0x0d),
    BigInt(0x01),
    SMTO_ABORTIFHUNG,
    1000,
    resultBuf,
  );

  // EnumWindows 로 'WorkerW' 클래스이면서 자식에 'SHELLDLL_DefView' 가 있는 후보를 찾는다.
  // 그게 바로 "바탕화면 wallpaper 위 / 아이콘 아래" 레이어.
  let target: Win32Handle | null = null;

  const callback = koffi.register(
    (hwnd: Win32Handle, _lp: bigint): boolean => {
      const cls = getClassName(hwnd);
      if (cls !== 'WorkerW') return true; // 계속 탐색

      const child = FindWindowExW(hwnd, null, 'SHELLDLL_DefView', null);
      if (child) {
        // SHELLDLL_DefView 자식을 가진 WorkerW 가 우리가 원하는 wallpaper 레이어.
        // 그 WorkerW 의 형제 (Z-order 상 다음 WorkerW) 가 attach 대상.
        const sibling = FindWindowExW(null, hwnd, 'WorkerW', null);
        target = sibling ?? hwnd;
        return false; // EnumWindows 종료
      }
      return true;
    },
    koffi.pointer(EnumWindowsProc),
  );

  try {
    EnumWindows(callback, BigInt(0));
  } finally {
    koffi.unregister(callback);
  }

  // fallback: SHELLDLL_DefView 직속 WorkerW 도 attach 가능
  if (!target) {
    const defView = FindWindowExW(progman, null, 'SHELLDLL_DefView', null);
    if (defView) {
      target = progman;
    }
  }

  return target;
}

function attachWidgetToWorkerW(widgetHwnd: Win32Handle, workerW: Win32Handle): boolean {
  const result = SetParent(widgetHwnd, workerW);
  if (!result) return false;
  // 위젯이 WorkerW 안에서 적절한 z-order 와 가시성을 갖도록 보정.
  SetWindowPos(
    widgetHwnd,
    koffi.as(BigInt(HWND_TOP), HWND),
    0,
    0,
    0,
    0,
    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
  );
  return true;
}

function detachWidgetFromWorkerW(widgetHwnd: Win32Handle): void {
  try {
    // SetParent(hwnd, NULL) → desktop 으로 복귀. 실패하면 무시 (이미 죽은 핸들 등).
    SetParent(widgetHwnd, koffi.as(BigInt(0), HWND));
    SetWindowPos(
      widgetHwnd,
      koffi.as(BigInt(HWND_TOP), HWND),
      0,
      0,
      0,
      0,
      SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    );
  } catch {
    // 무시 — Phase 1 의 다중 호출 안전성 요구.
  }
}

function installLowLevelMouseHook(
  callback: (point: { x: number; y: number }) => MouseHookDecision,
): Win32Handle | null {
  const hookProc = koffi.register(
    (nCode: number, wParam: bigint, lParam: bigint): bigint => {
      // nCode < 0 이면 무조건 통과.
      if (nCode < 0) {
        return CallNextHookEx(null as unknown as Win32Handle, nCode, wParam, lParam) as bigint;
      }
      try {
        // lParam 은 MSLLHOOKSTRUCT* — koffi.decode 로 .pt 를 읽는다.
        const msg = koffi.decode(lParam, MSLLHOOKSTRUCT) as { pt: { x: number; y: number } };
        const decision = callback({ x: msg.pt.x, y: msg.pt.y });
        // 'pass-through' / 'electron-handles' 둘 다 현재는 시스템에 위임.
        // Electron 위젯이 WorkerW 자식으로 attach 된 상태에서 mouse event 는
        // Windows 가 자연스럽게 z-order 에 따라 라우팅하므로, hook 은 원칙적으로
        // intercept 하지 않고 통과시킨다. Phase 3 에서 zone 외부 hit 시 별도 PostMessage 검토.
        void decision;
      } catch {
        // 콜백 예외는 hook chain 을 깨뜨리지 않도록 swallow.
      }
      return CallNextHookEx(null as unknown as Win32Handle, nCode, wParam, lParam) as bigint;
    },
    koffi.pointer(LowLevelMouseProc),
  );

  // GetModuleHandle(NULL) 은 현재 프로세스 hModule 을 돌려준다 (low-level hook 은 thread-id=0
  // global hook 이므로 hModule 이 필요).
  const hModule = GetModuleHandleW(null);
  const hook = SetWindowsHookExW(WH_MOUSE_LL, hookProc, hModule, 0);
  if (!hook) {
    koffi.unregister(hookProc);
    return null;
  }
  // hook 핸들과 hookProc 토큰을 함께 보관해 uninstall 시 unregister 도 가능하도록.
  hookProcRegistry.set(hook, hookProc);
  return hook;
}

const hookProcRegistry = new Map<Win32Handle, unknown>();

function uninstallMouseHook(hook: Win32Handle): void {
  if (!hook) return;
  try {
    UnhookWindowsHookEx(hook);
  } catch {
    // swallow
  }
  const proc = hookProcRegistry.get(hook);
  if (proc !== undefined) {
    try {
      koffi.unregister(proc);
    } catch {
      // swallow
    }
    hookProcRegistry.delete(hook);
  }
}

export function createWin32DesktopAPI(): Win32DesktopAPI {
  return {
    findOrCreateWorkerW,
    attachWidgetToWorkerW,
    detachWidgetFromWorkerW,
    decodeHwndFromBuffer,
    installLowLevelMouseHook,
    uninstallMouseHook,
  };
}

/**
 * desktopWidgetManager 가 사용할 수 있는 Win32 manager 팩토리.
 *
 * 본 함수는 Win32 native 의존성을 한 곳에 모아 manager 측에서는 단순히
 * `createWin32DesktopWidgetManager()` 만 호출하면 되도록 한다.
 */
export interface Win32WidgetController {
  enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string };
  disable(): void;
  updateWidgetBounds(window: BrowserWindow): void;
  setHitTestZones(zones: ReadonlyArray<{
    id: string;
    rect: { x: number; y: number; width: number; height: number };
  }>): void;
  isAttached(): boolean;
}

export function createWin32WidgetController(): Win32WidgetController {
  const api = createWin32DesktopAPI();
  let attachedHwnd: Win32Handle | null = null;
  let mouseHook: Win32Handle | null = null;
  let widgetBoundsCache: { x: number; y: number; width: number; height: number } | null = null;
  let zonesCache: ReadonlyArray<{
    id: string;
    rect: { x: number; y: number; width: number; height: number };
  }> = [];

  const isInRect = (
    p: { x: number; y: number },
    r: { x: number; y: number; width: number; height: number },
  ): boolean =>
    p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

  return {
    enable(window: BrowserWindow): { ok: true } | { ok: false; reason: string } {
      try {
        const buf = window.getNativeWindowHandle();
        const widgetHwnd = api.decodeHwndFromBuffer(buf);
        const workerW = api.findOrCreateWorkerW();
        if (!workerW) return { ok: false, reason: 'workerw-not-found' };
        const ok = api.attachWidgetToWorkerW(widgetHwnd, workerW);
        if (!ok) return { ok: false, reason: 'set-parent-failed' };
        attachedHwnd = widgetHwnd;
        widgetBoundsCache = window.getBounds();
        mouseHook = api.installLowLevelMouseHook((point) => {
          // 캐시 hit-test — 현재 정책상 모든 영역에서 'pass-through'. zone 진입/이탈 분기는
          // 추후 텔레메트리/디버깅용 hook 으로 활용.
          if (!widgetBoundsCache) return { action: 'pass-through' };
          const inWidget = isInRect(point, widgetBoundsCache);
          if (!inWidget) return { action: 'pass-through' };
          for (const z of zonesCache) {
            if (isInRect(point, z.rect)) return { action: 'pass-through' };
          }
          return { action: 'electron-handles' };
        });
        if (!mouseHook) {
          // hook 실패 — attach 는 유지하고 기능이 일부 제한된 상태로 진행해도 되지만
          // Phase 2 정책은 hook 도 필수로 본다 (라우팅 디버깅 hook).
          api.detachWidgetFromWorkerW(widgetHwnd);
          attachedHwnd = null;
          widgetBoundsCache = null;
          return { ok: false, reason: 'hook-install-failed' };
        }
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, reason: `exception: ${msg}` };
      }
    },

    disable(): void {
      if (mouseHook) {
        api.uninstallMouseHook(mouseHook);
        mouseHook = null;
      }
      if (attachedHwnd) {
        api.detachWidgetFromWorkerW(attachedHwnd);
        attachedHwnd = null;
      }
      widgetBoundsCache = null;
      zonesCache = [];
    },

    updateWidgetBounds(window: BrowserWindow): void {
      if (!attachedHwnd) return;
      try {
        widgetBoundsCache = window.getBounds();
      } catch {
        // window 가 곧 destroy 될 수 있음
      }
    },

    setHitTestZones(zones): void {
      zonesCache = zones.filter((z) => z.rect.width > 0 && z.rect.height > 0);
    },

    isAttached(): boolean {
      return attachedHwnd !== null;
    },
  };
}
