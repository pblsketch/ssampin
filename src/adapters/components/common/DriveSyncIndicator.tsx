import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export function DriveSyncIndicator() {
  const { settings } = useSettingsStore();
  const { status, error, progress, conflicts, syncToCloud, syncFromCloud, resetStatus } = useDriveSyncStore();

  // 동기화 비활성이면 렌더링 안 함
  if (!settings.sync?.enabled) return null;

  // idle 상태에서는 최소한의 표시
  if (status === 'idle') return null;

  const handleRetry = async () => {
    resetStatus();
    await syncFromCloud();
    await syncToCloud();
  };

  return (
    <div className="mb-2">
      {status === 'syncing' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-surface text-xs text-sp-muted">
          <span className="material-symbols-outlined text-[16px] animate-spin text-sp-accent">sync</span>
          <span>
            {progress
              ? `동기화 중... (${progress.current}/${progress.total})`
              : '동기화 중...'}
          </span>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400">
          <span className="material-symbols-outlined text-[16px]">check_circle</span>
          <span>동기화 완료</span>
        </div>
      )}

      {status === 'error' && (
        <button
          type="button"
          onClick={handleRetry}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span className="flex-1 text-left truncate">{error ?? '동기화 실패'}</span>
          <span className="material-symbols-outlined text-[14px]">refresh</span>
        </button>
      )}

      {status === 'conflict' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
          <span className="material-symbols-outlined text-[16px]">warning</span>
          <span>충돌 {conflicts.length}건</span>
        </div>
      )}
    </div>
  );
}
