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
import { StaffRoomRichEditor } from './StaffRoomRichEditor';
import { staffRoomRichTextToPlain } from '@domain/rules/staffRoomRichText';
import {
  formatStaffRoomTag,
  splitStaffRoomTagInput,
  STAFFROOM_POST_MAX_TAGS,
} from '@domain/rules/staffRoomTaxonomy';

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
  const draftBodyFormat = useStaffRoomBoardStore((s) => s.draftBodyFormat);
  const draftSavedAt = useStaffRoomBoardStore((s) => s.draftSavedAt);
  const isLoading = useStaffRoomBoardStore((s) => s.isLoading);
  const error = useStaffRoomBoardStore((s) => s.error);
  const loadDraft = useStaffRoomBoardStore((s) => s.loadDraft);
  const updateDraft = useStaffRoomBoardStore((s) => s.updateDraft);
  const discardDraft = useStaffRoomBoardStore((s) => s.discardDraft);
  const writePost = useStaffRoomBoardStore((s) => s.writePost);
  const editPost = useStaffRoomBoardStore((s) => s.editPost);
  const clearError = useStaffRoomBoardStore((s) => s.clearError);

  const categories = useStaffRoomBoardStore((s) => s.categories);
  const loadCategories = useStaffRoomBoardStore((s) => s.loadCategories);

  const members = useStaffRoomStore((s) => s.members);
  const myRole = useStaffRoomStore((s) => s.currentDepartment?.myRole ?? null);
  const myEmail = useGoogleAccountStore((s) => s.email);
  const canMarkRequired = canSetRequired(myRole).allowed;

  const [title, setTitle] = useState(mode === 'edit' ? (currentPost?.title ?? '') : '');
  const [body, setBody] = useState(mode === 'edit' ? (currentPost?.body ?? '') : '');
  // 편집기가 만든 값은 구조(JSON)라 길이를 그대로 세면 빈 글도 수백 자로 나온다.
  // 글자 수 안내는 꾸밈을 뺀 순수 글자로 센다.
  const [plainBody, setPlainBody] = useState(
    mode === 'edit' && currentPost?.bodyFormat === 'lexical'
      ? staffRoomRichTextToPlain(currentPost.body)
      : (currentPost?.body ?? ''),
  );
  const [mentionedEmails, setMentionedEmails] = useState<string[]>(
    mode === 'edit' ? [...(currentPost?.mentionedEmails ?? [])] : [],
  );
  const [isRequired, setIsRequired] = useState(
    mode === 'edit' ? (currentPost?.isRequired ?? false) : false,
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    mode === 'edit' ? (currentPost?.categoryId ?? null) : null,
  );
  const [tags, setTags] = useState<string[]>(mode === 'edit' ? [...(currentPost?.tags ?? [])] : []);
  const [tagInput, setTagInput] = useState('');
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /**
   * 편집기에 처음 넣을 내용.
   *
   * ⚠️ **편집기는 처음 만들어질 때의 내용만 읽는다.** 나중에 바뀐 값을 계속
   * 밀어 넣으면 글자를 칠 때마다 커서가 맨 앞으로 튄다. 그런데 쓰던 글(임시저장)은
   * 서버에서 **나중에** 도착한다 — 그대로 두면 "쓰시던 글을 불러왔어요"라고
   * 안내해 놓고 정작 편집기는 비어 있는 상태가 된다.
   *
   * 그래서 내용이 통째로 바뀌는 순간(임시저장 도착·새로 쓰기)에만 `seed` 를
   * 올려 편집기를 다시 만든다. 타자 중에는 바뀌지 않으므로 커서는 튀지 않는다.
   */
  const [editorSeed, setEditorSeed] = useState(0);
  const [editorInitial, setEditorInitial] = useState(() => ({
    body: mode === 'edit' ? (currentPost?.body ?? '') : '',
    format: mode === 'edit' ? (currentPost?.bodyFormat ?? 'plain') : ('plain' as const),
  }));

  useEffect(() => {
    clearError();
    void loadCategories(departmentId);
    if (mode === 'create') void loadDraft(departmentId, boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 쓰던 글을 스토어가 불러오면 화면에 반영하고 안내를 띄운다 (새 글 모드에서만)
  useEffect(() => {
    if (mode !== 'create') return;
    if (draftTitle || draftBody) {
      setTitle(draftTitle);
      setBody(draftBody);
      // 편집기를 다시 만들어 쓰던 내용을 실제로 보여준다
      setEditorInitial({ body: draftBody, format: draftBodyFormat });
      setEditorSeed((n) => n + 1);
      setRestoredDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftTitle, draftBody, draftBodyFormat]);

  const otherMembers = useMemo(
    () => members.filter((m) => m.email.toLowerCase() !== (myEmail ?? '').toLowerCase()),
    [members, myEmail],
  );

  const isTitleAtLimit = title.length >= STAFFROOM_POST_TITLE_MAX_LENGTH;
  const isBodyTooLong = plainBody.length > STAFFROOM_POST_BODY_ADVISORY_LENGTH;
  const canSubmit = title.trim().length > 0 && !submitting;

  const handleTitleChange = (value: string) => {
    if (value.length > STAFFROOM_POST_TITLE_MAX_LENGTH) return;
    setTitle(value);
    if (mode === 'create') updateDraft(departmentId, { title: value });
  };

  const handleBodyChange = (value: string, plainText: string) => {
    setBody(value);
    setPlainBody(plainText);
    // 임시저장도 형식을 함께 보관한다 — 안 그러면 이어 쓸 때 서식이 풀린다
    if (mode === 'create') updateDraft(departmentId, { body: value, bodyFormat: 'lexical' });
  };

  /**
   * 적은 태그를 확정한다.
   *
   * 쉼표·공백·엔터 어느 것으로 끝내도 되게 했다 — 사람마다 습관이 다르고,
   * "왜 안 붙지" 하고 헤매게 만들 이유가 없다.
   */
  const commitTags = (raw: string) => {
    const added = splitStaffRoomTagInput(raw);
    if (added.length === 0) {
      setTagInput('');
      return;
    }
    setTags((prev) => {
      const merged = [...prev];
      for (const tag of added) {
        if (!merged.includes(tag) && merged.length < STAFFROOM_POST_MAX_TAGS) merged.push(tag);
      }
      return merged;
    });
    setTagInput('');
  };

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const toggleMention = (email: string) => {
    setMentionedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  };

  const handleStartFresh = async () => {
    await discardDraft(departmentId);
    setTitle('');
    setBody('');
    setPlainBody('');
    // 편집기도 비워야 한다 — 상태만 비우면 화면에는 쓰던 글이 그대로 남는다
    setEditorInitial({ body: '', format: 'plain' });
    setEditorSeed((n) => n + 1);
    setRestoredDraft(false);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    // 편집기가 만든 구조를 그대로 저장한다. 화면에 그릴 때 같은 형식 표시를
    // 보고 판단하므로(ADR-069), 저장하는 쪽과 그리는 쪽이 어긋나지 않는다.
    const bodyFormat = 'lexical' as const;
    const ok =
      mode === 'create'
        ? await writePost(departmentId, {
            title,
            body,
            bodyFormat,
            isRequired,
            mentionedEmails,
            categoryId,
            tags,
          })
        : currentPost
          ? await editPost(departmentId, currentPost.id, {
              title,
              body,
              bodyFormat,
              mentionedEmails,
              categoryId,
              tags,
            })
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

        {categories.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="post-category" className="shrink-0 text-xs text-sp-muted">
              말머리
            </label>
            <select
              id="post-category"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value === '' ? null : e.target.value)}
              className="h-8 rounded-lg border border-sp-border bg-sp-bg px-2 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
            >
              <option value="">말머리 없음</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-3">
          <StaffRoomRichEditor
            key={editorSeed}
            initialBody={editorInitial.body}
            initialBodyFormat={editorInitial.format}
            onChange={handleBodyChange}
          />
        </div>
        {/* 해시태그 */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-sp-border bg-sp-surface px-2.5 py-1 text-xs text-sp-text"
              >
                {formatStaffRoomTag(tag)}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`${formatStaffRoomTag(tag)} 빼기`}
                  className="text-sp-muted transition-colors hover:text-sp-text"
                >
                  <span className="material-symbols-outlined text-icon-sm">close</span>
                </button>
              </span>
            ))}
            {tags.length < STAFFROOM_POST_MAX_TAGS && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  // 쉼표·공백을 치면 그 자리에서 확정한다
                  if (/[,\s]/.test(e.target.value)) commitTags(e.target.value);
                  else setTagInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  // 한글 조합 중의 엔터는 "글자 확정"이지 "태그 확정"이 아니다.
                  // 막지 않으면 "체육"을 치다가 태그가 잘려 붙는다.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    commitTags(tagInput);
                  }
                  if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
                    removeTag(tags[tags.length - 1]!);
                  }
                }}
                onBlur={() => commitTags(tagInput)}
                placeholder={tags.length === 0 ? '#태그 (쉼표나 엔터로 구분)' : '태그 추가'}
                className="h-8 min-w-[9rem] flex-1 rounded-lg border border-sp-border bg-sp-bg px-2.5 text-xs text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
              />
            )}
          </div>
          {tags.length >= STAFFROOM_POST_MAX_TAGS && (
            <p className="mt-1 text-xs text-sp-muted">
              태그는 {STAFFROOM_POST_MAX_TAGS}개까지 붙일 수 있어요.
            </p>
          )}
        </div>

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
