/**
 * v2.x — 학생 댓글 collapsed 트리거 (패들렛 패턴 2-state 중 1단계).
 *
 * Click/Focus 시 부모가 expanded 상태로 전환하도록 onExpand 호출.
 * draft가 보존된 경우(`hasDraft`) 시각적으로 강조하고 안내 문구 변경.
 *
 * 회귀 보호:
 *   - rounded-full / rounded-sp-* 미사용 (Tailwind 기본 키만)
 *   - 학생 트리(src/student/) 격리 — 교사 컴포넌트 import 금지
 */

interface StudentCommentInputCollapsedProps {
  readonly onExpand: () => void;
  readonly disabled?: boolean;
  readonly hasDraft: boolean;
}

export function StudentCommentInputCollapsed({
  onExpand,
  disabled = false,
  hasDraft,
}: StudentCommentInputCollapsedProps) {
  const baseClass =
    'flex w-full items-center gap-2 rounded-xl border bg-sp-card px-3 py-2 text-detail transition';
  const variantClass = hasDraft
    ? 'border-sp-accent/30 text-sp-text'
    : 'border-sp-border text-sp-muted hover:border-sp-accent/40 hover:text-sp-text';
  return (
    <button
      type="button"
      onClick={onExpand}
      onFocus={onExpand}
      disabled={disabled}
      aria-label="댓글 입력란 열기"
      className={`${baseClass} ${variantClass} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="material-symbols-outlined text-base">forum</span>
      <span className="flex-1 text-left">
        {hasDraft ? '작성 중인 댓글이 있어요…' : '댓글 추가...'}
      </span>
      <span className="material-symbols-outlined text-base text-sp-muted/60">
        arrow_forward
      </span>
    </button>
  );
}
