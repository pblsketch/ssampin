import { useEffect, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import type { CloudSyncInfo } from '@adapters/stores/useDriveSyncStore';

export interface FirstSyncConfirmModalProps {
  open: boolean;
  /** 클라우드 manifest 사전 조회 결과 (undefined=조회중, null=실패) */
  cloudInfo: CloudSyncInfo | null | undefined;
  onChooseDownload: () => void;
  onChooseUpload: () => void;
  onDefer: () => void;
}

/**
 * 신규 기기 최초 동기화 방향 확인 모달.
 * Plan/Design: docs/02-design/features/first-sync-confirmation.design.md
 *
 * 3선택 카드 + 2차 confirm을 단일 컴포넌트에 통합 (showUploadWarn 내부 state).
 *
 * 디자인 원칙:
 *  - closeOnBackdrop / closeOnEsc 모두 false → 실수로 닫혀 무단 동기화 방지
 *  - X 버튼 / ESC 키는 모두 onDefer로 처리 (안전한 기본값)
 *  - cloudInfo에 따라 카드 강조 자동 전환 (받기 vs 덮어쓰기)
 */
export function FirstSyncConfirmModal({
  open,
  cloudInfo,
  onChooseDownload,
  onChooseUpload,
  onDefer,
}: FirstSyncConfirmModalProps) {
  const [showUploadWarn, setShowUploadWarn] = useState(false);
  const [understood, setUnderstood] = useState(false);

  // 모달이 닫히거나 다시 열릴 때 내부 단계 리셋
  useEffect(() => {
    if (!open) {
      setShowUploadWarn(false);
      setUnderstood(false);
    }
  }, [open]);

  // ESC 키 → defer (closeOnEsc=false이므로 별도 리스너로 처리)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showUploadWarn) {
          setShowUploadWarn(false);
        } else {
          onDefer();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, showUploadWarn, onDefer]);

  const hasCloudData = cloudInfo?.hasData === true;
  const cloudInfoLoaded = cloudInfo !== undefined;

  const cloudLastSyncedAt = formatDateTime(cloudInfo?.lastSyncedAt);
  const cloudDeviceName = cloudInfo?.deviceName ?? '다른 기기';

  // 2차 confirm 단계
  if (showUploadWarn) {
    return (
      <Modal
        isOpen={open}
        onClose={() => setShowUploadWarn(false)}
        title="클라우드 데이터 덮어쓰기 확인"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
        closeOnEsc={false}
      >
        <div className="p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-red-400 text-icon-lg">warning</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-sp-text">
                클라우드 데이터가 삭제됩니다
              </h2>
              {hasCloudData && cloudLastSyncedAt && (
                <p className="mt-1 text-sm text-sp-muted">
                  {cloudDeviceName}의 {cloudLastSyncedAt} 백업이 영구 삭제됩니다.
                </p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-2 p-3 rounded-lg bg-sp-surface cursor-pointer">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 accent-red-500"
              aria-label="이해했습니다"
            />
            <span className="text-sm text-sp-text">
              클라우드의 모든 데이터가 삭제되는 것을 이해했습니다
            </span>
          </label>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUploadWarn(false)}
              className="px-4 py-2 rounded-lg border border-sp-border text-sp-text hover:bg-sp-text/5"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                onChooseUpload();
              }}
              disabled={!understood}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              덮어쓰기 진행
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 1차: 3선택 카드
  return (
    <Modal
      isOpen={open}
      onClose={onDefer}
      title="첫 동기화 방향을 선택해주세요"
      srOnlyTitle
      size="md"
      closeOnBackdrop={false}
      closeOnEsc={false}
    >
      <div className="p-6">
        {/* 헤더 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-sp-accent/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-sp-accent text-icon-lg">cloud_sync</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-sp-text">
              첫 동기화 방향을 선택해주세요
            </h2>
            <p className="mt-1 text-sm text-sp-muted">
              이 기기에는 동기화 기록이 없어요.
            </p>
          </div>
          <button
            type="button"
            onClick={onDefer}
            className="flex-shrink-0 p-1 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-icon-md">close</span>
          </button>
        </div>

        {/* 클라우드 상태 배지 */}
        <div
          id="cloud-status-desc"
          className="mb-4 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
          aria-live="polite"
        >
          {!cloudInfoLoaded ? (
            <>
              <span className="material-symbols-outlined animate-spin text-sp-muted text-icon-sm">progress_activity</span>
              <span className="text-sp-muted">클라우드 확인 중...</span>
            </>
          ) : cloudInfo === null ? (
            <span className="text-amber-400">
              ⚠️ 클라우드 상태를 확인하지 못했어요
            </span>
          ) : hasCloudData ? (
            <span className="text-emerald-400">
              ☁️ 클라우드에 {cloudDeviceName}의 백업이 있어요{cloudLastSyncedAt ? ` (${cloudLastSyncedAt})` : ''}
            </span>
          ) : (
            <span className="text-sp-muted">
              클라우드에 저장된 데이터가 없어요
            </span>
          )}
        </div>

        {/* 3선택 카드 */}
        <div role="group" aria-label="동기화 방향 선택" className="flex flex-col gap-3">
          {/* 카드 1: 받기 */}
          <ChoiceCard
            icon="cloud_download"
            title="클라우드 데이터 받기"
            description="클라우드에 저장된 데이터를 이 기기로 가져옵니다. 기존 데이터가 덮여쓰여요."
            preview={
              hasCloudData
                ? '클라우드 백업을 이 기기에 적용해요'
                : '클라우드가 비어있어요. 빈 상태로 시작해요'
            }
            previewClass={hasCloudData ? 'text-sp-accent' : 'text-sp-muted'}
            recommended={hasCloudData}
            tone="accent"
            onClick={onChooseDownload}
          />

          {/* 카드 2: 덮어쓰기 */}
          <ChoiceCard
            icon="cloud_upload"
            title="이 기기 데이터로 시작"
            description={
              hasCloudData
                ? '클라우드의 기존 백업이 이 기기 데이터로 대체됩니다. 클라우드 데이터는 복구할 수 없어요.'
                : '클라우드가 비어있어요. 이 기기 데이터를 클라우드에 올려 동기화를 시작해요.'
            }
            preview={
              hasCloudData
                ? '클라우드 백업이 삭제되고 이 기기 데이터로 교체돼요'
                : undefined
            }
            previewClass={hasCloudData ? 'text-red-400' : 'text-sp-muted'}
            recommended={cloudInfoLoaded && cloudInfo !== null && !hasCloudData}
            tone={hasCloudData ? 'danger' : 'accent'}
            onClick={() => setShowUploadWarn(true)}
          />

          {/* 카드 3: 나중에 */}
          <ChoiceCard
            icon="schedule"
            title="나중에 결정"
            description="동기화를 잠시 끄고 나중에 설정에서 결정할 수 있어요."
            preview="자동 동기화가 일시 중단돼요"
            previewClass="text-sp-muted"
            tone="muted"
            onClick={onDefer}
          />
        </div>

        <p className="mt-4 text-xs text-sp-muted">
          선택한 이후에는 설정 &gt; 구글 드라이브에서 언제든지 변경할 수 있어요.
        </p>
      </div>
    </Modal>
  );
}

