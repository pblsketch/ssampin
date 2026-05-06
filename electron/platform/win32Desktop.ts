/**
 * 바탕화면 아이콘 아래 모드(native-desktop) Win32 FFI wrapper.
 *
 * Phase 4-1: koffi load 검증 + getCurrentProcessId
 * Phase 4-2 (현 단계): WorkerW 탐색 + SetParent attach/detach + Z-order 보정 + IsWindow
 *
 * Phase 6/7에서 추가될 항목 (현재 not-implemented stub만):
 *   - findDesktopListView(workerW): bigint | null
 *   - lvmHitTest(listView, point): boolean
 *   - installLowLevelMouseHook(cb): MouseHookHandle
 *   - uninstallLowLevelMouseHook(h): void
 *
 * 주의:
 *   - 본 파일은 process.platform === 'win32'에서만 require된다 (lazy require).
 *   - HWND/handle 타입은 koffi 'void *' 반환값을 따른다 (BigInt | number | null).
 *     manager 레이어에서는 bigint로 통일 처리한다.
 *   - 모든 외부 호출 실패는 명시적 Error 클래스로 throw하고, manager에서 흡수한다.
 *   - SetParent/SetWindowLongPtr 결과는 GetLastError로 판단하지 않고, 반환값 0/null만
 *     확인한다 (단순화). 추가 진단이 필요하면 GetLastError를 별도 export 가능.
 */

import type { BrowserWindow } from 'electron';
import { diagLog, diagWarn } from '../nativeDesktopDiag';

// ────────────────────────────────────────────────────────────
// Error classes
// ────────────────────────────────────────────────────────────

/**
 * koffi 또는 시스템 라이브러리(user32/kernel32) load 실패.
 */
export class KoffiLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KoffiLoadError';
  }
}

/**
 * Progman 또는 WorkerW 탐색 실패.
 */
export class WorkerWNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerWNotFoundError';
  }
}

/**
 * SetParent / SetWindowLongPtr / SetWindowPos 등 attach 단계 실패.
 * UAC 거부, 무결성 레벨 차이, 정책 차단 등.
 */
export class AttachFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachFailedError';
  }
}

/**
 * Phase 6 — Explorer process OpenProcess 거부 (ACCESS_DENIED).
 * UAC 환경(관리자 권한 Explorer + 일반 권한 쌤핀) 또는 보안 정책 차단.
 */
export class OpenProcessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenProcessDeniedError';
  }
}

/**
 * Phase 6 — VirtualAllocEx / WriteProcessMemory 등 원격 메모리 조작 실패.
 */
export class RemoteMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteMemoryError';
  }
}

/**
 * Phase 7 — SetWindowsHookExW 실패. 보안 프로그램 차단 등.
 */
export class HookInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookInstallError';
  }
}

// ────────────────────────────────────────────────────────────
// Win32 constants
// ────────────────────────────────────────────────────────────

/** WM_SPAWN_WORKER — Progman에 보내 WorkerW 생성을 유도하는 비공식 메시지 */
const WM_SPAWN_WORKER = 0x052c;

/** GWL_EXSTYLE — GetWindowLongPtrW 인덱스 (extended window styles) */
const GWL_EXSTYLE = -20;

/** GWL_STYLE — GetWindowLongPtrW 인덱스 (basic window styles)
 *
 * G2-bis 게이트 진단:
 *   transparent+frame:false BrowserWindow는 Win32 레벨에서 WS_POPUP top-level이다.
 *   SetParent 호출은 success를 반환하지만 WS_POPUP 윈도우는 진짜 child가 되지 않고
 *   owner relationship으로만 처리된다 → GetParent(hwnd)는 0n 반환 → 검증 실패.
 *
 *   해결책: SetParent 직전에 WS_POPUP 비트 제거 + WS_CHILD 추가.
 *   detach 시 원래 style 복원 필수.
 *
 *   참고: Wallpaper Engine, Lively Wallpaper, RainMeter 등 데스크톱 widget 도구가 동일 패턴 사용.
 */
const GWL_STYLE = -16;

/** Window style 비트 — WS_POPUP / WS_CHILD 변환에만 사용. 다른 비트는 그대로 보존. */
const WS_POPUP = 0x80000000n;
const WS_CHILD = 0x40000000n;

/** SetWindowPos uFlags */
const SWP_NOACTIVATE = 0x0010;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_FRAMECHANGED = 0x0020;
/**
 * Phase 7-C — drag hot path 추가 플래그.
 *
 * SWP_NOZORDER: hWndInsertAfter 무시 + 현재 Z-order 유지. drag 중 widget이 임의로 위로
 *   올라오는 부작용 방지 (HWND_BOTTOM 사용 안 함 → 부모 안에서 매 프레임 Z 변경 시
 *   message pump 흔들림 발생).
 * SWP_ASYNCWINDOWPOS: 호출자가 OS의 ZOrder thread에 작업을 큐잉한 뒤 즉시 반환. drag
 *   중 매 MOUSEMOVE에 동기 호출하면 hook callback hot path에서 다른 thread의 SetWindowPos
 *   결과를 기다리는 동안 mouse callback이 누적 → 성능 저하. 비동기로 던지면 끊김 없는
 *   drag가 가능하다.
 */
const SWP_NOZORDER = 0x0004;
const SWP_ASYNCWINDOWPOS = 0x4000;

/** ShowWindow nCmdShow */
const SW_SHOWNOACTIVATE = 4;

/** SetWindowPos hWndInsertAfter */
const HWND_BOTTOM_HANDLE = 1; // 0이 아닌 sentinel — koffi에서 bigint(1)로 전달

/** OpenProcess access flags */
const PROCESS_VM_OPERATION = 0x0008;
const PROCESS_VM_READ = 0x0010;
const PROCESS_VM_WRITE = 0x0020;
const PROCESS_QUERY_INFORMATION = 0x0400;

/** VirtualAllocEx flAllocationType */
const MEM_COMMIT = 0x1000;
const MEM_RESERVE = 0x2000;
/** VirtualAllocEx flProtect */
const PAGE_READWRITE = 0x04;
/** VirtualFreeEx dwFreeType */
const MEM_RELEASE = 0x8000;

/** ListView messages */
const LVM_FIRST = 0x1000;
const LVM_HITTEST = LVM_FIRST + 18;

/** SetWindowsHookExW idHook */
const WH_MOUSE_LL = 14;

/** GetWindow uCmd */
const GW_HWNDNEXT = 2;
const GW_HWNDPREV = 3;

/**
 * Phase 7-A — Win32 mouse 메시지 상수.
 *
 * WH_MOUSE_LL hook callback은 wParam에 본 메시지 타입을 받는다 (MSDN: lowlevelmouseproc).
 * WS_CHILD가 된 위젯 HWND가 정상적으로 받지 못하는 (top-level이 아니므로 OS의 default
 * routing이 부모 WorkerW로 전달하지 않음) 마우스 이벤트들 중 가장 자주 쓰이는 것을
 * PostMessage로 직접 전달한다.
 *
 * 분류:
 *   - 클릭/이동 (Phase 7-A): LBUTTONDOWN/UP/DBLCLK, RBUTTONDOWN/UP, MBUTTONDOWN/UP, MOUSEMOVE
 *   - 휠 (Phase 7-B 예정): MOUSEWHEEL, MOUSEHWHEEL
 *   - 헤더 드래그 (Phase 7-C 예정): WM_NCLBUTTONDOWN
 *   - resize (Phase 7-D 예정): WM_NCHITTEST 기반 cursor 처리
 */
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_LBUTTONDBLCLK = 0x0203;
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;
const WM_MBUTTONDOWN = 0x0207;
const WM_MBUTTONUP = 0x0208;
/**
 * Phase 7-B — 휠 메시지 상수.
 *
 * WM_MOUSEWHEEL: 수직 휠. MSLLHOOKSTRUCT.mouseData의 HIWORD에 wheel delta(signed short).
 * WM_MOUSEHWHEEL: 수평 휠(틸트). 동일 위치에 horizontal delta.
 *
 * Win32 wheel delta convention: WHEEL_DELTA = ±120 per click.
 *   양수 = 위/오른쪽으로 회전 (멀리 미는 동작)
 *   음수 = 아래/왼쪽으로 회전 (가까이 당기는 동작)
 *
 * Chromium deltaY convention: 양수 = 아래로 스크롤 (페이지가 위로 이동).
 *   따라서 WM_MOUSEWHEEL의 양수 delta는 Chromium deltaY 음수에 해당 → 부호 반전 필요.
 */
const WM_MOUSEWHEEL = 0x020a;
const WM_MOUSEHWHEEL = 0x020e;

// ────────────────────────────────────────────────────────────
// Bindings
// ────────────────────────────────────────────────────────────

/**
 * Lazy 초기화된 Win32 함수 바인딩.
 * koffi.load() / func() 실패 시 KoffiLoadError throw, cache는 무효화.
 */
interface Win32Bindings {
  // kernel32
  GetCurrentProcessId: () => number;

  // user32 — 창 탐색
  FindWindowW: (className: string | null, windowName: string | null) => bigint | null;
  FindWindowExW: (
    parent: bigint | number | null,
    childAfter: bigint | number | null,
    className: string | null,
    windowName: string | null,
  ) => bigint | null;
  EnumWindows: (callback: unknown, lParam: bigint | number) => number;

  // user32 — 메시지 송신
  SendMessageW: (hWnd: bigint | number, msg: number, wParam: bigint | number, lParam: bigint | number) => bigint | number;
  SendMessageTimeoutW: (
    hWnd: bigint | number,
    msg: number,
    wParam: bigint | number,
    lParam: bigint | number,
    fuFlags: number,
    uTimeout: number,
    lpdwResult: unknown,
  ) => bigint | number;
  /**
   * Phase 7-A — 비동기 메시지 송신.
   *
   * WH_MOUSE_LL callback hot path에서 widget HWND로 마우스 메시지를 전달하려면 SendMessage는
   * 부적합(callback 동기 wait + Chromium message pump가 hook callback 안에 갇혀 deadlock).
   * PostMessage는 즉시 반환하고 윈도우 큐에 enqueue → renderer가 일반 message loop에서 소비.
   *
   * @returns nonzero = success, 0 = failure (큐 가득 참 등). 본 단계에선 silent ignore.
   */
  PostMessageW: (
    hWnd: bigint | number,
    msg: number,
    wParam: bigint | number,
    lParam: bigint | number,
  ) => number;

