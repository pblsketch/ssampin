import type { RealtimeWallPost } from '@domain/entities/RealtimeWall';
import type { RealtimeWallViewerRole } from './types';

/**
 * v2.1 Phase D — soft delete placeholder 카드 (Design v2.1 §3.4 / §5.4 / §11.1).
 *
 * status='hidden-by-author' 카드를 렌더할 때 본문 대신 표시.
 *   - "작성자가 삭제했어요" 메시지 + 닉네임 + 시간 보존
 *   - 좋아요 / 댓글 카운트 read-only 표시 (데이터 일관성)
 *   - 교사만 "복원" 메뉴 활성 (onRestore prop)
 *
 * 회귀 위험 #8 보호: 카드는 posts 배열에서 제거되지 않고 placeholder로 분기 표시.
 */

interface RealtimeWallCardPlaceholderProps {
  readonly post: RealtimeWallPost;
  readonly viewerRole: RealtimeWallViewerRole;
  /** 교사만 복원 가능 (viewerRole='teacher' + onRestore 모두 있을 때 표시) */
  readonly onRestore?: () => void;
}

export function RealtimeWallCardPlaceholder({
  post,
  viewerRole,
  onRestore,
}: RealtimeWallCardPlaceholderProps) {
  const submittedTime = new Date(post.submittedAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const likes = post.likes ?? 0;
  const visibleComments = (post.comments ?? []).filter((c) => c.status === 'approved');
  const commentCount = visibleComments.length;
  const showRestore = viewerRole === 'teacher' && Boolean(onRestore);

  return (
    <article
      className="relative flex h-full flex-col rounded-xl border border-dashed border-sp-border/60 bg-sp-bg/40 p-3.5 text-sp-muted/80"
      aria-label="작성자가 삭제한 카드"
    >
      <div className="mb-2 flex items-start gap-2">
        <span className="material-symbols-outlined text-[18px] text-sp-muted/60">
          delete_outline
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sp-muted/90">
            {post.nickname}
          </p>
          <p className="text-[11px] text-sp-muted/60">{submittedTime}</p>
        </div>
        {showRestore && (
          <button
            type="button"
            onClick={onRestore}
            title="카드 복원"
            className="rounded-md border border-sp-border/60 bg-sp-card px-2 py-0.5 text-[11px] font-semibold text-sp-text transition hover:border-sky-400/60 hover:text-sky-300"
          >
            복원
          </button>
        )}
      </div>

      <p className="mt-1 text-sm italic text-sp-muted/70">
        작성자가 삭제했어요
      </p>

      {(likes > 0 || commentCount > 0) && (
        <div className="mt-3 flex items-center gap-3 text-[11px] text-sp-muted/60">
          {likes > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">favorite</span>
              <span className="tabular-nums">{likes}</span>
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">chat_bubble</span>
              <span className="tabular-nums">{commentCount}</span>
            </span>
          )}
        </div>
      )}
    </article>
  );
}
