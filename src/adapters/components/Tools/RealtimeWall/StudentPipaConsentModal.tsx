/**
 * v2.1 신규 — PIPA(개인정보보호법) 동의 모달 (Plan FR-B11 / Design v2.1 §5.9).
 *
 * 첫 이미지 첨부 시점에 1회 표시. localStorage 플래그
 * `ssampin-pipa-consent-shown`로 학기 동안 재표시 방지.
 *
 * 친구 사진 / 신분 식별 가능 사진 등 동의 책임 안내 (학생 자율).
 *
 * 2026-04-25: 공통 Modal로 마이그레이션 (focus trap + body lock + ESC + ARIA).
 */
import { Modal } from '@adapters/components/common/Modal';

interface StudentPipaConsentModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function StudentPipaConsentModal({
  open,
  onClose,
  onConfirm,
}: StudentPipaConsentModalProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="사진을 올리기 전에 잠깐!" srOnlyTitle size="sm">
      <div className="p-5">
        <h3 className="text-base font-bold text-sp-text mb-2">
          사진을 올리기 전에 잠깐!
        </h3>
        <ul className="text-sm text-sp-muted space-y-1.5 mb-4 list-disc list-inside">
          <li>다른 친구가 나오는 사진은 그 친구의 동의가 필요해요.</li>
          <li>얼굴이나 이름표 같은 신분이 드러나는 사진은 신중하게 올려주세요.</li>
          <li>장난이나 놀림으로 쓰일 수 있는 사진은 올리지 않아요.</li>
        </ul>
        <p className="text-xs text-sp-muted/80 mb-4">
          이 안내는 한 번만 보여요.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-sp-border px-4 py-2 text-xs text-sp-muted hover:bg-sp-surface"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-sp-accent px-4 py-2 text-xs font-bold text-sp-accent-fg hover:bg-sp-accent/90"
          >
            확인했어요
          </button>
        </div>
      </div>
    </Modal>
  );
}
