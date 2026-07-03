import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useGoogleAuthContext } from '@mobile/contexts/GoogleAuthContext';
import { SyncResultSummary } from '@adapters/components/common/SyncResultSummary';

const AUTO_SYNC_OPTIONS = [
  { value: 0, label: '꺼짐' },
  { value: 1, label: '1분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
] as const;

export function SyncStatus() {
  const {
    state,
    progress,
    error,
    conflict,
    lastSyncedAt,
    syncToCloud,
    syncFromCloud,
    resolveConflict,
    isAuthenticated,
    lastSyncResult,
  } = useMobileDriveSyncStore();
  const { isAuthenticated: accountConnected, email, startLogin, logout } = useGoogleAuthContext();
  const currentInterval = useMobileSettingsStore((s) => s.settings.sync?.autoSyncInterval ?? 0);
  const setAutoSyncInterval = useMobileSettingsStore((s) => s.setAutoSyncInterval);

  const handleAutoSyncChange = (value: number) => {
    void setAutoSyncInterval(value);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent">cloud_sync</span>
          <span className="text-sp-text font-bold">Google Drive 동기화</span>
        </div>
        {accountConnected && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-green-400 text-xs">연결됨</span>
          </div>
        )}
      </div>

      {/* 계정 영역: 로그인 / 로그아웃 / 계정 변경 */}
      {accountConnected ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-sp-border px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-sp-muted text-icon-sm shrink-0">
              account_circle
            </span>
            <span className="text-sp-text text-xs truncate">{email ?? '연결됨'}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                void logout().then(() => startLogin(true));
              }}
              className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-accent transition-colors"
              title="다른 계정으로 변경"
            >
              <span className="material-symbols-outlined text-icon-sm">swap_horiz</span>
              계정 변경
            </button>
            <button
              onClick={() => void logout()}
              className="flex items-center gap-1 text-xs text-sp-muted hover:text-red-400 transition-colors"
            >
              <span className="material-symbols-outlined text-icon-sm">logout</span>
              로그아웃
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sp-muted text-sm">
            PC에서 입력한 데이터를 보려면 Google 계정으로 로그인하세요.
          </p>
          <p className="flex items-start gap-1.5 text-sp-muted text-xs leading-relaxed">
            <span className="material-symbols-outlined text-icon-sm shrink-0 text-sp-highlight">
              lightbulb
            </span>
            <span>
              PC에서 먼저 데이터를 입력·동기화한 뒤 휴대폰에서 같은 계정으로 로그인하면 PC 데이터를
              그대로 받아와요.
            </span>
          </p>
          <button
            onClick={() => void startLogin()}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm rounded-xl bg-sp-accent text-sp-accent-fg font-medium active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-icon-sm">login</span>
            Google 계정으로 로그인
          </button>
        </div>
      )}

      {!accountConnected && error && <p className="text-red-400 text-sm">{error}</p>}

      {isAuthenticated && state === 'syncing' && (
        <div>
          <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-sp-accent rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sp-muted text-xs mt-1">동기화 중...</p>
        </div>
      )}

      {isAuthenticated && state === 'error' && error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      {isAuthenticated && state === 'conflict' && conflict && (
        <div className="space-y-2">
          <p className="text-yellow-400 text-sm">충돌 발생: {conflict.filename}</p>
          <div className="flex gap-2">
            <button
              onClick={() => resolveConflict('local')}
              className="flex-1 py-2 text-sm rounded-lg bg-sp-accent/15 text-sp-accent"
            >
              로컬 유지
            </button>
            <button
              onClick={() => resolveConflict('remote')}
              className="flex-1 py-2 text-sm rounded-lg bg-sp-accent/15 text-sp-accent"
            >
              클라우드 유지
            </button>
          </div>
        </div>
      )}

      {isAuthenticated && lastSyncedAt && (
        <p className="text-sp-muted text-xs">
          마지막 동기화: {new Date(lastSyncedAt).toLocaleString('ko-KR')}
        </p>
      )}

      {isAuthenticated && (
        <div className="flex gap-2">
          <button
            onClick={() => void syncToCloud()}
            disabled={state === 'syncing'}
            className="flex-1 py-2 text-sm rounded-xl border border-sp-border text-sp-text disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            업로드
          </button>
          <button
            onClick={() => void syncFromCloud()}
            disabled={state === 'syncing'}
            className="flex-1 py-2 text-sm rounded-xl border border-sp-border text-sp-text disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            다운로드
          </button>
        </div>
      )}

      {isAuthenticated && lastSyncResult && <SyncResultSummary result={lastSyncResult} compact />}

      {isAuthenticated && (
        <div className="mt-3">
          <p className="text-sp-muted text-xs font-medium mb-2">자동 동기화</p>
          <div className="flex flex-wrap gap-1.5">
            {AUTO_SYNC_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleAutoSyncChange(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  currentInterval === opt.value
                    ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
                    : 'border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
