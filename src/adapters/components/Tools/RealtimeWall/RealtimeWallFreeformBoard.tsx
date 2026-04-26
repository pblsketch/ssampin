import { useMemo } from 'react';
import { Rnd } from 'react-rnd';
import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import { isOwnCard } from '@domain/rules/realtimeWallRules';
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import type { RealtimeWallBoardCommonProps } from './types';

interface RealtimeWallFreeformBoardProps extends RealtimeWallBoardCommonProps {
  readonly onChangePosts?: (posts: RealtimeWallPost[]) => void;
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
  onHeart,
  viewerRole = 'teacher',
  currentSessionToken,
  currentPinHash,
  onStudentLike,
  onRemoveComment,
  renderCommentInput,
  onOwnCardEdit,
  onOwnCardDelete,
  onRestoreCard,
  onTeacherTrackAuthor,
  onTeacherUpdateNickname,
  onTeacherBulkHideStudent,
  highlightedPostIds,
  // v2.1 Phase C
  onOwnCardMove,
  isMobile = false,
  freeformLockEnabled = false,
}: RealtimeWallFreeformBoardProps) {
  // 보드 전체 readOnly (교사 readOnly prop) — 교사 모드 전체 차단용
  const boardReadOnly = readOnly;
  // 학생 모드 식별 (v2.1 Phase C: 자기 카드 드래그는 별도 분기)
  const isStudent = viewerRole === 'student';
  // 자기 카드 권한 컨텍스트 (양방향 매칭)
  const ownerCtx = useMemo(
    () => ({ currentSessionToken, currentPinHash }),
    [currentSessionToken, currentPinHash],
  );
  // v2.1 Phase D: hidden-by-author 카드도 placeholder로 포함.
  const approvedPosts = useMemo(
    () => posts
      .filter((post) => post.status === 'approved' || post.status === 'hidden-by-author')
      .sort((a, b) => a.freeform.zIndex - b.freeform.zIndex),
    [posts],
  );

  /**
   * v2.1 Phase C — 카드별 readOnly 결정 (Design v2.1 §5.3).
   *
   * - 보드 readOnly === true → 모든 카드 readOnly
   * - 교사 (viewerRole='teacher') → 모든 카드 unlock (기존 동작 보존)
   * - 학생 (viewerRole='student'):
   *   - 자기 카드 아니면 → readOnly (다른 학생/교사 카드 절대 못 옮김)
   *   - 자기 카드:
   *     - 모바일 viewport → readOnly (페2 high-2 — 실수 방지)
   *     - 잠금 토글 OFF → readOnly (페1 critical — 기본 locked)
   *     - placeholder (status='hidden-by-author') → readOnly (이미 삭제됨)
   *     - 그 외 (데스크톱 + 토글 ON + onOwnCardMove 콜백 있음) → unlock
   */
  function getCardReadOnly(post: RealtimeWallPost): boolean {
    if (boardReadOnly) return true;
    if (!isStudent) return false; // 교사는 기존 동작 그대로
    // 학생
    if (!isOwnCard(post, ownerCtx)) return true;
    if (post.status === 'hidden-by-author') return true;
    if (isMobile) return true;
    if (!freeformLockEnabled) return true;
    if (!onOwnCardMove) return true; // 콜백 없으면 활성화 의미 없음
    return false;
  }

  // 학생 모드 카드 표시 readOnly (액션/하트는 항상 차단 — 자기 카드 드래그만 별도)
  const studentDisplayReadOnly = boardReadOnly || isStudent;

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
                {studentDisplayReadOnly ? '표시할 카드가 없습니다' : '승인된 카드가 생기면 이 보드에서 자유롭게 배치할 수 있습니다'}
              </p>
            </div>
          )}

          {approvedPosts.map((post) => {
            const cardReadOnly = getCardReadOnly(post);
            const cardNode = (
              <RealtimeWallCard
                post={post}
                onOpenLink={onOpenLink}
                onHeart={!studentDisplayReadOnly ? onHeart : undefined}
                onStudentLike={onStudentLike}
                onRemoveComment={!studentDisplayReadOnly ? onRemoveComment : undefined}
                viewerRole={viewerRole}
                currentSessionToken={currentSessionToken}
                currentPinHash={currentPinHash}
                commentInputSlot={renderCommentInput?.(post.id)}
                actions={
                  studentDisplayReadOnly ? undefined : (
                    <RealtimeWallCardActions
                      onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
                      onHide={onHidePost ? () => onHidePost(post.id) : undefined}
                    />
                  )
                }
                onOwnCardEdit={onOwnCardEdit}
                onOwnCardDelete={onOwnCardDelete}
                onRestoreCard={onRestoreCard}
                onTeacherTrackAuthor={onTeacherTrackAuthor}
                onTeacherUpdateNickname={onTeacherUpdateNickname}
                onTeacherBulkHideStudent={onTeacherBulkHideStudent}
                highlighted={highlightedPostIds?.has(post.id) ?? false}
              />
            );

            // 교사 모드에서 onChangePosts 없는 경우는 기존 절대위치 div fallback (회귀 0)
            if (cardReadOnly || (!isStudent && !onChangePosts)) {
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

            // 교사 분기 (기존 동작 100% 보존 — onChangePosts 활용)
            if (!isStudent && onChangePosts) {
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
            }

            // v2.1 Phase C — 학생 자기 카드 (cardReadOnly === false)
            // onOwnCardMove 콜백으로 freeform 부분 patch 송신 (Plan FR-C5/C6)
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
                onDragStop={(_event, data) => {
                  onOwnCardMove?.(post.id, {
                    freeform: {
                      x: Math.round(data.x),
                      y: Math.round(data.y),
                      w: post.freeform.w,
                      h: post.freeform.h,
                      zIndex: post.freeform.zIndex,
                    },
                  });
                }}
                onResizeStop={(_event, _direction, ref, _delta, position) => {
                  onOwnCardMove?.(post.id, {
                    freeform: {
                      x: Math.round(position.x),
                      y: Math.round(position.y),
                      w: Math.round(Number.parseFloat(ref.style.width)),
                      h: Math.round(Number.parseFloat(ref.style.height)),
                      zIndex: post.freeform.zIndex,
                    },
                  });
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
