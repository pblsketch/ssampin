import { useMemo } from 'react';
import { sortRealtimeWallPostsForBoard } from '@domain/rules/realtimeWallRules';
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import type { RealtimeWallBoardCommonProps } from './types';

export type RealtimeWallStreamBoardProps = RealtimeWallBoardCommonProps;

export function RealtimeWallStreamBoard({
  posts,
  readOnly = false,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
}: RealtimeWallStreamBoardProps) {
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
            <span className="material-symbols-outlined text-[32px] text-sp-muted/30">view_stream</span>
            <p className="text-sm text-sp-muted/60">승인된 카드가 없어요</p>
            <p className="text-xs text-sp-muted/40">학생이 카드를 올리면 위에서부터 쌓입니다</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {approvedPosts.map((post) => (
              <RealtimeWallCard
                key={post.id}
                post={post}
                onOpenLink={onOpenLink}
                onHeart={!readOnly ? onHeart : undefined}
                actions={
                  !readOnly ? (
                    <RealtimeWallCardActions
                      onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
                      onHide={onHidePost ? () => onHidePost(post.id) : undefined}
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
