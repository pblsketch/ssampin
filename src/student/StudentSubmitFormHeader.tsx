/**
 * v2.2 (Bug 2 Fix) — Padlet 스타일 학생 카드 작성 모달 헤더.
 *
 * 좌측: 닫기(X) + 최소화(-)
 * 우측: 더보기(⋯) + 게시/수정 버튼
 *
 * 회귀 위험 #6 (키보드 shortcut 0) 격리 — 이 컴포넌트는 keyboard shortcut 미사용.
 * isSubmitting 시 모든 버튼 disabled.
 */

interface StudentSubmitFormHeaderProps {
  readonly canSubmit: boolean;
  readonly isSubmitting: boolean;
  readonly isEditMode: boolean;
  readonly onClose: () => void;
  readonly onMinimize: () => void;
  readonly onSubmit: () => void;
  readonly onMoreClick: () => void;
  readonly moreMenuOpen: boolean;
}

export function StudentSubmitFormHeader({
  canSubmit,
  isSubmitting,
  isEditMode,
  onClose,
  onMinimize,
  onSubmit,
  onMoreClick,
  moreMenuOpen,
}: StudentSubmitFormHeaderProps) {
  const submitLabel = isSubmitting
    ? isEditMode
      ? '수정 중...'
      : '올리는 중...'
    : isEditMode
      ? '수정'
      : '게시';
  return (
    <header className="flex items-center justify-between gap-2 border-b border-sp-border bg-sp-card px-3 py-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="닫기"
          title="닫기"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sp-muted transition hover:bg-sp-text/5 hover:text-sp-text disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        <button
          type="button"
          onClick={onMinimize}
          disabled={isSubmitting}
          aria-label="최소화 (작성 중 칩으로 보관)"
          title="최소화"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sp-muted transition hover:bg-sp-text/5 hover:text-sp-text disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[20px]">remove</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMoreClick}
          disabled={isSubmitting}
          aria-label="더 많은 도구"
          title="더 많은 도구"
          aria-expanded={moreMenuOpen}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sp-muted transition hover:bg-sp-text/5 hover:text-sp-text disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[20px]">more_horiz</span>
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          aria-label={submitLabel}
          title={submitLabel}
          className="inline-flex h-8 items-center justify-center rounded-lg bg-sp-accent px-4 text-sm font-semibold text-white transition hover:bg-sp-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </header>
  );
}
