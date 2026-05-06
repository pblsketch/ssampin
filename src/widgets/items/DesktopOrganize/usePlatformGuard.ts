import { useEffect, useState } from 'react';

/**
 * 현재 OS가 Windows인지 감지한다.
 * - Electron renderer: navigator.userAgent 또는 navigator.userAgentData에 'Windows' 포함
 * - 브라우저 dev: 동일 방식
 *
 * native-desktop 모드는 Windows 전용이므로 비-Windows는 카드 본문에 안내 표시.
 */
export function useIsWindows(): boolean {
  const [isWindows, setIsWindows] = useState<boolean>(() => detectIsWindowsSync());

  useEffect(() => {
    setIsWindows(detectIsWindowsSync());
  }, []);

  return isWindows;
}

function detectIsWindowsSync(): boolean {
  if (typeof navigator === 'undefined') return false;
  // userAgent는 모든 환경에서 안전하게 읽을 수 있음
  const ua = navigator.userAgent ?? '';
  return /Windows/i.test(ua);
}
