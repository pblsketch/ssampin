import type { RefObject } from 'react';

/**
 * @deprecated v1.10.6+ (2026-04-26) — 학생 카드/댓글 입력에서 마크다운 기능이 완전 제거됨.
 *   - 본 컴포넌트는 더 이상 production 코드(src/student/*)에서 사용되지 않음.
 *   - 다음 마이너 릴리즈에서 본 파일 삭제 예정.
 *   - 신규 호출처 추가 금지.
 *
 * v2.2 (UX) — 학생 마크다운 서식 바 (옵션 F — 한글 라벨 + 옵션 D — 미리보기 토글).
 *
 * 변경 (vs StudentMarkdownToolbar):
 *   - 라벨: B/I → 굵게/기울임 (한글)
 *   - 우측 끝 미리보기 토글 (눈 아이콘) 추가 — Toggle Preview 패턴
 *   - variant 분기:
 *       * 'card' (기본) → 굵게/기울임/• 목록/❝ 인용 + 미리보기(편집/미리보기 텍스트)
 *       * 'comment'    → 굵게/기울임만 + 아이콘 토글 (텍스트 라벨 X) — 좁은 레이아웃 대응
 *
 * 회귀 보호 (StudentMarkdownToolbar 동등):
 *   - 별표 직접 입력 회피 (회귀 #6 — 한글 IME 자모분리 충돌 방지)
 *   - 선택 영역만 wrap / 줄 prefix만 추가 — IME composition 충돌 0
 *   - keyboard shortcut 미사용 (`C` 단축키 부재 — 회귀 #6 격리)
 *   - WCAG 2.5.5: 카드 variant 버튼은 자연 height + 미리보기 토글 min-h-[32px]
 *     (desktop 전용 데스크톱 위치이므로 32px 허용 + title hint 보강)
 *
 * preview 모드일 때 서식 버튼은 disabled (편집 불가).
 */

interface StudentFormatBarProps {
  readonly textareaRef: RefObject<HTMLTextAreaElement>;
  readonly onChange: (next: string) => void;
  readonly mode: 'edit' | 'preview';
  readonly onModeToggle: () => void;
  readonly disabled?: boolean;
  /** 카드(card) → list/quote 노출 / 댓글(comment) → 굵게/기울임만 + 아이콘 토글 */
  readonly variant?: 'card' | 'comment';
}

function applyWrap(
  textarea: HTMLTextAreaElement,
  marker: string,
  onChange: (v: string) => void,
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.slice(start, end);
  const inner = selected.length > 0 ? selected : '텍스트';
  const next =
    value.slice(0, start) + marker + inner + marker + value.slice(end);
  onChange(next);
  // 다음 tick에 선택 영역 복원
  requestAnimationFrame(() => {
    textarea.focus();
    const cursorStart = start + marker.length;
    const cursorEnd = cursorStart + inner.length;
    textarea.setSelectionRange(cursorStart, cursorEnd);
  });
}

function applyPrefixLine(
  textarea: HTMLTextAreaElement,
  prefix: string,
  onChange: (v: string) => void,
): void {
  const start = textarea.selectionStart;
  const value = textarea.value;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + prefix.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

interface FormatBtnProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}

function FormatButton({ label, onClick, disabled, title }: FormatBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      className="rounded-lg border border-sp-border/40 bg-sp-card px-2 py-1 text-xs text-sp-text transition hover:border-sp-accent/40 hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function StudentFormatBar({
  textareaRef,
  onChange,
  mode,
  onModeToggle,
  disabled = false,
  variant = 'card',
}: StudentFormatBarProps) {
  const isPreview = mode === 'preview';
  const editDisabled = disabled || isPreview;
  const isComment = variant === 'comment';

  const handleBold = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    applyWrap(ta, '**', onChange);
  };
  const handleItalic = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    applyWrap(ta, '*', onChange);
  };
  const handleList = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    applyPrefixLine(ta, '- ', onChange);
  };
  const handleQuote = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    applyPrefixLine(ta, '> ', onChange);
  };

  return (
    <div
      className="flex items-center gap-1.5"
      role="toolbar"
      aria-label="텍스트 서식"
    >
      <FormatButton
        label="굵게"
        onClick={handleBold}
        disabled={editDisabled}
        title="굵게 (선택 영역에 적용)"
      />
      <FormatButton
        label="기울임"
        onClick={handleItalic}
        disabled={editDisabled}
        title="기울임 (선택 영역에 적용)"
      />
      {!isComment && (
        <>
          <FormatButton
            label="• 목록"
            onClick={handleList}
            disabled={editDisabled}
            title="목록 (현재 줄 앞에 추가)"
          />
          <FormatButton
            label="❝ 인용"
            onClick={handleQuote}
            disabled={editDisabled}
            title="인용 (현재 줄 앞에 추가)"
          />
        </>
      )}
      <button
        type="button"
        onClick={onModeToggle}
        disabled={disabled}
        aria-pressed={isPreview}
        aria-label={isPreview ? '편집으로 돌아가기' : '미리보기로 보기'}
        title={isPreview ? '편집으로 돌아가기' : '결과를 미리 볼 수 있어요'}
        className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-xs text-sp-text transition hover:border-sp-accent/40 hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[14px]">
          {isPreview ? 'edit' : 'visibility'}
        </span>
        {!isComment && <span>{isPreview ? '편집' : '미리보기'}</span>}
      </button>
    </div>
  );
}