  // user32 — 부모/스타일/표시
  SetParent: (child: bigint | number, newParent: bigint | number | null) => bigint | null;
  GetParent: (hWnd: bigint | number) => bigint | null;
  GetWindowLongPtrW: (hWnd: bigint | number, nIndex: number) => bigint | number;
  SetWindowLongPtrW: (hWnd: bigint | number, nIndex: number, dwNewLong: bigint | number) => bigint | number;
  SetWindowPos: (
    hWnd: bigint | number,
    hWndInsertAfter: bigint | number,
    x: number, y: number, cx: number, cy: number,
    flags: number,
  ) => number;
  ShowWindow: (hWnd: bigint | number, nCmdShow: number) => number;
  IsWindow: (hWnd: bigint | number) => number;

  // user32 — sibling/child traversal (Strategy 2/3 보조)
  GetWindow: (hWnd: bigint | number, uCmd: number) => bigint | null;

  // user32 — Phase 6: 좌표/스레드/프로세스
  GetWindowThreadProcessId: (hWnd: bigint | number, lpdwProcessId: unknown) => number;
  ScreenToClient: (hWnd: bigint | number, lpPoint: unknown) => number;

  // kernel32 — Phase 6: 원격 메모리 조작
  OpenProcess: (dwDesiredAccess: number, bInheritHandle: number, dwProcessId: number) => bigint | null;
  CloseHandle: (hObject: bigint | number) => number;
  VirtualAllocEx: (
    hProcess: bigint | number,
    lpAddress: bigint | number,
    dwSize: number | bigint,
    flAllocationType: number,
    flProtect: number,
  ) => bigint | null;
  VirtualFreeEx: (
    hProcess: bigint | number,
    lpAddress: bigint | number,
    dwSize: number | bigint,
    dwFreeType: number,
  ) => number;
  WriteProcessMemory: (
    hProcess: bigint | number,
    lpBaseAddress: bigint | number,
    lpBuffer: unknown,
    nSize: number | bigint,
    lpNumberOfBytesWritten: unknown,
  ) => number;
  ReadProcessMemory: (
    hProcess: bigint | number,
    lpBaseAddress: bigint | number,
    lpBuffer: unknown,
    nSize: number | bigint,
    lpNumberOfBytesRead: unknown,
  ) => number;

  // user32 — Phase 7: low-level mouse hook
  SetWindowsHookExW: (idHook: number, lpfn: unknown, hmod: bigint | number | null, dwThreadId: number) => bigint | null;
  UnhookWindowsHookEx: (hhk: bigint | number) => number;
  // Phase 7-B: lParam은 proto에서 'void*'이므로 koffi가 External pointer object | BigInt | number 가능 → unknown.
  CallNextHookEx: (hhk: bigint | number | null, nCode: number, wParam: bigint | number, lParam: unknown) => bigint | number;

  // kernel32 — Phase 7: 모듈 핸들 (hook callback이 모듈에 속해야 함)
  GetModuleHandleW: (lpModuleName: string | null) => bigint | null;

  // koffi 헬퍼 (callback 등록 등 Phase 7에서 사용)
  koffi: typeof import('koffi');
}

let cachedBindings: Win32Bindings | null = null;
let cachedKoffi: typeof import('koffi') | null = null;
// koffi.proto는 같은 type 이름을 두 번 등록하면 'Duplicate type name' throw → module-level 캐시.
// hook을 설치/해제/재설치할 때마다 새로 만들면 안 됨. 단 하나의 proto를 평생 재사용.
let cachedLowLevelMouseProc: unknown = null;
// Phase 7-B 진단: OutputDebugStringW 캐시 — DebugView로 hook callback 가시화.
let cachedOutputDebugStringW: ((msg: string) => void) | null = null;

