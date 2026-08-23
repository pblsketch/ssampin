/**
 * 온라인 교무실 — 글 하나 보기 (M2)
 *
 * 본문은 `StaffRoomRichText` 한 곳에서만 그린다 — 맨글이든 서식 있는 글이든 그
 * 부품이 형식을 보고 판단한다(ADR-069). 원시 HTML을 그대로 심는 방식을
 * 쓰면 다른 선생님의 글이 내 화면에서 스크립트로 실행될 수 있어 회귀 게이트가 이를 막는다.
 *
 * **읽음 현황(누가 읽고 누가 안 읽었는지)**은 필독 글에만 있고, 이 화면에서 가장
 * 힘을 준 영역이다 — "단체방으로는 확인이 안 되던 것"이 이 기능의 존재 이유라서다.
 */
import { useState } from 'react';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import {
  canDeleteComment,
  canDeletePost,
  canEditPost,
  canSetRequired,
  displayNameOf,
} from '@domain/rules/staffRoomBoardPermission';
import { STAFFROOM_COMMENT_MAX_LENGTH } from '@domain/entities/StaffRoomBoard';
import { formatPostTime } from './boardFormat';
import { StaffRoomRichText } from './StaffRoomRichText';

interface PostDetailProps {
  departmentId: string;
  onEdit: () => void;
}

