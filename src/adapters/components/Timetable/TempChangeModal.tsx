import { useState } from 'react';
import type { TimetableOverride } from '@domain/entities/Timetable';

const REASON_PRESETS = ['수업 교환', '자습', '시험', '행사', '보충수업', '출장', '기타'] as const;

interface TempChangeModalProps {
  date: string;
  period: number;
  currentSubject: string;
  currentClassroom?: string;
  onSave: (override: Omit<TimetableOverride, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

export function TempChangeModal({
  date,
  period,
  currentSubject,
  currentClassroom,
  onSave,
  onClose,
}: TempChangeModalProps) {
  const [subject, setSubject] = useState(currentSubject);
  const [classroom, setClassroom] = useState(currentClassroom ?? '');
  const [reason, setReason] = useState('');

  const displayDate = date.replace(/-/g, '.');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-sp-text mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400 text-lg">push_pin</span>
          임시 시간표 변경
        </h3>
        <p className="text-xs text-sp-muted mb-4">
          {displayDate} {period}교시만 변경됩니다. 기본 시간표에는 영향 없습니다.
        </p>

        {/* 변경할 과목 */}
        <label className="block text-xs font-medium text-sp-muted mb-1">변경할 과목</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="비우면 공강/자습"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 mb-3"
          autoFocus
        />

        {/* 교실 (선택) */}
        <label className="block text-xs font-medium text-sp-muted mb-1">교실 (선택)</label>
        <input
          type="text"
          value={classroom}
          onChange={(e) => setClassroom(e.target.value)}
          placeholder="교실"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 mb-3"
        />

        {/* 사유 프리셋 */}
        <label className="block text-xs font-medium text-sp-muted mb-1.5">변경 사유</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {REASON_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason((prev) => (prev === r ? '' : r))}
              className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                reason === r
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent font-medium'
                  : 'border-sp-border text-sp-muted hover:border-sp-muted hover:text-sp-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* 저장/취소 */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              onSave({
                date,
                period,
                subject,
                classroom: classroom || undefined,
                reason: reason || undefined,
              });
              onClose();
            }}
            className="flex-1 py-2.5 text-sm font-bold bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-all active:scale-95"
          >
            변경
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-bold bg-sp-surface border border-sp-border text-sp-muted rounded-lg hover:text-sp-text transition-all"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
