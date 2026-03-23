import { useState, useMemo } from 'react';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

interface Props {
  events: readonly SchoolEvent[];
  onDelete: (startDate: string, endDate: string) => Promise<number>;
  onClose: () => void;
}

export function BulkDeleteByDateRangeModal({ events, onDelete, onClose }: Props) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const affectedEvents = useMemo(() => {
    if (!startDate || !endDate) return [];
    return events.filter((e) => !e.isHidden && e.date >= startDate && e.date <= endDate);
  }, [events, startDate, endDate]);

  const affectedCount = affectedEvents.length;

  // 외부 연동 일정 수
  const externalCount = useMemo(() => {
    return affectedEvents.filter((e) => e.source === 'neis' || e.source === 'google').length;
  }, [affectedEvents]);

  const isValidRange = startDate && endDate && startDate <= endDate;

  const handleDelete = async () => {
    if (!startDate || !endDate) return;
    setIsDeleting(true);
    const count = await onDelete(startDate, endDate);
    setIsDeleting(false);
    alert(`${count}개의 일정이 삭제되었습니다.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose} aria-hidden="true">
      <div
        className="bg-sp-card border border-sp-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-bulk-delete-date-range"
      >
        <div className="px-6 py-5 border-b border-sp-border">
          <h3 id="modal-title-bulk-delete-date-range" className="text-lg font-bold text-sp-text">기간별 일정 삭제</h3>
          <p className="text-sm text-sp-muted mt-1">
            지정한 기간의 모든 일정을 삭제합니다.
          </p>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs text-sp-muted mb-1.5 font-medium">시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setIsConfirming(false);
                }}
                className="w-full bg-sp-surface border border-sp-border rounded-xl px-3 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent/50 focus:border-sp-accent/50 transition-colors"
              />
            </div>
            <span className="text-sp-muted mt-5">~</span>
            <div className="flex-1">
              <label className="block text-xs text-sp-muted mb-1.5 font-medium">종료일</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setIsConfirming(false);
                }}
                className="w-full bg-sp-surface border border-sp-border rounded-xl px-3 py-2.5 text-sm text-sp-text focus:outline-none focus:ring-1 focus:ring-sp-accent/50 focus:border-sp-accent/50 transition-colors"
              />
            </div>
          </div>

          {/* 미리보기 */}
          {isValidRange && (
            <div className="mt-4 p-3 bg-sp-surface rounded-xl border border-sp-border">
              <p className="text-sm text-sp-text">
                삭제 대상: <span className="font-bold text-red-400">{affectedCount}개</span>
              </p>
            </div>
          )}

          {startDate && endDate && startDate > endDate && (
            <p className="mt-3 text-xs text-red-400">시작일이 종료일보다 이후입니다.</p>
          )}
        </div>

        {/* 확인 영역 */}
        {isValidRange && affectedCount > 0 && (
          <div className="px-6 py-4 border-t border-sp-border">
            {externalCount > 0 && (
              <div className="mb-3 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-xl">
                <p className="text-xs text-yellow-300">
                  <span className="font-bold">주의:</span> 외부 연동 일정 {externalCount}개가 포함되어 있습니다.
                  삭제해도 다음 동기화 시 다시 나타날 수 있습니다.
                </p>
              </div>
            )}

            {!isConfirming ? (
              <button
                type="button"
                onClick={() => setIsConfirming(true)}
                className="w-full py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-semibold transition-colors"
              >
                {affectedCount}개 일정 삭제
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-red-400 font-semibold text-center">
                  정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfirming(false)}
                    className="flex-1 py-2.5 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제 확인'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 하단 닫기 */}
        <div className="px-6 py-4 border-t border-sp-border flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
