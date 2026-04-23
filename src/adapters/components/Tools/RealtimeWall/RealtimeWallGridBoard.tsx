import { useMemo } from 'react';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { sortRealtimeWallPostsForBoard } from '@domain/rules/realtimeWallRules';
import { RealtimeWallCard } from './RealtimeWallCard';

export interface RealtimeWallGridBoardProps {
  readonly posts: readonly RealtimeWallPost[];
  readonly readOnly?: boolean;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  readonly onOpenLink?: (url: string) => void;
}

function GridActionButtons({
  onTogglePin,
  onHide,
}: {
  onTogglePin?: () => void;
  onHide?: () => void;
}) {
  if (!onTogglePin && !onHide) return null;

  return (
    <div className="flex items-center gap-0.5">
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          className="rounded-md p-1 text-sp-muted/60 transition hover:bg-amber-400/10 hover:text-amber-300"
          title="고정 토글"
        >
          <span className="material-symbols-outlined text-[16px]">push_pin</span>
        </button>
      )}
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="rounded-md p-1 text-sp-muted/60 transition hover:bg-red-500/10 hover:text-red-400"
          title="숨기기"
        >
          <span className="material-symbols-outlined text-[16px]">visibility_off</span>
        </button>
      )}
    </div>
  );
}

export function RealtimeWallGridBoard({
  posts,
  readOnly = false,
  onTogglePin,
  onHidePost,
  onOpenLink,
}: RealtimeWallGridBoardProps) {
  const approvedPosts = useMemo(
    () => sortRealtimeWallPostsForBoard(
      posts.filter((post) => post.status === 'approved'),
    ),
    [posts],
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-sp-border bg-sp-bg p-4">
        {approvedPosts.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <span className="material-symbols-outlined text-[32px] text-sp-muted/30">grid_view</span>
            <p className="text-sm text-sp-muted/60">승인된 카드가 없어요</p>
            <p className="text-xs text-sp-muted/40">대기열에서 카드를 보드에 올려보세요</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gridAutoRows: 'minmax(160px, auto)',
            }}
          >
            {approvedPosts.map((post) => (
              <div key={post.id} className="relative">
                <RealtimeWallCard
                  post={post}
                  onOpenLink={onOpenLink}
                  actions={
                    !readOnly ? (
                      <GridActionButtons
                        onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
                        onHide={onHidePost ? () => onHidePost(post.id) : undefined}
                      />
                    ) : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
