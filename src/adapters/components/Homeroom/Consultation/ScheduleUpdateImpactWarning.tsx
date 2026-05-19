import type { ScheduleUpdateImpact } from '@domain/entities/Consultation';

interface ScheduleUpdateImpactWarningProps {
  impact: ScheduleUpdateImpact;
  /** 영향 예약 자동 취소 후 진행 */
  onProceed: () => void;
  /** 수정 취소 (모달 닫기 또는 폼 복귀) */
  onCancel: () => void;
  submitting?: boolean;
}

const REASON_LABEL: Record<ScheduleUpdateImpact['affected'][number]['reason'], string> = {
  slot_removed: '해당 시간대가 사라짐',
  slot_blocked: '해당 시간대가 차단됨',
  method_unsupported: '예약 방식이 더 이상 지원되지 않음',
};

export function ScheduleUpdateImpactWarning({
  impact,
  onProceed,
  onCancel,
  submitting = false,
}: ScheduleUpdateImpactWarningProps) {
  if (impact.affected.length === 0) return null;

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-red-400 text-base mt-0.5">warning</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">
            아래 예약이 이번 변경으로 영향을 받습니다 ({impact.affected.length}건)
          </p>
          <p className="text-xs text-sp-muted mt-1 leading-relaxed">
            진행을 선택하면 영향 예약이 자동으로 취소됩니다. 학부모님께는 별도로 안내해 주세요.
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 text-xs text-sp-text bg-sp-surface/60 rounded-lg border border-sp-border/40 p-3">
        {impact.affected.map(({ booking, reason }) => (
          <li key={booking.id} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xs text-red-400/80">error</span>
            <span className="font-medium">{booking.studentNumber}번</span>
            <span className="text-sp-muted">·</span>
            <span className="text-sp-muted">{REASON_LABEL[reason]}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text disabled:opacity-50"
        >
          수정 취소
        </button>
        <button
          type="button"
          onClick={onProceed}
          disabled={submitting}
          className="px-3 py-2 rounded-lg bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {submitting ? '진행 중…' : '그대로 진행 (영향 예약 자동 취소)'}
        </button>
      </div>
    </div>
  );
}
