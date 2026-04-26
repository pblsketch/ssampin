import type { RealtimeWallPost, WallApprovalMode } from '@domain/entities/RealtimeWall';
import { RealtimeWallCard } from './RealtimeWallCard';

export interface RealtimeWallQueuePanelProps {
  readonly pendingPosts: readonly RealtimeWallPost[];
  readonly hiddenPosts: readonly RealtimeWallPost[];
  /** 현재 보드 승인 정책. 'auto'면 pending 섹션 숨김 (Design §4.5). */
  readonly approvalMode: WallApprovalMode;
  readonly onApprove: (postId: string) => void;
  readonly onHide: (postId: string) => void;
  readonly onRestore: (postId: string) => void;
  readonly onOpenLink: (url: string) => void;
}

export function RealtimeWallQueuePanel({
  pendingPosts,
  hiddenPosts,
  approvalMode,
  onApprove,
  onHide,
  onRestore,
  onOpenLink,
}: RealtimeWallQueuePanelProps) {
  // auto 모드는 pending이 구조적으로 0건이므로 승인 대기 섹션 숨김.
  // 단 manual→auto 전환 시 "개별 검토"를 선택한 경우 잔존 pending이 있을 수
  // 있으므로, approvalMode가 auto여도 pendingPosts가 실제로 있으면 섹션을 보여
  // 교사가 처리할 수 있게 한다 (안전망).
  const hidePendingSection = approvalMode === 'auto' && pendingPosts.length === 0;

  return (
    <aside className="flex h-full min-h-[560px] flex-col gap-3 rounded-xl border border-sp-border bg-sp-card p-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-bold text-sp-text">대기열</h3>
        <div className="flex items-center gap-1.5">
          {pendingPosts.length > 0 && (
            <span className="rounded-full bg-sp-accent/15 px-2 py-0.5 text-detail font-bold text-sp-accent">
              {pendingPosts.length}건 대기
            </span>
          )}
          {hiddenPosts.length > 0 && (
            <span className="rounded-full bg-sp-surface px-2 py-0.5 text-detail text-sp-muted">
              숨김 {hiddenPosts.length}
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-0.5">
        {/* 승인 대기 (auto 모드 + pending 0건이면 완전히 숨김) */}
        {!hidePendingSection && (
        <section>
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <span className="material-symbols-outlined text-sm text-sp-accent">inbox</span>
            <p className="text-xs font-semibold text-sp-text">승인 대기</p>
          </div>
          <div className="space-y-2.5">
            {pendingPosts.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-sp-border/40 px-4 py-5 text-center">
                <span className="material-symbols-outlined text-[22px] text-sp-muted/30">hourglass_empty</span>
                <p className="text-xs text-sp-muted/60">아직 제출된 카드가 없어요</p>
              </div>
            ) : (
              pendingPosts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border border-sp-accent/15 bg-sp-accent/5 p-2.5"
                >
                  <RealtimeWallCard post={post} compact onOpenLink={onOpenLink} />
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onApprove(post.id)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sp-accent/85"
                    >
                      <span className="material-symbols-outlined text-[13px]">check</span>
                      보드에 올리기
                    </button>
                    <button
                      type="button"
                      onClick={() => onHide(post.id)}
                      className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition hover:border-red-400/50 hover:text-red-400"
                      title="숨기기"
                    >
                      <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
        )}

        {/* 숨김 카드 */}
        {hiddenPosts.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className="material-symbols-outlined text-sm text-sp-muted/60">visibility_off</span>
              <p className="text-xs font-semibold text-sp-muted">숨김 카드</p>
            </div>
            <div className="space-y-2">
              {hiddenPosts.map((post) => (
                <div key={post.id} className="opacity-60">
                  <RealtimeWallCard post={post} compact onOpenLink={onOpenLink} />
                  <button
                    type="button"
                    onClick={() => onRestore(post.id)}
                    className="mt-1.5 w-full rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-muted transition hover:border-sp-accent/40 hover:text-sp-accent"
                  >
                    다시 표시
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
