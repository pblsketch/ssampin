import { useEffect, useState } from 'react';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isGoogleAuthBlockedError } from '@domain/rules/calendarSyncRules';
import { isCloudRebuildRequiredError } from '@domain/rules/driveSyncRecovery';
import { Notice } from './Notice';
import { CloudRebuildConfirmModal } from './CloudRebuildConfirmModal';

interface DriveSyncIndicatorProps {
  /** 사이드바 접힘 등 좁은 공간용 — 아이콘만 표시하고 상세 문구는 title 툴팁으로 전달 */
  collapsed?: boolean;
}

function formatRelativeSync(isoString: string | null | undefined): string {
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

export function DriveSyncIndicator({ collapsed = false }: DriveSyncIndicatorProps) {
  const { settings } = useSettingsStore();
  const {
    status,
    error,
    progress,
    conflicts,
    syncToCloud,
    syncFromCloud,
    resetStatus,
    lastSyncedAt,
    rebuildCloudData,
  } = useDriveSyncStore();

  const [showRebuildConfirm, setShowRebuildConfirm] = useState(false);

  // idle 상태의 "n분 전 동기화" 문구를 60초마다 다시 계산
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // 동기화 비활성이면 렌더링 안 함
  if (!settings.sync?.enabled) return null;

  const handleRetry = async () => {
    resetStatus();
    await syncFromCloud();
    await syncToCloud();
  };

  const handleManualSync = async () => {
    if (status === 'syncing') return;
    await syncFromCloud();
    await syncToCloud();
  };

  const isAuthBlocked = error ? isGoogleAuthBlockedError(error) : false;
  // 장부와 실제 파일이 어긋난 계열만 — 재시도로는 절대 안 풀리고
  // 클라우드를 다시 만들어야만 풀린다. 일시적 실패에는 띄우지 않는다 —
  // 기다리면 될 일에 클라우드를 통째 다시 만들게 할 수는 없다.
  const canRebuild = status === 'error' && !!error && isCloudRebuildRequiredError(error);
  const relativeLabel = formatRelativeSync(lastSyncedAt ?? settings.sync?.lastSyncedAt);

  if (collapsed) {
    const { icon, className, title } = (() => {
      if (status === 'syncing') {
        return {
          icon: 'sync',
          className: 'text-sp-accent animate-spin',
          title: progress ? `동기화 중... (${progress.current}/${progress.total})` : '동기화 중...',
        };
      }
      if (status === 'error') {
        return {
          icon: 'error',
          className: 'text-red-400',
          title: isAuthBlocked ? '구글 인증 차단 (학교 계정 정책)' : (error ?? '동기화 실패'),
        };
      }
      if (status === 'conflict') {
        return {
          icon: 'warning',
          className: 'text-amber-400',
          title: `충돌 ${conflicts.length}건`,
        };
      }
      return { icon: 'cloud_done', className: 'text-sp-muted', title: relativeLabel };
    })();

    return (
      <button
        type="button"
        onClick={() => void (status === 'error' ? handleRetry() : handleManualSync())}
        disabled={status === 'syncing'}
        title={title}
        aria-label={`Drive 동기화 상태: ${title}`}
        className="w-full flex items-center justify-center py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-60"
      >
        <span className={`material-symbols-outlined text-icon ${className}`}>{icon}</span>
      </button>
    );
  }

  return (
    <div className="mb-2">
      {status === 'idle' && (
        <button
          type="button"
          onClick={() => void handleManualSync()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-sp-muted hover:text-sp-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-icon">cloud_done</span>
          <span className="flex-1 text-left truncate">{relativeLabel}</span>
        </button>
      )}

      {status === 'syncing' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-surface text-xs text-sp-muted">
          <span className="material-symbols-outlined text-icon animate-spin text-sp-accent">
            sync
          </span>
          <span>
            {progress ? `동기화 중... (${progress.current}/${progress.total})` : '동기화 중...'}
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
          {canRebuild && (
            <button
              type="button"
              onClick={() => setShowRebuildConfirm(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-sp-border text-xs text-sp-accent hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <span className="material-symbols-outlined text-icon">cloud_sync</span>
              <span className="flex-1 text-left">클라우드 백업 다시 만들기</span>
            </button>
          )}
          {isAuthBlocked && (
            <Notice variant="warning">
              학교 계정(@*.go.kr 등)은 외부 앱 차단 정책일 수 있어요.{' '}
              <span className="font-medium">설정 → Google 통합</span>에서 연결을 해제하고{' '}
              <span className="font-medium">개인 Gmail</span>로 다시 연결해주세요.
            </Notice>
          )}
        </div>
      )}

      {status === 'conflict' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-xs text-amber-400">
          <span className="material-symbols-outlined text-icon">warning</span>
          <span>충돌 {conflicts.length}건</span>
        </div>
      )}

      <CloudRebuildConfirmModal
        open={showRebuildConfirm}
        onCancel={() => setShowRebuildConfirm(false)}
        onConfirm={() => {
          setShowRebuildConfirm(false);
          void rebuildCloudData();
        }}
      />
    </div>
  );
}
