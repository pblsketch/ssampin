import { useMemo } from 'react';
import { Rnd } from 'react-rnd';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';

interface RealtimeWallFreeformBoardProps {
  readonly posts: readonly RealtimeWallPost[];
  readonly readOnly?: boolean;
  readonly onChangePosts?: (posts: RealtimeWallPost[]) => void;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  readonly onOpenLink?: (url: string) => void;
}

function updatePostPosition(
  posts: readonly RealtimeWallPost[],
  postId: string,
  patch: Partial<RealtimeWallPost['freeform']>,
): RealtimeWallPost[] {
  return posts.map((post) => {
    if (post.id !== postId) return post;
    return {
      ...post,
      freeform: {
        ...post.freeform,
        ...patch,
      },
    };
  });
}

function bringPostToFront(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  const nextZIndex = posts.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;
  return updatePostPosition(posts, postId, { zIndex: nextZIndex });
}

export function RealtimeWallFreeformBoard({
  posts,
  readOnly = false,
  onChangePosts,
  onTogglePin,
  onHidePost,
  onOpenLink,
}: RealtimeWallFreeformBoardProps) {
  const approvedPosts = useMemo(
    () => posts
      .filter((post) => post.status === 'approved')
      .sort((a, b) => a.freeform.zIndex - b.freeform.zIndex),
    [posts],
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-sp-border bg-sp-bg p-3">
        <div
          className="relative h-[900px] w-[1400px] rounded-lg border border-sp-border/60 bg-sp-surface"
          style={{
            backgroundImage: [
              'linear-gradient(to right, rgb(148 163 184 / 0.08) 1px, transparent 1px)',
              'linear-gradient(to bottom, rgb(148 163 184 / 0.08) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '32px 32px',
          }}
        >
          {approvedPosts.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <span className="material-symbols-outlined text-[32px] text-sp-muted/30">dashboard</span>
              <p className="text-sm text-sp-muted/50">
                {readOnly ? '표시할 카드가 없습니다' : '승인된 카드가 생기면 이 보드에서 자유롭게 배치할 수 있습니다'}
              </p>
            </div>
          )}

          {approvedPosts.map((post) => {
            const cardNode = (
              <RealtimeWallCard
                post={post}
                onOpenLink={onOpenLink}
                actions={
                  readOnly ? undefined : (
                    <RealtimeWallCardActions
                      onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
                      onHide={onHidePost ? () => onHidePost(post.id) : undefined}
                    />
                  )
                }
              />
            );

            if (readOnly || !onChangePosts) {
              return (
                <div
                  key={post.id}
                  className="absolute"
                  style={{
                    left: post.freeform.x,
                    top: post.freeform.y,
                    width: post.freeform.w,
                    height: post.freeform.h,
                    zIndex: post.freeform.zIndex,
                  }}
                >
                  {cardNode}
                </div>
              );
            }

            return (
              <Rnd
                key={post.id}
                bounds="parent"
                size={{ width: post.freeform.w, height: post.freeform.h }}
                position={{ x: post.freeform.x, y: post.freeform.y }}
                style={{ zIndex: post.freeform.zIndex }}
                minWidth={220}
                minHeight={150}
                dragHandleClassName="realtime-wall-drag-surface"
                onDragStart={() => onChangePosts(bringPostToFront(posts, post.id))}
                onResizeStart={() => onChangePosts(bringPostToFront(posts, post.id))}
                onDragStop={(_event, data) => {
                  onChangePosts(updatePostPosition(posts, post.id, {
                    x: data.x,
                    y: data.y,
                  }));
                }}
                onResizeStop={(_event, _direction, ref, _delta, position) => {
                  onChangePosts(updatePostPosition(posts, post.id, {
                    x: position.x,
                    y: position.y,
                    w: Number.parseFloat(ref.style.width),
                    h: Number.parseFloat(ref.style.height),
                  }));
                }}
              >
                <div className="realtime-wall-drag-surface h-full cursor-move">
                  {cardNode}
                </div>
              </Rnd>
            );
          })}
        </div>
      </div>
    </div>
  );
}
