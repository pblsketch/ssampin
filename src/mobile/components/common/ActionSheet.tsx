import { BottomSheet } from '@mobile/components/common/BottomSheet';

interface ActionSheetProps {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * 편집/삭제/취소 액션시트 (Bottom-Sheet 스타일).
 * ClassProgressTab·ClassObservationTab 에서 바이트 단위로 동일했던 구현을 공용화.
 *
 * 딤·패널·손잡이·FAB 가림 방지 등록은 BottomSheet 껍데기가 담당한다.
 */
export function ActionSheet({ onEdit, onDelete, onClose }: ActionSheetProps) {
  return (
    <BottomSheet onClose={onClose} ariaLabel="편집 또는 삭제 선택">
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
    </BottomSheet>
  );
}
