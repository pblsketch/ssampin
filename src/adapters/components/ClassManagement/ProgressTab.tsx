import { useState, useMemo, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { CalendarPicker } from '@adapters/components/common/CalendarPicker';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { isSubjectMatch } from '@domain/rules/matchingRules';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { resolvePreset, resolveClassroomPreset } from '@domain/valueObjects/SubjectColor';

/* ──────────────────────── 유틸 ──────────────────────── */

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const STATUS_CONFIG: Record<ProgressStatus, { label: string; badge: string }> = {
  planned: { label: '예정', badge: 'bg-blue-500/20 text-blue-400' },
  completed: { label: '완료', badge: 'bg-green-500/20 text-green-400' },
  skipped: { label: '미실시', badge: 'bg-amber-500/20 text-amber-400' },
};

const STATUS_CYCLE: Record<ProgressStatus, ProgressStatus> = {
  planned: 'completed',
  completed: 'skipped',
  skipped: 'planned',
};

const STATUS_BAR_COLORS: Record<ProgressStatus, string> = {
  completed: 'bg-green-500',
  planned: 'bg-sp-border',
  skipped: 'bg-amber-500',
};

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_LABELS[d.getDay()]!;
}

/* ──────────────────────── 컴포넌트 ──────────────────────── */

interface ProgressTabProps {
  classId: string;
}