function loadKoffi(): typeof import('koffi') {
  if (cachedKoffi) return cachedKoffi;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedKoffi = require('koffi') as typeof import('koffi');
    return cachedKoffi;
  } catch (e) {
    throw new KoffiLoadError(
      `koffi 모듈 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

function loadWin32Bindings(): Win32Bindings {
  if (cachedBindings) return cachedBindings;

  const koffi = loadKoffi();

  // Phase 7-B: SetWindowsHookExW의 두번째 인자를 typed function pointer로 선언하기 위해
  // proto를 bindings 로드 직전에 미리 등록한다. 이전 구현은 SetWindowsHookExW 시그니처를
  // 'void *'(untyped)로 두었는데, 동일 환경(Win11 24H2)에서 동작하는 외부 데스크톱 위젯 v1.1.5
  // 분석 결과 typed `LLHookProc*`가 결정적 차이로 식별됨. koffi가 callback ABI를 인식하려면
  // SetWindowsHookExW 시그니처에서 두번째 인자를 함수 포인터 타입으로 명시해야 한다.
  //
  // proto는 module-level 캐시에 보관 — 'Duplicate type name' 회피.
  if (cachedLowLevelMouseProc === null) {
    cachedLowLevelMouseProc = koffi.proto(
      'intptr_t __stdcall LowLevelMouseProc(int nCode, uintptr_t wParam, void *lParam)',
    );
  }

  let kernel32: ReturnType<typeof koffi.load>;
  let user32: ReturnType<typeof koffi.load>;
  try {
    kernel32 = koffi.load('kernel32.dll');
  } catch (e) {
    throw new KoffiLoadError(
      `kernel32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
  try {
    user32 = koffi.load('user32.dll');
  } catch (e) {
    throw new KoffiLoadError(
      `user32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  // koffi 시그너처 표기:
  //   - HWND, HMODULE, HHOOK 등은 'void *' (koffi가 BigInt로 반환).
  //   - DWORD/UINT는 'uint32', LRESULT/LPARAM는 64-bit OS에서 'intptr_t' 권장.
  //   - WPARAM/LPARAM도 64-bit에서 'intptr_t'.
  //   - 문자열은 'str16' (UTF-16 LE) — Win32 W 함수.
  // Win32 ANSI/W 둘 다 있을 때 W를 선택해 한글 환경 호환성 보장.

  try {
    const GetCurrentProcessId = kernel32.func('uint32 __stdcall GetCurrentProcessId()') as Win32Bindings['GetCurrentProcessId'];

    const FindWindowW = user32.func(
      'void* __stdcall FindWindowW(str16, str16)',
    ) as Win32Bindings['FindWindowW'];

    const FindWindowExW = user32.func(
      'void* __stdcall FindWindowExW(void*, void*, str16, str16)',
    ) as Win32Bindings['FindWindowExW'];

    const EnumWindows = user32.func(
      'int __stdcall EnumWindows(void *, intptr_t)',
    ) as Win32Bindings['EnumWindows'];

    const SendMessageW = user32.func(
      'intptr_t __stdcall SendMessageW(void*, uint32, intptr_t, intptr_t)',
    ) as Win32Bindings['SendMessageW'];

    const SendMessageTimeoutW = user32.func(
      'intptr_t __stdcall SendMessageTimeoutW(void*, uint32, intptr_t, intptr_t, uint32, uint32, intptr_t *)',
    ) as Win32Bindings['SendMessageTimeoutW'];

    const PostMessageW = user32.func(
      'int __stdcall PostMessageW(void*, uint32, intptr_t, intptr_t)',
    ) as Win32Bindings['PostMessageW'];

    const SetParent = user32.func(
      'void* __stdcall SetParent(void*, void*)',
    ) as Win32Bindings['SetParent'];

    const GetParent = user32.func(
      'void* __stdcall GetParent(void*)',
    ) as Win32Bindings['GetParent'];

    const GetWindowLongPtrW = user32.func(
      'intptr_t __stdcall GetWindowLongPtrW(void*, int)',
    ) as Win32Bindings['GetWindowLongPtrW'];

    const SetWindowLongPtrW = user32.func(
      'intptr_t __stdcall SetWindowLongPtrW(void*, int, intptr_t)',
    ) as Win32Bindings['SetWindowLongPtrW'];

    const SetWindowPos = user32.func(
      'int __stdcall SetWindowPos(void*, void*, int, int, int, int, uint32)',
    ) as Win32Bindings['SetWindowPos'];

    const ShowWindow = user32.func(
      'int __stdcall ShowWindow(void*, int)',
    ) as Win32Bindings['ShowWindow'];

    const IsWindow = user32.func(
      'int __stdcall IsWindow(void*)',
    ) as Win32Bindings['IsWindow'];

    const GetWindow = user32.func(
      'void* __stdcall GetWindow(void*, uint32)',
    ) as Win32Bindings['GetWindow'];

    // Phase 6 추가 바인딩
    const GetWindowThreadProcessId = user32.func(
      'uint32 __stdcall GetWindowThreadProcessId(void*, uint32 *)',
    ) as Win32Bindings['GetWindowThreadProcessId'];

    const ScreenToClient = user32.func(
      'int __stdcall ScreenToClient(void*, void *)',
    ) as Win32Bindings['ScreenToClient'];

    const OpenProcess = kernel32.func(
      'void* __stdcall OpenProcess(uint32, int, uint32)',
    ) as Win32Bindings['OpenProcess'];

    const CloseHandle = kernel32.func(
      'int __stdcall CloseHandle(void*)',
    ) as Win32Bindings['CloseHandle'];

    const VirtualAllocEx = kernel32.func(
      'void* __stdcall VirtualAllocEx(void*, void*, size_t, uint32, uint32)',
    ) as Win32Bindings['VirtualAllocEx'];

    const VirtualFreeEx = kernel32.func(
      'int __stdcall VirtualFreeEx(void*, void*, size_t, uint32)',
    ) as Win32Bindings['VirtualFreeEx'];

    const WriteProcessMemory = kernel32.func(
      'int __stdcall WriteProcessMemory(void*, void*, void *, size_t, size_t *)',
    ) as Win32Bindings['WriteProcessMemory'];

    const ReadProcessMemory = kernel32.func(
      'int __stdcall ReadProcessMemory(void*, void*, void *, size_t, size_t *)',
    ) as Win32Bindings['ReadProcessMemory'];

    // Phase 7
    // Phase 7-B FIX: 두번째 인자를 LowLevelMouseProc* (typed function pointer)로 변경.
    // 외부 데스크톱 위젯 1.1.5의 결정적 차이 — koffi가 callback dispatcher를 올바르게 thunk하려면
    // 함수 포인터 타입을 sig에 명시해야 한다. void*는 raw pointer로 처리되어 OS가 callback을
    // dispatch해도 JS 함수까지 전파되지 않는 것으로 추정 (Electron 40 + koffi 2.16 환경에서).
    const SetWindowsHookExW = user32.func(
      'void* __stdcall SetWindowsHookExW(int, LowLevelMouseProc *, void*, uint32)',
    ) as Win32Bindings['SetWindowsHookExW'];

    const UnhookWindowsHookEx = user32.func(
      'int __stdcall UnhookWindowsHookEx(void*)',
    ) as Win32Bindings['UnhookWindowsHookEx'];

    // Phase 7-B FIX: lParam을 'void*'로 변경 — koffi.decode를 더 자연스럽게 사용 + 외부 데스크톱 위젯와 정합.
    const CallNextHookEx = user32.func(
      'intptr_t __stdcall CallNextHookEx(void*, int, uintptr_t, void *)',
    ) as Win32Bindings['CallNextHookEx'];

    const GetModuleHandleW = kernel32.func(
      'void* __stdcall GetModuleHandleW(str16)',
    ) as Win32Bindings['GetModuleHandleW'];

    // Phase 7-B 진단: hook callback 진입을 OutputDebugStringW로 시그널 — 파일 IO보다 가볍고
    // DebugView 등 외부 도구로 가시화 가능. file fanout이 silent fail하는 경우 대비.
    try {
      const OutputDebugStringW = kernel32.func(
        'void __stdcall OutputDebugStringW(str16)',
      ) as (msg: string) => void;
      cachedOutputDebugStringW = OutputDebugStringW;
    } catch {
      cachedOutputDebugStringW = null;
    }

    cachedBindings = {
      GetCurrentProcessId,
      FindWindowW,
      FindWindowExW,
      EnumWindows,
      SendMessageW,
      SendMessageTimeoutW,
      PostMessageW,
      SetParent,
      GetParent,
      GetWindowLongPtrW,
      SetWindowLongPtrW,
      SetWindowPos,
      ShowWindow,
      IsWindow,
      GetWindow,
      GetWindowThreadProcessId,
      ScreenToClient,
      OpenProcess,
      CloseHandle,
      VirtualAllocEx,
      VirtualFreeEx,
      WriteProcessMemory,
      ReadProcessMemory,
      SetWindowsHookExW,
      UnhookWindowsHookEx,
      CallNextHookEx,
      GetModuleHandleW,
      koffi,
    };
    return cachedBindings;
  } catch (e) {
    throw new KoffiLoadError(
      `Win32 함수 바인딩 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * koffi 'void *' 반환값을 bigint로 정규화.
 *
 * **중요 — koffi 2.x ABI**:
 *   - 함수 시그너처가 `void *` (또는 `HWND` 등 opaque pointer) 반환이면
 *     koffi는 **External pointer object**(JS 'object' typeof)를 반환한다.
 *     BigInt도 number도 아니다.
 *   - 이 객체를 `BigInt()`나 template literal/concatenation에 넣으면
 *     "Cannot convert object to primitive value" TypeError가 발생한다.
 *   - 정수 값을 얻으려면 반드시 `koffi.address(ptr)`를 호출해야 하며,
 *     `koffi.address(null)`은 0n을 안전하게 반환한다.
 *
 * 따라서 본 함수는 koffi External pointer를 1차 케이스로 처리하고,
 * 그 외에는 BigInt/number/null로 fallback한다.
 *
 * - null / undefined / 0 → 0n
 * - bigint → 그대로
 * - number → BigInt(number)
 * - 그 외(객체) → koffi.address(handle) 호출 (External pointer 가정)
 *
 * @throws Error koffi.address가 unsupported value를 받으면 koffi 자체가 throw한다.
 *   호출자는 try/catch로 흡수해 명시적 도메인 에러로 변환할 책임이 있다.
 */
function toBigInt(handle: unknown): bigint {
  if (handle === null || handle === undefined) return 0n;
  if (typeof handle === 'bigint') return handle;
  if (typeof handle === 'number') return BigInt(handle);
  // 'object' 또는 'function' (External pointer) — koffi.address로 BigInt 추출.
  // cachedKoffi는 loadKoffi()가 cache했어야 함. 호출 순서상 toBigInt가 먼저 도달할 수 없다.
  if (cachedKoffi) {
    return cachedKoffi.address(handle as never);
  }
  // koffi 미초기화 상태에서 객체가 들어오면 안 된다 — 호출 순서 위반.
  throw new Error(
    `toBigInt: koffi 미초기화 상태에서 외부 포인터 객체 수신 (typeof=${typeof handle})`,
  );
}

function isNullHandle(h: bigint): boolean {
  return h === 0n;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Phase 4-1 동작 검증용. 다음 Phase에서도 진단/health-check에 사용 가능.
 */
export function getCurrentProcessId(): number {
  const b = loadWin32Bindings();
  return b.GetCurrentProcessId();
}

/**
 * 위젯 BrowserWindow에서 native HWND를 추출한다.
 *
 * Electron이 반환하는 Buffer는 32-bit OS에서 4바이트, 64-bit OS에서 8바이트.
 * 64-bit Windows 가정으로 readBigUInt64LE 사용.
 * isDestroyed 또는 buffer length 비정상이면 throw.
 */
export function getWidgetHwnd(win: BrowserWindow): bigint {
  if (!win || win.isDestroyed()) {
    throw new AttachFailedError('getWidgetHwnd: BrowserWindow가 destroy 상태');
  }
  const buf = win.getNativeWindowHandle();
  if (!buf || buf.length < 8) {
    throw new AttachFailedError(
      `getWidgetHwnd: native handle buffer 비정상 (length=${buf?.length ?? 0})`,
    );
  }
  return buf.readBigUInt64LE(0);
}

/**
 * G2 게이트 진단으로 발견된 환경 분기를 위한 인터페이스.
 *
 * 사용자 환경 데스크톱 윈도우 계층은 표준과 다를 수 있다:
 *   - 표준: Progman → WorkerW → SHELLDLL_DefView → SysListView32
 *   - 변종: Progman → SHELLDLL_DefView → SysListView32 (Wallpaper Engine, ExplorerPatcher 등)
 *
 * `enable()`은 다음 우선순위로 attach 후보를 시도한다:
 *   STRATEGY1: 표준 WorkerW (SHELLDLL_DefView 자식 보유)
 *   STRATEGY2: SHELLDLL_DefView의 sibling WorkerW (Wallpaper Engine 패턴)
 *   STRATEGY3: SHELLDLL_DefView 자체 (Progman 직속 SHELLDLL_DefView 환경)
 *
 * Progman 자체는 SetParent 거부 환경이 다수 발견되어(G2 진단 결과) 사용하지 않는다.
 */
export interface DesktopAttachCandidates {
  /** 표준 패턴으로 발견된 WorkerW들 (0개~여러 개) */
  readonly standardWorkerWs: readonly bigint[];
  /** SHELLDLL_DefView 핸들 (Progman 직속 자식). 없으면 0n. */
  readonly shellDefView: bigint;
  /** SHELLDLL_DefView의 sibling WorkerW (Strategy 2). 없으면 0n. */
  readonly shellDefViewSiblingWorkerW: bigint;
  /** Progman 핸들. 진단/대체 검색용. SetParent 대상으로 사용 금지. */
  readonly progman: bigint;
}

/**
 * 데스크톱 attach 후보 핸들 목록을 모두 수집한다.
 *
 * 이전 `findOrCreateWorkerW()`를 대체. 단일 핸들이 아니라 strategy별 후보 묶음을 반환.
 * 호출자(enable)는 우선순위에 따라 순차 시도한다.
 *
 * @throws WorkerWNotFoundError Progman 자체가 없는 경우(매우 비정상적)
 */
export function collectDesktopAttachCandidates(): DesktopAttachCandidates {
  diagLog('native-desktop', 'collectDesktopAttachCandidates.A: enter');
  const b = loadWin32Bindings();
  diagLog('native-desktop', 'collectDesktopAttachCandidates.B: bindings loaded');

  // 1. Progman 탐색 (필수 anchor)
  let progmanRaw: unknown;
  try {
    progmanRaw = b.FindWindowW('Progman', null);
  } catch (e) {
    diagWarn('native-desktop', `collectDesktopAttachCandidates.C: FindWindowW(Progman) throw: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  let progman: bigint;
  try {
    progman = toBigInt(progmanRaw);
  } catch (e) {
    diagWarn('native-desktop', `collectDesktopAttachCandidates.D: toBigInt(progman) throw: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  diagLog('native-desktop', `collectDesktopAttachCandidates.D: Progman=0x${progman.toString(16)}`);
  if (isNullHandle(progman)) {
    throw new WorkerWNotFoundError('Progman 창을 찾을 수 없음');
  }

  // 2. WM_SPAWN_WORKER 송신 — idempotent. WorkerW 생성을 유도.
  try {
    b.SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0xd, 0, 0x0002, 1000, 0);
    diagLog('native-desktop', 'collectDesktopAttachCandidates.E: WM_SPAWN_WORKER sent');
  } catch (e) {
    diagWarn('native-desktop', `collectDesktopAttachCandidates.E: WM_SPAWN_WORKER send 실패 (무시): ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. STRATEGY 1 — 모든 top-level WorkerW 순회. SHELLDLL_DefView 자식 보유 후보 모두 수집.
  diagLog('native-desktop', 'collectDesktopAttachCandidates.STRATEGY1: 표준 WorkerW 탐색...');
  const standardWorkerWs: bigint[] = [];
  let prev: bigint = 0n;
  let count = 0;
  for (let i = 0; i < 64; i++) {
    let workerWRaw: unknown;
    try {
      workerWRaw = b.FindWindowExW(null, prev === 0n ? null : prev, 'WorkerW', null);
    } catch (e) {
      diagWarn('native-desktop', `collectDesktopAttachCandidates.F[${i}]: FindWindowExW(WorkerW) throw: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    let workerW: bigint;
    try {
      workerW = toBigInt(workerWRaw);
    } catch (e) {
      diagWarn('native-desktop', `collectDesktopAttachCandidates.F[${i}]: toBigInt(workerW) throw: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    if (isNullHandle(workerW)) break;
    count++;
    const shellDef = toBigInt(b.FindWindowExW(workerW, null, 'SHELLDLL_DefView', null));
    diagLog('native-desktop', `collectDesktopAttachCandidates.G: WorkerW#${count}=0x${workerW.toString(16)}, SHELLDLL_DefView=${isNullHandle(shellDef) ? 'NONE' : '0x' + shellDef.toString(16)}`);
    if (!isNullHandle(shellDef)) {
      standardWorkerWs.push(workerW);
    }
    prev = workerW;
  }
  diagLog('native-desktop', `collectDesktopAttachCandidates.STRATEGY1_RESULT: ${standardWorkerWs.length}개 표준 WorkerW 후보 (검사 ${count}개)`);

  // 4. SHELLDLL_DefView (Progman 직속) — STRATEGY 2/3에서 사용
  let shellDefView: bigint = 0n;
  try {
    shellDefView = toBigInt(b.FindWindowExW(progman, null, 'SHELLDLL_DefView', null));
  } catch (e) {
    diagWarn('native-desktop', `collectDesktopAttachCandidates.H: FindWindowExW(Progman, SHELLDLL_DefView) throw: ${e instanceof Error ? e.message : String(e)}`);
  }
  diagLog('native-desktop', `collectDesktopAttachCandidates.H: Progman 직속 SHELLDLL_DefView=${isNullHandle(shellDefView) ? 'NONE' : '0x' + shellDefView.toString(16)}`);

  // 5. STRATEGY 2 — SHELLDLL_DefView의 sibling WorkerW 탐색
  // Progman의 자식 트리에서 GetWindow(shellDefView, GW_HWNDPREV/NEXT)로 sibling 검사.
  // 또는 FindWindowExW로 Progman의 모든 자식을 순회하며 클래스가 WorkerW이고
  // GW_HWNDNEXT가 shellDefView인 후보를 찾는다.
  diagLog('native-desktop', 'collectDesktopAttachCandidates.STRATEGY2: SHELLDLL_DefView sibling 탐색...');
  let shellDefViewSiblingWorkerW: bigint = 0n;
  if (!isNullHandle(shellDefView)) {
    // 방법 A: GetWindow(shellDefView, GW_HWNDPREV/NEXT)로 직접 sibling 조회
    // 단, sibling은 같은 부모(=Progman)의 자식 사이에서만 의미 있음.
    try {
      const prevSibling = toBigInt(b.GetWindow(shellDefView, GW_HWNDPREV));
      const nextSibling = toBigInt(b.GetWindow(shellDefView, GW_HWNDNEXT));
      diagLog('native-desktop', `collectDesktopAttachCandidates.STRATEGY2.A: shellDefView siblings prev=0x${prevSibling.toString(16)} next=0x${nextSibling.toString(16)}`);

      // 클래스 검증은 EnumChildWindows 없이 GetClassName으로 해야 하지만 본 구현엔
      // GetClassName이 없다. 대신 FindWindowExW로 Progman의 자식 WorkerW를 순회하며
      // 각 WorkerW의 GetWindow(GW_HWNDNEXT)가 shellDefView인 것을 찾는다.
      let childPrev: bigint = 0n;
      for (let i = 0; i < 32; i++) {
        const childRaw = b.FindWindowExW(progman, childPrev === 0n ? null : childPrev, 'WorkerW', null);
        const child = toBigInt(childRaw);
        if (isNullHandle(child)) break;
        const childNextSibling = toBigInt(b.GetWindow(child, GW_HWNDNEXT));
        const childPrevSibling = toBigInt(b.GetWindow(child, GW_HWNDPREV));
        diagLog('native-desktop', `collectDesktopAttachCandidates.STRATEGY2.B: Progman 자식 WorkerW#${i + 1}=0x${child.toString(16)}, prev=0x${childPrevSibling.toString(16)}, next=0x${childNextSibling.toString(16)}`);
        if (childNextSibling === shellDefView || childPrevSibling === shellDefView) {
          shellDefViewSiblingWorkerW = child;
          diagLog('native-desktop', `collectDesktopAttachCandidates.STRATEGY2.C: SUCCESS sibling WorkerW=0x${child.toString(16)}`);
          break;
        }
        childPrev = child;
      }
    } catch (e) {
      diagWarn('native-desktop', `collectDesktopAttachCandidates.STRATEGY2: 예외 (무시): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  diagLog('native-desktop', `collectDesktopAttachCandidates.STRATEGY2_RESULT: ${isNullHandle(shellDefViewSiblingWorkerW) ? 'NONE' : '0x' + shellDefViewSiblingWorkerW.toString(16)}`);

  return {
    standardWorkerWs,
    shellDefView,
    shellDefViewSiblingWorkerW,
    progman,
  };
}

/**
 * 하위 호환 래퍼.
 *
 * @deprecated `enable()`은 `collectDesktopAttachCandidates`를 직접 사용한다.
 *   이 함수는 첫 번째 표준 WorkerW만 반환하며, sibling WorkerW나 SHELLDLL_DefView를
 *   고려하지 않는다. 외부 호출자가 있으면 정리 후 제거 예정.
 *
 * @throws WorkerWNotFoundError 표준 WorkerW 후보가 0개인 경우.
 */
export function findOrCreateWorkerW(): bigint {
  const cands = collectDesktopAttachCandidates();
  if (cands.standardWorkerWs.length > 0) {
    return cands.standardWorkerWs[0]!;
  }
  throw new WorkerWNotFoundError(
    'SHELLDLL_DefView를 자식으로 둔 표준 WorkerW를 찾을 수 없음 (Progman fallback은 G2 진단에서 거부 확인됨)',
  );
}

/**
 * attach 시 보존했다가 detach 시 원복할 핸들 묶음.
 */
export interface Win32DesktopHandles {
  /** WorkerW 또는 Progman handle */
  readonly workerW: bigint;
  /** 위젯 BrowserWindow의 HWND */
  readonly widgetHwnd: bigint;
  /** attach 직전의 부모 창 (보통 0). detach 시 SetParent로 복원 */
  readonly prevParent: bigint;
  /** attach 직전의 GWL_EXSTYLE (예: WS_EX_LAYERED 보존용) */
  readonly prevExStyle: bigint;
  /**
   * attach 직전의 GWL_STYLE.
   *
   * G2-bis 진단 결과: transparent+frame:false BrowserWindow는 WS_POPUP top-level이라
   * SetParent만으로는 child relationship이 수립되지 않는다.
   * attach 시 WS_POPUP을 제거하고 WS_CHILD를 추가하며, detach 시 본 값으로 정확히 복원해야
   * 위젯이 다시 정상 top-level로 동작한다.
   *
   * **반드시 detach 시 SetParent보다 뒤에 복원** (style 변경이 message pump을 흔들어
   * 부모 관계가 재계산되기 때문에 순서가 중요).
   */
  readonly prevStyle: bigint;
}

/**
 * SetParent 검증을 race-tolerant하게 수행한다.
 *
 * 일부 환경(특히 셸 변종)에서는 SetParent 직후 GetParent가 일시적으로 0을 반환했다가
 * 짧은 지연 후 정상값을 반환한다. 반대로 SetParent 직후 OS가 즉시 부모를 떼어낸 경우
 * (Progman 등 거부 환경)도 마찬가지로 0을 반환한다. 두 경우를 구분하기 위해
 * 짧은 sleep 후 재검증한다.
 *
 * @returns true면 성공 (newParent === expected). false면 부모가 expected가 아님.
 */
function verifySetParent(
  b: Win32Bindings,
  widgetHwnd: bigint,
  expected: bigint,
  diagPrefix: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    // 1차 검증 — 즉시
    const newParent1 = toBigInt(b.GetParent(widgetHwnd));
    diagLog('native-desktop', `${diagPrefix} verifySetParent.t0: newParent=0x${newParent1.toString(16)} expected=0x${expected.toString(16)}`);
    if (newParent1 === expected) {
      resolve(true);
      return;
    }

    // 2차 — 50ms 후
    setTimeout(() => {
      const newParent2 = toBigInt(b.GetParent(widgetHwnd));
      diagLog('native-desktop', `${diagPrefix} verifySetParent.t50: newParent=0x${newParent2.toString(16)} expected=0x${expected.toString(16)}`);
      if (newParent2 === expected) {
        resolve(true);
        return;
      }

      // 3차 — 추가 100ms (총 150ms) 후
      setTimeout(() => {
        const newParent3 = toBigInt(b.GetParent(widgetHwnd));
        diagLog('native-desktop', `${diagPrefix} verifySetParent.t150: newParent=0x${newParent3.toString(16)} expected=0x${expected.toString(16)}`);
        resolve(newParent3 === expected);
      }, 100);
    }, 50);
  });
}

/**
 * 위젯 HWND를 SetParent로 attach 시도하는 공통 코어.
 *
 * `attachToWorkerW`와 `attachToShellDefView`가 공유한다. 둘 다 SetParent + ExStyle 복원 +
 * Z-order 보정 + ShowWindow 단계를 거치며, parent 핸들만 다르다.
 */
async function attachToTarget(
  widgetHwnd: bigint,
  target: bigint,
  diagLabel: string,
): Promise<Win32DesktopHandles> {
  const b = loadWin32Bindings();

  if (isNullHandle(widgetHwnd)) {
    throw new AttachFailedError(`${diagLabel}: widgetHwnd is null`);
  }
  if (isNullHandle(target)) {
    throw new AttachFailedError(`${diagLabel}: target parent is null`);
  }
  if (b.IsWindow(widgetHwnd) === 0) {
    throw new AttachFailedError(`${diagLabel}: widgetHwnd is not a valid window`);
  }
  if (b.IsWindow(target) === 0) {
    throw new AttachFailedError(`${diagLabel}: target parent is not a valid window`);
  }

  // 1. ExStyle 저장
  const prevExStyleRaw = b.GetWindowLongPtrW(widgetHwnd, GWL_EXSTYLE);
  const prevExStyle = typeof prevExStyleRaw === 'bigint' ? prevExStyleRaw : BigInt(prevExStyleRaw);
  diagLog('native-desktop', `${diagLabel} step1 prevExStyle=0x${prevExStyle.toString(16)}`);

  // 2. 기존 부모 저장
  const prevParent = toBigInt(b.GetParent(widgetHwnd));
  diagLog('native-desktop', `${diagLabel} step2 prevParent=0x${prevParent.toString(16)}`);

  // 2-bis. GWL_STYLE 저장 (G2-bis 게이트 — WS_POPUP→WS_CHILD 전환 준비).
  //
  // 이전(G2 단계): SetParent만 호출하면 transparent+frame:false BrowserWindow는
  // WS_POPUP top-level 그대로라서 진짜 child가 되지 않고 GetParent=0n 반환.
  // 이를 해결하려면 SetParent 직전에 GWL_STYLE에서 WS_POPUP 비트를 제거하고
  // WS_CHILD 비트를 추가해야 한다 (Wallpaper Engine 등 데스크톱 widget 도구 정통 패턴).
  const prevStyleRaw = b.GetWindowLongPtrW(widgetHwnd, GWL_STYLE);
  const prevStyle = typeof prevStyleRaw === 'bigint' ? prevStyleRaw : BigInt(prevStyleRaw);
  diagLog('native-desktop', `${diagLabel} step2-bis prevStyle=0x${prevStyle.toString(16)}`);

  // 2-ter. WS_POPUP 제거 + WS_CHILD 추가. 다른 모든 style 비트(WS_VISIBLE, WS_CLIPSIBLINGS 등)는 보존.
  const newStyle = (prevStyle & ~WS_POPUP) | WS_CHILD;
  b.SetWindowLongPtrW(widgetHwnd, GWL_STYLE, newStyle);
  diagLog('native-desktop', `${diagLabel} step2-ter newStyle=0x${newStyle.toString(16)} (WS_POPUP 제거 + WS_CHILD 추가)`);

  // 3. SetParent
  const setParentResult = toBigInt(b.SetParent(widgetHwnd, target));
  diagLog('native-desktop', `${diagLabel} step3 SetParent return=0x${setParentResult.toString(16)} (returns previous parent on success)`);

  // 3-bis. SetParent 검증 — race 대응 retry. target이 widget을 진짜로 받아들였는지 확인.
  const verified = await verifySetParent(b, widgetHwnd, target, diagLabel);
  if (!verified) {
    const finalParent = toBigInt(b.GetParent(widgetHwnd));
    // 검증 실패 → style 원복 (부분 변경 상태로 두지 않음). best-effort.
    try {
      b.SetWindowLongPtrW(widgetHwnd, GWL_STYLE, prevStyle);
      diagLog('native-desktop', `${diagLabel} step3-bis 검증 실패 → prevStyle 0x${prevStyle.toString(16)} 원복`);
    } catch (e) {
      diagWarn('native-desktop', `${diagLabel} step3-bis style 원복 실패 (무시): ${e instanceof Error ? e.message : String(e)}`);
    }
    // SetParent도 가능하면 원복. SetParent 자체는 success를 반환했으므로 부모는 setParentResult가 이전 부모.
    // 다만 여기서 다시 원복 시도하면 추가 race가 생기므로 style 원복만으로 충분 (Win32 SetWindowLongPtrW가
    // 부모 관계도 재계산하게 한다).
    throw new AttachFailedError(
      `${diagLabel}: SetParent 후 부모 검증 실패 (expected=0x${target.toString(16)}, final=0x${finalParent.toString(16)}). 대상이 자식을 거부했음 (style 원복 완료).`,
    );
  }

  // 4. ExStyle 복원
  b.SetWindowLongPtrW(widgetHwnd, GWL_EXSTYLE, prevExStyle);

  // 5. Z-order: 부모 내부에서 가장 아래로.
  const swpResult = b.SetWindowPos(
    widgetHwnd,
    HWND_BOTTOM_HANDLE,
    0, 0, 0, 0,
    SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOMOVE | SWP_FRAMECHANGED,
  );
  diagLog('native-desktop', `${diagLabel} step5 SetWindowPos(HWND_BOTTOM)=${swpResult}`);

  // 6. 표시 (포커스 빼앗지 않음)
  const showResult = b.ShowWindow(widgetHwnd, SW_SHOWNOACTIVATE);
  diagLog('native-desktop', `${diagLabel} step6 ShowWindow(SW_SHOWNOACTIVATE)=${showResult}`);

  return {
    workerW: target,
    widgetHwnd,
    prevParent,
    prevExStyle,
    prevStyle,
  };
}

/**
 * 위젯 HWND를 WorkerW 자식으로 SetParent attach.
 *
 * 단계:
 *   1. GetWindowLongPtrW(GWL_EXSTYLE) — 기존 ExStyle 저장
 *   2. GetParent — 기존 부모 저장 (보통 0)
 *   3. SetParent(widgetHwnd, workerW) — 부모 변경 (race 검증 50ms+100ms retry)
 *   4. GWL_EXSTYLE 복원
 *   5. SetWindowPos(HWND_BOTTOM)
 *   6. ShowWindow(SW_SHOWNOACTIVATE)
 *
 * @throws AttachFailedError SetParent 후 부모 검증 실패 또는 사전 검증 실패.
 */
export async function attachToWorkerW(widgetHwnd: bigint, workerW: bigint): Promise<Win32DesktopHandles> {
  return attachToTarget(widgetHwnd, workerW, 'attachToWorkerW');
}

/**
 * 위젯 HWND를 SHELLDLL_DefView 자식으로 SetParent attach.
 *
 * STRATEGY 3 — 표준 WorkerW가 없거나 sibling WorkerW도 없는 환경 대비.
 * SHELLDLL_DefView는 SysListView32(아이콘 ListView)를 자식으로 가지므로 Z-order 충돌
 * 가능성이 있다. SetWindowPos(HWND_BOTTOM)으로 가장 아래로 보내 ListView 위에 가려지게
 * 한다. 다만 환경에 따라 여전히 시각적 부작용이 있을 수 있어 마지막 수단.
 *
 * 인터페이스는 attachToWorkerW와 동일.
 *
 * @throws AttachFailedError SetParent 후 부모 검증 실패.
 */
export async function attachToShellDefView(widgetHwnd: bigint, shellDefView: bigint): Promise<Win32DesktopHandles> {
  return attachToTarget(widgetHwnd, shellDefView, 'attachToShellDefView');
}

/**
 * attach를 원복한다.
 *   - SetParent로 prevParent 복원 (보통 null/0 = top-level)
 *   - GWL_EXSTYLE 복원
 *   - SetWindowPos로 Z-order top-level 갱신
 *
 * 모든 단계는 best-effort. 실패해도 throw하지 않는다 (cleanup 경로).
 */
export function detachFromWorkerW(h: Win32DesktopHandles): void {
  let b: Win32Bindings;
  try {
    b = loadWin32Bindings();
  } catch {
    return; // koffi가 죽었으면 detach 시도조차 무의미.
  }

  if (isNullHandle(h.widgetHwnd)) return;
  // 위젯 창이 이미 destroy됐으면 IsWindow가 0 반환 → 그냥 종료.
  try {
    if (b.IsWindow(h.widgetHwnd) === 0) return;
  } catch {
    return;
  }

  // 1. SetParent 복원. prevParent === 0이면 top-level (parent = NULL).
  try {
    b.SetParent(h.widgetHwnd, h.prevParent === 0n ? null : h.prevParent);
  } catch {
    /* best-effort */
  }

  // 2. GWL_STYLE 복원 (G2-bis — attach 시 WS_POPUP→WS_CHILD 전환했던 것 원복).
  //    SetParent 뒤에 호출해야 부모 관계가 먼저 떨어지고 나서 style이 정확히 적용된다.
  //    이 단계가 누락되면 위젯이 영원히 WS_CHILD로 남아 다음 mode 전환에서 정상 top-level로 복귀 불가.
  try {
    b.SetWindowLongPtrW(h.widgetHwnd, GWL_STYLE, h.prevStyle);
  } catch {
    /* best-effort */
  }

  // 3. ExStyle 복원
  try {
    b.SetWindowLongPtrW(h.widgetHwnd, GWL_EXSTYLE, h.prevExStyle);
  } catch {
    /* best-effort */
  }

  // 4. Frame 변경 신호 (Z-order는 top-level이 됐으므로 OS가 처리)
  try {
    b.SetWindowPos(
      h.widgetHwnd,
      0,
      0, 0, 0, 0,
      SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOMOVE | SWP_FRAMECHANGED,
    );
  } catch {
    /* best-effort */
  }
}

/**
 * 핸들 유효성 검사 — Win32 IsWindow 호출.
 * koffi load 실패 시에도 false 반환 (throw 금지).
 */
export function isWindowAlive(handle: bigint): boolean {
  if (isNullHandle(handle)) return false;
  try {
    const b = loadWin32Bindings();
    return b.IsWindow(handle) !== 0;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Phase 6 — 바탕화면 아이콘 ListView + LVM_HITTEST
// ────────────────────────────────────────────────────────────

/**
 * Explorer가 관리하는 바탕화면 아이콘 ListView를 찾는다.
 *
 * 경로:
 *   workerW (또는 Progman)
 *     └─ SHELLDLL_DefView
 *           └─ SysListView32  ← 본 함수가 반환
 *
 * 사용자가 "아이콘 자동 정렬"을 끄고 다른 셸을 쓰면 ListView 클래스명이 다를 수 있다.
 * 본 구현은 SysListView32 단일 후보만 검사. 미발견 시 null 반환 (throw 안 함).
 *
 * @param workerW findOrCreateWorkerW가 반환한 핸들. Progman일 수도 있음 (fallback).
 */
export function findDesktopListView(workerW: bigint): bigint | null {
  if (isNullHandle(workerW)) return null;
  let b: Win32Bindings;
  try {
    b = loadWin32Bindings();
  } catch {
    return null;
  }

  // 후보 1: workerW의 자식 SHELLDLL_DefView (표준/sibling 케이스)
  let shellDef = toBigInt(b.FindWindowExW(workerW, null, 'SHELLDLL_DefView', null));

  // 후보 2 (STRATEGY 3 케이스): workerW 자체가 이미 SHELLDLL_DefView일 수 있음.
  //   collectDesktopAttachCandidates의 STRATEGY 3에서는 SHELLDLL_DefView를
  //   직접 부모로 사용한다. 이때 handles.workerW === SHELLDLL_DefView.
  if (isNullHandle(shellDef)) {
    shellDef = workerW;
  }

  const listView = toBigInt(b.FindWindowExW(shellDef, null, 'SysListView32', null));
  if (isNullHandle(listView)) return null;

  return listView;
}

/**
 * 화면 좌표(physical pixel)에 바탕화면 아이콘이 있는지 LVM_HITTEST로 판정.
 *
 * 절차:
 *   1. GetWindowThreadProcessId(listView, &pid) — Explorer PID 획득
 *   2. OpenProcess(VM_OPERATION | VM_READ | VM_WRITE | QUERY_INFO, false, pid)
 *      ACCESS_DENIED → OpenProcessDeniedError
 *   3. ScreenToClient: physical screen → listView client 좌표 변환
 *      (ScreenToClient는 lparam이 POINT 구조체. koffi 'void *'로 raw pointer 전달)
 *   4. VirtualAllocEx(listView process, sizeof(LVHITTESTINFO), MEM_COMMIT|MEM_RESERVE, PAGE_RW)
 *   5. WriteProcessMemory(remote, &lvhti, sizeof)
 *   6. SendMessageW(listView, LVM_HITTEST, 0, remoteAddr) → 결과 인덱스 반환 (-1 = miss)
 *   7. try/finally: VirtualFreeEx(remote, MEM_RELEASE) + CloseHandle
 *
 * 결과: 인덱스 ≥ 0 → 아이콘 위, -1 → miss(빈 공간)
 *
 * LVHITTESTINFO 메모리 레이아웃 (x64, packed = 24 bytes):
 *   POINT pt;        // 8 bytes (LONG x, LONG y)
 *   UINT flags;      // 4 bytes
 *   int iItem;       // 4 bytes  ← 아이콘 인덱스 (없으면 -1)
 *   int iSubItem;    // 4 bytes
 *   int iGroup;      // 4 bytes (Vista+, 본 사용에선 무시)
 *
 * @throws OpenProcessDeniedError UAC 등 권한 문제로 Explorer 프로세스 open 실패
 * @throws RemoteMemoryError VirtualAllocEx / WriteProcessMemory 실패
 */
export function lvmHitTest(
  listView: bigint,
  physicalPoint: { x: number; y: number },
): boolean {
  if (isNullHandle(listView)) return false;
  const b = loadWin32Bindings();

  // 1. Explorer PID
  // GetWindowThreadProcessId의 두번째 인자는 LPDWORD out. koffi에서는 'uint32 *'를
  // 받기 위해 출력 buffer를 4바이트 Buffer로 직접 전달하고 readUInt32LE로 디코딩.
  const pidBuf = Buffer.alloc(4);
  b.GetWindowThreadProcessId(listView, pidBuf);
  const pid = pidBuf.readUInt32LE(0);
  if (pid === 0) return false; // 잘못된 핸들

  // 2. OpenProcess
  const access = PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_INFORMATION;
  const hProcess = toBigInt(b.OpenProcess(access, 0, pid));
  if (isNullHandle(hProcess)) {
    throw new OpenProcessDeniedError(`OpenProcess(pid=${pid}) ACCESS_DENIED 또는 실패`);
  }

  let remote: bigint = 0n;
  try {
    // 3. ScreenToClient: client 좌표로 변환
    // POINT 구조체 (8 bytes: LONG x, LONG y)
    const pointBuf = Buffer.alloc(8);
    pointBuf.writeInt32LE(Math.round(physicalPoint.x), 0);
    pointBuf.writeInt32LE(Math.round(physicalPoint.y), 4);
    const stcResult = b.ScreenToClient(listView, pointBuf);
    if (stcResult === 0) {
      // ScreenToClient 실패 — 위젯 영역 외부 또는 invalid handle
      return false;
    }
    const clientX = pointBuf.readInt32LE(0);
    const clientY = pointBuf.readInt32LE(4);

    // 4. VirtualAllocEx — Explorer process에 LVHITTESTINFO(24 bytes) 공간 확보
    const SIZE_LVHITTESTINFO = 24;
    remote = toBigInt(
      b.VirtualAllocEx(hProcess, 0, SIZE_LVHITTESTINFO, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE),
    );
    if (isNullHandle(remote)) {
      throw new RemoteMemoryError(`VirtualAllocEx(${SIZE_LVHITTESTINFO} bytes) 실패`);
    }

    // 5. WriteProcessMemory — pt만 채워서 보냄. flags/iItem 등은 0/미사용.
    const lvhti = Buffer.alloc(SIZE_LVHITTESTINFO);
    lvhti.writeInt32LE(clientX, 0);
    lvhti.writeInt32LE(clientY, 4);
    // iItem(offset 12) = -1 (= 0xFFFFFFFF as int32)로 초기화 → 결과 비교 시 -1 = miss로 명확.
    lvhti.writeInt32LE(-1, 12);
    const wpmOk = b.WriteProcessMemory(hProcess, remote, lvhti, SIZE_LVHITTESTINFO, 0);
    if (wpmOk === 0) {
      throw new RemoteMemoryError('WriteProcessMemory(LVHITTESTINFO) 실패');
    }

    // 6. SendMessage(LVM_HITTEST) — 동기 호출. 결과는 hit된 아이콘 인덱스 또는 -1.
    // SendMessage 자체의 반환값을 사용 (LVM_HITTEST는 LRESULT로 인덱스 반환).
    const result = b.SendMessageW(listView, LVM_HITTEST, 0, remote);
    const idx = typeof result === 'bigint'
      ? Number(BigInt.asIntN(32, result))
      : (result | 0);

    return idx >= 0;
  } finally {
    // 7. cleanup — 항상 실행
    if (!isNullHandle(remote)) {
      try {
        b.VirtualFreeEx(hProcess, remote, 0, MEM_RELEASE);
      } catch {
        /* best-effort */
      }
    }
    try {
      b.CloseHandle(hProcess);
    } catch {
      /* best-effort */
    }
  }
}

// ────────────────────────────────────────────────────────────
// Phase 7 — WH_MOUSE_LL hook
// ────────────────────────────────────────────────────────────

/**
 * 설치된 mouse hook의 핸들 묶음.
 * uninstallLowLevelMouseHook에 그대로 전달해 정리한다.
 */
export interface MouseHookHandle {
  /** SetWindowsHookExW가 반환한 HHOOK */
  readonly hhk: bigint;
  /**
   * koffi.register로 등록된 callback 함수 포인터.
   * GC가 회수하지 않도록 strong reference 유지.
   * unregister 시 동일 식별자 사용.
   */
  readonly registeredCallback: unknown;
}

/**
 * WH_MOUSE_LL hook callback signature.
 *
 * Phase 7-A에서 시그너처 확장 — 이전(`(p) => boolean`)에서 메시지 타입과 mouseData를 받게 변경.
 * manager는 본 callback 안에서 라우팅 결정 + PostMessage 호출을 직접 수행한다.
 *
 * **Hot path 제약**:
 *   - 0.5ms 이내 반환할 것. async/IPC/log 사용 금지(파일 I/O는 절대 금지).
 *   - throw 금지. 어떤 에러도 silent하게 swallow해야 hook이 다음 callback도 받는다.
 *   - 호출 빈도: WM_MOUSEMOVE는 초당 수백 회. 캐싱 필수.
 *
 * @param physicalPoint MSLLHOOKSTRUCT.pt (physical screen coordinate, DPI 무관 device pixel)
 * @param msgType wParam에 들어온 Win32 mouse 메시지 타입 (WM_LBUTTONDOWN 등)
 * @param mouseData MSLLHOOKSTRUCT.mouseData (wheel delta, XBUTTON 식별 등). 클릭/이동에선 0.
 */
export type MouseHookCallback = (
  physicalPoint: { x: number; y: number },
  msgType: number,
  mouseData: number,
) => void;

/**
 * WH_MOUSE_LL low-level mouse hook 설치.
 *
 * 본 함수 자체는 **차단/주입을 하지 않는다**. 모든 마우스 메시지를 CallNextHookEx로
 * 그대로 전달하며, callback이 PostMessage로 widget HWND에 메시지를 enqueue하더라도 OS 자체의
 * 메시지 흐름은 변경되지 않는다 (PostMessage는 부가 라우팅).
 *
 * 라우팅 효과:
 *   - 위젯 위 빈 공간(클릭): WS_CHILD가 된 위젯 HWND가 OS의 default routing으로는 받지 못한다 →
 *     callback이 PostMessage로 직접 전달
 *   - 위젯 위 아이콘: callback이 라우팅을 skip → Explorer ListView가 정상 처리
 *   - 위젯 영역 밖: callback이 즉시 skip
 *
 * MSLLHOOKSTRUCT 메모리 레이아웃 (x64, packed):
 *   POINT pt;       // offset 0, 8 bytes (LONG x, LONG y)
 *   DWORD mouseData;// offset 8, 4 bytes
 *   DWORD flags;    // offset 12, 4 bytes
 *   DWORD time;     // offset 16, 4 bytes
 *   ULONG_PTR dwExtraInfo; // offset 24 (x64), 8 bytes
 *
 * @throws HookInstallError SetWindowsHookExW 실패 (보안 차단 등)
 */
export function installLowLevelMouseHook(
  onMouseEvent: MouseHookCallback,
): MouseHookHandle {
  const b = loadWin32Bindings();

  // 1. proto는 loadWin32Bindings()에서 이미 등록됨 (SetWindowsHookExW 시그니처가 `LowLevelMouseProc *`를
  //    참조하기 때문). 여기선 cached 값만 사용.
  const proto = cachedLowLevelMouseProc;
  if (proto === null) {
    throw new HookInstallError('LowLevelMouseProc proto가 bindings 로드 시 등록되지 않음');
  }

  // Phase 7-B 진단 카운터 — register 후 첫 호출까지 reachability 검증.
  let firstCallbackEntry = false;

  // koffi 콜백 — JS 함수를 함수 포인터로 변환. 등록된 callback은 unregister할 때까지 GC 불가.
  // Phase 7-B FIX: lParam 타입을 proto에서 `void*`로 선언했으므로 koffi가 raw pointer로 마샬링.
  // typeof lParam === 'object' (External) 또는 BigInt 가능 — koffi.decode는 두 형태 모두 수용.
  const callback = (nCode: number, wParamRaw: bigint | number, lParamRaw: unknown): bigint | number => {
    // Phase 7-B 진단: 첫 진입 시 OutputDebugString으로 시그널.
    if (!firstCallbackEntry) {
      firstCallbackEntry = true;
      try {
        if (cachedOutputDebugStringW) {
          cachedOutputDebugStringW(`[ssampin-hook] FIRST callback nCode=${nCode}\n`);
        }
        diagLog('phase7-hook-first-callback', { nCode });
      } catch {
        /* never throw from hook */
      }
    }

    // Win32 contract: nCode < 0이면 즉시 CallNextHookEx 호출
    if (nCode < 0) {
      return b.CallNextHookEx(null, nCode, wParamRaw, lParamRaw as bigint | number);
    }

    try {
      if (lParamRaw !== null && lParamRaw !== undefined && lParamRaw !== 0 && lParamRaw !== 0n) {
        // koffi.decode 3-인자 형태: (pointer, type, count) = pt.x, pt.y, mouseData를 한 번에.
        // lParam은 koffi가 'void*' 시그니처에 맞춰 External pointer object 또는 BigInt로 전달.
        const decoded = b.koffi.decode(lParamRaw, 'int32', 3) as number[] | Int32Array;
        const x = decoded[0] ?? 0;
        const y = decoded[1] ?? 0;
        const mouseDataRaw = decoded[2] ?? 0;
        // wParam = mouse 메시지 타입 (WM_LBUTTONDOWN 등).
        const msgType = typeof wParamRaw === 'bigint' ? Number(BigInt.asUintN(32, wParamRaw)) : (wParamRaw >>> 0);
        try {
          onMouseEvent({ x, y }, msgType, mouseDataRaw);
        } catch {
          /* callback 안에서 throw 금지 */
        }
      }
    } catch {
      /* hook은 매우 자주 호출되므로 어떤 에러도 silent하게 swallow */
    }

    // 항상 다음 hook으로 패스 — 차단 없음
    return b.CallNextHookEx(null, nCode, wParamRaw, lParamRaw as bigint | number);
  };

  const registered = b.koffi.register(callback, b.koffi.pointer(proto));

  // 2. Phase 7-B FIX: hMod=NULL로 변경. WH_MOUSE_LL은 dwThreadId=0(global)일 때 hMod=NULL이 합법.
  //    외부 데스크톱 위젯 v1.1.5 (Win11 24H2 동작 확인)는 hMod=0을 직접 넘긴다. GetModuleHandle(NULL)이
  //    반환하는 EXE 모듈 핸들을 넘기면 koffi+Electron 40 환경에서 callback dispatch가 누락되는
  //    것으로 진단됨 (hook은 설치되지만 totalCallbacks=0).
  const hhk = toBigInt(b.SetWindowsHookExW(WH_MOUSE_LL, registered, null, 0));

  if (isNullHandle(hhk)) {
    // 등록된 callback도 정리
    try {
      b.koffi.unregister(registered);
    } catch {
      /* ignore */
    }
    throw new HookInstallError('SetWindowsHookExW(WH_MOUSE_LL) 실패 — 보안 정책 차단 추정');
  }

  // Phase 7-B 진단: hook 설치 직후 OutputDebugString 시그널 — DebugView로 install confirm 가능.
  try {
    if (cachedOutputDebugStringW) {
      cachedOutputDebugStringW(`[ssampin-hook] INSTALLED hhk=0x${hhk.toString(16)}\n`);
    }
  } catch {
    /* ignore */
  }

  return {
    hhk,
    registeredCallback: registered,
  };
}

/**
 * mouse hook 정리 — UnhookWindowsHookEx + koffi.unregister.
 * 둘 다 best-effort. 실패해도 throw하지 않는다.
 */
export function uninstallLowLevelMouseHook(h: MouseHookHandle): void {
  let b: Win32Bindings;
  try {
    b = loadWin32Bindings();
  } catch {
    return;
  }
  try {
    if (!isNullHandle(h.hhk)) {
      b.UnhookWindowsHookEx(h.hhk);
    }
  } catch {
    /* best-effort */
  }
  try {
    b.koffi.unregister(h.registeredCallback);
  } catch {
    /* best-effort */
  }
}

// ────────────────────────────────────────────────────────────
// Phase 7-A — Mouse routing helpers
// ────────────────────────────────────────────────────────────

/**
 * Phase 7-A/B에서 widget HWND로 라우팅할 마우스 메시지 식별.
 *
 * 포함:
 *   - WM_MOUSEMOVE (0x0200) — hover 효과, mouseenter/leave 트래킹
 *   - WM_LBUTTONDOWN/UP/DBLCLK (0x0201/2/3) — 좌클릭, 더블클릭
 *   - WM_RBUTTONDOWN/UP (0x0204/5) — 우클릭(컨텍스트 메뉴)
 *   - WM_MBUTTONDOWN/UP (0x0207/8) — 휠 클릭
 *   - WM_MOUSEWHEEL (0x020A) — 수직 휠 (Phase 7-B)
 *   - WM_MOUSEHWHEEL (0x020E) — 수평 휠/틸트 (Phase 7-B)
 *
 * 제외 (다음 Phase로 분리):
 *   - WM_NCLBUTTONDOWN — Phase 7-C (헤더 드래그로 위젯 이동)
 *   - WM_NCHITTEST 기반 cursor 처리 — Phase 7-D (테두리 resize)
 *
 * 본 함수는 hot path(WH_MOUSE_LL callback)에서 호출되므로 inline 가능한 단순 비교.
 */
export function isMouseMessageOfInterest(msgType: number): boolean {
  return (
    msgType === WM_LBUTTONDOWN
    || msgType === WM_LBUTTONUP
    || msgType === WM_RBUTTONDOWN
    || msgType === WM_RBUTTONUP
    || msgType === WM_MBUTTONDOWN
    || msgType === WM_MBUTTONUP
    || msgType === WM_LBUTTONDBLCLK
    || msgType === WM_MOUSEMOVE
    || msgType === WM_MOUSEWHEEL
    || msgType === WM_MOUSEHWHEEL
  );
}

/**
 * physical screen coordinate를 widget client coordinate로 변환.
 *
 * Win32 마우스 메시지의 lParam은 일반적으로 client coordinate (target window의
 * client area 좌상단 기준). MSDN(WM_MOUSEMOVE 등): "The high-order word specifies
 * the y-coordinate ... the low-order word specifies the x-coordinate of the cursor.
 * The coordinate is relative to the upper-left corner of the client area."
 *
 * physical screen → physical client 변환:
 *   client.x = physical.x - widgetBounds.x
 *   client.y = physical.y - widgetBounds.y
 *
 * 본 함수는 widget bounds를 physical pixel로 받기 때문에 추가 DPI 변환이 필요 없다
 * (manager가 이미 dipToPhysical로 갱신해 캐시).
 *
 * 음수가 될 수 있는데(이론상 widget 영역 밖이지만 caller가 잘못 호출), Win32 마우스 메시지의
 * client coord는 음수도 합법(클라이언트 영역 밖이지만 OS가 그대로 전달).
 *
 * **주의**: WM_MOUSEMOVE 등의 lParam 인코딩은 16-bit signed × 2이지만 PostMessage 호출 시
 * 32-bit 합치기는 caller(`postMouseMessageToWidget`)가 책임진다.
 */
export function physicalToClient(
  physicalPoint: { readonly x: number; readonly y: number },
  widgetPhysicalBounds: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  return {
    x: physicalPoint.x - widgetPhysicalBounds.x,
    y: physicalPoint.y - widgetPhysicalBounds.y,
  };
}

/**
 * Win32 마우스 메시지를 widget HWND에 PostMessage로 송신.
 *
 * lParam encoding:
 *   - low-order WORD = client.x (16-bit signed)
 *   - high-order WORD = client.y (16-bit signed)
 *   - 32-bit 정수 한 개로 packing: (clientY << 16) | (clientX & 0xFFFF)
 *   - JS bitwise는 32-bit signed → 그대로 사용 가능
 *
 * wParam encoding (메시지별 다름, Phase 7-A에선 0으로 충분):
 *   - WM_MOUSEMOVE: MK_LBUTTON | MK_RBUTTON 등 button state. 0이면 "어떤 버튼도 안 눌림".
 *   - WM_LBUTTONDOWN/UP: 다른 키(SHIFT/CTRL) state. 0이면 "수정자 없음".
 *   - 정확한 state가 필요하면 GetAsyncKeyState로 보강 가능 (현재는 미구현 — 단순 클릭/이동만
 *     처리하면 사용자 입장에서 시각적 차이 없음).
 *
 * @param widgetHwnd PostMessage 대상 HWND (위젯 native handle)
 * @param msgType WM_LBUTTONDOWN 등
 * @param clientX widget client area 기준 x (physical pixel)
 * @param clientY widget client area 기준 y (physical pixel)
 * @param mouseData MSLLHOOKSTRUCT.mouseData. wheel/XBUTTON에서만 의미. 클릭/이동에선 0.
 * @returns true = PostMessage success, false = 실패(큐 가득 참 등)
 */
export function postMouseMessageToWidget(
  widgetHwnd: bigint,
  msgType: number,
  clientX: number,
  clientY: number,
  mouseData: number = 0,
): boolean {
  if (isNullHandle(widgetHwnd)) return false;
  let b: Win32Bindings;
  try {
    b = loadWin32Bindings();
  } catch {
    return false;
  }

  // 16-bit signed clamp (값이 범위 밖이면 잘리는 게 정상 — Win32 마우스 메시지의 client coord는
  // 16-bit signed로 packing되며 매우 큰 값(±32767 초과)은 어차피 의미가 없다).
  const cx = clientX | 0;
  const cy = clientY | 0;
  const lparam = ((cy & 0xFFFF) << 16) | (cx & 0xFFFF);

  // wParam: Phase 7-A에서는 0 (수정자 키/버튼 state 미보강).
  // mouseData는 wheel/XBUTTON에서만 lParam 또는 wParam high word로 들어가므로 본 단계에서 미사용.
  const wParam = 0;
  void mouseData; // 의도적 미사용 — Phase 7-B에서 wheel delta로 활용 예정.

  try {
    const result = b.PostMessageW(widgetHwnd, msgType, wParam, lparam);
    return result !== 0;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Phase 7-C — Header drag (위젯 위치 이동)
// ────────────────────────────────────────────────────────────

/**
 * 위젯을 physical screen 좌표로 즉시 이동.
 *
 * 용도 (Phase 7-C 헤더 드래그):
 *   WS_CHILD가 된 widget은 nc message가 부모(WorkerW)로 가서 BrowserWindow의 -webkit-app-region:
 *   drag가 작동하지 않는다. WH_MOUSE_LL hook callback이 drag 시작/이동/종료를 감지하고 본
 *   함수로 widget을 마우스 따라 이동시킨다.
 *
 * 좌표계:
 *   - x, y: physical screen pixel (WorkerW 부모 좌표가 아니라 desktop 절대 좌표).
 *     SetWindowPos는 child window일 때 부모 client 좌표를 기대하지만 WorkerW는 desktop을
 *     full-cover하므로 (0,0) origin이라 screen 좌표가 그대로 통한다. 멀티모니터 환경에서도
 *     WorkerW는 virtual screen 전체를 cover하므로 음수 좌표(좌측 모니터)도 그대로 OK.
 *
 * 플래그:
 *   - SWP_NOZORDER: Z-order 변경 안 함. drag 중 widget이 위로 튀는 현상 차단.
 *   - SWP_NOACTIVATE: 포커스 빼앗기지 않음 (drag 중 active window 유지).
 *   - SWP_ASYNCWINDOWPOS: 비동기 — drag hot path에서 OS thread 동기 대기 회피.
 *
 * @param widgetHwnd 위젯 native HWND (Phase 4-2 attach 후의 hwnd 그대로)
 * @param x physical screen X
 * @param y physical screen Y
 * @param width physical pixel 폭 (변경 없으면 startBounds.width 그대로)
 * @param height physical pixel 높이
 * @returns true = SetWindowPos 호출 성공 (비동기 큐잉 OK), false = 실패/null handle
 */
export function moveWidget(
  widgetHwnd: bigint,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (isNullHandle(widgetHwnd)) return false;
  let b: Win32Bindings;
  try {
    b = loadWin32Bindings();
  } catch {
    return false;
  }
  try {
    const flags = SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS;
    // hWndInsertAfter는 SWP_NOZORDER로 무시되지만 0(NULL)을 안전 기본값으로.
    const result = b.SetWindowPos(widgetHwnd, 0, x, y, width, height, flags);
    return result !== 0;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// Phase 7-A (재시도) — Electron sendInputEvent 라우팅 매핑
// ────────────────────────────────────────────────────────────
//
// 사용자 검증 결과: PostMessageW로 widget HWND에 마우스 메시지를 보내도 Chromium이
// 무시한다. Chromium의 input pipeline은 OS native 마우스 이벤트만 신뢰하고,
// 합성된 win32 메시지는 button state(wParam) 검증 등에서 invalid로 판정될 가능성이 높다.
//
// 정통 패턴은 Electron 공식 API인 `webContents.sendInputEvent`. 본 메서드는 Chromium
// renderer의 input router에 직접 이벤트를 enqueue하므로 hit-test/focus/event handler가
// native 이벤트와 동일하게 처리한다.
//
// 본 헬퍼들은 WH_MOUSE_LL callback에서 받은 win32 메시지 타입을 sendInputEvent payload로
// 변환할 때 사용한다. PostMessage 인프라는 fallback으로 보존(routingMethod === 'post-message').
// ────────────────────────────────────────────────────────────

/**
 * Electron `sendInputEvent` mouse event type. Electron 공식 타입과 동일하지만 import 의존을
 * 피하기 위해 string literal union으로 직접 정의.
 *
 * 참고: https://www.electronjs.org/docs/latest/api/web-contents#contentssendinputeventinputevent
 */
export type ElectronMouseEventType =
  | 'mouseDown'
  | 'mouseUp'
  | 'mouseMove'
  | 'mouseEnter'
  | 'mouseLeave'
  | 'mouseWheel';

/**
 * Electron `sendInputEvent` mouse button.
 */
export type ElectronMouseButton = 'left' | 'right' | 'middle';

/**
 * win32 mouse 메시지 타입 → Electron sendInputEvent type 매핑.
 *
 * 매핑 규칙:
 *   - WM_LBUTTONDOWN/RBUTTONDOWN/MBUTTONDOWN/LBUTTONDBLCLK → 'mouseDown'
 *   - WM_LBUTTONUP/RBUTTONUP/MBUTTONUP → 'mouseUp'
 *   - WM_MOUSEMOVE → 'mouseMove'
 *   - 그 외(휠/NC* 등) → null (다음 phase)
 *
 * 더블클릭(WM_LBUTTONDBLCLK)은 mouseDown으로 매핑하고 호출자가 clickCount=2를 함께 전달.
 *
 * @returns 매핑 가능한 메시지면 type, 아니면 null
 */
export function mapWin32MsgToElectronEvent(msg: number): ElectronMouseEventType | null {
  switch (msg) {
    case WM_LBUTTONDOWN:
    case WM_RBUTTONDOWN:
    case WM_MBUTTONDOWN:
    case WM_LBUTTONDBLCLK:
      return 'mouseDown';
    case WM_LBUTTONUP:
    case WM_RBUTTONUP:
    case WM_MBUTTONUP:
      return 'mouseUp';
    case WM_MOUSEMOVE:
      return 'mouseMove';
    case WM_MOUSEWHEEL:
    case WM_MOUSEHWHEEL:
      return 'mouseWheel';
    default:
      return null;
  }
}

/**
 * win32 mouse 메시지 → Electron mouse button 매핑.
 *
 * - 우측: WM_RBUTTONDOWN/UP → 'right'
 * - 휠 클릭: WM_MBUTTONDOWN/UP → 'middle'
 * - 그 외(좌측/이동/더블클릭) → 'left' (기본값)
 *
 * WM_MOUSEMOVE는 button이 '필수'가 아니지만 Electron API가 string을 요구해 'left'로
 * 채워둔다. mouseMove에서 button은 의미 없음.
 */
export function mapWin32MsgToButton(msg: number): ElectronMouseButton {
  if (msg === WM_RBUTTONDOWN || msg === WM_RBUTTONUP) return 'right';
  if (msg === WM_MBUTTONDOWN || msg === WM_MBUTTONUP) return 'middle';
  return 'left';
}

/**
 * win32 mouse 메시지 → Electron clickCount 매핑.
 *
 * - WM_LBUTTONDBLCLK → 2 (더블클릭)
 * - 그 외 → 1 (단일 클릭/이동)
 *
 * Electron의 sendInputEvent는 clickCount를 직접 받기 때문에 OS의 더블클릭 자동 합성을
 * 신뢰하지 않고 본 매핑으로 명시 전달한다.
 */
export function mapWin32MsgToClickCount(msg: number): number {
  return msg === WM_LBUTTONDBLCLK ? 2 : 1;
}

// ────────────────────────────────────────────────────────────
// Phase 7-B — Wheel routing helpers
// ────────────────────────────────────────────────────────────

/**
 * Phase 7-B 휠 축 식별.
 *
 * - WM_MOUSEWHEEL → 'vertical' (수직 휠, 일반적인 마우스 휠 회전)
 * - WM_MOUSEHWHEEL → 'horizontal' (수평/틸트 휠 또는 터치패드 가로 스크롤)
 * - 그 외 → null
 *
 * hot path에서 분기에 사용.
 */
export type WheelAxis = 'vertical' | 'horizontal';

export function mapWin32MsgToWheelAxis(msg: number): WheelAxis | null {
  if (msg === WM_MOUSEWHEEL) return 'vertical';
  if (msg === WM_MOUSEHWHEEL) return 'horizontal';
  return null;
}

/**
 * Phase 7-B — MSLLHOOKSTRUCT.mouseData에서 wheel delta 추출.
 *
 * mouseData는 32-bit DWORD. wheel delta는 HIWORD에 packing된 signed short(16-bit).
 *   - bits 0..15 (LOWORD): 미사용 (XBUTTON 식별 등 다른 용도)
 *   - bits 16..31 (HIWORD): wheel delta
 *
 * Win32 wheel delta convention:
 *   - WHEEL_DELTA = ±120 per click (표준 마우스 휠 한 칸)
 *   - 양수: 위쪽 / 오른쪽으로 회전 (멀리 미는 동작)
 *   - 음수: 아래쪽 / 왼쪽으로 회전
 *   - 정밀 휠/터치패드는 ±120 미만 값도 가능
 *
 * 16-bit signed 변환: HIWORD가 0x8000 이상이면 음수.
 *
 * 본 함수는 axis와 무관하게 단순 HIWORD signed 추출만 수행. axis 매핑은
 * mapWin32MsgToWheelAxis가 별도 책임.
 *
 * @param mouseData MSLLHOOKSTRUCT.mouseData (32-bit unsigned 가정)
 * @returns wheel delta (signed short, 보통 ±120 단위)
 */
export function decodeWheelDelta(mouseData: number): number {
  // mouseData가 음수 int32로 들어올 수 있음 (`>>> 0`로 unsigned 변환).
  const u32 = mouseData >>> 0;
  const high = (u32 >>> 16) & 0xffff;
  // signed short: 0x8000 이상이면 음수
  return high >= 0x8000 ? high - 0x10000 : high;
}
