import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';
import { StudentJoinScreen } from './StudentJoinScreen';
import { StudentBoardView } from './StudentBoardView';
import { useStudentReconnect } from './useStudentReconnect';

/**
 * 학생 실시간 담벼락 최상위 컨테이너.
 *
 * 흐름:
 * 1. 닉네임 미입력 시 `StudentJoinScreen` 렌더 — 닉네임 받고 WebSocket connect
 * 2. connect 후 status 분기로 연결 중/연결됨/종료/에러 UI 전환
 * 3. board snapshot 수신 시 `StudentBoardView` 렌더 (4 레이아웃 라우터)
 *
 * v2.1 Phase A 추가:
 *   - useStudentReconnect: visibilitychange + 지수 백오프 → iOS Safari 30초+ 백그라운드 mitigation
 *   - "다시 연결되었어요" 1회 토스트 (재연결 성공 후 표시)
 *
 * Design v2.1 §5.1 / §6.3 (시퀀스 다이어그램) / §10.6.2.
 */

const NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';

export function StudentRealtimeWallApp() {
  const status = useRealtimeWallSyncStore((s) => s.status);
  const board = useRealtimeWallSyncStore((s) => s.board);
  const connect = useRealtimeWallSyncStore((s) => s.connect);
  const disconnect = useRealtimeWallSyncStore((s) => s.disconnect);

  const [reconnectToast, setReconnectToast] = useState<string | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // 탭 닫힘 시 disconnect (best-effort)
  useEffect(() => {
    const handleUnload = () => {
      disconnect();
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [disconnect]);

  // 학생 entry는 항상 같은 origin으로 연결 (cloudflared 터널)
  const reconnect = useCallback(() => {
    if (typeof window === 'undefined') return;
    setReconnectToast('연결 중...');
    connect(window.location.origin);
  }, [connect]);

  // socket getter — store 내부 socket이 module-scope이므로 status로 추정
  // status='open'이면 socket OPEN, 'reconnecting'/'connecting'은 CONNECTING,
  // 'error'/'closed'/'idle'은 unconnected. useStudentReconnect는 OPEN/CONNECTING이 아닐 때만 재연결.
  const getSocket = useCallback((): WebSocket | null => {
    if (status === 'open') {
      return { readyState: WebSocket.OPEN } as unknown as WebSocket;
    }
    if (status === 'connecting' || status === 'reconnecting') {
      return { readyState: WebSocket.CONNECTING } as unknown as WebSocket;
    }
    return null;
  }, [status]);

  // visibilitychange + 지수 백오프 재연결 (iOS Safari 30초+ 시나리오)
  // 단 이미 닫힌(closed) 보드는 재연결 X
  useStudentReconnect({
    getSocket,
    reconnect,
    enabled: status !== 'closed' && readNickname() !== null,
    onReconnectAttempt: (delayMs) => {
      setReconnectToast(`연결 중... (${Math.round(delayMs / 1000)}초 후 재시도)`);
    },
  });

  // 재연결 성공 감지 — open이 된 직후 1회 토스트 (직전 status가 open이 아니었을 때만)
  useEffect(() => {
    if (status === 'open' && !wasOpenRef.current) {
      // 첫 open이거나 재연결 성공
      if (reconnectToast !== null) {
        setReconnectToast('다시 연결되었어요');
        const timer = setTimeout(() => setReconnectToast(null), 2500);
        return () => clearTimeout(timer);
      }
    }
    wasOpenRef.current = status === 'open';
  }, [status, reconnectToast]);

  // 닉네임이 아직 없으면 join 화면
  if (status === 'idle' && !readNickname()) {
    return <StudentJoinScreen />;
  }

  if (status === 'connecting') {
    return (
      <StudentStatusScreen
        icon="wifi_tethering"
        title="연결 중이에요"
        description="담벼락에 접속하고 있습니다"
      />
    );
  }

  if (status === 'reconnecting') {
    return (
      <StudentStatusScreen
        icon="sync"
        title="다시 연결하는 중이에요"
        description="잠시만 기다려 주세요"
      />
    );
  }

  if (status === 'closed') {
    return (
      <StudentStatusScreen
        icon="lock"
        title="게시판이 닫혔어요"
        description="선생님이 실시간 담벼락을 종료했습니다"
      />
    );
  }

  if (status === 'error') {
    return (
      <StudentStatusScreen
        icon="error"
        title="연결이 끊어졌어요"
        description="새로고침해 주세요"
      />
    );
  }

  if (status === 'open' && board) {
    return (
      <>
        <StudentBoardView board={board} />
        {reconnectToast && <ReconnectToast message={reconnectToast} />}
      </>
    );
  }

  // open이지만 아직 wall-state 미수신
  return (
    <StudentStatusScreen
      icon="cloud_download"
      title="담벼락을 불러오는 중이에요"
      description="거의 다 됐습니다"
    />
  );
}

function readNickname(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NICKNAME_STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

interface StudentStatusScreenProps {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}

function StudentStatusScreen({ icon, title, description }: StudentStatusScreenProps) {
  return (
    <div className="min-h-screen bg-sp-bg px-6 py-12 text-sp-text">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-sp-border bg-sp-card p-8 text-center">
        <span className="material-symbols-outlined text-[48px] text-sp-accent">{icon}</span>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-sp-muted">{description}</p>
      </div>
    </div>
  );
}

/**
 * v2.1 (Phase A-A6) — 재연결 토스트 (상단 중앙 fixed).
 */
function ReconnectToast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-full border border-sky-400/40 bg-sp-card px-4 py-2 text-xs text-sp-text shadow-lg"
    >
      {message}
    </div>
  );
}