export function ProgressTab({ classId }: ProgressTabProps) {
  const {
    classes,
    progressEntries,
    addProgressEntry,
    updateProgressEntry,
    deleteProgressEntry,
  } = useTeachingClassStore();

  const { classSchedule, getEffectiveTeacherSchedule } = useScheduleStore();
  const { settings } = useSettingsStore();

  const subjectAccent = useMemo(() => {
    const cls = classes.find((c: TeachingClass) => c.id === classId);
    if (!cls) return undefined;
    const colorBy = settings.timetableColorBy ?? 'classroom';
    if (colorBy === 'classroom') {
      return resolveClassroomPreset(cls.name, settings.classroomColors).tw;
    }
    return resolvePreset(cls.subject, settings.subjectColors).tw;
  }, [classes, classId, settings.subjectColors, settings.classroomColors, settings.timetableColorBy]);

  const [showForm, setShowForm] = useState(false);
  const [formDate, setFormDate] = useState(todayString);
  const [formPeriod, setFormPeriod] = useState(1);
  const [formUnit, setFormUnit] = useState('');
  const [formLesson, setFormLesson] = useState('');
  const [formNote, setFormNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editPeriod, setEditPeriod] = useState(1);
  const [editUnit, setEditUnit] = useState('');
  const [editLesson, setEditLesson] = useState('');
  const [editNote, setEditNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSourceClassId, setImportSourceClassId] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<ReadonlySet<string>>(new Set());
  const [importDateOverrides, setImportDateOverrides] = useState<Map<string, string>>(new Map());
  const [importDateShiftDays, setImportDateShiftDays] = useState(0);

  // 해당 학급 진도 항목만 필터, 날짜 내림차순 → 교시 오름차순 정렬
  const entries = useMemo(() => {
    return progressEntries
      .filter((e) => e.classId === classId)
      .slice()
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return a.period - b.period;
      });
  }, [progressEntries, classId]);

  const groupedEntries = useMemo(() => {
    const groups: { date: string; items: typeof entries }[] = [];
    let currentDate = '';
    for (const entry of entries) {
      if (entry.date !== currentDate) {
        currentDate = entry.date;
        groups.push({ date: currentDate, items: [] });
      }
      groups[groups.length - 1]!.items.push(entry);
    }
    return groups;
  }, [entries]);

  // 진도 통계
  const stats = useMemo(() => {
    const total = entries.length;
    const completed = entries.filter((e) => e.status === 'completed').length;
    const planned = entries.filter((e) => e.status === 'planned').length;
    const skipped = entries.filter((e) => e.status === 'skipped').length;
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, planned, skipped, percent };
  }, [entries]);

  /* ── 폼 핸들러 ── */

  // 해당 학급(과목)의 시간표 교시 추출
  const getMatchingPeriods = useCallback((dateStr: string): number[] => {
    if (!dateStr) return [];
    const currentClass = classes.find((c: TeachingClass) => c.id === classId);
    if (!currentClass) return [];
    const subjectName = currentClass.subject;
    const className = currentClass.name;

    const weekendDays = settings.enableWeekendDays;
    const dayScheduleTeacher = getEffectiveTeacherSchedule(dateStr, weekendDays);

    const periods: number[] = [];

    // 1단계: 교사 시간표에서 교실명 + 과목 동시 매칭 (가장 정확)
    dayScheduleTeacher.forEach((slot, idx) => {
      if (!slot) return;
      const classroomMatch =
        slot.classroom === className ||
        slot.classroom.includes(className) ||
        className.includes(slot.classroom);
      const subjectMatch = isSubjectMatch(slot.subject, subjectName);

      if (classroomMatch && subjectMatch) {
        periods.push(idx + 1);
      }
    });

    // 2단계: 교실명만으로 매칭 (과목명이 약간 다른 경우 커버)
    if (periods.length === 0) {
      dayScheduleTeacher.forEach((slot, idx) => {
        if (!slot) return;
        const classroomMatch =
          slot.classroom === className ||
          slot.classroom.includes(className) ||
          className.includes(slot.classroom);

        if (classroomMatch) {
          periods.push(idx + 1);
        }
      });
    }

    // 3단계: 담임반 시간표 폴백 (교사 시간표가 없는 경우)
    if (periods.length === 0) {
      const dayOfWeek = getDayOfWeek(new Date(dateStr + 'T00:00:00'), weekendDays);
      const dayScheduleClass = dayOfWeek ? classSchedule[dayOfWeek] : undefined;
      if (dayScheduleClass && dayScheduleClass.length > 0) {
        dayScheduleClass.forEach((slot, idx) => {
          if (slot.subject && isSubjectMatch(slot.subject, subjectName)) {
            periods.push(idx + 1);
          }
        });
      }
    }

    return periods;
  }, [classId, classes, classSchedule, getEffectiveTeacherSchedule, settings.enableWeekendDays]);

  // 수업이 있는 요일 인덱스 (JS getDay: 0=일, 1=월, ..., 6=토)
  const lessonDayIndices = useMemo(() => {
    const indices: number[] = [];
    // 기준 주간의 각 요일에 대해 수업 존재 여부 확인
    const ref = new Date();
    const refDay = ref.getDay();
    for (let i = 0; i < 7; i++) {
      const d = new Date(ref);
      d.setDate(d.getDate() + (i - refDay));
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (getMatchingPeriods(dateStr).length > 0) {
        indices.push(i);
      }
    }
    return indices;
  }, [getMatchingPeriods]);

  // 날짜 변경 핸들러 (교시 자동 선택 포함)
  const handleDateChange = useCallback((newDate: string) => {
    setFormDate(newDate);
    const matching = getMatchingPeriods(newDate);
    if (matching.length > 0 && matching[0] !== undefined) {
      setFormPeriod(matching[0]);
    }
  }, [getMatchingPeriods]);

  const resetForm = useCallback(() => {
    const today = todayString();
    setFormDate(today);
    const matching = getMatchingPeriods(today);
    setFormPeriod(matching[0] ?? 1);
    setFormUnit('');
    setFormLesson('');
    setFormNote('');
  }, [getMatchingPeriods]);

  const handleAdd = useCallback(async () => {
    if (!formUnit.trim() || !formLesson.trim()) return;
    await addProgressEntry(
      classId,
      formDate,
      formPeriod,
      formUnit.trim(),
      formLesson.trim(),
      formNote.trim() || undefined,
    );
    resetForm();
    setShowForm(false);
  }, [classId, formDate, formPeriod, formUnit, formLesson, formNote, addProgressEntry, resetForm]);

  const handleStatusCycle = useCallback(
    async (entry: ProgressEntry) => {
      const next = STATUS_CYCLE[entry.status];
      await updateProgressEntry({ ...entry, status: next });
    },
    [updateProgressEntry],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProgressEntry(id);
      setConfirmDeleteId(null);
    },
    [deleteProgressEntry],
  );

  const startEdit = useCallback((entry: ProgressEntry) => {
    setEditingId(entry.id);
    setEditDate(entry.date);
    setEditPeriod(entry.period);
    setEditUnit(entry.unit);
    setEditLesson(entry.lesson);
    setEditNote(entry.note);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(
    async (entry: ProgressEntry) => {
      if (!editUnit.trim() || !editLesson.trim()) return;
      await updateProgressEntry({
        ...entry,
        date: editDate,
        period: editPeriod,
        unit: editUnit.trim(),
        lesson: editLesson.trim(),
        note: editNote.trim(),
      });
      setEditingId(null);
    },
    [editDate, editPeriod, editUnit, editLesson, editNote, updateProgressEntry],
  );

  /* ── 다른 반에서 불러오기 ── */

  const otherClasses = useMemo(
    () => classes.filter((c: TeachingClass) => c.id !== classId),
    [classes, classId],
  );

  const sourceEntries = useMemo(() => {
    if (!importSourceClassId) return [];
    return progressEntries
      .filter((e) => e.classId === importSourceClassId)
      .slice()
      .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        return a.period - b.period;
      });
  }, [progressEntries, importSourceClassId]);

  const entriesCountByClass = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of progressEntries) {
      map.set(e.classId, (map.get(e.classId) ?? 0) + 1);
    }
    return map;
  }, [progressEntries]);

  const handleImport = useCallback(async () => {
    if (!importSourceClassId || selectedImportIds.size === 0) return;
    setImportLoading(true);
    try {
      const toImport = sourceEntries.filter((e) => selectedImportIds.has(e.id));
      for (const entry of toImport) {
        await addProgressEntry(
          classId,
          importDateOverrides.get(entry.id) ?? (importDateShiftDays !== 0 ? shiftDate(entry.date, importDateShiftDays) : entry.date),
          entry.period,
          entry.unit,
          entry.lesson,
          entry.note || undefined,
        );
      }
      setImportSuccessCount(toImport.length);
      setTimeout(() => {
        setShowImportModal(false);
        setImportSourceClassId(null);
        setImportSuccessCount(null);
        setSelectedImportIds(new Set());
      }, 1500);
    } finally {
      setImportLoading(false);
    }
  }, [importSourceClassId, selectedImportIds, sourceEntries, classId, addProgressEntry]);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    setImportSourceClassId(null);
    setImportSuccessCount(null);
    setSelectedImportIds(new Set());
    setImportDateOverrides(new Map());
    setImportDateShiftDays(0);
  }, []);

  const toggleImportEntry = useCallback((id: string) => {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllImportEntries = useCallback(() => {
    if (selectedImportIds.size === sourceEntries.length) {
      setSelectedImportIds(new Set());
    } else {
      setSelectedImportIds(new Set(sourceEntries.map((e) => e.id)));
    }
  }, [selectedImportIds.size, sourceEntries]);

  /* ── 진도 바 세그먼트 계산 ── */
  const barSegments = useMemo(() => {
    if (stats.total === 0) return [];
    const segments: { status: ProgressStatus; width: number }[] = [];
    if (stats.completed > 0) {
      segments.push({ status: 'completed', width: (stats.completed / stats.total) * 100 });
    }
    if (stats.skipped > 0) {
      segments.push({ status: 'skipped', width: (stats.skipped / stats.total) * 100 });
    }
    if (stats.planned > 0) {
      segments.push({ status: 'planned', width: (stats.planned / stats.total) * 100 });
    }
    return segments;
  }, [stats]);

  return (
    <div className="flex flex-col gap-4">
      {/* ── 진도 요약 + 추가 버튼 ── */}
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-sp-text font-medium">
              진도율: {stats.percent}% ({stats.completed}/{stats.total})
            </span>
            <div className="flex gap-3 text-xs text-sp-muted">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                완료 {stats.completed}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                미실시 {stats.skipped}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sp-border inline-block" />
                예정 {stats.planned}
              </span>
            </div>
          </div>
          {/* 진도 바 */}
          <div className="h-2.5 bg-sp-surface rounded-full overflow-hidden flex">
            {barSegments.map((seg) => (
              <div
                key={seg.status}
                className={`${STATUS_BAR_COLORS[seg.status]} transition-all duration-300`}
                style={{ width: `${seg.width}%` }}
              />
            ))}
            {stats.total === 0 && <div className="w-full bg-sp-border" />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sp-surface border border-sp-border
                       text-sp-muted rounded-lg hover:text-sp-text hover:border-sp-accent/50
                       transition-colors text-sm font-medium"
            title="다른 반의 진도 계획을 불러옵니다"
          >
            <span className="material-symbols-outlined text-lg">content_copy</span>
            다른 반에서 불러오기
          </button>
          {getMatchingPeriods(todayString()).length > 0 && (
            <button
              onClick={() => {
                const today = todayString();
                const periods = getMatchingPeriods(today);
                const existingPeriods = new Set(
                  entries
                    .filter((e) => e.date === today)
                    .map((e) => e.period),
                );
                const unlogged = periods.filter((p) => !existingPeriods.has(p));
                if (unlogged.length === 0) return;
                setFormDate(today);
                setFormPeriod(unlogged[0]!);
                setFormUnit('');
                setFormLesson('');
                setFormNote('');
                setShowForm(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400
                         rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium"
              title="오늘 시간표에서 이 과목이 배정된 교시에 빠르게 진도를 추가합니다"
            >
              <span className="material-symbols-outlined text-lg">today</span>
              오늘 수업
            </button>
          )}
          <button
            onClick={() => {
              if (!showForm) resetForm();
              setShowForm(!showForm);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sp-accent/20 text-sp-accent
                       rounded-lg hover:bg-sp-accent/30 transition-colors text-sm font-medium"
          >
            <span className="material-symbols-outlined text-lg">
              {showForm ? 'close' : 'add'}
            </span>
            {showForm ? '취소' : '항목 추가'}
          </button>
        </div>
      </div>

      {/* ── 추가 폼 ── */}
      {showForm && (
        <div className="bg-sp-surface border border-sp-border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-sp-muted mb-1">날짜</label>
              <CalendarPicker
                value={formDate}
                onChange={handleDateChange}
                lessonDays={lessonDayIndices}
                accentColor={subjectAccent}
              />
            </div>
            <div>
              <label className="block text-xs text-sp-muted mb-1">교시</label>
              <select
                value={formPeriod}
                onChange={(e) => setFormPeriod(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                           text-sp-text text-sm focus:outline-none focus:border-sp-accent"
              >
                {Array.from({ length: settings.maxPeriods ?? 8 }, (_, i) => i + 1).map((p) => {
                  const matching = getMatchingPeriods(formDate);
                  const isMatch = matching.includes(p);
                  return (
                    <option key={p} value={p}>
                      {p}교시{isMatch ? ' ✦' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1">단원</label>
            <input
              type="text"
              value={formUnit}
              onChange={(e) => setFormUnit(e.target.value)}
              placeholder="예: 1단원 - 문학의 이해"
              className="w-full px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent
                         placeholder:text-sp-muted/50"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1">차시/주제</label>
            <input
              type="text"
              value={formLesson}
              onChange={(e) => setFormLesson(e.target.value)}
              placeholder="예: 1차시 - 소설의 구성요소"
              className="w-full px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent
                         placeholder:text-sp-muted/50"
            />
          </div>
          <div>
            <label className="block text-xs text-sp-muted mb-1">비고 (선택)</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="예: 모둠 활동 포함"
              className="w-full px-3 py-1.5 bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent
                         placeholder:text-sp-muted/50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleAdd()}
              disabled={!formUnit.trim() || !formLesson.trim()}
              className="px-4 py-1.5 bg-sp-accent text-white text-sm rounded-lg
                         hover:bg-sp-accent/80 transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* ── 진도 목록 ── */}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-4xl mb-3">trending_up</span>
          <p className="text-sm">아직 진도 항목이 없습니다.</p>
          <p className="text-xs mt-1 text-sp-muted/60">
            '항목 추가' 버튼으로 첫 진도를 기록하세요.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {groupedEntries.map((group, gi) => (
            <div key={group.date} className="space-y-1.5">
              <div className={`flex items-center gap-2 pb-1 ${gi > 0 ? 'pt-3' : ''}`}>
                <span className="text-xs font-medium text-sp-muted">
                  {group.date} ({getDayLabel(group.date)})
                </span>
                <div className="flex-1 h-px bg-sp-border/50" />
                <span className="text-xs text-sp-muted/60">{group.items.length}건</span>
              </div>
              {group.items.map((entry) => (
                <div
                  key={entry.id}
                  className="group bg-sp-surface border border-sp-border rounded-xl px-4 py-3
                             hover:border-sp-accent/30 transition-colors"
                >
                  {editingId === entry.id ? (
                    /* ── 인라인 편집 모드 ── */
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-sp-muted mb-1">날짜</label>
                          <CalendarPicker
                            value={editDate}
                            onChange={setEditDate}
                            lessonDays={lessonDayIndices}
                            accentColor={subjectAccent}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-sp-muted mb-1">교시</label>
                          <select
                            value={editPeriod}
                            onChange={(e) => setEditPeriod(Number(e.target.value))}
                            className="w-full px-2.5 py-1 bg-sp-card border border-sp-border rounded-lg
                                       text-sp-text text-sm focus:outline-none focus:border-sp-accent"
                          >
                            {Array.from({ length: settings.maxPeriods ?? 8 }, (_, i) => i + 1).map((p) => {
                              const matching = getMatchingPeriods(editDate);
                              const isMatch = matching.includes(p);
                              return (
                                <option key={p} value={p}>
                                  {p}교시{isMatch ? ' ✦' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-sp-muted mb-1">단원</label>
                        <input
                          type="text"
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                          placeholder="예: 1단원 - 문학의 이해"
                          className="w-full px-2.5 py-1 bg-sp-card border border-sp-border rounded-lg
                                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                                     placeholder:text-sp-muted/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-sp-muted mb-1">차시/주제</label>
                        <input
                          type="text"
                          value={editLesson}
                          onChange={(e) => setEditLesson(e.target.value)}
                          placeholder="예: 1차시 - 소설의 구성요소"
                          className="w-full px-2.5 py-1 bg-sp-card border border-sp-border rounded-lg
                                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                                     placeholder:text-sp-muted/50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-sp-muted mb-1">비고 (선택)</label>
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="예: 모둠 활동 포함"
                          className="w-full px-2.5 py-1 bg-sp-card border border-sp-border rounded-lg
                                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                                     placeholder:text-sp-muted/50"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={cancelEdit}
                          className="px-2.5 py-1 text-xs text-sp-muted hover:text-sp-text transition-colors"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => void saveEdit(entry)}
                          disabled={!editUnit.trim() || !editLesson.trim()}
                          className="px-3 py-1 bg-sp-accent text-white text-xs rounded-lg
                                     hover:bg-sp-accent/80 transition-colors
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── 표시 모드 ── */
                    <div className="flex items-center gap-3">
                      {/* 교시 */}
                      <div className="text-xs text-sp-muted shrink-0 w-14">
                        <span>{entry.period}교시</span>
                      </div>

                      {/* 단원 > 차시 */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-sp-text truncate block">
                          {entry.unit}
                          <span className="text-sp-muted mx-1.5">&gt;</span>
                          {entry.lesson}
                        </span>
                        {entry.note && (
                          <span className="text-xs text-sp-muted/70 block truncate mt-0.5">
                            {entry.note}
                          </span>
                        )}
                      </div>

                      {/* 상태 배지 */}
                      <button
                        onClick={() => void handleStatusCycle(entry)}
                        className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium cursor-pointer
                                   transition-colors ${STATUS_CONFIG[entry.status].badge}`}
                        title="클릭하여 상태 변경"
                      >
                        {STATUS_CONFIG[entry.status].label}
                      </button>

                      {/* 액션 버튼 */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => startEdit(entry)}
                          className="p-1 text-sp-muted hover:text-sp-accent transition-colors rounded"
                          title="편집"
                        >
                          <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                        {confirmDeleteId === entry.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => void handleDelete(entry.id)}
                              className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded
                                         hover:bg-red-500/30 transition-colors"
                            >
                              삭제
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-0.5 text-sp-muted text-xs hover:text-sp-text transition-colors"
                            >
                              취소
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(entry.id)}
                            className="p-1 text-sp-muted hover:text-red-400 transition-colors rounded"
                            title="삭제"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {/* ── 다른 반에서 불러오기 모달 ── */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}
        >
          <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
              <div className="flex items-center gap-2 text-sp-text font-medium">
                <span className="material-symbols-outlined text-xl text-sp-accent">content_copy</span>
                다른 반에서 불러오기
              </div>
              <button
                onClick={closeImportModal}
                className="p-1 text-sp-muted hover:text-sp-text transition-colors rounded"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {importSuccessCount !== null ? (
                /* 성공 피드백 */
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <span className="material-symbols-outlined text-4xl text-green-400">check_circle</span>
                  <p className="text-sp-text font-medium">불러오기 완료!</p>
                  <p className="text-sm text-sp-muted">총 {importSuccessCount}개 항목을 불러왔습니다.</p>
                </div>
              ) : importSourceClassId === null ? (
                /* Step 1: 학급 선택 */
                <div className="space-y-2">
                  <p className="text-sm text-sp-muted mb-3">
                    진도 계획을 복사해올 학급을 선택하세요. 불러올 항목을 선택할 수 있습니다.
                  </p>
                  {otherClasses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-sp-muted gap-2">
                      <span className="material-symbols-outlined text-3xl">school</span>
                      <p className="text-sm">다른 학급이 없습니다.</p>
                    </div>
                  ) : (
                    otherClasses.map((cls: TeachingClass) => {
                      const count = entriesCountByClass.get(cls.id) ?? 0;
                      return (
                        <button
                          key={cls.id}
                          onClick={() => {
                            setImportSourceClassId(cls.id);
                            // 해당 학급의 모든 진도 항목 자동 선택
                            const ids = progressEntries
                              .filter((e) => e.classId === cls.id)
                              .map((e) => e.id);
                            setSelectedImportIds(new Set(ids));
                          }}
                          className="w-full flex items-center justify-between px-4 py-3
                                     bg-sp-surface border border-sp-border rounded-xl
                                     hover:border-sp-accent/50 hover:bg-sp-surface/80
                                     transition-colors text-left"
                        >
                          <span className="text-sm text-sp-text">
                            {cls.subject}
                            <span className="text-sp-muted mx-1.5">·</span>
                            {cls.name}
                          </span>
                          <span className="px-2 py-0.5 bg-sp-accent/15 text-sp-accent text-xs rounded-full">
                            {count}개
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Step 2: 미리보기 */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setImportSourceClassId(null);
                        setSelectedImportIds(new Set());
                        setImportDateOverrides(new Map());
                        setImportDateShiftDays(0);
                      }}
                      className="p-1 text-sp-muted hover:text-sp-text transition-colors rounded"
                    >
                      <span className="material-symbols-outlined text-base">arrow_back</span>
                    </button>
                    <span className="text-sm text-sp-text font-medium">
                      {(() => {
                        const src = otherClasses.find((c: TeachingClass) => c.id === importSourceClassId);
                        return src ? `${src.subject} · ${src.name}` : '';
                      })()}
                    </span>
                    <span className="ml-auto text-xs text-sp-muted">
                      {selectedImportIds.size}/{sourceEntries.length}개 선택
                    </span>
                  </div>

                  {/* 전체 선택 토글 */}
                  {sourceEntries.length > 0 && (
                    <button
                      onClick={toggleAllImportEntries}
                      className="flex items-center gap-2 text-xs text-sp-muted hover:text-sp-text transition-colors"
                    >
                      <span className={`material-symbols-outlined text-base ${
                        selectedImportIds.size === sourceEntries.length ? 'text-sp-accent' : ''
                      }`}>
                        {selectedImportIds.size === sourceEntries.length ? 'check_box' : selectedImportIds.size > 0 ? 'indeterminate_check_box' : 'check_box_outline_blank'}
                      </span>
                      전체 선택
                    </button>
                  )}

                  {/* 날짜 일괄 조정 */}
                  {sourceEntries.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-sp-surface border border-sp-border rounded-lg">
                      <span className="text-xs text-sp-muted shrink-0">날짜 일괄 조정</span>
                      <input
                        type="number"
                        value={importDateShiftDays}
                        onChange={(e) => setImportDateShiftDays(Number(e.target.value))}
                        placeholder="0"
                        className="w-20 px-2.5 py-1 bg-sp-card border border-sp-border rounded-lg
                                   text-sp-text text-sm focus:outline-none focus:border-sp-accent text-center"
                      />
                      <span className="text-xs text-sp-muted shrink-0">일</span>
                      {(importDateOverrides.size > 0 || importDateShiftDays !== 0) && (
                        <button
                          type="button"
                          onClick={() => { setImportDateOverrides(new Map()); setImportDateShiftDays(0); }}
                          className="px-3 py-1 bg-sp-surface border border-sp-border text-sp-muted text-xs
                                     rounded-lg hover:text-sp-text transition-colors"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                  )}

                  {sourceEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-sp-muted gap-2">
                      <span className="material-symbols-outlined text-3xl">inbox</span>
                      <p className="text-sm">이 학급에 진도 항목이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {sourceEntries.map((entry) => {
                        const isSelected = selectedImportIds.has(entry.id);
                        const overriddenDate = importDateOverrides.get(entry.id) ?? (importDateShiftDays !== 0 ? shiftDate(entry.date, importDateShiftDays) : entry.date);
                        return (
                          <div
                            key={entry.id}
                            className={`w-full flex items-start gap-3 px-3 py-2 rounded-lg
                                       transition-colors ${
                              isSelected
                                ? 'bg-sp-accent/10 border border-sp-accent/30'
                                : 'bg-sp-surface border border-sp-border'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleImportEntry(entry.id)}
                              className="mt-0.5 shrink-0"
                            >
                              <span className={`material-symbols-outlined text-base ${
                                isSelected ? 'text-sp-accent' : 'text-sp-muted'
                              }`}>
                                {isSelected ? 'check_box' : 'check_box_outline_blank'}
                              </span>
                            </button>
                            <div className="shrink-0 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                              <CalendarPicker
                                value={overriddenDate}
                                onChange={(newDate) => {
                                  setImportDateOverrides((prev) => {
                                    const next = new Map(prev);
                                    next.set(entry.id, newDate);
                                    return next;
                                  });
                                }}
                                lessonDays={lessonDayIndices}
                                compact
                                portal
                                accentColor={subjectAccent}
                              />
                              <span className="text-xs text-sp-muted text-center">{entry.period}교시</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleImportEntry(entry.id)}
                              className="text-sm text-sp-text min-w-0 text-left flex-1"
                            >
                              {entry.unit}
                              <span className="text-sp-muted mx-1">&gt;</span>
                              {entry.lesson}
                              {entry.note && (
                                <span className="block text-xs text-sp-muted/70 truncate mt-0.5">
                                  {entry.note}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            {importSuccessCount === null && (
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-sp-border">
                <button
                  onClick={closeImportModal}
                  className="px-4 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
                >
                  닫기
                </button>
                {importSourceClassId !== null && sourceEntries.length > 0 && (
                  <button
                    onClick={() => void handleImport()}
                    disabled={importLoading || selectedImportIds.size === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-sp-accent text-white
                               text-sm rounded-lg hover:bg-sp-accent/80 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importLoading ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        불러오는 중...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">content_copy</span>
                        {selectedImportIds.size}개 항목 불러오기
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
