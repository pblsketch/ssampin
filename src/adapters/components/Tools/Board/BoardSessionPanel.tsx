/**
 * BoardSessionPanel — 활성 세션 뷰 조립 (Design §5.1)
 *
 * - QR·세션코드·URL 카드 (BoardQRCard)
 * - 접속자 목록 (BoardParticipantList)
 * - 마지막 자동 저장 시각 표시 + 에러 배너
 *
 * useBoardSessionStore가 IPC 이벤트 구독으로 실시간 갱신됨. 이 컴포넌트는
 * 셀렉터만 구독하므로 수동 polling 없음.
 */
import { useEffect, useState } from 'react';

import { useBoardSessionStore } from '@adapters/stores/useBoardSessionStore';

import { BoardQRCard } from './BoardQRCard';
import { BoardParticipantList } from './BoardParticipantList';

function formatSince(timestamp: number): string {
  const s = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (s < 5) return '방금';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return `${h}시간 전`;
}

export function BoardSessionPanel(): JSX.Element | null {
  const active = useBoardSessionStore((s) => s.active);
  const participants = useBoardSessionStore((s) => s.participants);
  const lastSavedAt = useBoardSessionStore((s) => s.lastSavedAt);
  const lastError = useBoardSessionStore((s) => s.lastError);

  // 1초마다 "방금/N초 전" 표시 갱신
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  void tick;

  if (!active) return null;

  return (
    <div className="space-y-4">
      <BoardQRCard
        publicUrl={active.publicUrl}
        sessionCode={active.sessionCode}
        authToken={active.authToken}
        qrDataUrl={active.qrDataUrl}
      />

      <BoardParticipantList participants={participants} />

      {/* 자동 저장 상태 */}
      <div className="bg-sp-card rounded-xl p-4 flex items-center gap-2 text-xs">
        <span className="material-symbols-outlined text-sp-muted text-icon-sm">
          {lastSavedAt ? 'cloud_done' : 'cloud_sync'}
        </span>
        <span className="text-sp-muted">
          {lastSavedAt
            ? `마지막 자동 저장: ${formatSince(lastSavedAt)}`
            : '30초 주기로 자동 저장됩니다 (아직 저장 전)'}
        </span>
      </div>

      {/* 세션 에러 배너 */}
      {lastError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400 break-words">
          <div className="font-semibold mb-1">세션 이슈 감지</div>
          <div className="font-mono">{lastError}</div>
        </div>
      )}
    </div>
  );
}
