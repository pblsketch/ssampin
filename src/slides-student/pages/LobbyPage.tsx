/**
 * 학생 SPA 로비 화면 — 선생님이 수업을 시작할 때까지 대기.
 */

import type { ConnectionState } from '../wsClient';

export interface LobbyPageProps {
  readonly connectionState: ConnectionState;
}

export function LobbyPage({ connectionState }: LobbyPageProps): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-6 text-center">
      <div className="text-6xl mb-6 animate-pulse" aria-hidden>⏳</div>
      <h1 className="text-xl font-bold mb-3">수업이 곧 시작됩니다</h1>
      <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
        선생님이 수업을 시작하면 화면이 자동으로 전환됩니다.
        <br />
        이 화면을 그대로 두세요.
      </p>

      {connectionState === 'reconnecting' && (
        <div className="mt-8 px-4 py-2 bg-amber-500/15 border border-amber-400/40 rounded-lg text-xs text-amber-200">
          연결 다시 시도 중…
        </div>
      )}
      {connectionState === 'closed' && (
        <div className="mt-8 px-4 py-2 bg-red-500/15 border border-red-400/40 rounded-lg text-xs text-red-200">
          연결이 끊겼어요. 페이지를 새로고침해 주세요.
        </div>
      )}
    </div>
  );
}