/* ───────────── 카드 컴포넌트 ───────────── */

interface ChoiceCardProps {
  icon: string;
  title: string;
  description: string;
  preview?: string;
  previewClass?: string;
  recommended?: boolean;
  tone: 'accent' | 'danger' | 'muted';
  onClick: () => void;
}

function ChoiceCard({
  icon,
  title,
  description,
  preview,
  previewClass = 'text-sp-muted',
  recommended,
  tone,
  onClick,
}: ChoiceCardProps) {
  const toneClasses: Record<ChoiceCardProps['tone'], string> = {
    accent: recommended
      ? 'border-sp-accent ring-1 ring-sp-accent/30 hover:bg-sp-accent/5'
      : 'border-sp-border hover:bg-sp-accent/5 hover:border-sp-accent/60',
    danger:
      'border-sp-border hover:bg-red-500/5 hover:border-red-500/40',
    muted: 'border-sp-border/60 hover:bg-sp-surface hover:border-sp-border',
  };
  const iconBgClasses: Record<ChoiceCardProps['tone'], string> = {
    accent: 'bg-sp-accent/10 text-sp-accent',
    danger: 'bg-red-500/10 text-red-400',
    muted: 'bg-sp-surface text-sp-muted',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-[80px] p-4 rounded-xl border bg-sp-card text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent ${toneClasses[tone]}`}
    >
      {recommended && (
        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-sp-accent text-white text-xs font-medium">
          권장
        </span>
      )}
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBgClasses[tone]}`}>
          <span className="material-symbols-outlined text-icon-lg">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-sp-text">{title}</h3>
          <p className="mt-1 text-sm text-sp-muted">{description}</p>
          {preview && (
            <p className={`mt-2 text-xs ${previewClass}`}>{preview}</p>
          )}
        </div>
      </div>
    </button>
  );
}

function formatDateTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return undefined;
  }
}
