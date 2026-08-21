/**
 * 온라인 교무실 — 게시판 글 목록 (M2)
 *
 * 계획서 §3.5-다 — 목록에는 제목·작성자·시각·댓글 수만 있고 본문은 없다.
 * 필독 글은 서버가 이미 맨 위로 정렬해서 주므로, 여기서는 다시 정렬하지 않고
 * 시각적으로만 확실히 구분한다(테두리 2px + 배지) — 부장 선생님 공지가 새 글에
 * 묻히지 않게 하는 것이 이 기능의 존재 이유다.
 */
import { useEffect } from 'react';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import { displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import type { StaffRoomPostSummary } from '@domain/entities/StaffRoomBoard';
import { formatPostTime } from './boardFormat';

interface BoardViewProps {
  departmentId: string;
  boardId: string;
  onWriteNew: () => void;
}

function PostRow({ post, onOpen }: { post: StaffRoomPostSummary; onOpen: () => void }) {
  const authorLabel = displayNameOf({ email: post.authorEmail, displayName: post.authorName });

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border px-4 py-3.5 text-left transition-all duration-sp-base ease-sp-out ${
        post.isRequired
          ? 'border-2 border-sp-accent bg-sp-surface'
          : 'border-sp-border bg-sp-card hover:border-sp-accent hover:shadow-sp-md'
      }`}
    >
      {post.isRequired && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-sp-accent px-2.5 py-1 text-xs font-sp-semibold text-white">
          <span className="material-symbols-outlined text-icon-sm">push_pin</span>
          필독
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.isUnread && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-sp-accent"
              role="img"
              aria-label="안 읽음"
              title="안 읽음"
            />
          )}
          <h3
            className={`truncate text-sm text-sp-text ${
              post.isUnread ? 'font-sp-bold' : 'font-sp-medium'
            }`}
          >
            {post.title}
          </h3>
          {post.mentionsMe && (
            <span className="shrink-0 rounded-full border border-sp-highlight px-2 py-0.5 text-[11px] font-sp-semibold text-sp-highlight">
              나를 부름
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-sp-muted">
          {authorLabel} · {formatPostTime(post.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 text-xs text-sp-muted">
        <span className="material-symbols-outlined text-icon-sm">chat_bubble</span>
        {post.commentCount}
      </div>
    </button>
  );
}

export function BoardView({ departmentId, boardId, onWriteNew }: BoardViewProps) {
  const posts = useStaffRoomBoardStore((s) => s.posts);
  const isLoading = useStaffRoomBoardStore((s) => s.isLoading);
  const hasLoadedPosts = useStaffRoomBoardStore((s) => s.hasLoadedPosts);
  const error = useStaffRoomBoardStore((s) => s.error);
  const loadPosts = useStaffRoomBoardStore((s) => s.loadPosts);
  const openPost = useStaffRoomBoardStore((s) => s.openPost);
  const clearError = useStaffRoomBoardStore((s) => s.clearError);

  useEffect(() => {
    void loadPosts(departmentId, boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, boardId]);

  const isEmpty = hasLoadedPosts && posts.length === 0;
  const isInitialLoading = isLoading && !hasLoadedPosts;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <span className="material-symbols-outlined shrink-0 text-icon-md text-red-400">
            error
          </span>
          <p className="flex-1 text-sm text-sp-text">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label="오류 닫기"
            className="shrink-0 text-sp-muted transition-colors hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-icon">close</span>
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onWriteNew}
          className="flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95"
        >
          <span className="material-symbols-outlined text-icon">edit_square</span>
          글쓰기
        </button>
      </div>

      {isInitialLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-sp-muted">
          <span className="material-symbols-outlined animate-spin text-icon-md">
            progress_activity
          </span>
          글 목록을 불러오는 중이에요…
        </div>
      ) : isEmpty ? (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-xl border border-dashed border-sp-border bg-sp-card px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sp-surface text-sp-accent">
            <span className="material-symbols-outlined text-icon-xl">forum</span>
          </div>
          <h2 className="text-lg font-sp-bold text-sp-text">아직 올라온 글이 없어요</h2>
          <p className="max-w-sm text-sm leading-relaxed text-sp-muted">
            이 게시판은 부서 선생님들과 공지·자료·소식을 나누는 곳이에요. 첫 글을 올려보세요.
          </p>
          <button
            type="button"
            onClick={onWriteNew}
            className="mt-1 flex items-center gap-1.5 rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95"
          >
            <span className="material-symbols-outlined text-icon">edit_square</span>첫 글 쓰기
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              onOpen={() => void openPost(departmentId, post.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
