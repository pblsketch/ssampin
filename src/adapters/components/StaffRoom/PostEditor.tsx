/**
 * 온라인 교무실 — 글 쓰기/고치기 (M2)
 *
 * 자동 저장(임시저장)은 **새 글을 쓸 때만** 쓴다(`mode === 'create'`). 이미 있는 글을
 * 고칠 때 같은 임시저장 칸을 건드리면, "쓰다 만 새 글"과 "고치던 글"이 한 칸에서
 * 섞여버린다 — 계획서 §8-A 의 임시저장은 사람×게시판마다 한 벌이라서다.
 *
 * @멘션은 본문에 `@이름`을 타이핑하는 파싱을 만들지 않는다. 부서 멤버를 목록에서
 * 골라 칩으로 쌓는 방식만 쓴다 — 오작동 없이 확실하다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import { useStaffRoomStore } from '@adapters/stores/useStaffRoomStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { canSetRequired, displayNameOf } from '@domain/rules/staffRoomBoardPermission';
import {
  STAFFROOM_POST_BODY_ADVISORY_LENGTH,
  STAFFROOM_POST_TITLE_MAX_LENGTH,
} from '@domain/entities/StaffRoomBoard';
import { formatClockTime } from './boardFormat';

interface PostEditorProps {
  departmentId: string;
  boardId: string;
  mode: 'create' | 'edit';
  onDone: () => void;
  onCancel: () => void;
}

export function PostEditor({ departmentId, boardId, mode, onDone, onCancel }: PostEditorProps) {
  const currentPost = useStaffRoomBoardStore((s) => s.currentPost);
  const draftTitle = useStaffRoomBoardStore((s) => s.draftTitle);
  const draftBody = useStaffRoomBoardStore((s) => s.draftBody);
  const draftSavedAt = useStaffRoomBoardStore((s) => s.draftSavedAt);
  const isLoading = useStaffRoomBoardStore((s) => s.isLoading);
  const error = useStaffRoomBoardStore((s) => s.error);
  const loadDraft = useStaffRoomBoardStore((s) => s.loadDraft);
  const updateDraft = useStaffRoomBoardStore((s) => s.updateDraft);
  const discardDraft = useStaffRoomBoardStore((s) => s.discardDraft);
  const writePost = useStaffRoomBoardStore((s) => s.writePost);
  const editPost = useStaffRoomBoardStore((s) => s.editPost);
  const clearError = useStaffRoomBoardStore((s) => s.clearError);

  const members = useStaffRoomStore((s) => s.members);
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole ?? null);
  const myEmail = useGoogleAccountStore((s) => s.email);
  const canMarkRequired = canSetRequired(myRole).allowed;

  const [title, setTitle] = useState(mode === 'edit' ? (currentPost?.title ?? '') : '');
  const [body, setBody] = useState(mode === 'edit' ? (currentPost?.body ?? '') : '');
  const [mentionedEmails, setMentionedEmails] = useState<string[]>(
    mode === 'edit' ? [...(currentPost?.mentionedEmails ?? [])] : [],
  );
  const [isRequired, setIsRequired] = useState(
    mode === 'edit' ? (currentPost?.isRequired ?? false) : false,
  );
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    clearError();
    if (mode === 'create') void loadDraft(departmentId, boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 쓰던 글을 스토어가 불러오면 화면에 반영하고 안내를 띄운다 (새 글 모드에서만)
  useEffect(() => {
    if (mode !== 'create') return;
    if (draftTitle || draftBody) {
      setTitle(draftTitle);
      setBody(draftBody);
      setRestoredDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTitle, draftBody]);

  const otherMembers = useMemo(
    () => members.filter((m) => m.email.toLowerCase() !== (myEmail ?? '').toLowerCase()),
    [members, myEmail],
  );

  const isTitleAtLimit = title.length >= STAFFROOM_POST_TITLE_MAX_LENGTH;
  const isBodyTooLong = body.length > STAFFROOM_POST_BODY_ADVISORY_LENGTH;
  const canSubmit = title.trim().length > 0 && !submitting;

  const handleTitleChange = (value: string) => {
    if (value.length > STAFFROOM_POST_TITLE_MAX_LENGTH) return;
    setTitle(value);
    if (mode === 'create') updateDraft(departmentId, { title: value });
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    if (mode === 'create') updateDraft(departmentId, { body: value });
  };

  const toggleMention = (email: string) => {
    setMentionedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const handleStartFresh = async () => {
    await discardDraft(departmentId);
    setTitle('');
    setBody('');
    setRestoredDraft(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const ok =
      mode === 'create'
        ? await writePost(departmentId, { title, body, isRequired, mentionedEmails })
        : currentPost
          ? await editPost(departmentId, currentPost.id, { title, body, mentionedEmails })
          : false;
    setSubmitting(false);
    if (ok) onDone();
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onCancel}
        className="flex items-center gap-1.5 text-sm text-sp-muted transition-colors hover:text-sp-text"
      >
        <span className="material-symbols-outlined text-icon">arrow_back</span>
        {mode === 'create' ? '목록으로' : '취소'}
      </button>

      {mode === 'create' && restoredDraft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sp-border bg-sp-surface px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm text-sp-text">
            <span className="material-symbols-outlined text-icon-md text-sp-accent">history</span>
            쓰시던 글을 불러왔어요
          </p>
          <button
            type="button"
            onClick={() => void handleStartFresh()}
            className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
          >
            새로 쓰기
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-sp-text">
          <span className="material-symbols-outlined text-icon-sm shrink-0 text-red-400">
            error
          </span>
          {error}
        </p>
      )}

      <div className="rounded-xl border border-sp-border bg-sp-card p-6">
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="제목을 입력하세요"
            autoFocus
            className="w-full border-b border-sp-border bg-transparent pb-3 text-lg font-sp-bold text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
          <p
            className={`mt-1 text-right text-xs tabular-nums ${
              isTitleAtLimit ? 'text-red-400' : 'text-sp-muted'
            }`}
          >
            {title.length}/{STAFFROOM_POST_TITLE_MAX_LENGTH}
          </p>
        </div>

        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="내용을 입력하세요"
          rows={16}
          className="mt-3 w-full resize-y rounded-lg border border-sp-border bg-sp-bg px-3.5 py-3 text-sm leading-relaxed text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          {isBodyTooLong ? (
            <span className="text-sp-highlight">
              내용이 너무 길어요. 저장은 되지만 나눠 쓰는 걸 권해요.
            </span>
          ) : (
            <span />
          )}
          {mode === 'create' && draftSavedAt && (
            <span className="ml-auto flex items-center gap-1 text-sp-muted">
              <span className="material-symbols-outlined text-icon-sm">cloud_done</span>
              자동 저장됨 · {formatClockTime(draftSavedAt)}
            </span>
          )}
        </div>

        {otherMembers.length > 0 && (
          <div className="mt-5 border-t border-sp-border pt-5">
            <p className="mb-1 text-sm font-sp-medium text-sp-text">함께 볼 선생님</p>
            <p className="mb-3 text-xs text-sp-muted">고른 분들께 이 글을 알려드려요.</p>
            <div className="flex flex-wrap gap-1.5">
              {otherMembers.map((member) => {
                const selected = mentionedEmails.includes(member.email);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleMention(member.email)}
                    className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-sp-medium transition-colors ${
                      selected
                        ? 'bg-sp-accent text-white'
                        : 'border border-sp-border text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {selected && (
                      <span className="material-symbols-outlined text-icon-sm">check</span>
                    )}
                    {displayNameOf(member)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canMarkRequired && (
          <label className="mt-5 flex items-center gap-2 border-t border-sp-border pt-5 text-sm text-sp-text">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="h-4 w-4 accent-sp-accent"
            />
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-icon-sm text-sp-accent">
                push_pin
              </span>
              필독으로 올리기
            </span>
          </label>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-colors hover:text-sp-text"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-40"
        >
          {submitting || isLoading ? '저장하는 중…' : mode === 'create' ? '올리기' : '수정 완료'}
        </button>
      </div>
    </div>
  );
}
