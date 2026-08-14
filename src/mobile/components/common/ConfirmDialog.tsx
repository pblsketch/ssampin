import type { ReactNode } from 'react';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';

interface ConfirmDialogProps {
  /** 다이얼로그 제목. */
  title: string;
  /** 본문(문자열 또는 조립된 노드). */
  message: ReactNode;
  /** 확인 버튼 라벨. 기본 "삭제". */
  confirmLabel?: string;
  /** 취소 버튼 라벨. 기본 "취소". */
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 삭제 등 파괴적 동작 확인 다이얼로그 (중앙 정렬 모달).
 * ClassProgressTab·ClassObservationTab 의 ConfirmDeleteDialog 가 문구·데이터만 다르고
 * 셸·버튼·className 이 동일했던 것을 공용화. 문구는 호출부에서 prop 으로 조립한다.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '삭제',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useBottomSheet(true, onCancel);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-sp-card border border-sp-border rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sp-text font-bold text-base mb-2">{title}</h3>
        <p className="text-sp-muted text-sm mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg"
            style={{ minHeight: 44 }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm text-white bg-sp-error hover:opacity-90 rounded-lg font-medium"
            style={{ minHeight: 44 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
