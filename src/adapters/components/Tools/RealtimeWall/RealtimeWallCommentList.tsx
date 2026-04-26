/**
 * RealtimeWallCommentList — 학생 댓글 목록.
 *
 * v1.14 Phase P2 (padlet mode). Design §5.5.
 *
 * 동작:
 *   - status='hidden' 댓글은 학생 화면에서 **제외**.
 *     교사 화면에서는 흐린 스타일로 표시 (인덱스 보존 확인용).
 *   - 교사인 경우 onRemove 전달 시 각 댓글에 휴지통 아이콘 표시.
 *   - 학생 화면에서는 sessionToken 절대 노출 금지.
 */
import type {
  RealtimeWallComment,
} from '@domain/entities/RealtimeWall';
import type { RealtimeWallViewerRole } from './types';
import { RealtimeWallCardMarkdown } from './RealtimeWallCardMarkdown';
import { RealtimeWallCardImageGallery } from './RealtimeWallCardImageGallery';

export interface RealtimeWallCommentListProps {
  readonly comments: readonly RealtimeWallComment[];
  readonly viewerRole: RealtimeWallViewerRole;
  /** 교사일 때만 의미 있음. 전달 시 각 댓글 옆에 휴지통 표시. */
  readonly onRemove?: (commentId: string) => void;
}

/** 1분/1시간/1일 기준 상대 시간 포맷. */
function formatRelativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 0) return '방금 전';
  if (diff < 60_000) return '방금 전';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`;
  return `${Math.floor(diff / 86_400_000)}일 전`;
}

export function RealtimeWallCommentList({
  comments,
  viewerRole,
  onRemove,
}: RealtimeWallCommentListProps) {
  const visible = viewerRole === 'teacher'
    ? comments
    : comments.filter((c) => c.status === 'approved');

  if (visible.length === 0) {
    return (
      <p className="py-3 text-center text-detail text-sp-muted/70">
        아직 댓글이 없어요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map((comment) => {
        const isHidden = comment.status === 'hidden';
        return (
          <li
            key={comment.id}
            className={`flex gap-2 rounded-lg px-2 py-1.5 ${
              isHidden ? 'bg-sp-bg/40 opacity-50' : 'bg-sp-bg/60'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-xs font-semibold text-sp-text">
                  {comment.nickname}
                </span>
                <span className="text-caption text-sp-muted/70">
                  {formatRelativeTime(comment.submittedAt)}
                </span>
                {isHidden && (
                  <span className="text-caption text-amber-400/80">
                    (숨김)
                  </span>
                )}
              </div>
              <div className="mt-0.5 break-words text-xs leading-relaxed text-sp-text">
                <RealtimeWallCardMarkdown text={comment.text} />
              </div>
              {/* v2.1 — 댓글 이미지 1장 표시 */}
              {comment.images && comment.images.length > 0 && (
                <RealtimeWallCardImageGallery images={comment.images} />
              )}
            </div>
            {viewerRole === 'teacher' && onRemove && !isHidden && (
              <button
                type="button"
                onClick={() => onRemove(comment.id)}
                className="shrink-0 rounded-md p-1 text-sp-muted/60 transition hover:bg-red-500/10 hover:text-red-400"
                title="댓글 삭제"
                aria-label={`${comment.nickname}의 댓글 삭제`}
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
