import { useMemo, useState, useCallback, useEffect } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';

interface StepSubjectSelectProps {
  className: string;
  initialSelected: Set<string>;
  onBack: () => void;
  onNext: (subjects: string[]) => void;
  onCancel: () => void;
}

interface ExtractedSubject {
  readonly subject: string;
  readonly weeklyPeriods: number;
  readonly teachers: ReadonlySet<string>;
  readonly isSpecialist: boolean;
  readonly alreadyExists: boolean;
  readonly isCustom: boolean;
}

const DAYS = ['월', '화', '수', '목', '금'] as const;

const FALLBACK_SUBJECTS: readonly string[] = [
  '국어',
  '수학',
  '사회',
  '과학',
  '영어',
  '도덕',
  '체육',
  '음악',
  '미술',
  '실과',
  '창의적 체험활동',
];

interface ExtractEntry {
  subject: string;
  weeklyPeriods: number;
  teachers: Set<string>;
}

/** classSchedule에서 과목+교사 추출 */
function extractFromClassSchedule(schedule: ClassScheduleData | null | undefined): Map<string, ExtractEntry> {
  const map = new Map<string, ExtractEntry>();
  if (!schedule) return map;
  for (const day of DAYS) {
    const periods = schedule[day];
    if (!periods) continue;
    periods.forEach((slot) => {
      if (!slot?.subject) return;
      const entry = map.get(slot.subject) ?? {
        subject: slot.subject,
        weeklyPeriods: 0,
        teachers: new Set<string>(),
      };
      entry.weeklyPeriods += 1;
      const teacher = slot.teacher?.trim();
      if (teacher) entry.teachers.add(teacher);
      map.set(slot.subject, entry);
    });
  }
  return map;
}

/** teacherSchedule에서 과목 추출 (폴백, 교사 정보 없음) */
function extractFromTeacherSchedule(
  schedule: TeacherScheduleData | null | undefined,
): Map<string, ExtractEntry> {
  const map = new Map<string, ExtractEntry>();
  if (!schedule) return map;
  for (const day of DAYS) {
    const periods = schedule[day];
    if (!periods) continue;
    periods.forEach((slot) => {
      if (!slot?.subject) return;
      const entry = map.get(slot.subject) ?? {
        subject: slot.subject,
        weeklyPeriods: 0,
        teachers: new Set<string>(),
      };
      entry.weeklyPeriods += 1;
      map.set(slot.subject, entry);
    });
  }
  return map;
}

/** ssampin:navigate 이벤트로 페이지 전환 */
function navigateToTimetable(): void {
  try {
    window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: 'timetable' }));
  } catch {
    // noop
  }
}

