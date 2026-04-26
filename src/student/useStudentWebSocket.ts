import { useEffect } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';

/**
 * 학생 SPA 진입 시점에 WebSocket lifecycle을 위임.
 *
 * `useRealtimeWallSyncStore`의 connect/disconnect를 mount/unmount에 바인딩한다.
 * Zustand 스토어가 exponential backoff / teardown / 메시지 분기 등 lifecycle 전체를
 * 처리하므로 이 훅은 의도적으로 thin wrapper로 유지한다.
 *
 * Design §11.1 — P1 신규 파일 목록 항목.
 * Clean Architecture: adapters → adapters (허용).
 *
 * @param url 교사가 공유한 서버 URL (http/https/ws/wss 모두 허용, 내부에서 ws(s) 변환)
 */
export function useStudentWebSocket(url: string): void {
  const connect = useRealtimeWallSyncStore((s) => s.connect);
  const disconnect = useRealtimeWallSyncStore((s) => s.disconnect);

  useEffect(() => {
    connect(url);
    return () => {
      disconnect();
    };
  }, [url, connect, disconnect]);
}
