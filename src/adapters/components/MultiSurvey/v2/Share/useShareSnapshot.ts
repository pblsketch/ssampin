/**
 * useShareSnapshot — Share view(별도 BrowserWindow)에서 IPC 스냅샷을 수신하는 훅.
 *
 * 교사 콘솔 창에서 sendMultiSurveyShareSnapshot 으로 전송한 스냅샷을
 * Electron main 프로세스가 Share window로 중계하면 여기서 수신한다.
 *
 * - 마운트 시 구독, 언마운트 시 정리 (메모리 누수 없음)
 * - 첫 스냅샷 도착 전까지 null 반환 → ShareWindowApp 에서 대기 화면 표시
 */

import { useEffect, useState } from 'react';
import type { ShareSnapshot } from './shareSnapshot';

export function useShareSnapshot(): ShareSnapshot | null {
  const [snapshot, setSnapshot] = useState<ShareSnapshot | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onMultiSurveyShareSnapshot) return;

    const unsub = api.onMultiSurveyShareSnapshot((s) => {
      setSnapshot(s);
    });

    return () => {
      unsub();
    };
  }, []);

  return snapshot;
}
