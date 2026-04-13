import type { AttendanceReason, AttendanceStatus } from '@domain/entities/Attendance';
import { ATTENDANCE_REASONS } from '@domain/entities/Attendance';

export interface AttendanceDetailEditorProps {
  status: AttendanceStatus;
  reason?: AttendanceReason;
  memo?: string;
  onChange: (next: { reason?: AttendanceReason; memo?: string }) => void;
  compact?: boolean;
}

/**
 * 출결 사유 chip + 메모 textarea 조합 컴포넌트.
 * status === 'present' 이면 null 반환 (정상출석에는 사유 불필요).
 * compact=true 이면 인라인용(작게), false 이면 팝오버용(보통 크기).
 */
export function AttendanceDetailEditor({
  status,
  reason,
  memo,
  onChange,
  compact = false,
}: AttendanceDetailEditorProps) {
  if (status === 'present') return null;

  const handleReasonClick = (r: AttendanceReason) => {
    onChange({ reason: reason === r ? undefined : r, memo });
  };

  const handleMemoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ reason, memo: e.target.value });
  };

  return (
    <div className={`flex flex-col gap-1.5 ${compact ? 'pt-1' : 'pt-2'}`}>
      {/* 사유 chip */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className={`text-sp-muted font-medium shrink-0 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          사유
        </span>
        {ATTENDANCE_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => handleReasonClick(r)}
            className={`rounded-lg font-medium transition-colors border ${
              compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
            } ${
              reason === r
                ? 'bg-sp-accent text-white border-sp-accent'
                : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* 메모 textarea */}
      <textarea
        rows={compact ? 1 : 2}
        placeholder="상세 사유 / 메모 (선택)"
        value={memo ?? ''}
        onChange={handleMemoChange}
        className={`w-full bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-sp-text
                   placeholder:text-sp-muted/50 focus:outline-none focus:border-sp-accent resize-none
                   ${compact ? 'text-[10px]' : 'text-xs'}`}
      />
    </div>
  );
}
