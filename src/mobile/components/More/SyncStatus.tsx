import { useState } from 'react';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useGoogleAuthContext } from '@mobile/contexts/GoogleAuthContext';
import {
  getFileLabel,
  SyncResultSummary,
} from '@adapters/components/common/SyncResultSummary';

const AUTO_SYNC_OPTIONS = [
  { value: 0, label: '꺼짐' },
  { value: 1, label: '1분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
] as const;

export function SyncStatus() {
  const [resolvingChoice, setResolvingChoice] = useState<
    'local' | 'remote' | 'remote-all' | null
  >(null);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const {
    state,
    progress,
    error,
    conflict,
    lastSyncedAt,
    syncToCloud,
    syncFromCloud,
    resolveConflict,
    resolveAllConflictsFromCloud,
    isAuthenticated,
    lastSyncResult,
  } = useMobileDriveSyncStore();
  const { isAuthenticated: accountConnected, email, startLogin, logout } = useGoogleAuthContext();
  const currentInterval = useMobileSettingsStore((s) => s.settings.sync?.autoSyncInterval ?? 0);
  const setAutoSyncInterval = useMobileSettingsStore((s) => s.setAutoSyncInterval);

  const handleAutoSyncChange = (value: number) => {
    void setAutoSyncInterval(value);
  };

  const handleConflictResolution = async (choice: 'local' | 'remote') => {
    if (resolvingChoice !== null) return;
    setResolvingChoice(choice);
    try {
      await resolveConflict(choice);
    } finally {
      setResolvingChoice(null);
    }
  };

  const conflictCount = lastSyncResult?.conflicts?.length ?? 0;

  const handleResolveAllFromCloud = async () => {
    if (resolvingChoice !== null) return;
    setBatchCurrent(1);
    setBatchTotal(conflictCount);
    setResolvingChoice('remote-all');
    try {
      await resolveAllConflictsFromCloud(setBatchCurrent);
    } finally {
      setResolvingChoice(null);
      setBatchCurrent(0);
      setBatchTotal(0);
    }
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

      {isAuthenticated && conflict && resolvingChoice !== null && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-sp-border bg-sp-bg p-3"
        >
          <div className="flex items-start gap-2.5">
            <span
              className="material-symbols-outlined text-sp-accent text-icon-lg animate-spin shrink-0 mt-0.5"
              aria-hidden
            >
              sync
            </span>
            <div className="min-w-0">
              <p className="text-sp-text text-sm font-sp-semibold">
                {resolvingChoice === 'remote-all'
                  ? `${batchCurrent}/${batchTotal} 항목: 클라우드 복구 중`
                  : `${getFileLabel(conflict.filename)}: ${
                      resolvingChoice === 'remote'
                        ? '클라우드 복구 중'
                        : '이 기기 내용 반영 중'
                    }`}
              </p>
              <p className="text-sp-muted text-xs leading-relaxed mt-1">
                저장 후 안전하게 다시 확인합니다. 잠시만 기다려 주세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {isAuthenticated && conflict && resolvingChoice === null && (
        <div role="alert" className="space-y-3 rounded-xl border border-sp-border bg-sp-bg p-3">
          <div className="flex items-start gap-2.5">
            <span
              className="material-symbols-outlined rounded-lg bg-sp-warning/12 p-1.5 text-sp-warning text-icon-lg shrink-0"
              aria-hidden
            >
              cloud_alert
            </span>
            <div className="min-w-0">
              <p className="text-sp-text text-sm font-sp-semibold">
                {getFileLabel(conflict.filename)} 동기화 내용을 선택해 주세요
              </p>
              <p className="text-sp-muted text-xs leading-relaxed mt-1">
                기기와 클라우드의 내용이 달라 자동으로 덮어쓰지 않았습니다.
              </p>
            </div>
          </div>
          {conflictCount > 1 && (
            <>
              <button
                type="button"
                onClick={() => void handleResolveAllFromCloud()}
                disabled={state === 'syncing' || resolvingChoice !== null}
                className="w-full min-h-11 px-3 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                모두 클라우드에서 복구 ({conflictCount}개)
              </button>
              <p className="text-center text-sp-muted text-xs">또는 현재 항목만 선택</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleConflictResolution('local')}
              disabled={state === 'syncing'}
              className="min-h-10 px-3 py-2 rounded-xl border border-sp-border bg-sp-card text-sp-text text-xs font-sp-medium disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              이 기기 내용 유지
            </button>
            <button
              type="button"
              onClick={() => void handleConflictResolution('remote')}
              disabled={state === 'syncing'}
              className="min-h-10 px-3 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-xs font-sp-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              클라우드에서 복구
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
            disabled={state === 'syncing' || conflict !== null}
            className="flex-1 py-2 text-sm rounded-xl border border-sp-border text-sp-text disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            업로드
          </button>
          <button
            onClick={() => void syncFromCloud()}
            disabled={state === 'syncing' || conflict !== null}
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
