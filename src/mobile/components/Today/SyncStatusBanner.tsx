import { useState, useEffect } from 'react';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

export function SyncStatusBanner() {
  const state = useMobileDriveSyncStore((s) => s.state);
  const progress = useMobileDriveSyncStore((s) => s.progress);
  const error = useMobileDriveSyncStore((s) => s.error);
  const lastSyncedAt = useMobileDriveSyncStore((s) => s.lastSyncedAt);
  const isAuthenticated = useMobileDriveSyncStore((s) => s.isAuthenticated);
  const syncFromCloud = useMobileDriveSyncStore((s) => s.syncFromCloud);

  const [dismissed, setDismissed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // 동기화 완료 시 성공 배너 표시, 5초 후 자동 숨김
  useEffect(() => {
    if (state === 'idle' && lastSyncedAt) {
      setShowSuccess(true);
      setDismissed(false);
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state, lastSyncedAt]);

  // 새 에러 발생 시 dismissed 초기화
  useEffect(() => {
    if (state === 'error') {
      setDismissed(false);
    }
  }, [state, error]);

  if (dismissed) return null;
  if (!isAuthenticated) return null;

  // 동기화 중
  if (state === 'syncing') {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-sp-accent/15 border border-sp-accent/20 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent text-base animate-spin">
              sync
            </span>
            <span className="text-sm text-sp-text font-medium">
              PC 데이터 동기화 중... {progress}%
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-sp-muted hover:text-sp-text transition-colors"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="h-1 w-full rounded-full bg-sp-accent/20">
          <div
            className="h-1 rounded-full bg-sp-accent transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // 오류
  if (state === 'error' && error) {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="material-symbols-outlined text-red-400 text-base mt-0.5 shrink-0">
              error
            </span>
            <span className="text-sm text-sp-text leading-snug">{error}</span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-sp-muted hover:text-sp-text transition-colors shrink-0"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              setDismissed(false);
              void syncFromCloud();
            }}
            className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // 동기화 완료 성공 배너
  if (state === 'idle' && lastSyncedAt && showSuccess) {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-green-400 text-base">
              check_circle
            </span>
            <span className="text-sm text-sp-text font-medium">
              동기화 완료! PC 데이터를 불러왔어요
            </span>
          </div>
          <button
            onClick={() => {
              setShowSuccess(false);
              setDismissed(true);
            }}
            className="text-sp-muted hover:text-sp-text transition-colors"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