/** 위자드 Step 2 — 과목 선택 (Phase 3: 전담 구분 + 직접 추가 + 빈 상태 빠른 칩). */
export function StepSubjectSelect({
  className,
  initialSelected,
  onBack,
  onNext,
  onCancel,
}: StepSubjectSelectProps) {
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const existingClasses = useTeachingClassStore((s) => s.classes);
  const teacherName = useSettingsStore((s) => s.settings.teacherName);
  const trimmedTeacherName = teacherName?.trim() ?? '';
  const hasTeacherName = trimmedTeacherName.length > 0;

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState<string>('');
  const [hideSpecialists, setHideSpecialists] = useState<boolean>(hasTeacherName);
  const [initialized, setInitialized] = useState<boolean>(false);

  const existingKeys = useMemo(
    () => new Set(existingClasses.map((c) => `${c.name}__${c.subject}`)),
    [existingClasses],
  );

  // 양쪽 시간표에서 각각 추출
  const classEntries = useMemo<ExtractEntry[]>(
    () => [...extractFromClassSchedule(classSchedule).values()],
    [classSchedule],
  );
  const teacherEntries = useMemo<ExtractEntry[]>(
    () => [...extractFromTeacherSchedule(teacherSchedule).values()],
    [teacherSchedule],
  );
  const hasClassSource = classEntries.length > 0;
  const hasTeacherSource = teacherEntries.length > 0;

  // 데이터 소스 선택 — 초등은 학급 시간표 우선, 교사 시간표만 있으면 그것 사용
  type TimetableSource = 'class' | 'teacher';
  const [source, setSource] = useState<TimetableSource>(hasClassSource ? 'class' : 'teacher');
  const [sourceUserPicked, setSourceUserPicked] = useState(false);

  useEffect(() => {
    if (sourceUserPicked) return;
    if (hasClassSource) setSource('class');
    else if (hasTeacherSource) setSource('teacher');
  }, [hasClassSource, hasTeacherSource, sourceUserPicked]);

  const pickSource = useCallback((s: TimetableSource) => {
    setSource(s);
    setSourceUserPicked(true);
    setInitialized(false); // 소스 바뀌면 초기 선택 재계산
    setSelected(new Set());
  }, []);

  const scheduleEntries = useMemo<ExtractEntry[]>(
    () => (source === 'class' ? classEntries : teacherEntries),
    [source, classEntries, teacherEntries],
  );

  /** 시간표에서 추출된 과목 + 직접 추가된 과목을 합친 결과 */
  const extracted = useMemo<ExtractedSubject[]>(() => {
    const result: ExtractedSubject[] = scheduleEntries.map((entry) => {
      let isSpecialist = false;
      if (hasTeacherName && entry.teachers.size > 0) {
        isSpecialist = !entry.teachers.has(trimmedTeacherName);
      }
      return {
        subject: entry.subject,
        weeklyPeriods: entry.weeklyPeriods,
        teachers: entry.teachers,
        isSpecialist,
        alreadyExists: existingKeys.has(`${className}__${entry.subject}`),
        isCustom: false,
      };
    });
    result.sort((a, b) => b.weeklyPeriods - a.weeklyPeriods);

    // 직접 추가된 과목 (시간표 추출에 없는 것만)
    const scheduleSubjects = new Set(result.map((r) => r.subject));
    const customEntries: ExtractedSubject[] = customSubjects
      .filter((s) => !scheduleSubjects.has(s))
      .map((subject) => ({
        subject,
        weeklyPeriods: 0,
        teachers: new Set<string>(),
        isSpecialist: false,
        alreadyExists: existingKeys.has(`${className}__${subject}`),
        isCustom: true,
      }));

    return [...result, ...customEntries];
  }, [scheduleEntries, customSubjects, existingKeys, className, hasTeacherName, trimmedTeacherName]);

  const hasTimetable = scheduleEntries.length > 0;

  /** 초기 선택 규칙 (최초 1회만 적용 — 사용자가 토글한 상태를 덮어쓰지 않음) */
  useEffect(() => {
    if (initialized) return;
    if (initialSelected.size > 0) {
      // 이전 스텝에서 돌아온 경우 기존 선택 유지
      setInitialized(true);
      return;
    }
    if (!hasTimetable) {
      // 빈 시간표: 전체 해제로 시작 (빠른 추가 칩으로 유도)
      setSelected(new Set());
      setInitialized(true);
      return;
    }
    if (hasTeacherName) {
      // teacherName 있음: 전담이 아닌 과목만 체크
      const next = new Set<string>();
      scheduleEntries.forEach((entry) => {
        const isSpecialist =
          entry.teachers.size > 0 && !entry.teachers.has(trimmedTeacherName);
        if (!isSpecialist && !existingKeys.has(`${className}__${entry.subject}`)) {
          next.add(entry.subject);
        }
      });
      setSelected(next);
    } else {
      // teacherName 없음: 전체 해제
      setSelected(new Set());
    }
    setInitialized(true);
  }, [
    initialized,
    initialSelected,
    hasTimetable,
    hasTeacherName,
    trimmedTeacherName,
    scheduleEntries,
    existingKeys,
    className,
  ]);

  const toggleSubject = useCallback((subject: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const all = extracted
      .filter((e) => !e.alreadyExists)
      .filter((e) => !(hideSpecialists && e.isSpecialist))
      .map((e) => e.subject);
    setSelected(new Set(all));
  }, [extracted, hideSpecialists]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  /** 직접 추가 — 중복이면 무시, 유효하면 customSubjects에 추가 + 자동 선택 */
  const handleAddCustom = useCallback(() => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const alreadyInSchedule = scheduleEntries.some((e) => e.subject === trimmed);
    const alreadyCustom = customSubjects.includes(trimmed);
    if (alreadyInSchedule || alreadyCustom) {
      setCustomInput('');
      return;
    }
    setCustomSubjects((prev) => [...prev, trimmed]);
    setSelected((prev) => {
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
    setCustomInput('');
  }, [customInput, customSubjects, scheduleEntries]);

  /** 직접 추가된 과목 제거 */
  const removeCustom = useCallback((subject: string) => {
    setCustomSubjects((prev) => prev.filter((s) => s !== subject));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(subject);
      return next;
    });
  }, []);

  /** 빠른 추가 칩 토글 (빈 시간표 전용) */
  const toggleFallback = useCallback(
    (subject: string) => {
      const alreadyExists = existingKeys.has(`${className}__${subject}`);
      if (alreadyExists) return;
      const isActive = customSubjects.includes(subject);
      if (isActive) {
        removeCustom(subject);
      } else {
        setCustomSubjects((prev) => [...prev, subject]);
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(subject);
          return next;
        });
      }
    },
    [customSubjects, removeCustom, existingKeys, className],
  );

  const visibleExtracted = useMemo(() => {
    if (!hideSpecialists) return extracted;
    return extracted.filter((e) => !e.isSpecialist);
  }, [extracted, hideSpecialists]);

  const selectableCount = extracted.filter((e) => !e.alreadyExists).length;
  const selectedCount = selected.size;
  const canProceed = selectedCount > 0;
  const hasAnySpecialist = extracted.some((e) => e.isSpecialist);

  const handleNext = useCallback(() => {
    if (!canProceed) return;
    onNext([...selected]);
  }, [canProceed, selected, onNext]);

  const handleNavigateToTimetable = useCallback(() => {
    navigateToTimetable();
    onCancel();
  }, [onCancel]);

  return (
    <div>
      <p className="text-sm text-sp-muted mb-4">
        <span className="text-sp-text font-medium">{className}</span>에서 가르칠 과목을 선택하세요.
      </p>

      {/* 데이터 소스 선택 */}
      {(hasClassSource || hasTeacherSource) && (
        <div className="flex gap-1 mb-3 bg-sp-bg rounded-lg p-0.5 border border-sp-border">
          <button
            type="button"
            onClick={() => pickSource('class')}
            disabled={!hasClassSource}
            className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
              source === 'class'
                ? 'bg-sp-accent text-white'
                : hasClassSource
                  ? 'text-sp-muted hover:text-sp-text'
                  : 'text-sp-muted/40 cursor-not-allowed'
            }`}
          >
            학급 시간표{hasClassSource ? ` (${classEntries.length})` : ' · 비어있음'}
          </button>
          <button
            type="button"
            onClick={() => pickSource('teacher')}
            disabled={!hasTeacherSource}
            className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
              source === 'teacher'
                ? 'bg-sp-accent text-white'
                : hasTeacherSource
                  ? 'text-sp-muted hover:text-sp-text'
                  : 'text-sp-muted/40 cursor-not-allowed'
            }`}
          >
            교사 시간표{hasTeacherSource ? ` (${teacherEntries.length})` : ' · 비어있음'}
          </button>
        </div>
      )}

      {!hasTeacherName && hasTimetable && source === 'class' && (
        <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-lg text-xs text-amber-300 mb-3">
          선생님 이름이 설정에 등록되지 않아 전담 과목을 구분할 수 없습니다.
          <br />
          설정 → 일반에서 이름을 입력하시면 자동 구분됩니다.
        </div>
      )}

      {source === 'teacher' && hasTimetable && (
        <div className="bg-sp-accent/10 border border-sp-accent/30 px-3 py-2 rounded-lg text-xs text-sp-muted mb-3">
          교사 시간표에는 담당 교사 정보가 없어 전담 과목을 자동으로 구분할 수 없습니다.
        </div>
      )}

      {!hasTimetable ? (
        // ───────────── 빈 시간표: 빠른 추가 칩 ─────────────
        <div>
          <div className="py-6 text-center bg-sp-surface/40 border border-sp-border rounded-lg">
            <span className="material-symbols-outlined text-3xl text-sp-muted/50 mb-2 block">
              event_busy
            </span>
            <p className="text-sm text-sp-muted mb-4">
              학급 시간표가 아직 등록되지 않았습니다
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-4 px-3">
              {FALLBACK_SUBJECTS.map((s) => {
                const active = customSubjects.includes(s);
                const exists = existingKeys.has(`${className}__${s}`);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleFallback(s)}
                    disabled={exists}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      exists
                        ? 'bg-sp-surface/50 text-sp-muted/40 cursor-not-allowed'
                        : active
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:bg-sp-surface/70'
                    }`}
                  >
                    {s}
                    {exists && <span className="ml-1 text-[10px]">·등록됨</span>}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleNavigateToTimetable}
              className="text-xs text-sp-accent hover:underline"
            >
              시간표 등록하러 가기 →
            </button>
          </div>

          {/* 빈 시간표에서도 직접 추가 입력란 제공 */}
          <div className="mt-4 pt-4 border-t border-sp-border">
            <label className="block text-xs text-sp-muted mb-2">직접 입력해서 추가</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="과목명 입력..."
                className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customInput.trim()}
                className="px-3 py-2 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                + 추가
              </button>
            </div>
          </div>

          {/* 선택 카운트 + 선택된 직접 추가 리스트 */}
          {selectedCount > 0 && (
            <p className="text-[11px] text-sp-muted mt-3 text-center">
              {selectedCount}개 선택됨
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-sp-muted">
              {selectedCount}개 선택됨 · 총 {selectableCount}개 과목
            </span>
            <div className="flex gap-2 items-center">
              {hasAnySpecialist && (
                <>
                  <button
                    type="button"
                    onClick={() => setHideSpecialists((v) => !v)}
                    className={`text-[11px] ${
                      hideSpecialists ? 'text-sp-accent hover:underline' : 'text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {hideSpecialists ? '전담 과목 표시' : '전담 과목 숨김'}
                  </button>
                  <span className="text-sp-muted/40">|</span>
                </>
              )}
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] text-sp-accent hover:underline"
              >
                전체 선택
              </button>
              <span className="text-sp-muted/40">|</span>
              <button
                type="button"
                onClick={clearAll}
                className="text-[11px] text-sp-muted hover:text-sp-text"
              >
                전체 해제
              </button>
            </div>
          </div>

          <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
            {visibleExtracted.map((item) => {
              const isChecked = selected.has(item.subject);
              const isDisabled = item.alreadyExists;
              const specialistLabel =
                item.isSpecialist && item.teachers.size > 0
                  ? `전담 (${[...item.teachers]
                      .filter((t) => t !== trimmedTeacherName)
                      .join(', ')})`
                  : item.isSpecialist
                    ? '전담'
                    : null;
              return (
                <label
                  key={item.subject}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : isChecked
                        ? 'bg-sp-accent/10 ring-1 ring-sp-accent/30 cursor-pointer'
                        : 'hover:bg-sp-surface/50 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => toggleSubject(item.subject)}
                    className="w-4 h-4 rounded border-sp-border text-sp-accent focus:ring-sp-accent"
                  />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-sp-text">
                      {item.subject}
                    </span>
                    {item.isCustom ? (
                      <span className="text-[10px] text-sp-accent bg-sp-accent/10 px-1.5 py-0.5 rounded">
                        직접 추가
                      </span>
                    ) : (
                      <span className="text-[11px] text-sp-muted">
                        주 {item.weeklyPeriods}시간
                      </span>
                    )}
                    {specialistLabel && (
                      <span className="text-[10px] text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                        {specialistLabel}
                      </span>
                    )}
                  </div>
                  {isDisabled && (
                    <span className="text-[10px] text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                      이미 등록됨
                    </span>
                  )}
                  {item.isCustom && !isDisabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        removeCustom(item.subject);
                      }}
                      className="text-sp-muted hover:text-red-400 text-xs px-1"
                      aria-label="제거"
                    >
                      ×
                    </button>
                  )}
                </label>
              );
            })}
          </div>

          {/* 직접 추가 입력란 */}
          <div className="mt-4 pt-4 border-t border-sp-border">
            <label className="block text-xs text-sp-muted mb-2">
              시간표에 없는 과목 추가
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                placeholder="과목명 입력..."
                className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/60 focus:outline-none focus:border-sp-accent"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customInput.trim()}
                className="px-3 py-2 bg-sp-accent text-white rounded-lg text-sm hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                + 추가
              </button>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 mt-5">
        <button
          onClick={onBack}
          className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
        >
          이전
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
        >
          {selectedCount > 0 ? `${selectedCount}개 과목 선택 · 다음` : '다음'}
        </button>
      </div>
    </div>
  );
}
