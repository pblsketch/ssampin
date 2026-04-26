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
  onCardDetail,
  onTeacherLike,
  onTeacherAddComment,
}: RealtimeWallStreamBoardProps) {
  // 학생 뷰는 무조건 read-only — 액션 칩 DOM 제거.
  const effectiveReadOnly = readOnly || viewerRole === 'student';
  // v2.1 Phase D: hidden-by-author 카드도 placeholder로 포함.
  const visiblePosts = useMemo(
    () => sortRealtimeWallPostsForBoard(
      posts.filter(
        (post) => post.status === 'approved' || post.status === 'hidden-by-author',
      ),
    ),
    [posts],
  );

  return (
    <div className="flex h-full flex-col">
      {/* 2026-04-26 라운드 7 결함 B fix — bg-sp-bg 제거 (회색 잔존 차단).
          상위 RealtimeWallBoardThemeWrapper가 boardTheme 배경을 적용 → 본 컨테이너는 투명. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-sp-border bg-transparent p-4">
        {visiblePosts.length === 0 ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <span className="material-symbols-outlined text-[32px] text-sp-muted/30">view_stream</span>
            <p className="text-sm text-sp-muted/60">승인된 카드가 없어요</p>
            <p className="text-xs text-sp-muted/40">학생이 카드를 올리면 위에서부터 쌓입니다</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {visiblePosts.map((post) => (
              <RealtimeWallCard
                key={post.id}
                post={post}
                onOpenLink={onOpenLink}
                onHeart={!effectiveReadOnly ? onHeart : undefined}
                onStudentLike={onStudentLike}
                onRemoveComment={!effectiveReadOnly ? onRemoveComment : undefined}
                viewerRole={viewerRole}
                currentSessionToken={currentSessionToken}
                currentPinHash={currentPinHash}
                commentInputSlot={renderCommentInput?.(post.id)}
                actions={
                  !effectiveReadOnly ? (
                    <RealtimeWallCardActions
                      onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
                      onHide={onHidePost ? () => onHidePost(post.id) : undefined}
                    />
                  ) : undefined
                }
                onOwnCardEdit={onOwnCardEdit}
                onOwnCardDelete={onOwnCardDelete}
                onRestoreCard={onRestoreCard}
                onTeacherTrackAuthor={onTeacherTrackAuthor}
                onTeacherUpdateNickname={onTeacherUpdateNickname}
                onTeacherBulkHideStudent={onTeacherBulkHideStudent}
                highlighted={highlightedPostIds?.has(post.id) ?? false}
                onCardDetail={onCardDetail}
                onTeacherLike={onTeacherLike}
                onTeacherAddComment={onTeacherAddComment}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
