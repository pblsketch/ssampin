import { useCallback, useEffect, useRef, useState } from 'react';
import {
  REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH,
  REALTIME_WALL_MAX_COMMENT_IMAGES,
} from '@domain/rules/realtimeWallRules';
import { StudentImageMultiPicker } from '@adapters/components/Tools/RealtimeWall/StudentImageMultiPicker';
import { useStudentImageMultiUpload } from './useStudentImageMultiUpload';

/**
 * v2.x — 학생 댓글 expanded 입력 영역 (패들렛 패턴 2-state 중 2단계).
 *
 * 본문은 plain text textarea (마크다운 기능 제거 — 사용자 결정 2026-04-26).
 *
 * 키 매핑 (spec):
 *   - Enter           → 전송 (canSubmit 시)
 *   - Shift+Enter     → 줄바꿈 (기본 동작 유지)
 *   - Ctrl/Cmd+Enter  → 전송 (기존 사용자 호환 — 회귀 #11)
 *   - Esc             → 취소 (text/images draft는 부모가 보존)
 *
 * IME 가드: `e.nativeEvent.isComposing` (회귀 #12).
 *
 * 회귀 보호:
 *   - rounded-full / rounded-sp-* 미사용
 *   - 이미지 1장 한도 (REALTIME_WALL_MAX_COMMENT_IMAGES 그대로)
 *   - 학생 트리(src/student/) 격리
 *   - 파일 선택/드래그앤드롭/Ctrl+V 페이스트 3 경로 모두 유지
 */

interface StudentCommentInputExpandedProps {
  readonly nickname: string;
  readonly text: string;
  readonly images: readonly string[];
  readonly onNicknameChange: (v: string) => void;
  readonly onTextChange: (v: string) => void;
  readonly onAddImage: (dataUrl: string) => void;
  readonly onRemoveImage: (idx: number) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly canSubmit: boolean;
  readonly graphemeCount: number;
  readonly disabled?: boolean;
  readonly fullscreen?: boolean;
}

export function StudentCommentInputExpanded({
  nickname,
  text,
  images,
  onNicknameChange,
  onTextChange,
  onAddImage,
  onRemoveImage,
  onSubmit,
  onCancel,
  canSubmit,
  graphemeCount,
  disabled = false,
  fullscreen = false,
}: StudentCommentInputExpandedProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 이 컴포넌트가 직접 훅을 소유 — compact picker에 onFileSelectOverride로 위임
  const { onDrop, onPaste, onFileSelect, error: uploadError } = useStudentImageMultiUpload({
    currentImages: images,
    onAdd: onAddImage,
    maxImages: REALTIME_WALL_MAX_COMMENT_IMAGES,
  });

  // 마운트 시 textarea autofocus.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const showNicknameInput = nickname.trim().length === 0;

  const handleSubmit = useCallback(() => {
    onSubmit();
  }, [onSubmit]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // 회귀 #12 — IME 조합 중 Enter 가드
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (canSubmit) handleSubmit();
        return;
      }
      // 회귀 #11 — Ctrl/Cmd+Enter 호환 (기존 사용자 보호)
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canSubmit) handleSubmit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [canSubmit, handleSubmit, handleCancel],
  );

  // textarea onDrop — DragEvent<HTMLTextAreaElement>를 onDrop(DragEvent<HTMLElement>)로 위임
  const handleTextareaDrop = useCallback(
    (e: React.DragEvent<HTMLTextAreaElement>) => {
      setIsDragOver(false);
      onDrop(e as unknown as React.DragEvent<HTMLElement>);
    },
    [onDrop],
  );

  // textarea onPaste — ClipboardEvent<HTMLTextAreaElement>를 onPaste(ClipboardEvent<HTMLElement>)로 위임
  const handleTextareaPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      onPaste(e as unknown as React.ClipboardEvent<HTMLElement>);
    },
    [onPaste],
  );

  const wrapperClass = [
    'flex flex-col gap-2 rounded-xl border border-sp-accent bg-sp-card p-2 ring-1 ring-sp-accent/15',
    fullscreen ? 'fixed inset-0 z-40 p-4' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const submitButtonClass = canSubmit
    ? 'rounded-lg bg-sp-accent px-3 py-1 text-detail font-semibold text-white hover:bg-sp-accent/85 transition inline-flex items-center gap-1'
    : 'rounded-lg bg-sp-card px-3 py-1 text-detail font-semibold text-sp-muted/40 cursor-not-allowed border border-sp-border/40 inline-flex items-center gap-1';

  return (
    <div className={wrapperClass}>
      {showNicknameInput && (
        <input
          type="text"
          value={nickname}
          onChange={(e) => onNicknameChange(e.target.value.slice(0, 20))}
          placeholder="닉네임"
          disabled={disabled}
          className="rounded-lg border border-sp-border/40 bg-sp-bg px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/15 disabled:opacity-50"
          aria-label="댓글 닉네임"
        />
      )}

      {/* 댓글 textarea — 드래그앤드롭/페이스트 핸들러 부착 */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) =>
          onTextChange(e.target.value.slice(0, REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH))
        }
        onKeyDown={handleKeyDown}
        onDrop={handleTextareaDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onPaste={handleTextareaPaste}
        placeholder="댓글을 입력하세요 (Enter 전송 · Shift+Enter 줄바꿈)"
        rows={fullscreen ? 6 : 3}
        maxLength={REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH}
        disabled={disabled}
        className={[
          'w-full resize-none rounded-lg border bg-sp-bg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:ring-1 focus:ring-sp-accent/15 transition-colors',
          isDragOver
            ? 'border-sp-accent bg-sp-accent/5'
            : 'border-sp-border/40 focus:border-sp-accent',
        ].join(' ')}
        aria-label="댓글 내용"
      />

      {/* 하단 툴바: [📎 버튼 + 썸네일] ··· [카운터 | 취소 | 전송] */}
      <div className="flex items-center gap-1.5 border-t border-sp-border/40 pt-1.5">
        <StudentImageMultiPicker
          images={images}
          onAdd={onAddImage}
          onRemove={onRemoveImage}
          maxImages={REALTIME_WALL_MAX_COMMENT_IMAGES}
          disabled={disabled}
          compact
          onFileSelectOverride={onFileSelect}
          externalError={uploadError}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-caption text-sp-muted/70 tabular-nums">
            {graphemeCount}/{REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH}
          </span>
          <button
            type="button"
            onClick={handleCancel}
            disabled={disabled}
            className="rounded-lg border border-sp-border/40 bg-sp-card px-3 py-1 text-detail font-semibold text-sp-muted hover:text-sp-text hover:border-sp-border transition disabled:opacity-50"
            aria-label="댓글 작성 취소"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={submitButtonClass}
            aria-label="댓글 전송"
          >
            <span className="material-symbols-outlined text-base">send</span>
            <span>전송</span>
          </button>
        </div>
      </div>
    </div>
  );
}
