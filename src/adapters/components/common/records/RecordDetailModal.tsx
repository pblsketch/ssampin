import { useMemo } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { DateGroupHeader } from './DateGroupHeader';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { ExpandableRecordContent } from './ExpandableRecordContent';
import type { DisplayRecord } from '@adapters/presentation/displayRecord';

interface RecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 모달 제목(예: "김민준 · 결석 2건"). */
  title: string;
  /** 표시할 기록(표시 ViewModel). */
  records: readonly DisplayRecord[];
}

/**
 * 통계 셀 클릭 시 그 수치의 **세부 기록**을 같은 화면에서 보여주는 공용 상세 모달.
 *
 * 도메인 무관 {@link DisplayRecord}만 받으므로 담임(ProgressMode)·수업(ClassRecordStatsView)
 * 양쪽이 동일 모달을 공유한다. 날짜 그룹·출결 배지·내용 펼치기는 공용 부품 재사용.
 */
export function RecordDetailModal({ isOpen, onClose, title, records }: RecordDetailModalProps) {
  const groups = useMemo(() => {
    const map = new Map<string, DisplayRecord[]>();
    for (const r of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
      const arr = map.get(r.date);
      if (arr) arr.push(r);
      else map.set(r.date, [r]);
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
  }, [records]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div className="flex flex-col min-h-0">
        <div className="px-6 pb-4 pt-1 overflow-y-auto">
          {records.length === 0 ? (
            <p className="py-8 text-center text-sm text-sp-muted">해당 기록이 없습니다</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.date}>
                  <DateGroupHeader date={g.date} count={g.items.length} />
                  <div className="space-y-1.5">
                    {g.items.map((r) => (
                      <div
                        key={r.key}
                        className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium text-sp-text">
                            {r.studentName}
                            {r.studentNumber != null && (
                              <span className="text-sp-muted"> {r.studentNumber}번</span>
                            )}
                          </span>
                          {r.status ? (
                            <AttendanceStatusBadge status={r.status} />
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-sp-accent/10 text-sp-accent">
                              {r.kindLabel}
                            </span>
                          )}
                          {r.periodLabel && (
                            <span className="text-xs text-sp-muted">{r.periodLabel}</span>
                          )}
                          {r.reason && <span className="text-xs text-sp-muted">({r.reason})</span>}
                          {r.tags?.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-sp-accent/10 text-sp-accent"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                        {r.content && (
                          <ExpandableRecordContent
                            content={r.content}
                            className="text-sm text-sp-muted leading-relaxed whitespace-pre-wrap"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-3 border-t border-sp-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-sp-surface text-sm text-sp-text hover:bg-sp-surface/70 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
