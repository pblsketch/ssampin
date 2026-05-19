import { useState, useEffect } from 'react';

/**
 * electron-updater의 `onUpdateAvailable` 이벤트를 구독해
 * 현재 사용 가능한 새 버전 문자열을 반환.
 *
 * Sidebar(배지 표시)와 UpdateNotification(모달)이 모두 구독한다.
 * preload의 EventEmitter 패턴이 다중 구독을 보장.
 *
 * @returns 새 버전 string. 없으면 null.
 */
export function useNewVersionAvailable(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return;

    const cleanup = api.onUpdateAvailable((info) => {
      setVersion(info.version);
    });

    return cleanup;
  }, []);

  return version;
}
