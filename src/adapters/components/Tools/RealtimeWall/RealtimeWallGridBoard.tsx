import { useMemo } from 'react';
import { sortRealtimeWallPostsForBoard } from '@domain/rules/realtimeWallRules';
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import type { RealtimeWallBoardCommonProps } from './types';

export type RealtimeWallGridBoardProps = RealtimeWallBoardCommonProps;

export function RealtimeWallGridBoard({
  posts,
  readOnly = false,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onLike,
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
                  onLike={!readOnly ? onLike : undefined}
                  actions={
                    !readOnly ? (
                      <RealtimeWallCardActions
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
