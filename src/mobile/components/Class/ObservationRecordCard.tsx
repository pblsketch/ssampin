import { formatDateLabel } from '@mobile/utils/date';
import type { ObservationRecord } from '@domain/entities/Observation';

interface ObservationRecordCardProps {
  record: ObservationRecord;
  onAction: () => void;
}

export function ObservationRecordCard({ record, onAction }: ObservationRecordCardProps) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sp-muted text-xs mb-1">{formatDateLabel(record.date)}</p>
          <p className="text-sp-text text-sm leading-relaxed whitespace-pre-wrap break-words">
            {record.content}
          </p>
          {record.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {record.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full bg-sp-surface border border-sp-border text-sp-muted text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onAction}
          className="flex items-center justify-center shrink-0 text-sp-muted active:text-sp-text"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="기록 메뉴"
        >
          <span className="material-symbols-outlined text-xl">more_vert</span>
        </button>
      </div>
    </div>
  );
}
