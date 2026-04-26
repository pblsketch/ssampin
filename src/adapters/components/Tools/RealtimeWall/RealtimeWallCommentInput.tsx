/**
 * RealtimeWallCommentInput — 학생 댓글 입력.
 *
 * v1.14 Phase P2 (padlet mode). Design §5.5.
 *
 * UX 결정 (Design §5.5):
 *   - Enter는 줄바꿈 (IME 한글 입력 호환), Ctrl+Enter로 전송
 *   - 전송 버튼 클릭으로도 전송
 *   - 전송 성공 후 textarea clear
 *   - 200자 max (도메인 규칙과 일치). 카운터 표시
 *   - rate limit/server 에러 시 외부에서 disabled=true로 잠그면 입력만 비활성
 */
import { useState } from 'react';
import type { StudentCommentInput } from '@domain/entities/RealtimeWall';
import { REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH } from '@domain/rules/realtimeWallRules';

export interface RealtimeWallCommentInputProps {
  readonly postId: string;
  /** join 시 닉네임을 default로 채워 UX 줄이기. */
  readonly nicknameDefault?: string;
  readonly onSubmit: (input: Omit<StudentCommentInput, 'sessionToken'>) => void;
  readonly disabled?: boolean;
}

export function RealtimeWallCommentInput({
  postId,
  nicknameDefault,
  onSubmit,
  disabled = false,
}: RealtimeWallCommentInputProps) {
  const [nickname, setNickname] = useState(nicknameDefault ?? '');
  const [text, setText] = useState('');

  // postId는 부모가 key로 관리하지만 리셋 동작 트리거용으로 참조만 해둠.
  void postId;

  const trimmedNickname = nickname.trim();
  const trimmedText = text.trim();
  const canSubmit =
    !disabled &&
    trimmedNickname.length > 0 &&
    trimmedText.length > 0 &&
    trimmedText.length <= REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ nickname: trimmedNickname, text: trimmedText });
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd + Enter로 전송. 단독 Enter는 줄바꿈 (IME 충돌 회피).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-sp-border/70 bg-sp-bg/60 p-2">
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value.slice(0, 20))}
        placeholder="닉네임"
        disabled={disabled}
        className="rounded-md border border-sp-border/60 bg-sp-card px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-50"
        aria-label="댓글 닉네임"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH))}
        onKeyDown={handleKeyDown}
        placeholder="댓글을 입력하세요 (Ctrl+Enter로 전송)"
        rows={2}
        disabled={disabled}
        className="resize-none rounded-md border border-sp-border/60 bg-sp-card px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-50"
        aria-label="댓글 내용"
      />
      <div className="flex items-center justify-between">
        <span className="text-caption text-sp-muted/70 tabular-nums">
          {trimmedText.length}/{REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-sp-accent px-2.5 py-1 text-detail font-semibold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          댓글 달기
        </button>
      </div>
    </div>
  );
}
