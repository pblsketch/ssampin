import { useState, useCallback, useMemo, useEffect } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { consultationSupabaseClient } from '@adapters/di/container';
import type { ConsultationType, ConsultationMethod } from '@domain/entities/Consultation';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

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

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface BreakPreset {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}

function computeBreakPresets(periodTimes: readonly PeriodTime[]): BreakPreset[] {
  if (periodTimes.length === 0) return [];
  const sorted = [...periodTimes].sort((a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start));
  const presets: BreakPreset[] = [];

  // 조례 전
  const firstStart = parseTimeToMinutes(sorted[0]!.start);
  presets.push({
    id: 'before-school',
    label: '조례 전',
    startTime: minutesToTime(Math.max(firstStart - 20, 0)),
    endTime: sorted[0]!.start,
  });

  // 교시 사이 쉬는 시간
  let longestGapIdx = -1;
  let longestGap = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const endMins = parseTimeToMinutes(sorted[i]!.end);
    const nextStartMins = parseTimeToMinutes(sorted[i + 1]!.start);
    const gap = nextStartMins - endMins;
    if (gap > longestGap) {
      longestGap = gap;
      longestGapIdx = i;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    // 수업 시간
    presets.push({
      id: `period-${sorted[i]!.period}`,
      label: `${sorted[i]!.period}교시`,
      startTime: sorted[i]!.start,
      endTime: sorted[i]!.end,
    });

    // 쉬는 시간 (다음 교시가 있는 경우)
    if (i < sorted.length - 1) {
      const endMins = parseTimeToMinutes(sorted[i]!.end);
      const nextStartMins = parseTimeToMinutes(sorted[i + 1]!.start);
      if (nextStartMins <= endMins) continue;
      const isLunch = i === longestGapIdx && longestGap >= 30;
      presets.push({
        id: isLunch ? 'lunch' : `break-${sorted[i]!.period}`,
        label: isLunch ? '점심 시간' : `${sorted[i]!.period}교시 후 쉬는 시간`,
        startTime: sorted[i]!.end,
        endTime: sorted[i + 1]!.start,
      });
    }
  }

  // 종례 후
  const lastEnd = parseTimeToMinutes(sorted[sorted.length - 1]!.end);
  presets.push({
    id: 'after-school',
    label: '종례 후',
    startTime: sorted[sorted.length - 1]!.end,
    endTime: minutesToTime(lastEnd + 30),
  });

  return presets;
}

/* ──────────────── 컴포넌트 ──────────────── */

