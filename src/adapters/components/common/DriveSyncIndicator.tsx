import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isGoogleAuthBlockedError } from '@domain/rules/calendarSyncRules';

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

  const isAuthBlocked = error ? isGoogleAuthBlockedError(error) : false;

  return (
    <div className="mb-2">
      {status === 'syncing' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-surface text-xs text-sp-muted">
          <span className="material-symbols-outlined text-icon animate-spin text-sp-accent">sync</span>
          <span>
            {progress
              ? `동기화 중... (${progress.current}/${progress.total})`
              : '동기화 중...'}
          </span>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-xs text-emerald-400">
          <span className="material-symbols-outlined text-icon">check_circle</span>
          <span>동기화 완료</span>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={handleRetry}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
            title={error ?? undefined}
          >
            <span className="material-symbols-outlined text-icon">error</span>
            <span className="flex-1 text-left truncate">
              {isAuthBlocked ? '구글 인증 차단 (학교 계정 정책)' : (error ?? '동기화 실패')}
            </span>
            <span className="material-symbols-outlined text-icon-sm">refresh</span>
          </button>
          {isAuthBlocked && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-detail text-amber-200 leading-relaxed">
              학교 계정(@*.go.kr 등)은 외부 앱 차단 정책일 수 있어요. <span className="font-medium">설정 → Google 통합</span>에서 연결을 해제하고 <span className="font-medium">개인 Gmail</span>로 다시 연결해주세요.
            </div>
          )}
        </div>
      )}

      {status === 'conflict' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
          <span className="material-symbols-outlined text-icon">warning</span>
          <span>충돌 {conflicts.length}건</span>
        </div>
      )}
    </div>
  );
}
