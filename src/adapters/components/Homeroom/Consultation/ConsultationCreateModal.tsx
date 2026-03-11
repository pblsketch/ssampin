import { useState, useCallback, useMemo, useEffect } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { consultationSupabaseClient } from '@adapters/di/container';
import type { ConsultationType, ConsultationMethod } from '@domain/entities/Consultation';

/* ──────────────── 타입 ──────────────── */

interface ConsultationCreateModalProps {
  onClose: () => void;
}

interface DateEntry {
  date: string;
  startTime: string;
  endTime: string;
}

/* ──────────────── 상수 ──────────────── */

const TYPE_OPTIONS: { value: ConsultationType; label: string; icon: string }[] = [
  { value: 'parent', label: '학부모 상담', icon: '👨‍👩‍👧' },
  { value: 'student', label: '학생 상담', icon: '🙋' },
];

const METHOD_OPTIONS: { value: ConsultationMethod; label: string; icon: string }[] = [
  { value: 'face', label: '대면', icon: 'groups' },
  { value: 'phone', label: '전화', icon: 'call' },
  { value: 'video', label: '화상', icon: 'videocam' },
];

const SLOT_PRESETS = [10, 15, 20, 30, 60];

/* ──────────────── 유틸 ──────────────── */

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/* ──────────────── 컴포넌트 ──────────────── */

