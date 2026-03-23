import { useState, useCallback, useMemo, useEffect } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { consultationSupabaseClient, shortLinkClient } from '@adapters/di/container';
import { validateCustomCode } from '@infrastructure/supabase/ShortLinkClient';
import type { ConsultationType, ConsultationMethod } from '@domain/entities/Consultation';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

/* ──────────────── 타입 ──────────────── */

interface ConsultationCreateModalProps {
  onClose: () => void;
}

interface DateEntry {
  date: string;
  startTime: string;
  endTime: string;
  presetId?: string;
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

const PARENT_SLOT_PRESETS = [15, 20, 30, 45, 55];
const STUDENT_SLOT_PRESETS = [10, 15, 20, 25, 30];

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

function computeBreakPresets(
  periodTimes: readonly PeriodTime[],
  lunchStart?: string,
  lunchEnd?: string,
): BreakPreset[] {
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

  // 교시 사이 쉬는 시간 (점심 fallback: 가장 긴 간격 >= 30분)
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
      const isLunch = lunchStart && lunchEnd
        ? (endMins >= parseTimeToMinutes(lunchStart) && nextStartMins <= parseTimeToMinutes(lunchEnd))
        : (i === longestGapIdx && longestGap >= 30);
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

/** 시작시간부터 slotMinutes 간격으로 endTime까지 슬롯 시작시간 목록 생성 */
function buildSlotChips(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const chips: string[] = [];
  let current = start;
  while (current + slotMinutes <= end) {
    chips.push(minutesToTime(current));
    current += slotMinutes;
  }
  return chips;
}

/** 전체 시간 범위에서 제외 구간을 빼고 남은 연속 구간 목록 반환 */
function computeAvailableRanges(
  rangeStart: string,
  rangeEnd: string,
  excludedTimes: { startTime: string; endTime: string }[],
): { startTime: string; endTime: string }[] {
  const startMins = parseTimeToMinutes(rangeStart);
  const endMins = parseTimeToMinutes(rangeEnd);
  if (startMins >= endMins) return [];

  // 분 단위 가용 배열 (true = 사용 가능)
  const available = new Array(endMins - startMins).fill(true) as boolean[];
  for (const ex of excludedTimes) {
    const exStart = Math.max(parseTimeToMinutes(ex.startTime) - startMins, 0);
    const exEnd = Math.min(parseTimeToMinutes(ex.endTime) - startMins, available.length);
    for (let i = exStart; i < exEnd; i++) available[i] = false;
  }

  // 연속 구간 추출
  const ranges: { startTime: string; endTime: string }[] = [];
  let i = 0;
  while (i < available.length) {
    if (!available[i]) { i++; continue; }
    const segStart = i;
    while (i < available.length && available[i]) i++;
    ranges.push({
      startTime: minutesToTime(startMins + segStart),
      endTime: minutesToTime(startMins + i),
    });
  }
  return ranges;
}

/* ──────────────── 컴포넌트 ──────────────── */

export function ConsultationCreateModal({ onClose }: ConsultationCreateModalProps) {
  const { createSchedule } = useConsultationStore();
  const showToast = useToastStore((s) => s.show);
  const { track } = useAnalytics();
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
  const [customLinkCode, setCustomLinkCode] = useState('');
  const [linkCodeError, setLinkCodeError] = useState<string | null>(null);
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  // 학생 상담용: 날짜 + 프리셋 체크박스
  const [studentDate, setStudentDate] = useState('');
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());

  // 학부모 상담용: 수업 시간 제외
  const [excludeClassTime, setExcludeClassTime] = useState(false);
  const [excludedPeriodIds, setExcludedPeriodIds] = useState<Set<string>>(new Set());
  const [customExclusions, setCustomExclusions] = useState<{ startTime: string; endTime: string; label: string }[]>([]);

  // 사전 차단 슬롯 (date_startTime 키 기준)
  const [blockedSlotKeys, setBlockedSlotKeys] = useState<Set<string>>(new Set());

  // 스텝 위저드
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const breakPresets = useMemo(
    () => computeBreakPresets(settings.periodTimes, settings.lunchStart, settings.lunchEnd),
    [settings.periodTimes, settings.lunchStart, settings.lunchEnd],
  );

  // 학부모: 제외할 시간대 목록 (수업 교시 + 커스텀)
  const excludedTimes = useMemo(() => {
    if (!excludeClassTime || type !== 'parent') return [];
    const fromPresets = breakPresets
      .filter((p) => excludedPeriodIds.has(p.id))
      .map((p) => ({ startTime: p.startTime, endTime: p.endTime }));
    const fromCustom = customExclusions.map((c) => ({ startTime: c.startTime, endTime: c.endTime }));
    return [...fromPresets, ...fromCustom];
  }, [excludeClassTime, type, breakPresets, excludedPeriodIds, customExclusions]);

  // 수업 시간 제외 토글 시 교시 자동 선택
  useEffect(() => {
    if (excludeClassTime && type === 'parent') {
      const classPeriodIds = breakPresets
        .filter((p) => p.id.startsWith('period-'))
        .map((p) => p.id);
      setExcludedPeriodIds(new Set(classPeriodIds));
    } else if (!excludeClassTime) {
      setExcludedPeriodIds(new Set());
      setCustomExclusions([]);
    }
  }, [excludeClassTime, type, breakPresets]);

  const toggleExcludedPeriod = useCallback((periodId: string) => {
    setExcludedPeriodIds((prev) => {
      const next = new Set(prev);
      if (next.has(periodId)) next.delete(periodId);
      else next.add(periodId);
      return next;
    });
  }, []);

  // slotMinutes 변경 시 불가 프리셋 해제 + 남은 프리셋 칩 재생성
  useEffect(() => {
    if (type !== 'student') return;
    const toRemove = new Set<string>();
    const newEntries: DateEntry[] = [];

    for (const presetId of selectedPresets) {
      const preset = breakPresets.find((p) => p.id === presetId);
      if (!preset) continue;
      const chips = buildSlotChips(preset.startTime, preset.endTime, slotMinutes);
      if (chips.length === 0) {
        toRemove.add(presetId);
        continue;
      }
      // 모든 칩을 선택 상태로 재생성
      for (const chip of chips) {
        newEntries.push({
          date: studentDate,
          startTime: chip,
          endTime: minutesToTime(parseTimeToMinutes(chip) + slotMinutes),
          presetId,
        });
      }
    }

    if (toRemove.size > 0) {
      setSelectedPresets((prev) => {
        const next = new Set(prev);
        for (const id of toRemove) next.delete(id);
        return next;
      });
    }

    // 수동 항목 유지 + 프리셋 항목 재생성
    setDates((prev) => [
      ...prev.filter((d) => !d.presetId),
      ...newEntries,
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMinutes, type, breakPresets]);

  // 프리셋 토글 → 개별 칩 DateEntry 일괄 추가/제거
  const togglePreset = useCallback((preset: BreakPreset, disabled: boolean) => {
    if (disabled) return;
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(preset.id)) {
        next.delete(preset.id);
        setDates((d) => d.filter((entry) => entry.presetId !== preset.id));
      } else {
        next.add(preset.id);
        const chips = buildSlotChips(preset.startTime, preset.endTime, slotMinutes);
        const newEntries = chips.map((chip) => ({
          date: studentDate,
          startTime: chip,
          endTime: minutesToTime(parseTimeToMinutes(chip) + slotMinutes),
          presetId: preset.id,
        }));
        setDates((d) => [...d, ...newEntries]);
      }
      return next;
    });
  }, [studentDate, slotMinutes]);

