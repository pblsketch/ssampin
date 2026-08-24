import { useState, useEffect } from 'react';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { useGoogleAuthContext } from '@mobile/contexts/GoogleAuthContext';
import { getFileLabel } from '@adapters/components/common/SyncResultSummary';

interface SyncStatusBannerProps {
  onOpenSyncSettings: () => void;
}

export function SyncStatusBanner({ onOpenSyncSettings }: SyncStatusBannerProps) {
  const state = useMobileDriveSyncStore((s) => s.state);
  const progress = useMobileDriveSyncStore((s) => s.progress);
  const error = useMobileDriveSyncStore((s) => s.error);
  const errorKind = useMobileDriveSyncStore((s) => s.errorKind);
  const lastSyncedAt = useMobileDriveSyncStore((s) => s.lastSyncedAt);
  const isAuthenticated = useMobileDriveSyncStore((s) => s.isAuthenticated);
  const conflict = useMobileDriveSyncStore((s) => s.conflict);
  const syncFromCloud = useMobileDriveSyncStore((s) => s.syncFromCloud);
  const { startLogin } = useGoogleAuthContext();

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

  // 새 오류나 충돌은 이전 배너의 닫기 상태와 무관하게 반드시 다시 안내한다.
  useEffect(() => {
    if (state === 'error' || state === 'conflict') {
      setDismissed(false);
    }
  }, [state, error]);

  if (dismissed) return null;
  // 인증 만료/차단 오류는 isAuthenticated 를 false 로 바꾸므로, 오류 배너까지 숨기지 않도록 예외 처리.
  if (!isAuthenticated && state !== 'error') return null;

  if (state === 'conflict' && conflict) {
    const fileLabel = getFileLabel(conflict.filename);
    return (
      <div
        role="alert"
        className="mx-4 mb-3 rounded-xl bg-sp-highlight/10 border border-sp-highlight/30 px-4 py-3"
      >
        <div className="flex items-start gap-2">
          <span
            className="material-symbols-outlined text-sp-highlight text-base mt-0.5 shrink-0"
            aria-hidden="true"
          >
            sync_problem
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-sp-text font-medium">
              PC와 휴대폰의 {fileLabel}가 모두 변경됐어요
            </p>
            <p className="mt-0.5 text-sm text-sp-muted leading-relaxed">
              선택하기 전까지 이전 내용이 표시될 수 있어요.
            </p>
            <button
              onClick={onOpenSyncSettings}
              className="mt-2 min-h-[44px] text-sm text-sp-highlight font-medium hover:opacity-80 transition-opacity"
            >
              동기화 내용 선택하기
            </button>
          </div>
        </div>
      </div>
    );
  }

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
    // 인증 만료(auth) / 학교 계정 차단(blocked) 은 재시도로 해결되지 않으므로 재로그인 유도.
    const needsRelogin = errorKind === 'auth' || errorKind === 'blocked';

    return (
      <div className="mx-4 mb-3 rounded-xl bg-sp-error/10 border border-sp-error/30 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="material-symbols-outlined text-sp-error text-base mt-0.5 shrink-0">
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
          {needsRelogin ? (
            <button
              onClick={() => {
                setDismissed(false);
                void startLogin(true);
              }}
              className="flex items-center gap-1 text-xs text-sp-error hover:opacity-80 font-medium transition-opacity"
            >
              <span className="material-symbols-outlined text-icon-sm">login</span>
              다시 로그인
            </button>
          ) : (
            <button
              onClick={() => {
                setDismissed(false);
                void syncFromCloud();
              }}
              className="text-xs text-sp-error hover:opacity-80 font-medium transition-opacity"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    );
  }

  // 동기화 완료 성공 배너
  if (state === 'idle' && lastSyncedAt && showSuccess) {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-sp-success/10 border border-sp-success/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-success text-base">
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
