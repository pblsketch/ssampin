import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
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

/* ──────────────── ConsultationShareModal ──────────────── */

interface ConsultationShareModalProps {
  schedule: ConsultationSchedule;
  onClose: () => void;
}

function ConsultationShareModal({ schedule, onClose }: ConsultationShareModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showToast = useToastStore((s) => s.show);
  const url = schedule.shareUrl;

  useEffect(() => {
    if (!canvasRef.current || !url) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      color: { dark: '#1a2332', light: '#ffffff' },
    });
  }, [url]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('링크가 복사되었습니다', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('링크가 복사되었습니다', 'success');
    }
  }, [url, showToast]);

  const handleDownloadQR = useCallback(() => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `상담_QR_${schedule.title.slice(0, 20)}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    showToast('QR 이미지가 저장되었습니다', 'success');
  }, [schedule.title, showToast]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-sp-border">
          <h3 className="text-sm font-bold text-sp-text">상담 예약 공유</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
        <div className="p-5 flex flex-col items-center gap-4">
          <p className="text-xs text-sp-muted text-center">{schedule.title}</p>
          <div className="bg-white rounded-xl p-3">
            <canvas ref={canvasRef} />
          </div>
          <div className="w-full flex items-center gap-2 bg-sp-surface rounded-lg border border-sp-border px-3 py-2">
            <span className="material-symbols-outlined text-sm text-sp-muted">link</span>
            <span className="flex-1 text-xs text-sp-text truncate select-all">{url}</span>
            <button onClick={handleCopyLink} className="shrink-0 text-xs text-sp-accent hover:text-sp-accent/80 font-medium transition-colors">
              복사
            </button>
          </div>
          <div className="w-full grid grid-cols-2 gap-2">
            <button onClick={handleCopyLink} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors">
              <span className="material-symbols-outlined text-sm">content_copy</span>
              링크 복사
            </button>
            <button onClick={handleDownloadQR} className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent/50 transition-colors">
              <span className="material-symbols-outlined text-sm">download</span>
              QR 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────── ConsultationCard ──────────────── */

interface ConsultationCardProps {
  schedule: ConsultationSchedule;
  onSelect: (id: string) => void;
  onShare: (schedule: ConsultationSchedule) => void;
}

function ConsultationCard({ schedule, onSelect, onShare }: ConsultationCardProps) {
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(schedule.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(schedule.id); }}
      className="w-full text-left rounded-xl border border-sp-border p-4 transition-all hover:border-sp-accent/50 hover:shadow-lg bg-sp-accent/5 cursor-pointer"
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
                onShare(schedule);
              }}
              className="text-[11px] text-sp-accent hover:text-sp-accent/80 transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">share</span>
              공유 (링크 + QR)
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const [shareSchedule, setShareSchedule] = useState<ConsultationSchedule | null>(null);

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

  const handleShare = useCallback((schedule: ConsultationSchedule) => {
    setShareSchedule(schedule);
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
                  <ConsultationCard key={s.id} schedule={s} onSelect={handleSelect} onShare={handleShare} />
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
                  <ConsultationCard key={s.id} schedule={s} onSelect={handleSelect} onShare={handleShare} />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <ConsultationCreateModal onClose={() => setShowCreateModal(false)} />
      )}

      {shareSchedule && (
        <ConsultationShareModal schedule={shareSchedule} onClose={() => setShareSchedule(null)} />
      )}
    </div>
  );
}
