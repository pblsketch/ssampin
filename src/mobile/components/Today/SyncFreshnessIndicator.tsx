import { useEffect, useState } from 'react';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

/** 마지막 동기화 시각을 상대 시간 문자열로. */
function formatFreshness(isoString: string | null): string {
  if (!isoString) return '동기화 기록 없음';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 동기화';
  if (diffMin < 60) return `${diffMin}분 전 동기화`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전 동기화`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}일 전 동기화`;
}

/**
 * 홈 화면 상단에 상시 노출되는 동기화 신선도 표시.
 * 완료 배너(SyncStatusBanner)는 5초 후 사라져 그 뒤로는 데이터가 언제 것인지 알 방법이 없었다.
 * 60초 간격으로 상대 시간을 다시 계산해 항상 최신 문구를 보여주고, 탭하면 수동 동기화도 겸한다.
 */
export function SyncFreshnessIndicator() {
  const isAuthenticated = useMobileDriveSyncStore((s) => s.isAuthenticated);
  const lastSyncedAt = useMobileDriveSyncStore((s) => s.lastSyncedAt);
  const syncState = useMobileDriveSyncStore((s) => s.state);
  const syncFromCloud = useMobileDriveSyncStore((s) => s.syncFromCloud);

  // 60초마다 상대 시간 문구를 다시 계산하기 위한 리렌더 트리거
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!isAuthenticated) {
    return (
      <span className="inline-flex items-center gap-1 text-tiny text-sp-muted opacity-70">
        <span className="material-symbols-outlined text-xs leading-none">cloud_off</span>
        동기화 꺼짐
      </span>
    );
  }

  const isSyncing = syncState === 'syncing';

  return (
    <button
      type="button"
      onClick={() => void syncFromCloud()}
      disabled={isSyncing}
      className="inline-flex items-center gap-1 text-tiny text-sp-muted active:opacity-60 disabled:opacity-70 transition-opacity"
      aria-label="지금 동기화하기"
    >
      <span
        className={`material-symbols-outlined text-xs leading-none ${
          isSyncing ? 'animate-spin text-sp-accent' : ''
        }`}
      >
        {isSyncing ? 'sync' : 'cloud_done'}
      </span>
      {isSyncing ? '동기화 중...' : formatFreshness(lastSyncedAt)}
    </button>
  );
}
