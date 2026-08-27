import { useState, useCallback, useMemo, useEffect } from 'react';
import { useConsultationStore } from '@adapters/stores/useConsultationStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { consultationSupabaseClient, shortLinkClient } from '@adapters/di/container';
import { validateCustomCode } from '@infrastructure/supabase/ShortLinkClient';
import type { ConsultationType, ConsultationMethod } from '@domain/entities/Consultation';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  buildExcludedTimesByDate,
  computeAvailableRanges,
  computeBreakPresets,
  computeDefaultExclusionKeys,
  exclusionKey,
  parseExclusionKey,
  periodNumberOf,
  type BreakPreset,
  type TimeRange,
} from '@domain/rules/consultationTimetableRules';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
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

/** 학생 상담: 날짜+프리셋 키 생성 */
function presetKey(date: string, presetId: string): string {
  return `${date}|${presetId}`;
}

/** 학생 상담: 키 파싱 */
function parsePresetKey(key: string): { date: string; presetId: string } {
  const idx = key.indexOf('|');
  return { date: key.slice(0, idx), presetId: key.slice(idx + 1) };
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

/** "YYYY-MM-DD" → "3월 2일 (월)". 어느 날 시간표를 보고 있는지 화면에 적기 위한 것. */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
function formatDateWithWeekday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;
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

  // 학생 상담용: 여러 날짜 + 날짜별 프리셋 체크박스
  // selectedPresets 키 형식: `${date}|${presetId}`
  const [studentDates, setStudentDates] = useState<string[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());

  // 학부모 상담용: 수업 시간 제외
  //
  // ★ 제외는 **날짜별**이다. 키 형식 `${date}|${presetId}` — 학생 상담 selectedPresets 와 같다.
  //   예전에는 교시 id 하나만 담아 첫 번째 날짜의 시간표로 계산한 결과를 모든 날짜에 복사했고,
  //   요일이 다른 날을 함께 열면 교사가 수업 중인 시간에 학부모 예약이 들어왔다.
  const [excludeClassTime, setExcludeClassTime] = useState(false);
  const [excludedPeriodIds, setExcludedPeriodIds] = useState<Set<string>>(new Set());
  const [customExclusions, setCustomExclusions] = useState<
    { date: string; startTime: string; endTime: string; label: string }[]
  >([]);
  // 기본값을 이미 채운 날짜. "제외를 전부 해제한 날짜"와 "아직 안 채운 날짜"를 구별하기 위한 것 —
  // 이게 없으면 날짜를 하나 추가할 때마다 손으로 해제한 항목이 되살아난다.
  const [seededDates, setSeededDates] = useState<Set<string>>(new Set());
  // 펼쳐 둔 날짜. 기본은 접힘 — 날짜가 3~4개면 교시 목록이 화면을 가득 채운다.
  // 접혀 있어도 요약 줄이 "그 날 무엇이 빠졌는지"를 그대로 말해 준다.
  const [expandedExclusionDates, setExpandedExclusionDates] = useState<Set<string>>(new Set());

  // 사전 차단 슬롯 (date_startTime 키 기준)
  const [blockedSlotKeys, setBlockedSlotKeys] = useState<Set<string>>(new Set());

  // 스텝 위저드
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const getEffectiveTeacherSchedule = useScheduleStore((s) => s.getEffectiveTeacherSchedule);

  const breakPresets = useMemo(
    () => computeBreakPresets(settings.periodTimes, settings.lunchStart, settings.lunchEnd),
    [settings.periodTimes, settings.lunchStart, settings.lunchEnd],
  );

  // 상담 날짜 목록만 뽑아 이어 붙인다.
  // ★ 시작·종료 시간만 고치면 이 문자열은 그대로다 → 아래 공강표가 다시 만들어지지 않고,
  //   따라서 자동 채움도 돌지 않아 손으로 맞춰 둔 제외가 살아남는다.
  const parentDateKeysCsv = useMemo(() => {
    if (type !== 'parent') return '';
    return [...new Set(dates.map((d) => d.date).filter(Boolean))].sort().join(',');
  }, [type, dates]);

  const parentDateList = useMemo(
    () => (parentDateKeysCsv ? parentDateKeysCsv.split(',') : []),
    [parentDateKeysCsv],
  );

  // 날짜별 공강 교시. null = 그 날은 시간표 자체가 없다(주말에 주말 시간표를 안 켠 경우 등).
  // null 을 "공강 0교시"로 읽으면 모든 교시가 수업으로 분류되어 그 날 슬롯이 통째로 사라진다.
  const freePeriodsByDate = useMemo(() => {
    const map = new Map<string, Set<number> | null>();
    for (const ds of parentDateList) {
      const schedule = getEffectiveTeacherSchedule(ds, settings.enableWeekendDays);
      if (schedule.length === 0) {
        map.set(ds, null);
        continue;
      }
      const free = new Set<number>();
      schedule.forEach((period, idx) => {
        if (period === null) free.add(idx + 1); // 1-based period number
      });
      map.set(ds, free);
    }
    return map;
  }, [parentDateList, getEffectiveTeacherSchedule, settings.enableWeekendDays]);

  // 학부모: 날짜별 제외 시간대 (수업 교시 + 커스텀)
  const excludedTimesByDate = useMemo(() => {
    if (!excludeClassTime || type !== 'parent') return new Map<string, TimeRange[]>();
    const customByDate = new Map<string, TimeRange[]>();
    for (const c of customExclusions) {
      if (!c.date) continue;
      const list = customByDate.get(c.date) ?? [];
      list.push({ startTime: c.startTime, endTime: c.endTime });
      customByDate.set(c.date, list);
    }
    return buildExcludedTimesByDate({
      excludedKeys: excludedPeriodIds,
      presets: breakPresets,
      customByDate,
    });
  }, [excludeClassTime, type, breakPresets, excludedPeriodIds, customExclusions]);

  const excludedTimesFor = useCallback(
    (date: string): TimeRange[] => excludedTimesByDate.get(date) ?? [],
    [excludedTimesByDate],
  );

  // 수업 시간 제외 자동 채움 — **아직 안 채운 날짜만** 채우고 기존 선택은 건드리지 않는다.
  useEffect(() => {
    if (!excludeClassTime || type !== 'parent') {
      // 토글을 끄면 전부 비운다 (기존 동작 유지)
      if (!excludeClassTime) {
        setExcludedPeriodIds(new Set());
        setCustomExclusions([]);
        setSeededDates(new Set());
      }
      return;
    }

    const known = new Set(parentDateList);
    const toSeed = parentDateList.filter((d) => !seededDates.has(d));
    const staleSeeds = [...seededDates].filter((d) => !known.has(d));
    if (toSeed.length === 0 && staleSeeds.length === 0) return;

    const seeded = computeDefaultExclusionKeys({
      dates: toSeed,
      presets: breakPresets,
      freePeriodsByDate,
      mode: 'classOnly',
    });

    setExcludedPeriodIds((prev) => {
      const next = new Set<string>();
      // 사라진 날짜의 선택은 정리하고, 남은 날짜의 선택은 그대로 지킨다
      for (const key of prev) {
        if (known.has(parseExclusionKey(key).date)) next.add(key);
      }
      for (const key of seeded) next.add(key);
      return next;
    });
    setCustomExclusions((prev) => prev.filter((c) => known.has(c.date)));
    setSeededDates(known);
  }, [excludeClassTime, type, breakPresets, freePeriodsByDate, parentDateList, seededDates]);

  const toggleExcludedPeriod = useCallback((date: string, presetId: string) => {
    setExcludedPeriodIds((prev) => {
      const key = exclusionKey(date, presetId);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** 어느 날짜든 공강이 하나라도 있으면 "공강만 상담 가능" 버튼을 보여 준다. */
  const hasAnyFreePeriod = useMemo(() => {
    for (const free of freePeriodsByDate.values()) {
      if (free !== null && free.size > 0) return true;
    }
    return false;
  }, [freePeriodsByDate]);

  /** 모든 날짜를 "공강만 상담 가능"으로 맞춘다. 각 날짜는 자기 요일 시간표를 본다. */
  const applyFreeOnlyToAllDates = useCallback(() => {
    setExcludedPeriodIds(
      computeDefaultExclusionKeys({
        dates: parentDateList,
        presets: breakPresets,
        freePeriodsByDate,
        mode: 'freeOnly',
      }),
    );
  }, [parentDateList, breakPresets, freePeriodsByDate]);

  // slotMinutes 변경 시 불가 프리셋 해제 + 남은 프리셋 칩 재생성 (모든 학생 상담 날짜에 대해)
  useEffect(() => {
    if (type !== 'student') return;
    const toRemove = new Set<string>();
    const newEntries: DateEntry[] = [];

    for (const key of selectedPresets) {
      const { date, presetId } = parsePresetKey(key);
      const preset = breakPresets.find((p) => p.id === presetId);
      if (!preset) continue;
      const chips = buildSlotChips(preset.startTime, preset.endTime, slotMinutes);
      if (chips.length === 0) {
        toRemove.add(key);
        continue;
      }
      // 모든 칩을 선택 상태로 재생성
      for (const chip of chips) {
        newEntries.push({
          date,
          startTime: chip,
          endTime: minutesToTime(parseTimeToMinutes(chip) + slotMinutes),
          presetId,
        });
      }
    }

    if (toRemove.size > 0) {
      setSelectedPresets((prev) => {
        const next = new Set(prev);
        for (const k of toRemove) next.delete(k);
        return next;
      });
    }

    // 수동 항목 유지 + 프리셋 항목 재생성
    setDates((prev) => [...prev.filter((d) => !d.presetId), ...newEntries]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotMinutes, type, breakPresets]);

  // 프리셋 토글 → 개별 칩 DateEntry 일괄 추가/제거 (특정 날짜 기준)
  const togglePreset = useCallback(
    (date: string, preset: BreakPreset, disabled: boolean) => {
      if (disabled || !date) return;
      const key = presetKey(date, preset.id);
      setSelectedPresets((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
          setDates((d) =>
            d.filter((entry) => !(entry.presetId === preset.id && entry.date === date)),
          );
        } else {
          next.add(key);
          const chips = buildSlotChips(preset.startTime, preset.endTime, slotMinutes);
          const newEntries = chips.map((chip) => ({
            date,
            startTime: chip,
            endTime: minutesToTime(parseTimeToMinutes(chip) + slotMinutes),
            presetId: preset.id,
          }));
          setDates((d) => [...d, ...newEntries]);
        }
        return next;
      });
    },
    [slotMinutes],
  );

  // 개별 칩 토글 (프리셋 내 특정 시간 선택/해제, 날짜별)
  const toggleChip = useCallback(
    (date: string, presetId: string, chipStart: string) => {
      if (!date) return;
      setDates((prev) => {
        const exists = prev.some(
          (d) => d.presetId === presetId && d.date === date && d.startTime === chipStart,
        );
        if (exists) {
          const filtered = prev.filter(
            (d) => !(d.presetId === presetId && d.date === date && d.startTime === chipStart),
          );
          // 해당 날짜의 프리셋 칩이 모두 해제되면 프리셋 자체도 해제
          if (!filtered.some((d) => d.presetId === presetId && d.date === date)) {
            setSelectedPresets((p) => {
              const next = new Set(p);
              next.delete(presetKey(date, presetId));
              return next;
            });
          }
          return filtered;
        } else {
          return [
            ...prev,
            {
              date,
              startTime: chipStart,
              endTime: minutesToTime(parseTimeToMinutes(chipStart) + slotMinutes),
              presetId,
            },
          ];
        }
      });
    },
    [slotMinutes],
  );

  // 학생 상담: 날짜 추가 / 변경 / 제거 헬퍼
  const addStudentDate = useCallback(() => {
    setStudentDates((prev) => [...prev, '']);
  }, []);

  const updateStudentDate = useCallback((idx: number, newDate: string) => {
    setStudentDates((prev) => {
      const oldDate = prev[idx] ?? '';
      if (oldDate === newDate) return prev;
      // 중복 방지: 이미 같은 날짜가 있으면 변경 취소 (사용자가 다시 선택하도록)
      if (newDate && prev.includes(newDate)) return prev;
      const next = [...prev];
      next[idx] = newDate;

      // dates 배열에서 이 슬롯에 속한 항목들의 date 마이그레이션
      setDates((entries) =>
        entries.map((entry) => {
          if (entry.date !== oldDate) return entry;
          // 수동 항목: 빈 oldDate에서 newDate로만 이동 (같은 oldDate가 여러 idx에 동시 존재할 수 없도록 중복 방지됨)
          return { ...entry, date: newDate };
        }),
      );

      // selectedPresets 키 재발급
      setSelectedPresets((keys) => {
        const nextKeys = new Set<string>();
        for (const k of keys) {
          const { date, presetId } = parsePresetKey(k);
          if (date === oldDate) nextKeys.add(presetKey(newDate, presetId));
          else nextKeys.add(k);
        }
        return nextKeys;
      });

      return next;
    });
  }, []);

  const removeStudentDate = useCallback((idx: number) => {
    setStudentDates((prev) => {
      const target = prev[idx];
      if (target === undefined) return prev;
      const next = prev.filter((_, i) => i !== idx);

      // 해당 날짜의 모든 dates 항목 제거 (프리셋 + 수동)
      setDates((entries) => entries.filter((e) => e.date !== target));

      // 해당 날짜의 모든 선택 프리셋 키 제거
      setSelectedPresets((keys) => {
        const nextKeys = new Set<string>();
        for (const k of keys) {
          const { date } = parsePresetKey(k);
          if (date !== target) nextKeys.add(k);
        }
        return nextKeys;
      });

      return next;
    });
  }, []);

  // 유형 변경 시 dates 리셋
  useEffect(() => {
    setDates([]);
    setSelectedPresets(new Set());
    setStudentDates([]);
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
    setMethods((prev) => (prev.includes(m) ? prev.filter((v) => v !== m) : [...prev, m]));
  }, []);

  /* ── 날짜 조작 ── */

  const addDate = useCallback(() => {
    setDates((prev) => [...prev, { date: '', startTime: '09:00', endTime: '17:00' }]);
  }, []);

  const updateDate = useCallback((idx: number, field: keyof DateEntry, value: string) => {
    setDates((prev) => prev.map((d, i) => (i === idx ? { ...d, [field]: value } : d)));
  }, []);

  const removeDate = useCallback((idx: number) => {
    setDates((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  /* ── 슬롯 미리보기 ── */

  const slotPreview = useMemo(() => {
    return dates.map((d) => {
      if (!d.date || !d.startTime || !d.endTime) return { ...d, count: 0 };
      const dayExcluded = excludedTimesFor(d.date);
      if (type === 'parent' && excludeClassTime && dayExcluded.length > 0) {
        const ranges = computeAvailableRanges(d.startTime, d.endTime, dayExcluded);
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
  }, [dates, slotMinutes, type, excludeClassTime, excludedTimesFor]);

  const toggleExclusionCard = useCallback((date: string) => {
    setExpandedExclusionDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  /**
   * 날짜별 요약 — 접힌 상태에서도 "그 날 무엇이 빠졌고 얼마가 남았는지"를 말해 준다.
   * 이게 없으면 접는 순간 예전의 "어느 날 기준인지 모름" 문제가 그대로 돌아온다.
   */
  const exclusionSummaryFor = useCallback(
    (date: string) => {
      const free = freePeriodsByDate.get(date) ?? null;
      const slots = slotPreview.filter((d) => d.date === date).reduce((sum, d) => sum + d.count, 0);
      if (free === null) {
        return { noTimetable: true, excludedLabel: '', freeLabel: '', slots, customCount: 0 };
      }

      const shortLabel = (presetId: string, label: string) => {
        const n = periodNumberOf(presetId);
        return n === null ? label : `${n}`;
      };

      const excludedPeriods: string[] = [];
      let excludedOther = 0;
      for (const p of breakPresets) {
        if (!excludedPeriodIds.has(exclusionKey(date, p.id))) continue;
        if (periodNumberOf(p.id) !== null) excludedPeriods.push(shortLabel(p.id, p.label));
        else excludedOther += 1;
      }

      const freeOpen: string[] = [];
      for (const p of breakPresets) {
        const n = periodNumberOf(p.id);
        if (n === null || !free.has(n)) continue;
        if (!excludedPeriodIds.has(exclusionKey(date, p.id))) freeOpen.push(String(n));
      }

      const parts: string[] = [];
      if (excludedPeriods.length > 0) parts.push(`${excludedPeriods.join('·')}교시 제외`);
      if (excludedOther > 0) parts.push(`쉬는시간 ${excludedOther}개 제외`);

      return {
        noTimetable: false,
        excludedLabel: parts.join(' · '),
        freeLabel: freeOpen.length > 0 ? `${freeOpen.join('·')}교시 공강 열림` : '',
        slots,
        customCount: customExclusions.filter((c) => c.date === date).length,
      };
    },
    [freePeriodsByDate, breakPresets, excludedPeriodIds, customExclusions, slotPreview],
  );

  const totalSlots = slotPreview.reduce((sum, d) => sum + d.count, 0);

  // 생성될 슬롯 미리보기 계산
  const generatedSlots = useMemo(() => {
    const result: { date: string; startTime: string; endTime: string }[] = [];
    const validDates = dates.filter((d) => d.date && d.startTime && d.endTime);

    for (const d of validDates) {
      const dayExcluded = excludedTimesFor(d.date);
      if (type === 'parent' && excludeClassTime && dayExcluded.length > 0) {
        const ranges = computeAvailableRanges(d.startTime, d.endTime, dayExcluded);
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
  }, [dates, slotMinutes, type, excludeClassTime, excludedTimesFor]);

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
            const dayExcluded = excludedTimesFor(date);
            if (type === 'parent' && excludeClassTime && dayExcluded.length > 0) {
              return computeAvailableRanges(startTime, endTime, dayExcluded).map((r) => ({
                date,
                startTime: r.startTime,
                endTime: r.endTime,
              }));
            }
            return [{ date, startTime, endTime }];
          }),
        targetClassName: '',
        targetStudents: students
          .filter(isStudentActive)
          .map((s) => ({ number: s.studentNumber ?? 0 })),
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
  }, [
    canSubmit,
    title,
    type,
    methods,
    slotMinutes,
    dates,
    message,
    createSchedule,
    showToast,
    onClose,
    excludeClassTime,
    excludedTimesFor,
    blockedSlotKeys,
  ]);

  return (
    <Modal isOpen onClose={onClose} title="새 상담 일정" srOnlyTitle size="lg">
      <div className="flex flex-col flex-1 min-h-0">
        {/* 헤더 + 스텝 인디케이터 */}
        <div className="p-5 border-b border-sp-border shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-sp-text">새 상담 일정</h3>
            <IconButton icon="close" label="닫기" variant="ghost" size="md" onClick={onClose} />
          </div>
          <div className="flex items-center gap-1">
            {[
              { step: 1 as const, label: '기본 설정' },
              { step: 2 as const, label: '시간 설정' },
              { step: 3 as const, label: '슬롯 확인' },
            ].map(({ step, label }, idx) => (
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
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-caption font-bold shrink-0 ${
                      step === currentStep
                        ? 'bg-sp-accent text-white'
                        : step < currentStep
                          ? 'bg-sp-accent/30 text-sp-accent'
                          : 'bg-sp-surface text-sp-muted/50'
                    }`}
                  >
                    {step < currentStep ? (
                      <span className="material-symbols-outlined text-xs">check</span>
                    ) : (
                      step
                    )}
                  </span>
                  <span className="hidden sm:inline">{label}</span>
                </button>
                {idx < 2 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      step < currentStep ? 'bg-sp-accent/30' : 'bg-sp-border'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {currentStep === 1 && (
            <>
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
                <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                  상담 방식 *
                </label>
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
                  <p className="text-caption text-amber-400 mt-1">
                    상담 방식을 최소 1개 선택하세요
                  </p>
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
                      onClick={() => {
                        setSlotMinutes(mins);
                        setCustomSlot(false);
                      }}
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
                    onClick={() => {
                      setCustomSlot(true);
                      setCustomSlotValue(String(slotMinutes));
                    }}
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
                  <p className="text-caption text-sp-muted/70 mt-1.5">
                    💡 학부모 상담은 보통 45~55분으로 설정합니다
                  </p>
                )}
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              {/* 상담 날짜 */}
              <div>
                <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                  상담 날짜 * ({dates.length > 0 ? `${dates.length}건` : '미설정'})
                </label>

                {type === 'student' ? (
                  /* ── 학생 상담: 여러 날짜 + 날짜별 프리셋 체크박스 ── */
                  <div className="flex flex-col gap-3">
                    {studentDates.map((sDate, sIdx) => (
                      <div
                        key={`student-date-${sIdx}`}
                        className="bg-sp-surface rounded-lg p-3 border border-sp-border flex flex-col gap-3"
                      >
                        {/* 날짜 선택 + 삭제 */}
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={sDate}
                            onChange={(e) => updateStudentDate(sIdx, e.target.value)}
                            className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                          />
                          <button
                            onClick={() => removeStudentDate(sIdx)}
                            className="text-sp-muted hover:text-red-400 transition-colors shrink-0"
                            aria-label="날짜 삭제"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>

                        {/* 프리셋 체크박스 (해당 날짜용) */}
                        {sDate && breakPresets.length > 0 && (
                          <div>
                            <label className="text-caption text-sp-muted mb-1.5 block">
                              시간대 선택
                            </label>
                            <div className="flex flex-col gap-1.5">
                              {breakPresets.map((preset) => {
                                const key = presetKey(sDate, preset.id);
                                const checked = selectedPresets.has(key);
                                const allChips = buildSlotChips(
                                  preset.startTime,
                                  preset.endTime,
                                  slotMinutes,
                                );
                                const presetSlotCount = allChips.length;
                                const selectedChipCount = dates.filter(
                                  (d) => d.presetId === preset.id && d.date === sDate,
                                ).length;
                                const disabled = !checked && presetSlotCount === 0;
                                return (
                                  <div
                                    key={preset.id}
                                    className={`rounded-lg border transition-all ${
                                      disabled
                                        ? 'opacity-40 bg-sp-card border-sp-border'
                                        : checked
                                          ? 'bg-sp-accent/15 border-sp-accent/50'
                                          : 'bg-sp-card border-sp-border'
                                    }`}
                                  >
                                    <button
                                      onClick={() => togglePreset(sDate, preset, disabled)}
                                      disabled={disabled}
                                      className={`flex items-center gap-2.5 px-3 py-2.5 text-sm text-left w-full ${
                                        disabled
                                          ? 'cursor-not-allowed text-sp-muted'
                                          : checked
                                            ? 'text-sp-text'
                                            : 'text-sp-muted hover:text-sp-text'
                                      }`}
                                    >
                                      <span
                                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                          checked
                                            ? 'bg-sp-accent border-sp-accent'
                                            : 'border-sp-border'
                                        }`}
                                      >
                                        {checked && (
                                          <span className="material-symbols-outlined text-white text-xs">
                                            check
                                          </span>
                                        )}
                                      </span>
                                      <span className="flex-1">{preset.label}</span>
                                      {!checked && (
                                        <span className="text-xs text-sp-muted font-mono">
                                          {preset.startTime}~{preset.endTime}
                                        </span>
                                      )}
                                      {/* N명 가능 / 불가 배지 (또는 선택 현황) */}
                                      <span
                                        className={`text-caption font-medium ml-1 shrink-0 ${
                                          disabled
                                            ? 'text-sp-muted/50'
                                            : checked
                                              ? 'text-sp-accent'
                                              : presetSlotCount >= 1
                                                ? 'text-sp-accent'
                                                : 'text-sp-muted/50'
                                        }`}
                                      >
                                        {disabled
                                          ? '불가'
                                          : checked
                                            ? `${selectedChipCount}/${presetSlotCount}명`
                                            : `${presetSlotCount}명 가능`}
                                      </span>
                                    </button>
                                    {/* 선택 가능한 시간 칩 */}
                                    {checked && allChips.length > 0 && (
                                      <div className="flex flex-wrap gap-1 px-3 pb-2.5">
                                        {allChips.map((chip) => {
                                          const isSelected = dates.some(
                                            (d) =>
                                              d.presetId === preset.id &&
                                              d.date === sDate &&
                                              d.startTime === chip,
                                          );
                                          return (
                                            <button
                                              key={chip}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                toggleChip(sDate, preset.id, chip);
                                              }}
                                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-caption font-mono border transition-all ${
                                                isSelected
                                                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                                                  : 'bg-sp-card border-sp-border text-sp-muted/50 hover:text-sp-muted hover:border-sp-muted/50'
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

                        {/* 해당 날짜의 수동 추가된 시간대 */}
                        {dates.map((d, dIdx) => {
                          if (d.presetId || d.date !== sDate) return null;
                          const isInvalid = d.startTime >= d.endTime;
                          return (
                            <div
                              key={`manual-${dIdx}`}
                              className="bg-sp-card rounded-lg p-2.5 border border-sp-border flex flex-col gap-2"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="time"
                                  value={d.startTime}
                                  onChange={(e) => updateDate(dIdx, 'startTime', e.target.value)}
                                  className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                                />
                                <span className="text-sp-muted text-xs">~</span>
                                <input
                                  type="time"
                                  value={d.endTime}
                                  onChange={(e) => updateDate(dIdx, 'endTime', e.target.value)}
                                  className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none transition-colors"
                                />
                                <button
                                  onClick={() => removeDate(dIdx)}
                                  className="text-sp-muted hover:text-red-400 transition-colors shrink-0"
                                >
                                  <span className="material-symbols-outlined text-base">
                                    delete
                                  </span>
                                </button>
                              </div>
                              {isInvalid && (
                                <p className="text-caption text-amber-400">
                                  종료 시간이 시작 시간보다 이전입니다
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* 이 날짜에 수동 시간대 직접 추가 */}
                        {sDate && (
                          <button
                            onClick={() =>
                              setDates((prev) => [
                                ...prev,
                                { date: sDate, startTime: '09:00', endTime: '10:00' },
                              ])
                            }
                            className="flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-sp-border text-caption text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                            시간대 직접 추가
                          </button>
                        )}
                      </div>
                    ))}

                    {/* 날짜 추가 */}
                    <button
                      onClick={addStudentDate}
                      className="flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-sp-border text-xs text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
                    >
                      <span className="material-symbols-outlined text-sm">add</span>
                      날짜 추가
                    </button>
                  </div>
                ) : (
                  /* ── 학부모 상담: 기존 날짜+시간 범위 UI ── */
                  <div className="flex flex-col gap-2">
                    {slotPreview.map((d, idx) => {
                      const isInvalid = d.date !== '' && d.startTime >= d.endTime;
                      return (
                        <div
                          key={idx}
                          className="bg-sp-surface rounded-lg p-3 border border-sp-border flex flex-col gap-2"
                        >
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
                              →{' '}
                              <span
                                className={
                                  d.count > 0 ? 'text-sp-accent font-medium' : 'text-sp-muted'
                                }
                              >
                                {d.count}슬롯
                              </span>
                            </span>
                          </div>
                          {isInvalid && (
                            <p className="text-caption text-amber-400">
                              종료 시간이 시작 시간보다 이전입니다
                            </p>
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

                    {/* 수업 시간 제외 — 날짜마다 그 요일 시간표를 본다 */}
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
                          <span className="text-caption text-sp-muted">시간표 연동</span>
                        </button>

                        {excludeClassTime && hasAnyFreePeriod && (
                          <button
                            onClick={applyFreeOnlyToAllDates}
                            className="mt-1 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs text-emerald-400 hover:bg-emerald-500/10 transition-all w-full"
                          >
                            <span className="material-symbols-outlined text-sm">
                              event_available
                            </span>
                            <span className="flex-1 text-left">공강만 상담 가능</span>
                            <span className="text-caption text-emerald-400/60">
                              {parentDateList.length > 1 ? '모든 날짜' : '적용'}
                            </span>
                          </button>
                        )}

                        {excludeClassTime && parentDateList.length === 0 && (
                          <p className="text-caption text-sp-muted/70 mt-2">
                            날짜를 먼저 고르면 그 날 시간표에 맞춰 수업 시간을 빼 드립니다
                          </p>
                        )}

                        {/* 날짜마다 따로 — 각 날짜는 자기 요일 시간표를 본다 */}
                        {excludeClassTime &&
                          parentDateList.map((exDate) => {
                            const freeSet = freePeriodsByDate.get(exDate) ?? null;
                            const noTimetable = freeSet === null;
                            const dayCustom = customExclusions.filter((c) => c.date === exDate);
                            const isOpen = expandedExclusionDates.has(exDate);
                            const sum = exclusionSummaryFor(exDate);
                            const noSlots = sum.slots === 0;

                            return (
                              <div
                                key={exDate}
                                className="mt-2 rounded-lg border border-sp-border bg-sp-surface/50 overflow-hidden"
                              >
                                {/* 요약 줄 — 접혀 있어도 "이 날 무엇이 빠졌는지"를 그대로 말한다 */}
                                <button
                                  onClick={() => toggleExclusionCard(exDate)}
                                  aria-expanded={isOpen}
                                  className="w-full flex items-start gap-2 p-3 text-left hover:bg-sp-card/40 transition-colors"
                                >
                                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-sp-text">
                                        {formatDateWithWeekday(exDate)}
                                      </span>
                                      <span
                                        className={`text-caption font-medium ${
                                          noSlots ? 'text-amber-400' : 'text-sp-accent'
                                        }`}
                                      >
                                        {sum.slots}슬롯
                                      </span>
                                    </div>
                                    <span className="text-caption text-sp-muted truncate">
                                      {noTimetable
                                        ? '시간표 없음 · 전체 시간 열림'
                                        : [sum.excludedLabel, sum.freeLabel]
                                            .filter(Boolean)
                                            .join(' · ') || '제외 없음 · 전체 시간 열림'}
                                      {sum.customCount > 0 && ` · 직접 추가 ${sum.customCount}개`}
                                    </span>
                                  </div>
                                  <span
                                    className={`material-symbols-outlined text-base text-sp-muted shrink-0 transition-transform duration-200 ${
                                      isOpen ? 'rotate-180' : ''
                                    }`}
                                  >
                                    expand_more
                                  </span>
                                </button>

                                {isOpen && (
                                  <div className="px-3 pb-3 flex flex-col gap-2 border-t border-sp-border/60 pt-2">
                                    {noTimetable ? (
                                      <p className="text-caption text-sp-muted/70">
                                        이 날은 등록된 시간표가 없어 전체 시간이 열립니다
                                      </p>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {breakPresets.map((preset) => {
                                          const periodNum = periodNumberOf(preset.id);
                                          const isClass = periodNum !== null;
                                          const isFree = isClass && freeSet.has(periodNum);
                                          const isExcluded = excludedPeriodIds.has(
                                            exclusionKey(exDate, preset.id),
                                          );
                                          return (
                                            <button
                                              key={preset.id}
                                              onClick={() =>
                                                toggleExcludedPeriod(exDate, preset.id)
                                              }
                                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-all ${
                                                isExcluded
                                                  ? 'bg-red-500/10 text-red-400'
                                                  : 'text-sp-muted hover:text-sp-text'
                                              }`}
                                            >
                                              <span
                                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                                  isExcluded
                                                    ? 'bg-red-500 border-red-500'
                                                    : 'border-sp-border'
                                                }`}
                                              >
                                                {isExcluded && (
                                                  <span className="material-symbols-outlined text-icon-xs text-white">
                                                    close
                                                  </span>
                                                )}
                                              </span>
                                              <span className="flex-1 text-left">
                                                {preset.label}
                                              </span>
                                              {isClass && (
                                                <span
                                                  className={`text-tiny px-1.5 py-0.5 rounded-full ${
                                                    isFree
                                                      ? 'bg-emerald-500/15 text-emerald-400'
                                                      : 'bg-sp-muted/10 text-sp-muted'
                                                  }`}
                                                >
                                                  {isFree ? '공강' : '수업'}
                                                </span>
                                              )}
                                              <span className="text-caption font-mono text-sp-muted">
                                                {preset.startTime}~{preset.endTime}
                                              </span>
                                              {isClass && !isExcluded && isFree && (
                                                <span className="text-tiny text-green-400">
                                                  상담가능
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* 커스텀 제외 (이 날짜) */}
                                    {dayCustom.length > 0 && (
                                      <div className="flex flex-col gap-1 mt-1">
                                        <label className="text-caption font-medium text-sp-muted">
                                          추가 제외 시간
                                        </label>
                                        {dayCustom.map((ex) => (
                                          <div
                                            key={`${ex.date}-${ex.startTime}-${ex.endTime}-${ex.label}`}
                                            className="flex items-center gap-2 px-2.5 py-1.5 bg-red-500/10 rounded-md"
                                          >
                                            <span className="text-caption font-mono text-red-400">
                                              {ex.startTime}~{ex.endTime}
                                            </span>
                                            {ex.label && (
                                              <span className="text-caption text-sp-muted">
                                                ({ex.label})
                                              </span>
                                            )}
                                            <button
                                              onClick={() =>
                                                setCustomExclusions((prev) =>
                                                  prev.filter((c) => c !== ex),
                                                )
                                              }
                                              className="ml-auto text-sp-muted hover:text-red-400"
                                            >
                                              <span className="material-symbols-outlined text-icon-sm">
                                                close
                                              </span>
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <button
                                      onClick={() =>
                                        setCustomExclusions((prev) => [
                                          ...prev,
                                          {
                                            date: exDate,
                                            startTime: '12:00',
                                            endTime: '13:00',
                                            label: '',
                                          },
                                        ])
                                      }
                                      className="flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-sp-border text-caption text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-all"
                                    >
                                      <span className="material-symbols-outlined text-icon-xs">
                                        add
                                      </span>
                                      제외 시간 추가
                                    </button>

                                    {/* 이 날짜의 상담 가능 시간 */}
                                    {(() => {
                                      const entry = dates.find(
                                        (d) => d.date === exDate && d.startTime && d.endTime,
                                      );
                                      if (!entry) return null;
                                      const ranges = computeAvailableRanges(
                                        entry.startTime,
                                        entry.endTime,
                                        excludedTimesFor(exDate),
                                      );
                                      if (ranges.length === 0) {
                                        return (
                                          <p className="text-caption text-amber-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-icon-xs">
                                              warning
                                            </span>
                                            이 날은 남는 시간이 없어 슬롯이 만들어지지 않습니다
                                          </p>
                                        );
                                      }
                                      const hasShortGap = ranges.some((r) => {
                                        const dur =
                                          parseTimeToMinutes(r.endTime) -
                                          parseTimeToMinutes(r.startTime);
                                        return dur > 0 && dur < slotMinutes;
                                      });
                                      return (
                                        <div className="mt-1 p-2 rounded-md bg-sp-card border border-sp-border">
                                          <p className="text-caption font-medium text-sp-muted mb-1">
                                            상담 가능 시간
                                          </p>
                                          <div className="flex flex-wrap gap-1">
                                            {ranges.map((r) => {
                                              const dur =
                                                parseTimeToMinutes(r.endTime) -
                                                parseTimeToMinutes(r.startTime);
                                              const slots = Math.floor(dur / slotMinutes);
                                              return (
                                                <span
                                                  key={`${r.startTime}-${r.endTime}`}
                                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-mono ${
                                                    slots > 0
                                                      ? 'bg-sp-accent/10 text-sp-accent'
                                                      : 'bg-sp-surface text-sp-muted/50'
                                                  }`}
                                                >
                                                  {r.startTime}~{r.endTime}
                                                  <span className="text-tiny">
                                                    ({dur}분{slots > 0 ? ` / ${slots}슬롯` : ''})
                                                  </span>
                                                </span>
                                              );
                                            })}
                                          </div>
                                          {hasShortGap && (
                                            <p className="text-caption text-amber-400 mt-1.5 flex items-center gap-1">
                                              <span className="material-symbols-outlined text-icon-xs">
                                                warning
                                              </span>
                                              일부 시간대가 {slotMinutes}분보다 짧아 슬롯이 생성되지
                                              않습니다
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <p className="text-caption text-sp-muted/50 mt-1">
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
                      <span
                        className={totalSlots > 0 ? 'text-sp-text font-medium' : 'text-amber-400'}
                      >
                        {totalSlots}슬롯
                      </span>
                      {` (${slotMinutes}분 간격)`}
                    </span>
                    {/* 학생 상담: 프리셋별 내역 (그룹핑) */}
                    {type === 'student' &&
                      (() => {
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
                                <span key={presetId} className="text-caption text-sp-muted">
                                  {preset.label}:{' '}
                                  <span className="text-sp-accent">{count}슬롯</span>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                  </div>
                )}
              </div>
            </>
          )}

          {currentStep === 1 && (
            <>
              {/* 안내 메시지 */}
              <div>
                <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                  안내 메시지 (선택)
                </label>
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
                {linkCodeError && <p className="text-caption text-red-400 mt-1">{linkCodeError}</p>}
                {customLinkCode && !linkCodeError && !isCheckingCode && (
                  <p className="text-caption text-green-400 mt-1">사용 가능</p>
                )}
                <p className="text-caption text-sp-muted/50 mt-1">
                  비워두면 자동으로 생성됩니다. 한글, 영문, 숫자, -, _ 사용 가능
                </p>
              </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              {/* 슬롯 확인 및 차단 */}
              {generatedSlots.length > 0 ? (
                <div>
                  <label className="text-xs font-medium text-sp-muted mb-1.5 block">
                    생성될 슬롯 ({generatedSlots.length}개)
                    {blockedSlotKeys.size > 0 && (
                      <span className="text-red-400 ml-1">· {blockedSlotKeys.size}개 차단</span>
                    )}
                  </label>
                  <p className="text-caption text-sp-muted/70 mb-2">
                    클릭하여 개별 슬롯을 차단/해제할 수 있습니다
                  </p>
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
                          <p className="text-caption font-medium text-sp-muted mb-1.5">{date}</p>
                          <div className="flex flex-wrap gap-1">
                            {daySlots.map((slot) => {
                              const key = `${slot.date}_${slot.startTime}`;
                              const isBlocked = blockedSlotKeys.has(key);
                              return (
                                <button
                                  key={key}
                                  onClick={() => toggleBlockSlot(slot.date, slot.startTime)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-caption font-mono border transition-all ${
                                    isBlocked
                                      ? 'bg-red-500/15 border-red-500/40 text-red-400 line-through'
                                      : 'bg-sp-card border-sp-border text-sp-text hover:border-sp-accent/50'
                                  }`}
                                  title={isBlocked ? '클릭하여 차단 해제' : '클릭하여 차단'}
                                >
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: '10px' }}
                                  >
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
                    <div className="mt-2 pt-2 border-t border-sp-border flex items-center gap-3 text-caption">
                      <span className="text-sp-accent font-medium">
                        예약 가능: {generatedSlots.length - blockedSlotKeys.size}개
                      </span>
                      {blockedSlotKeys.size > 0 && (
                        <span className="text-red-400">차단: {blockedSlotKeys.size}개</span>
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
                  <p className="text-caption mt-1">이전 단계에서 날짜와 시간을 설정하세요</p>
                </div>
              )}

              {/* 오프라인 경고 */}
              {!isOnline && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-400/10 border border-amber-400/30 rounded-lg">
                  <span className="material-symbols-outlined text-base text-amber-400">
                    wifi_off
                  </span>
                  <span className="text-xs text-amber-400">인터넷 연결이 필요합니다.</span>
                </div>
              )}
            </>
          )}
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
    </Modal>
  );
}
