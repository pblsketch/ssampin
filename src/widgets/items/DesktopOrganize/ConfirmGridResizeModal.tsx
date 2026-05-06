import { Modal } from '@adapters/components/common/Modal';
import type { GridResizePlan } from '@usecases/desktopOrganize/computeGridResizePlan';

interface ConfirmGridResizeModalProps {
  readonly isOpen: boolean;
  readonly plan: GridResizePlan | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * 그리드 축소 시 잘리는 박스 제목이 있을 때 사용자 확인 모달.
 * 5초 undo 윈도우는 토스트로 별도 제공 (이 모달은 명시적 confirm gate).
 */
export function ConfirmGridResizeModal({
  isOpen,
  plan,
  onCancel,
  onConfirm,
}: ConfirmGridResizeModalProps) {
  if (!plan) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="그리드 변경 확인" size="sm">
      <div className="p-5">
        <h2 className="text-base font-bold text-sp-text mb-3">
          그리드를 작게 만들면 일부 박스가 사라져요
        </h2>
        <p className="text-sm text-sp-muted mb-3">
          {plan.from.cols}×{plan.from.rows} → {plan.to.cols}×{plan.to.rows}로 변경하면
          다음 박스의 제목이 사라집니다:
        </p>
        <ul className="text-sm text-sp-text mb-4 space-y-1 max-h-40 overflow-y-auto">
          {plan.truncated.map((t) => (
            <li key={t.index} className="flex items-baseline gap-2">
              <span className="text-sp-muted shrink-0">박스 {t.index + 1}:</span>
              <span className="font-medium truncate">"{t.title}"</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors motion-reduce:transition-none"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-sm font-medium text-white transition-colors motion-reduce:transition-none"
          >
            계속 진행
          </button>
        </div>
      </div>
    </Modal>
  );
}
