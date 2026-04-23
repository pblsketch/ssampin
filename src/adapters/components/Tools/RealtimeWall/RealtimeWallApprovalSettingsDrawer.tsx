import { useEffect, useState } from 'react';
import type { WallApprovalMode } from '@domain/entities/RealtimeWall';

/**
 * 라이브 중 승인 정책 전환용 설정 드로어.
 *
 * Design §4.3 / §4.4 라이브 중 설정 패널.
 *
 * - 라디오로 manual/auto 토글 (filter는 "준비 중" 비활성)
 * - manual → auto 전환 시 `pendingCount > 0`이면 일괄 승인 확인 대화 노출
 *   - [취소]      : 드로어만 닫고 모드 전환도 취소
 *   - [승인]      : bulkApprove 실행 후 mode=auto 확정
 *   - [개별 검토] : mode만 auto로 바꾸고 기존 pending은 대기열에 유지
 * - auto → manual 전환은 즉시 적용 (기존 approved 건드리지 않음)
 */

type ConfirmStage =
  | { kind: 'idle' }
  | { kind: 'confirm-bulk'; pendingCount: number };

export interface RealtimeWallApprovalSettingsDrawerProps {
  readonly open: boolean;
  readonly approvalMode: WallApprovalMode;
  readonly pendingCount: number;
  readonly onClose: () => void;
  /** 모드 확정 + (선택적) 일괄 승인 실행. shouldBulkApprove=true면 호출측에서 bulkApprove 수행. */
  readonly onApply: (nextMode: WallApprovalMode, shouldBulkApprove: boolean) => void;
}

export function RealtimeWallApprovalSettingsDrawer({
  open,
  approvalMode,
  pendingCount,
  onClose,
  onApply,
}: RealtimeWallApprovalSettingsDrawerProps) {
  // 드로어 내부에서만 "선택 중"인 값. 사용자가 [저장]을 눌러야 실제 반영.
  const [draftMode, setDraftMode] = useState<WallApprovalMode>(approvalMode);
  const [confirmStage, setConfirmStage] = useState<ConfirmStage>({ kind: 'idle' });

  // 드로어가 열릴 때마다 현재 모드로 초기화 + 확인 단계 리셋
  useEffect(() => {
    if (open) {
      setDraftMode(approvalMode);
      setConfirmStage({ kind: 'idle' });
    }
  }, [open, approvalMode]);

  if (!open) return null;

  const handleSave = () => {
    // manual → auto 이면서 pending이 있으면 확인 대화로 단계 진입
    if (approvalMode === 'manual' && draftMode === 'auto' && pendingCount > 0) {
      setConfirmStage({ kind: 'confirm-bulk', pendingCount });
      return;
    }
    // 그 외 전환(auto→manual, manual→auto without pending 등): 즉시 적용
    onApply(draftMode, false);
    onClose();
  };

  const handleBulkApprove = () => {
    onApply('auto', true);
    onClose();
  };

  const handleKeepPending = () => {
    // 모드는 auto로 바꾸되 기존 pending은 건드리지 않음
    onApply('auto', false);
    onClose();
  };

  const handleCancel = () => {
    // 드로어 전체 취소 — 모드 전환도 취소
    setConfirmStage({ kind: 'idle' });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="승인 정책 설정"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-sp-border bg-sp-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="mb-4 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-sp-accent">tune</span>
          <h2 className="text-base font-bold text-sp-text">담벼락 설정</h2>
          <button
            type="button"
            onClick={handleCancel}
            className="ml-auto rounded-md p-1 text-sp-muted transition hover:bg-sp-surface hover:text-sp-text"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {confirmStage.kind === 'idle' ? (
          <>
            {/* 승인 모드 선택 */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-sp-muted">학생 카드 승인 방식</p>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sp-border bg-sp-surface p-3 transition hover:border-sp-accent/40">
                <input
                  type="radio"
                  name="approval-mode"
                  value="manual"
                  checked={draftMode === 'manual'}
                  onChange={() => setDraftMode('manual')}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sp-text">승인 필요</p>
                  <p className="mt-0.5 text-xs text-sp-muted">
                    교사가 대기열에서 검토한 뒤 보드에 올립니다.
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-sp-border bg-sp-surface p-3 transition hover:border-sp-accent/40">
                <input
                  type="radio"
                  name="approval-mode"
                  value="auto"
                  checked={draftMode === 'auto'}
                  onChange={() => setDraftMode('auto')}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-sp-text">자동 승인</p>
                  <p className="mt-0.5 text-xs text-sp-muted">
                    학생 제출이 즉시 보드에 노출됩니다.
                  </p>
                </div>
              </label>

              {/* filter — 비활성 */}
              <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-sp-border/60 bg-sp-surface/40 p-3 opacity-60">
                <input type="radio" disabled className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-sp-muted">키워드 필터</p>
                  <p className="mt-0.5 text-xs text-sp-muted/60">준비 중</p>
                </div>
              </label>
            </div>

            {/* 액션 */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={draftMode === approvalMode}
                className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </>
        ) : (
          // confirm-bulk 단계
          <div>
            <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-sp-accent/30 bg-sp-accent/10 p-3">
              <span className="material-symbols-outlined mt-0.5 text-[18px] text-sp-accent">info</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-sp-text">
                  대기 중 카드 {confirmStage.pendingCount}장을 자동 승인하시겠어요?
                </p>
                <p className="mt-1 text-xs text-sp-muted">
                  자동 승인으로 바꾸면, 이미 대기열에 쌓인 카드들을 한 번에 보드에 올릴 수 있습니다.
                  개별 검토를 원하시면 [각 카드 개별 검토]를 선택하세요.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleKeepPending}
                className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
              >
                각 카드 개별 검토
              </button>
              <button
                type="button"
                onClick={handleBulkApprove}
                className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-white transition hover:bg-sp-accent/85"
              >
                승인
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