export function PostDetail({ departmentId, onEdit }: PostDetailProps) {
  const currentPost = useStaffRoomBoardStore((s) => s.currentPost);
  const comments = useStaffRoomBoardStore((s) => s.comments);
  const readStatus = useStaffRoomBoardStore((s) => s.readStatus);
  const closePost = useStaffRoomBoardStore((s) => s.closePost);
  const removePost = useStaffRoomBoardStore((s) => s.removePost);
  const setRequired = useStaffRoomBoardStore((s) => s.setRequired);
  const addComment = useStaffRoomBoardStore((s) => s.addComment);
  const removeComment = useStaffRoomBoardStore((s) => s.removeComment);

  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole ?? null);
  const myEmail = useGoogleAccountStore((s) => s.email);

  const [pendingDeletePost, setPendingDeletePost] = useState(false);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  if (!currentPost) return null;

  const viewerEmail = myEmail ?? '';
  const editResult = canEditPost(myRole, viewerEmail, currentPost.authorEmail);
  const deleteResult = canDeletePost(myRole, viewerEmail, currentPost.authorEmail);
  const requiredResult = canSetRequired(myRole);
  const authorLabel = displayNameOf({
    email: currentPost.authorEmail,
    displayName: currentPost.authorName,
  });

  const handleDeletePost = async () => {
    const ok = await removePost(departmentId, currentPost.id);
    if (!ok) setPendingDeletePost(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    await removeComment(departmentId, commentId);
    setPendingDeleteCommentId(null);
  };

  const handleAddComment = async () => {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    const ok = await addComment(departmentId, currentPost.id, commentBody);
    setSubmittingComment(false);
    if (ok) setCommentBody('');
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={closePost}
        className="flex items-center gap-1.5 text-sm text-sp-muted transition-colors hover:text-sp-text"
      >
        <span className="material-symbols-outlined text-icon">arrow_back</span>
        목록으로
      </button>

      <div
        className={`rounded-xl border px-6 py-6 ${
          currentPost.isRequired
            ? 'border-2 border-sp-accent bg-sp-surface'
            : 'border-sp-border bg-sp-card'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {currentPost.isRequired && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-sp-accent px-2.5 py-1 text-xs font-sp-semibold text-white">
                  <span className="material-symbols-outlined text-icon-sm">push_pin</span>
                  필독
                </span>
              )}
              <h1 className="break-words text-xl font-sp-bold text-sp-text">{currentPost.title}</h1>
            </div>
            <p className="mt-2 text-sm text-sp-muted">
              {authorLabel} · {formatPostTime(currentPost.createdAt)}
              {currentPost.updatedAt !== currentPost.createdAt && ' · 수정됨'}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {requiredResult.allowed && (
              <button
                type="button"
                onClick={() =>
                  void setRequired(departmentId, currentPost.id, !currentPost.isRequired)
                }
                className="flex items-center gap-1 rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
              >
                <span className="material-symbols-outlined text-icon-sm">push_pin</span>
                {currentPost.isRequired ? '필독 해제' : '필독으로 지정'}
              </button>
            )}
            {editResult.allowed && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
              >
                수정
              </button>
            )}
            {deleteResult.allowed &&
              (pendingDeletePost ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-sp-muted">삭제할까요?</span>
                  <button
                    type="button"
                    onClick={() => void handleDeletePost()}
                    className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-sp-semibold text-white transition-colors hover:bg-red-600"
                  >
                    확인
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeletePost(false)}
                    className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs text-sp-muted transition-colors hover:text-sp-text"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDeletePost(true)}
                  className="rounded-lg border border-sp-border px-2.5 py-1.5 text-xs font-sp-medium text-red-400 transition-colors hover:bg-red-500/10"
                >
                  삭제
                </button>
              ))}
          </div>
        </div>

        <StaffRoomRichText
          body={currentPost.body}
          bodyFormat={currentPost.bodyFormat}
          className="mt-5 text-sm"
        />
      </div>

      {currentPost.isRequired && readStatus && (
        <div className="rounded-xl border border-sp-accent bg-sp-surface px-6 py-5">
          <h2 className="flex flex-wrap items-center gap-2 text-sm font-sp-bold text-sp-text">
            <span className="material-symbols-outlined text-icon-md text-sp-accent">
              fact_check
            </span>
            읽음 현황
            <span className="font-sp-medium text-sp-muted">
              읽음 {readStatus.read.length} · 안 읽음 {readStatus.unread.length}
            </span>
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-sp-semibold text-sp-muted">
                읽은 사람 ({readStatus.read.length})
              </p>
              {readStatus.read.length === 0 ? (
                <p className="text-xs text-sp-muted">아직 없어요.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {readStatus.read.map((r) => (
                    <li
                      key={r.email}
                      className="flex items-center gap-1 rounded-full bg-sp-accent px-2.5 py-1 text-xs font-sp-medium text-white"
                    >
                      <span className="material-symbols-outlined text-icon-sm">check</span>
                      {displayNameOf({ email: r.email, displayName: r.name })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-sp-semibold text-sp-muted">
                안 읽은 사람 ({readStatus.unread.length})
              </p>
              {readStatus.unread.length === 0 ? (
                <p className="text-xs text-sp-muted">모두 읽었어요.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {readStatus.unread.map((u) => (
                    <li
                      key={u.email}
                      className="rounded-full border border-sp-border px-2.5 py-1 text-xs font-sp-medium text-sp-muted"
                    >
                      {displayNameOf({ email: u.email, displayName: u.name })}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-sp-border bg-sp-card px-6 py-5">
        <h2 className="mb-4 text-sm font-sp-bold text-sp-text">댓글 {comments.length}</h2>
        <div className="space-y-3">
          {comments.length === 0 && <p className="text-sm text-sp-muted">아직 댓글이 없어요.</p>}
          {comments.map((comment) => {
            const commentAuthor = displayNameOf({
              email: comment.authorEmail,
              displayName: comment.authorName,
            });
            const canDelete = canDeleteComment(myRole, viewerEmail, comment.authorEmail).allowed;
            const isConfirming = pendingDeleteCommentId === comment.id;

            return (
              <div key={comment.id} className="rounded-lg bg-sp-surface px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-sp-semibold text-sp-text">
                      {commentAuthor}{' '}
                      <span className="font-normal text-sp-muted">
                        · {formatPostTime(comment.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-sp-text">{comment.body}</p>
                  </div>
                  {canDelete &&
                    (isConfirming ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="rounded-lg bg-red-500 px-2 py-1 text-xs font-sp-semibold text-white transition-colors hover:bg-red-600"
                        >
                          확인
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteCommentId(null)}
                          className="rounded-lg border border-sp-border px-2 py-1 text-xs text-sp-muted transition-colors hover:text-sp-text"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCommentId(comment.id)}
                        className="shrink-0 text-xs text-red-400 transition-colors hover:underline"
                      >
                        삭제
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-end gap-2">
          <textarea
            value={commentBody}
            onChange={(e) => {
              if (e.target.value.length <= STAFFROOM_COMMENT_MAX_LENGTH)
                setCommentBody(e.target.value);
            }}
            placeholder="댓글을 남겨보세요"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAddComment()}
            disabled={!commentBody.trim() || submittingComment}
            className="shrink-0 rounded-lg bg-sp-accent px-4 py-2.5 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-40"
          >
            등록
          </button>
        </div>
      </div>
    </div>
  );
}
