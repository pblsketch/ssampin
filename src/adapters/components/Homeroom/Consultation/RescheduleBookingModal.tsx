import { useCallback, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { ConsultationBooking, ConsultationSchedule } from '@domain/entities/Consultation';
import type {
  SlotPublic,
  BookingPublic,
} from '@infrastructure/supabase/ConsultationSupabaseClient';

interface RescheduleBookingModalProps {
  schedule: ConsultationSchedule;
  booking: ConsultationBooking | BookingPublic;
  /** 현재 슬롯 */
  currentSlot: Pick<SlotPublic, 'id' | 'date' | 'startTime' | 'endTime'>;
  /** ConsultationDetail 폴링으로 받은 슬롯 목록 — props 로 주입 */
  slots: readonly SlotPublic[];
  /** 학생 이름 (있으면 헤더에 표시) */
  studentName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function formatDateLabel(d: string): string {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return `${date.getMonth() + 1}/${date.getDate()} (${DAY_LABELS[date.getDay()]})`;
}

export function RescheduleBookingModal({
  schedule,
  booking,
  currentSlot,
  slots,
  studentName,
  onClose,
  onSuccess,
}: RescheduleBookingModalProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const showToast = useToastStore((s) => s.show);

  /** 본인 현재 슬롯 + 가용 슬롯만 후보 — booked/blocked 슬롯은 비활성 라벨로 표시 */
  const grouped = useMemo(() => {
    const byDate = new Map<string, SlotPublic[]>();
    for (const s of slots) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s);
      byDate.set(s.date, arr);
    }
    const dates = [...byDate.keys()].sort();
    return dates.map((date) => ({
      date,
      slots: (byDate.get(date) ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  }, [slots]);

  const isCandidate = useCallback(
    (slot: SlotPublic): boolean => {
      if (slot.id === currentSlot.id) return true;
      return slot.status === 'available';
    },
    [currentSlot.id],
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedSlotId) {
      showToast('변경할 시간대를 선택해주세요', 'info');
      return;
    }
    if (selectedSlotId === currentSlot.id) {
      showToast('현재 예약과 같은 시간대입니다', 'info');
      return;
    }

    setSubmitting(true);
    const result = await useConsultationStore
      .getState()
      .rescheduleBooking(schedule.id, booking.id, selectedSlotId);
    setSubmitting(false);

    if (result.ok) {
      showToast('예약 시간이 변경되었습니다', 'success');
      onSuccess();
    } else {
      showToast(result.reason, 'error');
    }
  }, [selectedSlotId, currentSlot.id, schedule.id, booking.id, onSuccess, showToast]);

  const studentLabel = studentName
    ? `${booking.studentNumber}번 ${studentName}`
    : `${booking.studentNumber}번`;

  return (
    <Modal isOpen onClose={onClose} title="상담 시간 변경" size="md">
      <div className="flex flex-col flex-1 min-h-0 px-6 pb-6 pt-2 gap-4">
        <div className="text-sm text-sp-text">
          <span className="font-medium">{studentLabel}</span>
          <span className="text-sp-muted"> · </span>
          현재 예약:{' '}
          <span className="text-sp-muted">
            {formatDateLabel(currentSlot.date)} {currentSlot.startTime}~{currentSlot.endTime}
          </span>
        </div>

        <p className="text-xs text-sp-muted leading-relaxed">
          변경할 시간대를 선택해주세요. 다른 학부모님이 예약한 시간대는 선택할 수 없습니다. 변경 후
          학부모님께는 별도로 안내해 주세요.
        </p>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3 -mx-2 px-2">
          {grouped.map((group) => (
            <div key={group.date} className="flex flex-col gap-1">
              <div className="text-xs font-medium text-sp-muted px-1">
                {formatDateLabel(group.date)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {group.slots.map((slot) => {
                  const candidate = isCandidate(slot);
                  const isCurrent = slot.id === currentSlot.id;
                  const isSelected = selectedSlotId === slot.id;
                  const isBookedByOther = slot.status === 'booked' && !isCurrent;
                  const isBlocked = slot.status === 'blocked';

                  const label = `${slot.startTime}~${slot.endTime}`;
                  const subLabel = isCurrent
                    ? '현재 예약'
                    : isBookedByOther
                      ? '다른 예약'
                      : isBlocked
                        ? '차단됨'
                        : null;

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!candidate || submitting}
                      onClick={() => setSelectedSlotId(slot.id)}
                      className={[
                        'text-left rounded-lg border px-3 py-2 text-xs transition-colors',
                        isSelected
                          ? 'border-sp-accent bg-sp-accent/15 text-sp-text'
                          : candidate
                            ? 'border-sp-border bg-sp-surface hover:border-sp-accent/50 text-sp-text'
                            : 'border-sp-border/50 bg-sp-surface/40 text-sp-muted cursor-not-allowed',
                      ].join(' ')}
                    >
                      <div className="font-medium">{label}</div>
                      {subLabel && (
                        <div className="text-detail text-sp-muted mt-0.5">{subLabel}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-sm text-sp-muted text-center py-8">선택 가능한 시간대가 없습니다.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-sp-border/40">
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
            disabled={!selectedSlotId || selectedSlotId === currentSlot.id || submitting}
            className="px-3 py-2 rounded-lg bg-sp-accent hover:bg-sp-accent/90 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '변경 중…' : '시간 변경하기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
