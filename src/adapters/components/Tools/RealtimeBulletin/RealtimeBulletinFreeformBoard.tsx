import { useMemo } from 'react';
import { Rnd } from 'react-rnd';
import type { RealtimeBulletinPost } from '@domain/entities/RealtimeBulletin';
import { RealtimeBulletinCard } from './RealtimeBulletinCard';

interface RealtimeBulletinFreeformBoardProps {
  readonly posts: readonly RealtimeBulletinPost[];
  readonly readOnly?: boolean;
  readonly onChangePosts?: (posts: RealtimeBulletinPost[]) => void;
  readonly onTogglePin?: (postId: string) => void;
  readonly onHidePost?: (postId: string) => void;
  readonly onOpenLink?: (url: string) => void;
}

function ActionButtons({
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

function updatePostPosition(
  posts: readonly RealtimeBulletinPost[],
  postId: string,
  patch: Partial<RealtimeBulletinPost['freeform']>,
): RealtimeBulletinPost[] {
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
  posts: readonly RealtimeBulletinPost[],
  postId: string,
): RealtimeBulletinPost[] {
  const nextZIndex = posts.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;
  return updatePostPosition(posts, postId, { zIndex: nextZIndex });
}

export function RealtimeBulletinFreeformBoard({
  posts,
  readOnly = false,
  onChangePosts,
  onTogglePin,
  onHidePost,
  onOpenLink,
}: RealtimeBulletinFreeformBoardProps) {
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
              <RealtimeBulletinCard
                post={post}
                onOpenLink={onOpenLink}
                actions={
                  readOnly ? undefined : (
                    <ActionButtons
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
                dragHandleClassName="realtime-bulletin-drag-surface"
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
                <div className="realtime-bulletin-drag-surface h-full cursor-move">
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
