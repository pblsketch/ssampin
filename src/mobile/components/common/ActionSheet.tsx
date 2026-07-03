import { useBottomSheet } from '@mobile/hooks/useBottomSheet';

interface ActionSheetProps {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * 편집/삭제/취소 액션시트 (Bottom-Sheet 스타일).
 * ClassProgressTab·ClassObservationTab 에서 바이트 단위로 동일했던 구현을 공용화.
 */
export function ActionSheet({ onEdit, onDelete, onClose }: ActionSheetProps) {
  useBottomSheet();
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 pt-2 flex justify-center">
          <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
        </div>
        <button
          onClick={onEdit}
          className="w-full flex items-center gap-3 px-5 py-4 text-left text-sp-text active:bg-sp-surface"
          style={{ minHeight: 52 }}
        >
          <span className="material-symbols-outlined text-sp-accent">edit</span>
          <span className="text-sm font-medium">편집</span>
        </button>
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-3 px-5 py-4 text-left text-red-400 active:bg-sp-surface"
          style={{ minHeight: 52 }}
        >
          <span className="material-symbols-outlined">delete</span>
          <span className="text-sm font-medium">삭제</span>
        </button>
        <div className="border-t border-sp-border">
          <button
            onClick={onClose}
            className="w-full px-5 py-4 text-sp-muted text-sm font-medium"
            style={{ minHeight: 52 }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
