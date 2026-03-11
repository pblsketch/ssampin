import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import type { ConsultationSchedule } from '@domain/entities/Consultation';
import type { RecordPrefill } from '../HomeroomPage';
import { ConsultationCreateModal } from './ConsultationCreateModal';
import { ConsultationDetail } from './ConsultationDetail';

/* ──────────────── 헬퍼 함수 ──────────────── */

function getMethodLabel(m: string): string {
  switch (m) {
    case 'face': return '대면';
    case 'phone': return '전화';
    case 'video': return '화상';
    default: return m;
  }
}

function getTypeLabel(t: string): string {
  return t === 'parent' ? '학부모' : '학생';
}

function formatDateRange(dates: readonly { date: string; startTime: string; endTime: string }[]): string {
  if (dates.length === 0) return '';
  if (dates.length === 1) {
    const d = dates[0]!;
    return `${d.date.slice(5).replace('-', '/')} ${d.startTime}~${d.endTime}`;
  }
  return `${dates[0]!.date.slice(5).replace('-', '/')} 외 ${dates.length - 1}일`;
}

/* ──────────────── ConsultationCard ──────────────── */

interface ConsultationCardProps {
  schedule: ConsultationSchedule;
  onSelect: (id: string) => void;
}

function ConsultationCard({ schedule, onSelect }: ConsultationCardProps) {
  const typeLabel = getTypeLabel(schedule.type);
  const methodLabels = schedule.methods.map(getMethodLabel).join(', ');
  const dateRange = formatDateRange(schedule.dates);

  const totalSlots = useMemo(() => {
    let count = 0;
    for (const d of schedule.dates) {
      const [sh, sm] = d.startTime.split(':').map(Number);
      const [eh, em] = d.endTime.split(':').map(Number);
      const start = (sh ?? 0) * 60 + (sm ?? 0);
      const end = (eh ?? 0) * 60 + (em ?? 0);
      if (end > start) {
        count += Math.floor((end - start) / schedule.slotMinutes);
      }
    }
    return count;
  }, [schedule.dates, schedule.slotMinutes]);

  return (
    <button
      onClick={() => onSelect(schedule.id)}
      className="w-full text-left rounded-xl border border-sp-border p-4 transition-all hover:border-sp-accent/50 hover:shadow-lg bg-sp-accent/5"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-sp-accent/20 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-sp-accent text-lg">
            {schedule.type === 'parent' ? 'family_restroom' : 'person'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-sp-text truncate">{schedule.title}</h4>
            <span className="text-xs text-sp-muted whitespace-nowrap">{totalSlots}슬롯</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-sp-muted flex-wrap">
            <span>{typeLabel} 상담</span>
            <span>·</span>
            <span>{methodLabels}</span>
            <span>·</span>
            <span>{schedule.slotMinutes}분</span>
          </div>
          {dateRange && (
            <div className="text-xs text-sp-muted mt-1">
              <span className="material-symbols-outlined text-xs align-middle mr-0.5">calendar_today</span>
              {dateRange}
            </div>
          )}
          {/* 예약 링크 공유 */}
          <div className="mt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(schedule.shareUrl);
              }}
              className="text-[11px] text-sp-accent hover:text-sp-accent/80 transition-colors"
            >
              🔗 예약 링크 공유
            </button>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ──────────────── ConsultationTab ──────────────── */

interface ConsultationTabProps {
  onWriteRecord?: (prefill: RecordPrefill) => void;
}

export function ConsultationTab({ onWriteRecord }: ConsultationTabProps) {
  const { schedules, loaded, load } = useConsultationStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const activeSchedules = useMemo(
    () => schedules.filter((s) => !s.isArchived),
    [schedules],
  );

  const archivedSchedules = useMemo(
    () => schedules.filter((s) => s.isArchived),
    [schedules],
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedScheduleId(id);
    setView('detail');
  }, []);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  /* 상세 화면 */
  if (view === 'detail' && selectedScheduleId) {
    const schedule = schedules.find((s) => s.id === selectedScheduleId);
    if (schedule) {
      return (
        <ConsultationDetail
          schedule={schedule}
          onBack={() => { setView('list'); setSelectedScheduleId(null); }}
          onWriteRecord={onWriteRecord}
        />
      );
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">event_available</span>
          상담 예약
          {activeSchedules.length > 0 && (
            <span className="text-sp-muted font-normal">({activeSchedules.length}개)</span>
          )}
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새 상담 일정
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {activeSchedules.length === 0 && archivedSchedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
            <span className="text-4xl">📅</span>
            <p className="text-sm font-medium">아직 상담 일정이 없습니다</p>
            <p className="text-xs">위의 &quot;새 상담 일정&quot; 버튼으로 첫 일정을 만들어보세요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 진행 중 */}
            {activeSchedules.length > 0 && (
              <>
                <p className="text-xs text-sp-muted font-medium px-1">
                  진행 중 ({activeSchedules.length})
                </p>
                {activeSchedules.map((s) => (
                  <ConsultationCard key={s.id} schedule={s} onSelect={handleSelect} />
                ))}
              </>
            )}

            {/* 완료/보관 */}
            {archivedSchedules.length > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors px-1 mt-2"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showArchived ? 'expand_less' : 'expand_more'}
                  </span>
                  완료/보관 ({archivedSchedules.length})
                </button>
                {showArchived && archivedSchedules.map((s) => (
                  <ConsultationCard key={s.id} schedule={s} onSelect={handleSelect} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <ConsultationCreateModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
