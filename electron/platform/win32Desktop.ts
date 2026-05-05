/**
 * 바탕화면 아이콘 아래 모드(native-desktop) Win32 FFI wrapper.
 *
 * Phase 4-1 (현 단계): koffi load 검증 골격만.
 *   - user32.dll, kernel32.dll lazy load
 *   - 실패 시 KoffiLoadError throw → manager가 'koffi-load-failed' fallback
 *   - 단순 동작 검증용 GetCurrentProcessId 1개만 export
 *
 * Phase 4-2~7에서 추가될 함수:
 *   - findOrCreateWorkerW(): bigint (Phase 4-2)
 *   - getWidgetHwnd(win): bigint (Phase 4-2)
 *   - attachToWorkerW(...): Win32DesktopHandles (Phase 4-2)
 *   - detachFromWorkerW(h): void (Phase 4-2)
 *   - findDesktopListView(workerW): bigint | null (Phase 6)
 *   - lvmHitTest(listView, point): boolean (Phase 6)
 *   - installLowLevelMouseHook(cb): MouseHookHandle (Phase 7)
 *   - uninstallLowLevelMouseHook(h): void (Phase 7)
 *
 * 주의:
 *   - 본 파일은 process.platform === 'win32'에서만 require된다 (lazy require).
 *   - `koffi`는 외부 의존성이며 esbuild externals + asarUnpack으로 처리된다.
 *   - 모든 외부 호출 실패는 명시적 Error 클래스로 throw하고, manager에서 흡수한다.
 *   - 상수·타입은 본 파일 내에서만 사용한다 (외부 노출 최소화).
 */

import type { BrowserWindow } from 'electron';

/**
 * koffi load 실패 시 던지는 명시 에러.
 *
 * win32 환경이지만 koffi 모듈/네이티브 바이너리를 load하지 못한 경우.
 * 가능한 원인:
 *   - koffi 의존성 미설치 (npm install 누락)
 *   - asarUnpack 미적용 (packaged build에서 .node 바이너리 접근 실패)
 *   - 시스템 라이브러리 (user32.dll, kernel32.dll) 접근 거부 (보안 프로그램)
 */
export class KoffiLoadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'KoffiLoadError';
  }
}

/**
 * Lazy 초기화된 Win32 함수 핸들.
 *
 * 첫 호출 시 koffi.load()를 시도하고 결과를 캐시한다.
 * 실패하면 KoffiLoadError를 throw하며 캐시는 갱신하지 않는다 (재시도 가능).
 */
interface Win32Bindings {
  GetCurrentProcessId: () => number;
}

let cachedBindings: Win32Bindings | null = null;

/**
 * koffi 모듈을 lazy load하고 user32/kernel32 함수 바인딩을 생성한다.
 *
 * @throws KoffiLoadError - koffi 모듈 또는 시스템 라이브러리 load 실패 시
 */
function loadWin32Bindings(): Win32Bindings {
  if (cachedBindings) return cachedBindings;

  // koffi는 외부 의존성. esbuild externals + asarUnpack으로 처리.
  // require 실패는 KoffiLoadError로 변환.
  let koffi: typeof import('koffi');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    koffi = require('koffi');
  } catch (e) {
    throw new KoffiLoadError(
      `koffi 모듈 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  // kernel32.dll: 프로세스 식별 등 기본 시스템 함수
  let kernel32: ReturnType<typeof koffi.load>;
  try {
    kernel32 = koffi.load('kernel32.dll');
  } catch (e) {
    throw new KoffiLoadError(
      `kernel32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  // user32.dll: 창 핸들·메시지·hook 등 (Phase 4-2부터 본격 사용)
  // Phase 4-1에서는 load만 시도해 시스템 접근 가능 여부를 확인한다.
  try {
    koffi.load('user32.dll');
  } catch (e) {
    throw new KoffiLoadError(
      `user32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  // GetCurrentProcessId — 단순 동작 검증용 (DWORD WINAPI GetCurrentProcessId(void))
  // 다음 Phase에서 OpenProcess / SendMessage 등이 추가될 때까지 자리값 역할.
  let GetCurrentProcessId: Win32Bindings['GetCurrentProcessId'];
  try {
    GetCurrentProcessId = kernel32.func('uint32 __stdcall GetCurrentProcessId()') as Win32Bindings['GetCurrentProcessId'];
  } catch (e) {
    throw new KoffiLoadError(
      `GetCurrentProcessId 바인딩 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  cachedBindings = { GetCurrentProcessId };
  return cachedBindings;
}

/**
 * 현재 프로세스 ID를 Win32 GetCurrentProcessId로 조회한다.
 *
 * Phase 4-1 골격 검증용. process.pid와 일치해야 정상.
 *
 * @throws KoffiLoadError - koffi/시스템 라이브러리 load 실패 시
 */
export function getCurrentProcessId(): number {
  const bindings = loadWin32Bindings();
  return bindings.GetCurrentProcessId();
}

/**
 * 위젯 BrowserWindow에서 native HWND를 추출한다.
 *
 * Phase 4-2에서 attachToWorkerW의 첫 인자로 사용될 예정.
 * Phase 4-1에서는 시그너처만 노출 (구현은 Phase 4-2 commit에서).
 *
 * 현 시점에서는 항상 throw — manager가 호출하지 않도록 골격만 유지한다.
 */
export function getWidgetHwnd(_win: BrowserWindow): bigint {
  throw new Error('getWidgetHwnd: not-implemented (Phase 4-2)');
}
