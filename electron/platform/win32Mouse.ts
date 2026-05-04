/**
 * Win32 마우스 버튼 상태 즉시 폴링용 FFI wrapper.
 *
 * 목적: Electron transparent + frameless BrowserWindow 의 드래그 폴링에서
 *       pointer capture 가 OS 합성 race 로 stale 되어 pointerup 이 안 오는 케이스를
 *       Win32 GetAsyncKeyState 로 직접 잡는다.
 *
 *       (clawd-on-desk 소스 분석에서 확인한 사실:
 *         "Repositioning the input window mid-drag can break pointer capture on Windows.")
 *
 * 사용처:
 *   - electron/main.ts startIconDrag() 의 setInterval 안에서 매 16ms
 *     isLeftMouseDown() 을 호출. 0 이면 즉시 stopIconDrag('mouseup-detected').
 *
 * 비-Windows / koffi 로드 실패 시 isLeftMouseDown() 은 항상 true 반환
 * (= 폴링 안 끊김). 그 경우 idle-stop 안전망(700ms)이 fallback.
 */

import type koffiType from 'koffi';

const VK_LBUTTON = 0x01;
const HIGH_BIT_MASK = 0x8000; // GetAsyncKeyState: 0x8000 비트가 켜지면 down

interface MouseApi {
  /** 0 ≠ down, 0 = up. 비-Windows 에서는 항상 true 로 간주. */
  isLeftButtonDown: () => boolean;
}

let cachedApi: MouseApi | null = null;
let loadAttempted = false;

/**
 * Win32 GetAsyncKeyState wrapper. 한 번만 로드하고 캐시.
 *
 * 반환:
 *   - Windows + koffi 로드 성공 → 실제 left button state
 *   - 그 외 → 항상 down=true (= idle-stop 안전망에 의존)
 */
export function getMouseApi(): MouseApi {
  if (cachedApi) return cachedApi;
  if (loadAttempted) {
    // 이전 로드 시도 실패 → null fallback
    return { isLeftButtonDown: () => true };
  }
  loadAttempted = true;

  if (process.platform !== 'win32') {
    cachedApi = { isLeftButtonDown: () => true };
    return cachedApi;
  }

  try {
    // lazy require — 비Windows 빌드에서 koffi 로드 시도조차 안 함
    const koffi = require('koffi') as typeof koffiType;
    const user32 = koffi.load('user32.dll');
    const GetAsyncKeyState = user32.func(
      'short __stdcall GetAsyncKeyState(int)',
    ) as unknown as (vKey: number) => number;

    cachedApi = {
      isLeftButtonDown: (): boolean => {
        try {
          const state = GetAsyncKeyState(VK_LBUTTON);
          // GetAsyncKeyState 는 short 반환. high-bit 가 켜지면 현재 down 상태.
          // 음수 short 도 가능하므로 unsigned 마스크.
          return (state & HIGH_BIT_MASK) !== 0;
        } catch {
          return true; // 호출 실패 → 안전하게 down 으로 간주 (drag 끊김 방지)
        }
      },
    };
    return cachedApi;
  } catch (err) {
    // koffi 로드 실패 (이론상 거의 없음 — package.json 의존성에 koffi 있음)
    console.warn('[win32Mouse] koffi load failed, falling back to idle-stop only:', err);
    cachedApi = { isLeftButtonDown: () => true };
    return cachedApi;
  }
}