export function ConsultationCreateModal({ onClose }: ConsultationCreateModalProps) {
  const { createSchedule } = useConsultationStore();
  const showToast = useToastStore((s) => s.show);
  const { students } = useStudentStore();
  const { settings } = useSettingsStore();

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

  // 학생 상담용: 날짜 + 프리셋 체크박스
  const [studentDate, setStudentDate] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());

  const breakPresets = useMemo(
    () => computeBreakPresets(settings.periodTimes),
    [settings.periodTimes],
  );

  // 프리셋 토글 → dates 배열 자동 갱신
  const togglePreset = useCallback((preset: BreakPreset) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(preset.id)) {
        next.delete(preset.id);
      } else {
        next.add(preset.id);
      }
      return next;
    });
  }, []);

  // 학생 상담: 선택된 프리셋 → dates 동기화
  useEffect(() => {
    if (type !== 'student' || !studentDate) return;
    const presetDates: DateEntry[] = breakPresets
      .filter((p) => selectedPresets.has(p.id))
      .map((p) => ({ date: studentDate, startTime: p.startTime, endTime: p.endTime }));
    // 수동 추가 항목 유지 (presetId가 없는 것)
    const manualDates = dates.filter(
      (d) => d.date !== studentDate || !breakPresets.some((p) => p.startTime === d.startTime && p.endTime === d.endTime && selectedPresets.has(p.id)),
    );
    // 수동 항목 중 프리셋과 동일하지 않은 것만 유지
    const manualOnly = manualDates.filter(
      (d) => !presetDates.some((pd) => pd.startTime === d.startTime && pd.endTime === d.endTime && pd.date === d.date),
    );
    setDates([...presetDates, ...manualOnly]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, studentDate, selectedPresets, breakPresets]);

  // 유형 변경 시 dates 리셋
  useEffect(() => {
    setDates([]);
    setSelectedPresets(new Set());
    setStudentDate('');
  }, [type]);

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
      // 학생 상담: 프리셋 1개 = 슬롯 1개
      const count = start < end ? (type === 'student' ? 1 : Math.floor((end - start) / slotMinutes)) : 0;
      return { ...d, count };
    });
  }, [dates, slotMinutes, type]);

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

          {/* 시간 단위 (학부모 상담만) */}
          {type !== 'student' && <div>
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
          </div>}

          {/* 상담 날짜 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              상담 날짜 * ({dates.length > 0 ? `${dates.length}건` : '미설정'})
            </label>

            {type === 'student' ? (
              /* ── 학생 상담: 날짜 + 프리셋 체크박스 ── */
              <div className="flex flex-col gap-3">
                {/* 날짜 선택 */}
                <div>
                  <label className="text-[10px] text-sp-muted mb-1 block">날짜</label>
                  <input
                    type="date"
                    value={studentDate}
                    onChange={(e) => setStudentDate(e.target.value)}
                    className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                  />
                </div>

                {/* 프리셋 체크박스 */}
                {studentDate && breakPresets.length > 0 && (
                  <div>
                    <label className="text-[10px] text-sp-muted mb-1.5 block">시간대 선택</label>
                    <div className="flex flex-col gap-1.5">
                      {breakPresets.map((preset) => {
                        const checked = selectedPresets.has(preset.id);
                        return (
                          <button
                            key={preset.id}
                            onClick={() => togglePreset(preset)}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-all text-left ${
                              checked
                                ? 'bg-sp-accent/15 border-sp-accent/50 text-sp-text'
                                : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? 'bg-sp-accent border-sp-accent' : 'border-sp-border'
                            }`}>
                              {checked && <span className="material-symbols-outlined text-white text-xs">check</span>}
                            </span>
                            <span className="flex-1">{preset.label}</span>
                            <span className="text-xs text-sp-muted font-mono">{preset.startTime}~{preset.endTime}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 수동 추가된 시간대 (프리셋에 해당하지 않는 것) */}
                {dates.filter((d) => !breakPresets.some((p) => selectedPresets.has(p.id) && p.startTime === d.startTime && p.endTime === d.endTime && d.date === studentDate)).map((d) => {
                  const realIdx = dates.indexOf(d);
                  const preview = slotPreview[realIdx];
                  const isInvalid = d.date !== '' && d.startTime >= d.endTime;
                  return (
                    <div key={`manual-${realIdx}`} className="bg-sp-surface rounded-lg p-3 border border-sp-border flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={d.startTime}
                          onChange={(e) => updateDate(realIdx, 'startTime', e.target.value)}
                          className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                        />
                        <span className="text-sp-muted text-xs">~</span>
                        <input
                          type="time"
                          value={d.endTime}
                          onChange={(e) => updateDate(realIdx, 'endTime', e.target.value)}
                          className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                        />
                        <span className="text-xs text-sp-muted shrink-0">
                          → <span className={preview && preview.count > 0 ? 'text-sp-accent font-medium' : 'text-sp-muted'}>{preview?.count ?? 0}슬롯</span>
                        </span>
                        <button
                          onClick={() => removeDate(realIdx)}
                          className="text-sp-muted hover:text-red-400 transition-colors shrink-0"
                        >
                          <span className="material-symbols-outlined text-base">delete</span>
                        </button>
                      </div>
                      {isInvalid && (
                        <p className="text-[10px] text-amber-400">종료 시간이 시작 시간보다 이전입니다</p>
                      )}
                    </div>
                  );
                })}

                {/* 직접 추가 */}
                {studentDate && (
                  <button
                    onClick={() => setDates((prev) => [...prev, { date: studentDate, startTime: '09:00', endTime: '10:00' }])}
                    className="flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-sp-border text-xs text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    시간대 직접 추가
                  </button>
                )}
              </div>
            ) : (
              /* ── 학부모 상담: 기존 날짜+시간 범위 UI ── */
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
            )}

            {/* 총 슬롯 요약 */}
            {dates.length > 0 && (
              <div className="mt-2 px-3 py-2 bg-sp-surface rounded-lg border border-sp-border">
                <span className="text-xs text-sp-muted">
                  총{' '}
                  <span className={totalSlots > 0 ? 'text-sp-text font-medium' : 'text-amber-400'}>
                    {totalSlots}슬롯
                  </span>
                  {type !== 'student' && ` (${slotMinutes}분 간격)`}
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