export function ConsultationCreateModal({ onClose }: ConsultationCreateModalProps) {
  const { createSchedule } = useConsultationStore();
  const showToast = useToastStore((s) => s.show);
  const { students } = useStudentStore();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ConsultationType>('parent');
  const [methods, setMethods] = useState<ConsultationMethod[]>(['face']);
  const [slotMinutes, setSlotMinutes] = useState(15);
  const [customSlot, setCustomSlot] = useState(false);
  const [customSlotValue, setCustomSlotValue] = useState('');
  const [dates, setDates] = useState<DateEntry[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /* ── 방식 토글 ── */

  const toggleMethod = useCallback((m: ConsultationMethod) => {
    setMethods((prev) =>
      prev.includes(m) ? prev.filter((v) => v !== m) : [...prev, m],
    );
  }, []);

  /* ── 날짜 조작 ── */

  const addDate = useCallback(() => {
    setDates((prev) => [...prev, { date: '', startTime: '09:00', endTime: '17:00' }]);
  }, []);

  const updateDate = useCallback((idx: number, field: keyof DateEntry, value: string) => {
    setDates((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  }, []);

  const removeDate = useCallback((idx: number) => {
    setDates((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── 슬롯 미리보기 ── */

  const slotPreview = useMemo(() => {
    return dates.map((d) => {
      if (!d.date || !d.startTime || !d.endTime) return { ...d, count: 0 };
      const start = parseTimeToMinutes(d.startTime);
      const end = parseTimeToMinutes(d.endTime);
      const count = start < end ? Math.floor((end - start) / slotMinutes) : 0;
      return { ...d, count };
    });
  }, [dates, slotMinutes]);

  const totalSlots = slotPreview.reduce((sum, d) => sum + d.count, 0);

  /* ── 유효성 ── */

  const canSubmit =
    title.trim().length > 0 &&
    methods.length > 0 &&
    dates.length > 0 &&
    totalSlots > 0 &&
    isOnline &&
    !saving;

  /* ── 생성 ── */

  const handleCreate = useCallback(async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const schedule = await createSchedule({
        title: title.trim(),
        type,
        methods,
        slotMinutes,
        dates: dates.filter((d) => d.date && d.startTime && d.endTime),
        targetClassName: '',
        targetStudents: students.filter((s) => !s.isVacant).map((_, i) => ({ number: i + 1 })),
        message: message.trim() || undefined,
      });

      await consultationSupabaseClient.createSchedule({
        id: schedule.id,
        title: schedule.title,
        type: schedule.type,
        methods: schedule.methods,
        slotMinutes: schedule.slotMinutes,
        dates: schedule.dates,
        targetClassName: schedule.targetClassName,
        targetStudents: schedule.targetStudents,
        message: schedule.message,
        adminKey: schedule.adminKey,
      });

      showToast('상담 일정이 생성되었습니다', 'success');
      onClose();
    } catch {
      showToast('상담 일정 생성에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }, [canSubmit, title, type, methods, slotMinutes, dates, message, createSchedule, showToast, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-sp-border shrink-0">
          <h3 className="text-lg font-bold text-sp-text">새 상담 일정</h3>
          <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {/* 제목 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">제목 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 3월 학부모 상담주간"
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
              maxLength={60}
            />
          </div>

          {/* 유형 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">유형</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                    type === opt.value
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 상담 방식 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">상담 방식 *</label>
            <div className="flex gap-2">
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleMethod(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    methods.includes(opt.value)
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {methods.length === 0 && (
              <p className="text-[10px] text-amber-400 mt-1">상담 방식을 최소 1개 선택하세요</p>
            )}
          </div>

          {/* 시간 단위 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">슬롯 단위</label>
            <div className="flex flex-wrap gap-2">
              {SLOT_PRESETS.map((mins) => (
                <button
                  key={mins}
                  onClick={() => { setSlotMinutes(mins); setCustomSlot(false); }}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    slotMinutes === mins && !customSlot
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {mins >= 60 ? `${mins / 60}시간` : `${mins}분`}
                </button>
              ))}
              <button
                onClick={() => { setCustomSlot(true); setCustomSlotValue(String(slotMinutes)); }}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  customSlot
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                }`}
              >
                직접 입력
              </button>
            </div>
            {customSlot && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customSlotValue}
                  onChange={(e) => {
                    setCustomSlotValue(e.target.value);
                    const v = parseInt(e.target.value, 10);
                    if (v >= 5 && v <= 180) setSlotMinutes(v);
                  }}
                  className="w-20 bg-sp-surface border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                  placeholder="분"
                  autoFocus
                />
                <span className="text-xs text-sp-muted">분 (5~180)</span>
              </div>
            )}
          </div>

          {/* 상담 날짜 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              상담 날짜 * ({dates.length}일)
            </label>
            <div className="flex flex-col gap-2">
              {slotPreview.map((d, idx) => {
                const isInvalid = d.date !== '' && d.startTime >= d.endTime;
                return (
                  <div key={idx} className="bg-sp-surface rounded-lg p-3 border border-sp-border flex flex-col gap-2">
                    {/* 1줄: 날짜 + 삭제 */}
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d.date}
                        onChange={(e) => updateDate(idx, 'date', e.target.value)}
                        className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                      />
                      <button
                        onClick={() => removeDate(idx)}
                        className="text-sp-muted hover:text-red-400 transition-colors shrink-0"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                    {/* 2줄: 시간 범위 + 슬롯 수 */}
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={d.startTime}
                        onChange={(e) => updateDate(idx, 'startTime', e.target.value)}
                        className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                      />
                      <span className="text-sp-muted text-xs">~</span>
                      <input
                        type="time"
                        value={d.endTime}
                        onChange={(e) => updateDate(idx, 'endTime', e.target.value)}
                        className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                      />
                      <span className="text-xs text-sp-muted shrink-0">
                        → <span className={d.count > 0 ? 'text-sp-accent font-medium' : 'text-sp-muted'}>{d.count}슬롯</span>
                      </span>
                    </div>
                    {isInvalid && (
                      <p className="text-[10px] text-amber-400">종료 시간이 시작 시간보다 이전입니다</p>
                    )}
                  </div>
                );
              })}

              <button
                onClick={addDate}
                className="flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-sp-border text-xs text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                날짜 추가
              </button>
            </div>

            {/* 총 슬롯 요약 */}
            {dates.length > 0 && (
              <div className="mt-2 px-3 py-2 bg-sp-surface rounded-lg border border-sp-border">
                <span className="text-xs text-sp-muted">
                  총{' '}
                  <span className={totalSlots > 0 ? 'text-sp-text font-medium' : 'text-amber-400'}>
                    {totalSlots}슬롯
                  </span>
                  {' '}({slotMinutes}분 간격)
                </span>
              </div>
            )}
          </div>

          {/* 안내 메시지 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">안내 메시지 (선택)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예약 페이지에 표시할 안내 문구를 입력하세요"
              rows={3}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors resize-none"
              maxLength={300}
            />
          </div>

          {/* 오프라인 경고 */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-400/10 border border-amber-400/30 rounded-lg">
              <span className="material-symbols-outlined text-base text-amber-400">wifi_off</span>
              <span className="text-xs text-amber-400">인터넷 연결이 필요합니다.</span>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="p-5 border-t border-sp-border flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {saving ? (
              <span className="text-xs">생성 중...</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-base">add</span>
                만들기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
