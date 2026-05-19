import { useCallback, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type {
  ConsultationBooking,
  ConsultationSchedule,
  ConsultationSlot,
} from '@domain/entities/Consultation';

interface CancelBookingConfirmDialogProps {
  schedule: ConsultationSchedule;
  booking: ConsultationBooking;
  slot?: Pick<ConsultationSlot, 'date' | 'startTime' | 'endTime'>;
  studentName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function formatDate(d: string): string {
  return d.slice(5).replace('-', '/');
}

export function CancelBookingConfirmDialog({
  schedule,
  booking,
  slot,
  studentName,
  onClose,
  onSuccess,
}: CancelBookingConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToastStore((s) => s.show);

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    const result = await useConsultationStore.getState().cancelBooking(schedule.id, booking.id);
    setSubmitting(false);

    if (result.ok) {
      showToast('예약이 취소되었습니다', 'success');
      onSuccess();
    } else {
      showToast(result.reason, 'error');
    }
  }, [schedule.id, booking.id, onSuccess, showToast]);

  const studentLabel = studentName
    ? `${booking.studentNumber}번 ${studentName}`
    : `${booking.studentNumber}번`;
  const slotLabel = slot ? `${formatDate(slot.date)} ${slot.startTime}~${slot.endTime}` : '';

  return (
    <Modal isOpen onClose={onClose} title="예약 취소" size="sm">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
        <div className="text-sm text-sp-text">
          <span className="font-medium">{studentLabel}</span>
          {slotLabel && (
            <>
              {' '}
              <span className="text-sp-muted">·</span>{' '}
              <span className="text-sp-muted">{slotLabel}</span>
            </>
          )}
          의 예약을 취소할까요?
        </div>
        <p className="text-xs text-sp-muted leading-relaxed">
          취소하면 해당 시간대가 다시 가능 상태로 돌아가 다른 학부모님이 예약할 수 있습니다.
          학부모님께는 별도로 안내해 주세요.
        </p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="px-3 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '취소 중…' : '예약 취소하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
