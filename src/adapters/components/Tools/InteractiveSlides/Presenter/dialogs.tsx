/**
 * Presenter 화면용 4종 확인 다이얼로그.
 *
 * Plan UX 리뷰 [2] 안전망 + frontend-architect 설계서 §E 한국어 카피.
 * 모두 Modal.tsx (focus-trap) 사용.
 */

import { Modal } from '@adapters/components/common/Modal';

interface BaseDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

// ─────────────────────────────────────────────────────────────
// E-1: 활동 활성화 확인
// ─────────────────────────────────────────────────────────────
export interface ActivateConfirmDialogProps extends BaseDialogProps {
  readonly onConfirm: () => void;
}

export function ActivateConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
}: ActivateConfirmDialogProps): JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="활동을 시작할까요?"
      size="sm"
    >
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-sp-text">활동을 시작할까요?</h2>
        <p className="text-sm text-sp-muted leading-relaxed">
          활동을 시작하면 학생 화면에 즉시 표시되며,
          진행 중에는 질문이나 선택지를 바꿀 수 없어요.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 bg-sp-accent text-white font-bold rounded-lg text-sm hover:bg-sp-accent/90"
            data-modal-fallback
          >
            활동 시작
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// E-2: 활동 닫기 / 닫고 새로 만들기
// ─────────────────────────────────────────────────────────────
export interface DeactivateConfirmDialogProps extends BaseDialogProps {
  readonly onConfirm: () => void;
  readonly onCloseAndRecreate: () => void;
}

export function DeactivateConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  onCloseAndRecreate,
}: DeactivateConfirmDialogProps): JSX.Element {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="활동을 종료할까요?" size="sm">
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-sp-text">활동을 종료할까요?</h2>
        <p className="text-sm text-sp-muted leading-relaxed">
          종료 후 학생 응답은 저장되고,
          선택한 공개 모드로 결과가 표시됩니다.
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="w-full px-4 py-2 bg-sp-accent text-white font-bold rounded-lg text-sm hover:bg-sp-accent/90"
            data-modal-fallback
          >
            활동 종료
          </button>
          <button
            type="button"
            onClick={() => {
              onCloseAndRecreate();
              onClose();
            }}
            className="w-full px-4 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent"
          >
            닫고 새로 만들기 (위치·타입 유지)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-sp-muted hover:text-sp-text"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// E-4: 수업 종료
// ─────────────────────────────────────────────────────────────
export interface EndLessonConfirmDialogProps extends BaseDialogProps {
  readonly onConfirm: () => void;
}

export function EndLessonConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
}: EndLessonConfirmDialogProps): JSX.Element {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="수업을 종료할까요?" size="sm">
      <div className="p-6 space-y-4">
        <h2 className="text-lg font-bold text-sp-text">수업을 종료할까요?</h2>
        <p className="text-sm text-sp-muted leading-relaxed">
          진행 중인 활동이 자동으로 닫히고, 학생 화면에 종료 안내가 표시됩니다.
          <br />
          응답 데이터는 수업 후 180일 자동 삭제됩니다.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 bg-red-500 text-white font-bold rounded-lg text-sm hover:bg-red-500/90"
            data-modal-fallback
          >
            수업 종료
          </button>
        </div>
      </div>
    </Modal>
  );
}
