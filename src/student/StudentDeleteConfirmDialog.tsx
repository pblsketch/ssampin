import { useEffect } from 'react';

/**
 * v2.1 Phase D — 학생 자기 카드 삭제 확인 다이얼로그 (Plan FR-D4 / Design v2.1 §11.1).
 *
 * 한국어 안내: "이 카드를 삭제할까요? 좋아요와 댓글은 남아있어요"
 * (soft delete + placeholder + 좋아요/댓글 보존 정책 — Plan §7.2 결정 #4)
 */

interface StudentDeleteConfirmDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function StudentDeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
}: StudentDeleteConfirmDialogProps) {
  // ESC 키 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-sp-border bg-sp-card p-5 shadow-2xl">
        <header className="flex items-start gap-2">
          <span className="material-symbols-outlined text-[24px] text-rose-400">
            delete
          </span>
          <div className="flex-1">
            <h2 id="student-delete-title" className="text-base font-bold text-sp-text">
              이 카드를 삭제할까요?
            </h2>
            <p className="mt-1 text-xs text-sp-muted">
              좋아요와 댓글은 그대로 남아있어요. 선생님이 다시 살릴 수 있어요.
            </p>
          </div>
        </header>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted transition hover:border-sp-accent hover:text-sp-accent"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-600"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