  // 개별 칩 토글 (프리셋 내 특정 시간 선택/해제)
  const toggleChip = useCallback((presetId: string, chipStart: string) => {
    setDates((prev) => {
      const exists = prev.some((d) => d.presetId === presetId && d.startTime === chipStart);
      if (exists) {
        const filtered = prev.filter((d) => !(d.presetId === presetId && d.startTime === chipStart));
        // 프리셋의 모든 칩이 해제되면 프리셋 자체도 해제
        if (!filtered.some((d) => d.presetId === presetId)) {
          setSelectedPresets((p) => {
            const next = new Set(p);
            next.delete(presetId);
            return next;
          });
        }
        return filtered;
      } else {
        return [...prev, {
          date: studentDate,
          startTime: chipStart,
          endTime: minutesToTime(parseTimeToMinutes(chipStart) + slotMinutes),
          presetId,
        }];
      }
    });
  }, [studentDate, slotMinutes]);

  // 학생 상담: 날짜 변경 시 프리셋 항목의 date 동기화
  useEffect(() => {
    if (type !== 'student' || !studentDate) return;
    setDates((prev) => prev.map((d) => d.presetId ? { ...d, date: studentDate } : d));
  }, [type, studentDate]);

  // 유형 변경 시 dates 리셋
  useEffect(() => {
    setDates([]);
    setSelectedPresets(new Set());
    setStudentDate('');
    setSlotMinutes(type === 'parent' ? 30 : 15);
    setCustomSlot(false);
    setExcludeClassTime(false);
    setExcludedPeriodIds(new Set());
    setCustomExclusions([]);
    setBlockedSlotKeys(new Set());
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

  // 커스텀 코드 실시간 검증 (디바운스 300ms)
  useEffect(() => {
    if (!customLinkCode) {
      setLinkCodeError(null);
      return;
    }
    const validation = validateCustomCode(customLinkCode);
    if (!validation.valid) {
      setLinkCodeError(validation.error ?? null);
      return;
    }
    setIsCheckingCode(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const available = await shortLinkClient.isCodeAvailable(customLinkCode);
          setLinkCodeError(available ? null : '이미 사용 중인 링크입니다');
        } catch {
          setLinkCodeError(null);
        }
        setIsCheckingCode(false);
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [customLinkCode]);

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
      if (type === 'parent' && excludeClassTime && excludedTimes.length > 0) {
        const ranges = computeAvailableRanges(d.startTime, d.endTime, excludedTimes);
        const count = ranges.reduce((sum, r) => {
          const s = parseTimeToMinutes(r.startTime);
          const e = parseTimeToMinutes(r.endTime);
          return sum + Math.floor((e - s) / slotMinutes);
        }, 0);
        return { ...d, count };
      }
      const start = parseTimeToMinutes(d.startTime);
      const end = parseTimeToMinutes(d.endTime);
      const count = start < end ? Math.floor((end - start) / slotMinutes) : 0;
      return { ...d, count };
    });
  }, [dates, slotMinutes, type, excludeClassTime, excludedTimes]);

  const totalSlots = slotPreview.reduce((sum, d) => sum + d.count, 0);

  // 생성될 슬롯 미리보기 계산
  const generatedSlots = useMemo(() => {
    const result: { date: string; startTime: string; endTime: string }[] = [];
    const validDates = dates.filter((d) => d.date && d.startTime && d.endTime);

    for (const d of validDates) {
      if (type === 'parent' && excludeClassTime && excludedTimes.length > 0) {
        const ranges = computeAvailableRanges(d.startTime, d.endTime, excludedTimes);
        for (const r of ranges) {
          let current = parseTimeToMinutes(r.startTime);
          const end = parseTimeToMinutes(r.endTime);
          while (current + slotMinutes <= end) {
            result.push({
              date: d.date,
              startTime: minutesToTime(current),
              endTime: minutesToTime(current + slotMinutes),
            });
            current += slotMinutes;
          }
        }
      } else {
        let current = parseTimeToMinutes(d.startTime);
        const end = parseTimeToMinutes(d.endTime);
        while (current + slotMinutes <= end) {
          result.push({
            date: d.date,
            startTime: minutesToTime(current),
            endTime: minutesToTime(current + slotMinutes),
          });
          current += slotMinutes;
        }
      }
    }
    return result;
  }, [dates, slotMinutes, type, excludeClassTime, excludedTimes]);

  const toggleBlockSlot = useCallback((date: string, startTime: string) => {
    const key = `${date}_${startTime}`;
    setBlockedSlotKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ── 유효성 ── */

  const canSubmit =
    title.trim().length > 0 &&
    methods.length > 0 &&
    dates.length > 0 &&
    totalSlots > 0 &&
    isOnline &&
    !saving;

  const canGoStep2 = title.trim().length > 0 && methods.length > 0;
  const canGoStep3 = dates.length > 0 && totalSlots > 0;

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
        dates: dates
          .filter((d) => d.date && d.startTime && d.endTime)
          .flatMap(({ date, startTime, endTime }) => {
            if (type === 'parent' && excludeClassTime && excludedTimes.length > 0) {
              return computeAvailableRanges(startTime, endTime, excludedTimes)
                .map((r) => ({ date, startTime: r.startTime, endTime: r.endTime }));
            }
            return [{ date, startTime, endTime }];
          }),
        targetClassName: '',
        targetStudents: students.filter((s) => !s.isVacant).map((_, i) => ({ number: i + 1 })),
        message: message.trim() || undefined,
        customLinkCode: customLinkCode.trim() || undefined,
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
        blockedSlots: [...blockedSlotKeys].map((key) => {
          const [date, startTime] = key.split('_');
          return { date: date!, startTime: startTime! };
        }),
      });

      showToast('상담 일정이 생성되었습니다', 'success');
      track('consultation_create', { type });
      onClose();
    } catch {
      showToast('상담 일정 생성에 실패했습니다', 'error');
    } finally {
      setSaving(false);
    }
  }, [canSubmit, title, type, methods, slotMinutes, dates, message, createSchedule, showToast, onClose, excludeClassTime, excludedTimes, blockedSlotKeys]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-sp-card rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 + 스텝 인디케이터 */}
        <div className="p-5 border-b border-sp-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-sp-text">새 상담 일정</h3>
            <button onClick={onClose} className="text-sp-muted hover:text-sp-text transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {([
              { step: 1 as const, label: '기본 설정' },
              { step: 2 as const, label: '시간 설정' },
              { step: 3 as const, label: '슬롯 확인' },
            ]).map(({ step, label }, idx) => (
              <div key={step} className="flex items-center flex-1">
                <button
                  onClick={() => {
                    if (step < currentStep) setCurrentStep(step);
                    else if (step === 2 && canGoStep2) setCurrentStep(2);
                    else if (step === 3 && canGoStep2 && canGoStep3) setCurrentStep(3);
                  }}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    step === currentStep
                      ? 'text-sp-accent font-medium'
                      : step < currentStep
                        ? 'text-sp-text cursor-pointer hover:text-sp-accent'
                        : 'text-sp-muted/50'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    step === currentStep
                      ? 'bg-sp-accent text-white'
                      : step < currentStep
                        ? 'bg-sp-accent/30 text-sp-accent'
                        : 'bg-sp-surface text-sp-muted/50'
                  }`}>
                    {step < currentStep ? (
                      <span className="material-symbols-outlined text-xs">check</span>
                    ) : step}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {idx < 2 && (
                  <div className={`flex-1 h-px mx-2 ${
                    step < currentStep ? 'bg-sp-accent/30' : 'bg-sp-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {currentStep === 1 && (<>
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

          {/* 시간 단위 (학생/학부모 모두 표시) */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              {type === 'student' ? '1인당 상담 시간' : '슬롯 단위'}
            </label>
            <div className="flex flex-wrap gap-2">
              {(type === 'parent' ? PARENT_SLOT_PRESETS : STUDENT_SLOT_PRESETS).map((mins) => (
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
            {type === 'parent' && !customSlot && (
              <p className="text-[10px] text-sp-muted/70 mt-1.5">
                💡 학부모 상담은 보통 45~55분으로 설정합니다
              </p>
            )}
          </div>
          </>)}

          {currentStep === 2 && (<>
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
                        const allChips = buildSlotChips(preset.startTime, preset.endTime, slotMinutes);
                        const presetSlotCount = allChips.length;
                        const selectedChipCount = dates.filter((d) => d.presetId === preset.id).length;
                        const disabled = !checked && presetSlotCount === 0;
                        return (
                          <div
                            key={preset.id}
                            className={`rounded-lg border transition-all ${
                              disabled
                                ? 'opacity-40 bg-sp-surface border-sp-border'
                                : checked
                                  ? 'bg-sp-accent/15 border-sp-accent/50'
                                  : 'bg-sp-surface border-sp-border'
                            }`}
                          >
                            <button
                              onClick={() => togglePreset(preset, disabled)}
                              disabled={disabled}
                              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm text-left w-full ${
                                disabled
                                  ? 'cursor-not-allowed text-sp-muted'
                                  : checked
                                    ? 'text-sp-text'
                                    : 'text-sp-muted hover:text-sp-text'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-sp-accent border-sp-accent' : 'border-sp-border'
                              }`}>
                                {checked && <span className="material-symbols-outlined text-white text-xs">check</span>}
                              </span>
                              <span className="flex-1">{preset.label}</span>
                              {!checked && (
                                <span className="text-xs text-sp-muted font-mono">{preset.startTime}~{preset.endTime}</span>
                              )}
                              {/* N명 가능 / 불가 배지 (또는 선택 현황) */}
                              <span className={`text-[10px] font-medium ml-1 shrink-0 ${
                                disabled ? 'text-sp-muted/50'
                                  : checked ? 'text-sp-accent'
                                    : presetSlotCount >= 1 ? 'text-sp-accent' : 'text-sp-muted/50'
                              }`}>
                                {disabled ? '불가'
                                  : checked ? `${selectedChipCount}/${presetSlotCount}명`
                                    : `${presetSlotCount}명 가능`}
                              </span>
                            </button>
                            {/* 선택 가능한 시간 칩 */}
                            {checked && allChips.length > 0 && (
                              <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                                {allChips.map((chip) => {
                                  const isSelected = dates.some(
                                    (d) => d.presetId === preset.id && d.startTime === chip,
                                  );
                                  return (
                                    <button
                                      key={chip}
                                      onClick={(e) => { e.stopPropagation(); toggleChip(preset.id, chip); }}
                                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-mono border transition-all ${
                                        isSelected
                                          ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                                          : 'bg-sp-surface border-sp-border text-sp-muted/50 hover:text-sp-muted hover:border-sp-muted/50'
                                      }`}
                                    >
                                      {chip}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 수동 추가된 시간대 */}
                {dates.filter((d) => !d.presetId).map((d) => {
                  const realIdx = dates.indexOf(d);
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

                {/* 수업 시간 제외 */}
                {breakPresets.length > 0 ? (
                  <div className="mt-1">
                    <button
                      onClick={() => setExcludeClassTime((v) => !v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all w-full ${
                        excludeClassTime
                          ? 'bg-sp-accent/10 border-sp-accent/40 text-sp-accent'
                          : 'bg-sp-surface border-sp-border text-sp-muted hover:text-sp-text'
                      }`}
                    >
                      <span className="material-symbols-outlined text-base">
                        {excludeClassTime ? 'toggle_on' : 'toggle_off'}
                      </span>
                      <span className="flex-1 text-left">수업 시간 제외</span>
                      <span className="text-[10px] text-sp-muted">시간표 연동</span>
                    </button>

                    {excludeClassTime && (
                      <div className="mt-2 rounded-lg border border-sp-border bg-sp-surface/50 p-3 flex flex-col gap-2">
                        <label className="text-[10px] font-medium text-sp-muted">시간표 기반 제외 시간</label>
                        <div className="flex flex-col gap-1">
                          {breakPresets.map((preset) => {
                            const isClass = preset.id.startsWith('period-');
                            const isExcluded = excludedPeriodIds.has(preset.id);
                            return (
                              <button
                                key={preset.id}
                                onClick={() => toggleExcludedPeriod(preset.id)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-all ${
                                  isExcluded
                                    ? 'bg-red-500/10 text-red-400'
                                    : 'text-sp-muted hover:text-sp-text'
                                }`}
                              >
                                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                  isExcluded ? 'bg-red-500 border-red-500' : 'border-sp-border'
                                }`}>
                                  {isExcluded && <span className="material-symbols-outlined text-white" style={{ fontSize: '10px' }}>close</span>}
                                </span>
                                <span className="flex-1 text-left">{preset.label}</span>
                                <span className="text-[10px] font-mono text-sp-muted">{preset.startTime}~{preset.endTime}</span>
                                {isClass && !isExcluded && (
                                  <span className="text-[9px] text-green-400">상담가능</span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* 커스텀 제외 */}
                        {customExclusions.length > 0 && (
                          <div className="flex flex-col gap-1 mt-1">
                            <label className="text-[10px] font-medium text-sp-muted">추가 제외 시간</label>
                            {customExclusions.map((ex, idx) => (
                              <div key={idx} className="flex items-center gap-2 px-2.5 py-1.5 bg-red-500/10 rounded-md">
                                <span className="text-[10px] font-mono text-red-400">{ex.startTime}~{ex.endTime}</span>
                                {ex.label && <span className="text-[10px] text-sp-muted">({ex.label})</span>}
                                <button
                                  onClick={() => setCustomExclusions((prev) => prev.filter((_, i) => i !== idx))}
                                  className="ml-auto text-sp-muted hover:text-red-400"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={() => setCustomExclusions((prev) => [...prev, { startTime: '12:00', endTime: '13:00', label: '' }])}
                          className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-sp-border text-[10px] text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                          제외 시간 추가
                        </button>

                        {/* 상담 가능 시간 요약 */}
                        {dates.length > 0 && (() => {
                          const firstDate = dates[0];
                          if (!firstDate || !firstDate.startTime || !firstDate.endTime) return null;
                          const ranges = computeAvailableRanges(firstDate.startTime, firstDate.endTime, excludedTimes);
                          if (ranges.length === 0) return null;
                          const hasShortGap = ranges.some((r) => {
                            const dur = parseTimeToMinutes(r.endTime) - parseTimeToMinutes(r.startTime);
                            return dur > 0 && dur < slotMinutes;
                          });
                          return (
                            <div className="mt-1 p-2 rounded-md bg-sp-card border border-sp-border">
                              <p className="text-[10px] font-medium text-sp-muted mb-1">상담 가능 시간</p>
                              <div className="flex flex-wrap gap-1">
                                {ranges.map((r, i) => {
                                  const dur = parseTimeToMinutes(r.endTime) - parseTimeToMinutes(r.startTime);
                                  const slots = Math.floor(dur / slotMinutes);
                                  return (
                                    <span
                                      key={i}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${
                                        slots > 0 ? 'bg-sp-accent/10 text-sp-accent' : 'bg-sp-surface text-sp-muted/50'
                                      }`}
                                    >
                                      {r.startTime}~{r.endTime}
                                      <span className="text-[9px]">({dur}분{slots > 0 ? ` / ${slots}슬롯` : ''})</span>
                                    </span>
                                  );
                                })}
                              </div>
                              {hasShortGap && (
                                <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>warning</span>
                                  일부 시간대가 {slotMinutes}분보다 짧아 슬롯이 생성되지 않습니다
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-sp-muted/50 mt-1">
                    설정 → 교시 시간 등록 후 수업 시간 제외 기능을 사용할 수 있습니다
                  </p>
                )}
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
                  {` (${slotMinutes}분 간격)`}
                </span>
                {/* 학생 상담: 프리셋별 내역 (그룹핑) */}
                {type === 'student' && (() => {
                  const groups = new Map<string, number>();
                  for (const d of dates) {
                    if (!d.presetId) continue;
                    groups.set(d.presetId, (groups.get(d.presetId) ?? 0) + 1);
                  }
                  if (groups.size === 0) return null;
                  return (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {[...groups.entries()].map(([presetId, count]) => {
                        const preset = breakPresets.find((p) => p.id === presetId);
                        if (!preset) return null;
                        return (
                          <span key={presetId} className="text-[10px] text-sp-muted">
                            {preset.label}: <span className="text-sp-accent">{count}슬롯</span>
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

          </div>
          </>)}

          {currentStep === 1 && (<>
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

          {/* 커스텀 링크 */}
          <div>
            <label className="text-xs font-medium text-sp-muted mb-1.5 block">
              커스텀 링크 (선택)
            </label>
            <div className="flex items-center gap-0">
              <span className="px-2.5 py-2.5 bg-sp-surface/60 border border-r-0 border-sp-border rounded-l-lg text-sp-muted text-xs whitespace-nowrap">
                ssampin.com/s/
              </span>
              <input
                type="text"
                value={customLinkCode}
                onChange={(e) => setCustomLinkCode(e.target.value)}
                placeholder="예: 3월상담예약"
                className="flex-1 bg-sp-surface border border-sp-border rounded-r-lg px-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
              />
            </div>
            {linkCodeError && (
              <p className="text-[10px] text-red-400 mt-1">{linkCodeError}</p>
            )}
            {customLinkCode && !linkCodeError && !isCheckingCode && (
              <p className="text-[10px] text-green-400 mt-1">사용 가능</p>
            )}
            <p className="text-[10px] text-sp-muted/50 mt-1">
              비워두면 자동으로 생성됩니다. 한글, 영문, 숫자, -, _ 사용 가능
            </p>
          </div>
          </>)}

          {currentStep === 3 && (<>
            {/* 슬롯 확인 및 차단 */}
            {generatedSlots.length > 0 ? (
              <div>
                <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                  생성될 슬롯 ({generatedSlots.length}개)
                  {blockedSlotKeys.size > 0 && (
                    <span className="text-red-400 ml-1">· {blockedSlotKeys.size}개 차단</span>
                  )}
                </label>
                <p className="text-[10px] text-sp-muted/70 mb-2">클릭하여 개별 슬롯을 차단/해제할 수 있습니다</p>
                <div className="rounded-lg border border-sp-border bg-sp-surface/50 p-3 max-h-72 overflow-y-auto">
                  {/* 날짜별 그룹 */}
                  {(() => {
                    const byDate = new Map<string, typeof generatedSlots>();
                    for (const slot of generatedSlots) {
                      const arr = byDate.get(slot.date) ?? [];
                      arr.push(slot);
                      byDate.set(slot.date, arr);
                    }
                    return [...byDate.entries()].map(([date, daySlots]) => (
                      <div key={date} className="mb-3 last:mb-0">
                        <p className="text-[10px] font-medium text-sp-muted mb-1.5">{date}</p>
                        <div className="flex flex-wrap gap-1">
                          {daySlots.map((slot) => {
                            const key = `${slot.date}_${slot.startTime}`;
                            const isBlocked = blockedSlotKeys.has(key);
                            return (
                              <button
                                key={key}
                                onClick={() => toggleBlockSlot(slot.date, slot.startTime)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border transition-all ${
                                  isBlocked
                                    ? 'bg-red-500/15 border-red-500/40 text-red-400 line-through'
                                    : 'bg-sp-card border-sp-border text-sp-text hover:border-sp-accent/50'
                                }`}
                                title={isBlocked ? '클릭하여 차단 해제' : '클릭하여 차단'}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>
                                  {isBlocked ? 'block' : 'check_circle'}
                                </span>
                                {slot.startTime}~{slot.endTime}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}

                  {/* 요약 */}
                  <div className="mt-2 pt-2 border-t border-sp-border flex items-center gap-3 text-[10px]">
                    <span className="text-sp-accent font-medium">
                      예약 가능: {generatedSlots.length - blockedSlotKeys.size}개
                    </span>
                    {blockedSlotKeys.size > 0 && (
                      <span className="text-red-400">
                        차단: {blockedSlotKeys.size}개
                      </span>
                    )}
                    {blockedSlotKeys.size > 0 && (
                      <button
                        onClick={() => setBlockedSlotKeys(new Set())}
                        className="text-sp-muted hover:text-sp-text ml-auto"
                      >
                        전체 해제
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-sp-muted">
                <span className="material-symbols-outlined text-3xl mb-2">event_busy</span>
                <p className="text-sm">생성될 슬롯이 없습니다</p>
                <p className="text-[10px] mt-1">이전 단계에서 날짜와 시간을 설정하세요</p>
              </div>
            )}

            {/* 오프라인 경고 */}
            {!isOnline && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-400/10 border border-amber-400/30 rounded-lg">
                <span className="material-symbols-outlined text-base text-amber-400">wifi_off</span>
                <span className="text-xs text-amber-400">인터넷 연결이 필요합니다.</span>
              </div>
            )}
          </>)}
        </div>

        {/* 하단 버튼 (스텝별) */}
        <div className="p-5 border-t border-sp-border flex items-center shrink-0">
          {currentStep > 1 && (
            <button
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-base">chevron_left</span>
              이전
            </button>
          )}
          <div className="flex-1" />
          {currentStep === 1 && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text transition-colors mr-2"
              >
                취소
              </button>
              <button
                onClick={() => setCurrentStep(2)}
                disabled={!canGoStep2}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </>
          )}
          {currentStep === 2 && (
            <button
              onClick={() => setCurrentStep(3)}
              disabled={!canGoStep3}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              다음
              <span className="material-symbols-outlined text-base">chevron_right</span>
            </button>
          )}
          {currentStep === 3 && (
            <button
              onClick={handleCreate}
              disabled={!canSubmit}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-sp-accent text-white hover:bg-sp-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          )}
        </div>
      </div>
    </div>
  );
}
