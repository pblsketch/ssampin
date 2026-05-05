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

/** SetWindowPos uFlags */
const SWP_NOACTIVATE = 0x0010;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_FRAMECHANGED = 0x0020;

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
  CallNextHookEx: (hhk: bigint | number | null, nCode: number, wParam: bigint | number, lParam: bigint | number) => bigint | number;

  // kernel32 — Phase 7: 모듈 핸들 (hook callback이 모듈에 속해야 함)
  GetModuleHandleW: (lpModuleName: string | null) => bigint | null;

  // koffi 헬퍼 (callback 등록 등 Phase 7에서 사용)
  koffi: typeof import('koffi');
}

let cachedBindings: Win32Bindings | null = null;
let cachedKoffi: typeof import('koffi') | null = null;

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
    const SetWindowsHookExW = user32.func(
      'void* __stdcall SetWindowsHookExW(int, void *, void*, uint32)',
    ) as Win32Bindings['SetWindowsHookExW'];

    const UnhookWindowsHookEx = user32.func(
      'int __stdcall UnhookWindowsHookEx(void*)',
    ) as Win32Bindings['UnhookWindowsHookEx'];

    const CallNextHookEx = user32.func(
      'intptr_t __stdcall CallNextHookEx(void*, int, intptr_t, intptr_t)',
    ) as Win32Bindings['CallNextHookEx'];

    const GetModuleHandleW = kernel32.func(
      'void* __stdcall GetModuleHandleW(str16)',
    ) as Win32Bindings['GetModuleHandleW'];

    cachedBindings = {
      GetCurrentProcessId,
      FindWindowW,
      FindWindowExW,
      EnumWindows,
      SendMessageW,
      SendMessageTimeoutW,
      SetParent,
      GetParent,
      GetWindowLongPtrW,
      SetWindowLongPtrW,
      SetWindowPos,
      ShowWindow,
      IsWindow,
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
 * Progman → WM_SPAWN_WORKER로 WorkerW 생성을 유도한 뒤,
 * EnumWindows로 SHELLDLL_DefView를 자식으로 둔 WorkerW를 찾는다.
 *
 * Windows 10/11에서 일반적인 패턴:
 *   1. FindWindow("Progman", null) — 데스크톱 부모창
 *   2. SendMessageTimeout(Progman, 0x052C, 0xD, 0) — WorkerW spawn 유도
 *   3. EnumWindows로 모든 top-level 창 순회
 *      → 각 창의 자식 중 SHELLDLL_DefView가 있는지 FindWindowEx로 확인
 *      → 발견하면 그 창의 형제(GetWindow GW_HWNDPREV) 또는 자기 자신이 후보
 *   4. 그 중 클래스명이 "WorkerW"이고 SHELLDLL_DefView 자식을 가진 창
 *
 * 단, EnumWindows 콜백을 koffi proto/pointer로 등록하면 콜백 메모리 관리 이슈가
 * 있을 수 있어, 본 구현은 더 안전한 폴백 방식을 사용한다:
 *   - Progman의 자식 SHELLDLL_DefView가 있으면 (icons-on-desktop 모드) Progman 자체에
 *     attach. 단, Progman attach는 일부 환경에서 시각적 깨짐이 발생할 수 있어
 *     WorkerW를 찾는 시도를 우선한다.
 *   - WorkerW 탐색: FindWindowEx(NULL, lastWorkerW, "WorkerW", NULL) 반복.
 *     각 WorkerW에 대해 FindWindowEx(workerW, NULL, "SHELLDLL_DefView", NULL)
 *     를 호출하고 자식이 발견되는 첫 WorkerW를 반환.
 *
 * @throws WorkerWNotFoundError Progman 미발견 또는 SHELLDLL_DefView 보유 창 미발견
 */
export function findOrCreateWorkerW(): bigint {
  diagLog('native-desktop', 'findOrCreateWorkerW.A: enter');
  const b = loadWin32Bindings();
  diagLog('native-desktop', 'findOrCreateWorkerW.B: bindings loaded');

  // 1. Progman 탐색
  let progmanRaw: unknown;
  try {
    progmanRaw = b.FindWindowW('Progman', null);
  } catch (e) {
    diagWarn('native-desktop', `findOrCreateWorkerW.C: FindWindowW(Progman) throw: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  diagLog('native-desktop', `findOrCreateWorkerW.C: FindWindowW(Progman) returned typeof=${typeof progmanRaw}`);

  let progman: bigint;
  try {
    progman = toBigInt(progmanRaw);
  } catch (e) {
    diagWarn('native-desktop', `findOrCreateWorkerW.D: toBigInt(progman) throw: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
  diagLog('native-desktop', `findOrCreateWorkerW.D: Progman=0x${progman.toString(16)}`);
  if (isNullHandle(progman)) {
    throw new WorkerWNotFoundError('Progman 창을 찾을 수 없음');
  }

  // 2. WorkerW 생성 유도 (idempotent — 이미 있으면 무해)
  // SendMessageTimeoutW로 1초 내 응답 없으면 무시. 결과 buffer는 사용하지 않음.
  // SMTO_NORMAL=0, SMTO_ABORTIFHUNG=2. 0x0002로 hung 시 중단.
  try {
    b.SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0xd, 0, 0x0002, 1000, 0);
    diagLog('native-desktop', 'findOrCreateWorkerW.E: WM_SPAWN_WORKER sent');
  } catch (e) {
    // SendMessageTimeoutW 실패도 무해 — 다음 단계 탐색에서 결과를 본다.
    diagWarn('native-desktop', `findOrCreateWorkerW.E: WM_SPAWN_WORKER send 실패 (무시): ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. 모든 WorkerW 순회 → SHELLDLL_DefView 자식이 있는 첫 후보 반환.
  // FindWindowExW(NULL, prev, "WorkerW", NULL)을 prev=null부터 반복 호출.
  let prev: bigint = 0n;
  let count = 0;
  for (let i = 0; i < 64; i++) {
    let workerWRaw: unknown;
    try {
      // FindWindowExW의 prev는 BigInt → koffi 'void *' 인자로 그대로 전달 가능.
      // koffi 2.x: BigInt/number 모두 'void *' 인자로 허용. null도 허용.
      workerWRaw = b.FindWindowExW(null, prev === 0n ? null : prev, 'WorkerW', null);
    } catch (e) {
      diagWarn('native-desktop', `findOrCreateWorkerW.F[${i}]: FindWindowExW(WorkerW) throw: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    let workerW: bigint;
    try {
      workerW = toBigInt(workerWRaw);
    } catch (e) {
      diagWarn('native-desktop', `findOrCreateWorkerW.F[${i}]: toBigInt(workerW) throw: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
    if (isNullHandle(workerW)) break;
    count++;
    const shellDef = toBigInt(b.FindWindowExW(workerW, null, 'SHELLDLL_DefView', null));
    diagLog('native-desktop', `findOrCreateWorkerW.G: WorkerW#${count}=0x${workerW.toString(16)}, SHELLDLL_DefView=${isNullHandle(shellDef) ? 'NONE' : '0x' + shellDef.toString(16)}`);
    if (!isNullHandle(shellDef)) {
      diagLog('native-desktop', `findOrCreateWorkerW.H: SUCCESS WorkerW=0x${workerW.toString(16)} (after ${count} candidates)`);
      return workerW;
    }
    prev = workerW;
  }

  diagLog('native-desktop', `findOrCreateWorkerW.I: WorkerW 후보 ${count}개 검사했으나 SHELLDLL_DefView 자식 없음 — Progman 자체 검사`);

  // 4. WorkerW에서 못 찾으면 Progman 자체 자식 검사 (icons-on-desktop OFF 환경 등).
  const shellDefInProgman = toBigInt(b.FindWindowExW(progman, null, 'SHELLDLL_DefView', null));
  diagLog('native-desktop', `findOrCreateWorkerW.J: Progman child SHELLDLL_DefView=${isNullHandle(shellDefInProgman) ? 'NONE' : '0x' + shellDefInProgman.toString(16)}`);
  if (!isNullHandle(shellDefInProgman)) {
    // Progman attach는 시각적 부작용이 있을 수 있지만 fallback으로 허용.
    diagLog('native-desktop', `findOrCreateWorkerW.K: FALLBACK to Progman 0x${progman.toString(16)}`);
    return progman;
  }

  throw new WorkerWNotFoundError(
    'SHELLDLL_DefView를 자식으로 둔 WorkerW/Progman을 찾을 수 없음',
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
}

/**
 * 위젯 HWND를 WorkerW 자식으로 SetParent attach.
 *
 * 단계:
 *   1. GetWindowLongPtrW(GWL_EXSTYLE) — 기존 ExStyle 저장
 *   2. GetParent — 기존 부모 저장 (보통 0)
 *   3. SetParent(widgetHwnd, workerW) — 부모 변경
 *      반환값 0이면 실패 (UAC, 무결성 레벨 차이 등) → AttachFailedError
 *   4. SetWindowLongPtrW(GWL_EXSTYLE, prevExStyle) — WS_EX_LAYERED 등 보존
 *      (SetParent 후 일부 ExStyle이 영향받을 수 있어 명시 복원)
 *   5. SetWindowPos(HWND_BOTTOM, NOACTIVATE | NOSIZE | NOMOVE | FRAMECHANGED)
 *      Z-order는 WorkerW 내부에서만 의미. 다른 형제(아이콘 ListView) 위에 둔다.
 *   6. ShowWindow(SW_SHOWNOACTIVATE)
 *
 * @throws AttachFailedError SetParent 실패 또는 사전 검증 실패
 */
export function attachToWorkerW(widgetHwnd: bigint, workerW: bigint): Win32DesktopHandles {
  const b = loadWin32Bindings();

  if (isNullHandle(widgetHwnd)) {
    throw new AttachFailedError('attachToWorkerW: widgetHwnd is null');
  }
  if (isNullHandle(workerW)) {
    throw new AttachFailedError('attachToWorkerW: workerW is null');
  }
  if (b.IsWindow(widgetHwnd) === 0) {
    throw new AttachFailedError('attachToWorkerW: widgetHwnd is not a valid window');
  }
  if (b.IsWindow(workerW) === 0) {
    throw new AttachFailedError('attachToWorkerW: workerW is not a valid window');
  }

  // 1. ExStyle 저장
  const prevExStyleRaw = b.GetWindowLongPtrW(widgetHwnd, GWL_EXSTYLE);
  const prevExStyle = typeof prevExStyleRaw === 'bigint' ? prevExStyleRaw : BigInt(prevExStyleRaw);
  diagLog('native-desktop', `attachToWorkerW step1 prevExStyle=0x${prevExStyle.toString(16)}`);

  // 2. 기존 부모 저장
  const prevParent = toBigInt(b.GetParent(widgetHwnd));
  diagLog('native-desktop', `attachToWorkerW step2 prevParent=0x${prevParent.toString(16)}`);

  // 3. SetParent
  const setParentResult = toBigInt(b.SetParent(widgetHwnd, workerW));
  diagLog('native-desktop', `attachToWorkerW step3 SetParent return=0x${setParentResult.toString(16)} (returns previous parent on success)`);
  if (isNullHandle(setParentResult) && !isNullHandle(prevParent)) {
    // SetParent는 성공 시 "이전 부모"를 반환. 이전 부모가 있었는데 결과가 0이면 실패.
    // 이전 부모가 없는 (top-level) 창의 경우 정상 결과도 0이라 추가 검증 필요.
    if (b.IsWindow(prevParent) !== 0) {
      throw new AttachFailedError(
        'SetParent 실패 (UAC/integrity-level/policy 차단 추정)',
      );
    }
  }

  // 3-bis. SetParent 결과 검증: 위젯의 새 부모가 workerW인지 확인
  const newParent = toBigInt(b.GetParent(widgetHwnd));
  diagLog('native-desktop', `attachToWorkerW step3-bis newParent=0x${newParent.toString(16)} (expected=0x${workerW.toString(16)})`);
  if (newParent !== workerW) {
    throw new AttachFailedError(
      `SetParent 후 부모 검증 실패 (expected=${workerW}, actual=${newParent})`,
    );
  }

  // 4. ExStyle 복원 (SetParent 후 영향 가능)
  b.SetWindowLongPtrW(widgetHwnd, GWL_EXSTYLE, prevExStyle);

  // 5. Z-order: WorkerW 내부에서 가장 아래(아이콘 ListView 아래)로.
  const swpResult = b.SetWindowPos(
    widgetHwnd,
    HWND_BOTTOM_HANDLE,
    0, 0, 0, 0,
    SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOMOVE | SWP_FRAMECHANGED,
  );
  diagLog('native-desktop', `attachToWorkerW step5 SetWindowPos(HWND_BOTTOM)=${swpResult}`);

  // 6. 표시 (포커스 빼앗지 않음)
  const showResult = b.ShowWindow(widgetHwnd, SW_SHOWNOACTIVATE);
  diagLog('native-desktop', `attachToWorkerW step6 ShowWindow(SW_SHOWNOACTIVATE)=${showResult} (was ${showResult === 0 ? 'previously hidden' : 'previously visible'})`);

  return {
    workerW,
    widgetHwnd,
    prevParent,
    prevExStyle,
  };
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

  // 2. ExStyle 복원
  try {
    b.SetWindowLongPtrW(h.widgetHwnd, GWL_EXSTYLE, h.prevExStyle);
  } catch {
    /* best-effort */
  }

  // 3. Frame 변경 신호 (Z-order는 top-level이 됐으므로 OS가 처리)
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

  const shellDef = toBigInt(b.FindWindowExW(workerW, null, 'SHELLDLL_DefView', null));
  if (isNullHandle(shellDef)) return null;

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
 * WH_MOUSE_LL low-level mouse hook 설치.
 *
 * shouldPassThrough(physicalPoint)는 callback hot path에서 호출된다 — 매우 빠르게(0.5ms 이내)
 * 반환해야 한다. async/IPC/PostMessage 등 호출 금지.
 *
 * 본 구현은 **차단/주입을 하지 않는다**. 모든 마우스 메시지를 CallNextHookEx로
 * 그대로 전달하며, hook의 가치는:
 *   1. AV false-positive 회피용 minimal presence
 *   2. 향후 라우팅 정책 변경 시 좌표 분석 기반 마련
 *
 * 라우팅 효과는 SetParent + Z-order(HWND_BOTTOM)만으로 자연스럽게 발생한다:
 *   - 위젯 위 빈 공간 → Electron(위젯)이 처리 (위젯이 forefront)
 *   - 위젯 위 아이콘 → Explorer ListView가 처리 (Z-order로 ListView가 위)
 *
 * MSLLHOOKSTRUCT 메모리 레이아웃 (x64, packed = 40 bytes):
 *   POINT pt;       // 8 bytes (x, y)
 *   DWORD mouseData;// 4 bytes
 *   DWORD flags;    // 4 bytes
 *   DWORD time;     // 4 bytes
 *   ULONG_PTR dwExtraInfo; // 8 bytes (x64)
 *
 * @throws HookInstallError SetWindowsHookExW 실패 (보안 차단 등)
 */
export function installLowLevelMouseHook(
  shouldPassThrough: (physicalPoint: { x: number; y: number }) => boolean,
): MouseHookHandle {
  const b = loadWin32Bindings();

  // 1. callback proto/register
  // LowLevelMouseProc: LRESULT CALLBACK Proc(int nCode, WPARAM wParam, LPARAM lParam)
  // x64에서 LRESULT/WPARAM/LPARAM 모두 64-bit → intptr_t.
  const proto = b.koffi.proto('intptr_t __stdcall LowLevelMouseProc(int, intptr_t, intptr_t)');

  // koffi 콜백 — JS 함수를 함수 포인터로 변환. 등록된 callback은 unregister할 때까지 GC 불가.
  const callback = (nCode: number, wParam: bigint | number, lParamRaw: bigint | number): bigint | number => {
    // Win32 contract: nCode < 0이면 즉시 CallNextHookEx 호출
    if (nCode < 0) {
      return b.CallNextHookEx(null, nCode, wParam, lParamRaw);
    }

    try {
      // lParam은 MSLLHOOKSTRUCT*. koffi.decode로 buffer를 얻거나 raw pointer로 직접 읽는다.
      // 가장 안전한 방법: koffi.decode(pointer, sizeBytes, type) — 단, MSLLHOOKSTRUCT 정의가 필요.
      // 본 구현은 koffi가 노출하는 raw memory 읽기 (decode + raw bytes) 패턴을 사용.
      // 더 단순화: pt만 필요하므로 lParam을 buffer로 decode해 처음 8 bytes만 읽는다.
      const lparamBig = typeof lParamRaw === 'bigint' ? lParamRaw : BigInt(lParamRaw);
      if (lparamBig !== 0n) {
        // koffi.decode(address, length, type) — type은 'unsigned char[N]' 등 사용 가능.
        // 더 단순: koffi.decode(pointer, 'int32', count) → int32 배열로 읽기.
        const decoded = b.koffi.decode(lparamBig, 'int32', 2) as number[] | Int32Array;
        const x = Array.isArray(decoded) ? decoded[0] : decoded[0];
        const y = Array.isArray(decoded) ? decoded[1] : decoded[1];
        // shouldPassThrough는 manager가 제공 — 차단/주입은 하지 않으므로 결과는 메트릭/캐시용.
        // 호출만 해도 manager TTL 캐시가 데워져 다음 hot path가 빨라진다.
        try {
          shouldPassThrough({ x: x ?? 0, y: y ?? 0 });
        } catch {
          /* callback 안에서 throw 금지 */
        }
      }
    } catch {
      /* hook은 매우 자주 호출되므로 어떤 에러도 silent하게 swallow */
    }

    // 항상 다음 hook으로 패스 — 차단 없음
    return b.CallNextHookEx(null, nCode, wParam, lParamRaw);
  };

  const registered = b.koffi.register(callback, b.koffi.pointer(proto));

  // 2. 모듈 핸들. WH_MOUSE_LL은 dwThreadId=0(global), hMod 인자는 어떤 모듈에 hook이
  //    속하는지 식별. 일반적으로 GetModuleHandle(NULL) (현재 EXE)을 넘긴다.
  const hModule = toBigInt(b.GetModuleHandleW(null));

  // 3. SetWindowsHookExW
  const hhk = toBigInt(b.SetWindowsHookExW(WH_MOUSE_LL, registered, hModule === 0n ? null : hModule, 0));

  if (isNullHandle(hhk)) {
    // 등록된 callback도 정리
    try {
      b.koffi.unregister(registered);
    } catch {
      /* ignore */
    }
    throw new HookInstallError('SetWindowsHookExW(WH_MOUSE_LL) 실패 — 보안 정책 차단 추정');
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
