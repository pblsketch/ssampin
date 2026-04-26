import { useRef, useState } from 'react';
import type { StudentCommentInput } from '@domain/entities/RealtimeWall';
import {
  REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH,
  REALTIME_WALL_MAX_COMMENT_IMAGES,
} from '@domain/rules/realtimeWallRules';
import { StudentMarkdownToolbar } from '@adapters/components/Tools/RealtimeWall/StudentMarkdownToolbar';
import { StudentImageMultiPicker } from '@adapters/components/Tools/RealtimeWall/StudentImageMultiPicker';
import { useGraphemeCounter } from './useGraphemeCounter';

/**
 * v2.1 신규 — 학생 댓글 정교화 폼 (Plan FR-B12 / Design v2.1 §5.9 / §11.1).
 *
 * v1 RealtimeWallCommentInput 위에 추가:
 *   - 이미지 1장 첨부 (`useStudentImageMultiUpload` maxImages=1)
 *   - Bold/Italic 마크다운 툴바 (별표 직접 입력 회피 — 회귀 위험 #6)
 *   - Intl.Segmenter IME-aware 카운터
 *   - 모바일 풀스크린 옵션 (부모가 결정 — fullscreen prop)
 *
 * 학생 트리에 격리 위치 (회귀 위험 mitigation — 학생 entry에 교사 컴포넌트 import X).
 */

export interface StudentCommentFormProps {
  readonly postId: string;
  readonly nicknameDefault?: string;
  readonly onSubmit: (
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;
  readonly disabled?: boolean;
  readonly fullscreen?: boolean;
}

export function StudentCommentForm({
  postId,
  nicknameDefault,
  onSubmit,
  disabled = false,
  fullscreen = false,
}: StudentCommentFormProps) {
  const [nickname, setNickname] = useState(nicknameDefault ?? '');
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  void postId;

  const graphemeCount = useGraphemeCounter(text);
  const trimmedNickname = nickname.trim();
  const trimmedText = text.trim();
  const canSubmit =
    !disabled &&
    trimmedNickname.length > 0 &&
    trimmedText.length > 0 &&
    graphemeCount <= REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      nickname: trimmedNickname,
      text: trimmedText,
      ...(images.length > 0 ? { images } : {}),
    });
    setText('');
    setImages([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={[
        'flex flex-col gap-2 rounded-lg border border-sp-border/70 bg-sp-bg/60 p-2',
        fullscreen ? 'fixed inset-0 z-40 p-4' : '',
      ].join(' ')}
    >
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value.slice(0, 20))}
        placeholder="닉네임"
        disabled={disabled}
        className="rounded-md border border-sp-border/60 bg-sp-card px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-50"
        aria-label="댓글 닉네임"
      />
      <StudentMarkdownToolbar
        textareaRef={textareaRef}
        onChange={(v) => setText(v.slice(0, REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH))}
        disabled={disabled}
      />
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) =>
          setText(e.target.value.slice(0, REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH))
        }
        onKeyDown={handleKeyDown}
        placeholder="댓글을 입력하세요 (Ctrl+Enter로 전송)"
        rows={fullscreen ? 6 : 2}
        disabled={disabled}
        className="resize-none rounded-md border border-sp-border/60 bg-sp-card px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none disabled:opacity-50"
        aria-label="댓글 내용"
      />
      <StudentImageMultiPicker
        images={images}
        onAdd={(dataUrl) => setImages((prev) => [...prev, dataUrl].slice(0, REALTIME_WALL_MAX_COMMENT_IMAGES))}
        onRemove={(idx) => setImages((prev) => prev.filter((_, i) => i !== idx))}
        maxImages={REALTIME_WALL_MAX_COMMENT_IMAGES}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-sp-muted/70 tabular-nums">
          {graphemeCount}/{REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-sp-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          댓글 달기
        </button>
      </div>
    </div>
  );
}
