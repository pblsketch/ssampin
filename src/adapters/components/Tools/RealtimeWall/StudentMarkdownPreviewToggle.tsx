import type { KeyboardEvent, RefObject } from 'react';
import { RealtimeWallCardMarkdown } from './RealtimeWallCardMarkdown';

/**
 * v2.2 (UX) — 학생 마크다운 본문/댓글 입력 토글 (옵션 D — 수동 미리보기).
 *
 * mode='edit'  → textarea (raw 마크다운 편집)
 * mode='preview' → RealtimeWallCardMarkdown (화이트리스트 7종 렌더)
 *
 * 회귀 보호:
 *   - dangerouslySetInnerHTML 신규 사용 0 (RealtimeWallCardMarkdown 그대로 재사용)
 *   - contenteditable 도입 X — 항상 textarea (회귀 #6 IME-safe 보존)
 *   - 마크다운 화이트리스트 7종 무수정 (`p, strong, em, ul, ol, li, blockquote`)
 *   - rounded-lg / rounded-xl만 사용
 *   - sp-* 다크 토큰만 사용
 *   - preview ↔ edit 전환 시 selection 복원 안 함 (textarea remount 허용)
 *
 * 한국어 UI 100%.
 */

interface StudentMarkdownPreviewToggleProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly maxLength?: number;
  readonly disabled?: boolean;
  readonly mode: 'edit' | 'preview';
  readonly onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
  /** preview 영역 최소 높이 (Tailwind class). 기본값 'min-h-[200px]' */
  readonly previewMinHeightClass?: string;
}

export function StudentMarkdownPreviewToggle({
  value,
  onChange,
  textareaRef,
  placeholder,
  rows = 4,
  maxLength,
  disabled = false,
  mode,
  onKeyDown,
  ariaLabel = '본문',
  className = '',
  previewMinHeightClass = 'min-h-[200px]',
}: StudentMarkdownPreviewToggleProps) {
  if (mode === 'preview') {
    return (
      <div
        className={`${previewMinHeightClass} rounded-lg border border-sp-border/60 bg-sp-bg/30 px-3 py-2 ${className}`}
        role="region"
        aria-label="미리보기"
      >
        {value.trim().length === 0 ? (
          <p className="text-xs text-sp-muted/60">미리볼 내용이 없어요</p>
        ) : (
          <RealtimeWallCardMarkdown text={value} />
        )}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      disabled={disabled}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      className={`w-full resize-none rounded-lg border border-sp-border/40 bg-sp-bg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/15 disabled:opacity-50 ${className}`}
    />
  );
}
