import { useState } from 'react';
import { useRealtimeWallSyncStore } from '@adapters/stores/useRealtimeWallSyncStore';

/**
 * 학생 닉네임 입력 화면.
 *
 * P1 범위는 닉네임 저장 + WebSocket 연결까지. 실제 카드 제출 UI는 P3.
 * Design §12 Q3 확정: join 시점 닉네임 입력 (기존 동작 유지).
 */

const NICKNAME_STORAGE_KEY = 'ssampin-realtime-wall-nickname';
const MAX_NICKNAME_LENGTH = 20;

export function StudentJoinScreen() {
  const connect = useRealtimeWallSyncStore((s) => s.connect);
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (trimmed.length === 0) {
      setError('닉네임을 입력해 주세요');
      return;
    }
    if (trimmed.length > MAX_NICKNAME_LENGTH) {
      setError(`닉네임은 ${MAX_NICKNAME_LENGTH}자 이하로 입력해 주세요`);
      return;
    }
    setError(null);
    try {
      window.sessionStorage.setItem(NICKNAME_STORAGE_KEY, trimmed);
    } catch {
      // sessionStorage 사용 불가여도 연결은 계속 진행
    }
    // 현재 페이지 origin에 WebSocket 연결 (cloudflared 터널 URL)
    connect(window.location.origin);
  };

  return (
    <div className="min-h-screen bg-sp-bg px-6 py-12 text-sp-text">
      <div className="mx-auto flex max-w-md flex-col gap-6">
        <header className="text-center">
          <span className="material-symbols-outlined text-[48px] text-sp-accent">forum</span>
          <h1 className="mt-2 text-2xl font-bold">실시간 담벼락</h1>
          <p className="mt-1 text-sm text-sp-muted">
            닉네임을 입력하고 게시판에 참여하세요
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-sp-border bg-sp-card p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-sp-text">닉네임</span>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="예) 민수"
              autoFocus
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
            />
          </label>

          {error && (
            <p className="text-xs text-rose-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="rounded-lg bg-sp-accent px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            참여하기
          </button>
        </form>

        <p className="text-center text-xs text-sp-muted">
          같은 기기에서 다시 열면 자동으로 연결됩니다
        </p>
      </div>
    </div>
  );
}
