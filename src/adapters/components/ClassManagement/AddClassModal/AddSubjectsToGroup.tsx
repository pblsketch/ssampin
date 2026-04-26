import { useMemo, useState, useCallback, useEffect } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';

interface AddSubjectsToGroupProps {
  onClose: () => void;
  onSwitchToNew: () => void;
}

interface GroupSummary {
  readonly groupId: string;
  readonly name: string;
  readonly subjects: readonly string[];
  readonly classCount: number;
  readonly studentCount: number;
}

interface SubjectCandidate {
  readonly subject: string;
  readonly weeklyPeriods: number;
  readonly teachers: ReadonlySet<string>;
  readonly isSpecialist: boolean;
  readonly alreadyInGroup: boolean;
  readonly isCustom: boolean;
}

const DAYS = ['월', '화', '수', '목', '금'] as const;

interface ExtractEntry {
  subject: string;
  weeklyPeriods: number;
  teachers: Set<string>;
}

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

/**
 * 기존 groupId 그룹에 과목만 추가하는 플로우.
 * - 그룹이 1개 → 자동 선택
 * - 그룹이 2개 이상 → 그룹 선택 단계 먼저
 * - 선택 후 시간표 기반 과목 선택 (이미 그룹에 있는 과목은 비활성)
 */
export function AddSubjectsToGroup({ onClose, onSwitchToNew }: AddSubjectsToGroupProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const addSubjectsToGroup = useTeachingClassStore((s) => s.addSubjectsToGroup);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const teacherName = useSettingsStore((s) => s.settings.teacherName);
  const trimmedTeacherName = teacherName?.trim() ?? '';
  const hasTeacherName = trimmedTeacherName.length > 0;

  /** 그룹 요약 추출 */
  const groups = useMemo<GroupSummary[]>(() => {
    const map = new Map<string, {
      groupId: string;
      name: string;
      subjects: string[];
      studentCount: number;
      classCount: number;
    }>();
    for (const c of classes) {
      if (!c.groupId) continue;
      const existing = map.get(c.groupId);
      if (existing) {
        existing.subjects.push(c.subject);
        existing.classCount += 1;
      } else {
        map.set(c.groupId, {
          groupId: c.groupId,
          name: c.name,
          subjects: [c.subject],
          studentCount: c.students.length,
          classCount: 1,
        });
      }
    }
    return [...map.values()];
  }, [classes]);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    groups.length === 1 ? (groups[0]?.groupId ?? null) : null,
  );
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // 그룹 개수가 1개로 변하면 자동 선택
  useEffect(() => {
    if (selectedGroupId) return;
    if (groups.length === 1) {
      setSelectedGroupId(groups[0]?.groupId ?? null);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.groupId === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const subjectsInGroup = useMemo(
    () => new Set(selectedGroup?.subjects ?? []),
    [selectedGroup],
  );

  /** 시간표에서 후보 과목 추출 */
  const candidates = useMemo<SubjectCandidate[]>(() => {
    if (!selectedGroup) return [];
    const classMap = extractFromClassSchedule(classSchedule);
    const entries: ExtractEntry[] =
      classMap.size > 0
        ? [...classMap.values()]
        : [...extractFromTeacherSchedule(teacherSchedule).values()];

    const fromSchedule: SubjectCandidate[] = entries.map((entry) => {
      let isSpecialist = false;
      if (hasTeacherName && entry.teachers.size > 0) {
        isSpecialist = !entry.teachers.has(trimmedTeacherName);
      }
      return {
        subject: entry.subject,
        weeklyPeriods: entry.weeklyPeriods,
        teachers: entry.teachers,
        isSpecialist,
        alreadyInGroup: subjectsInGroup.has(entry.subject),
        isCustom: false,
      };
    });
    fromSchedule.sort((a, b) => b.weeklyPeriods - a.weeklyPeriods);

    const scheduleSubjects = new Set(fromSchedule.map((c) => c.subject));
    const customEntries: SubjectCandidate[] = customSubjects
      .filter((s) => !scheduleSubjects.has(s))
      .map((subject) => ({
        subject,
        weeklyPeriods: 0,
        teachers: new Set<string>(),
        isSpecialist: false,
        alreadyInGroup: subjectsInGroup.has(subject),
        isCustom: true,
      }));

    return [...fromSchedule, ...customEntries];
  }, [
    selectedGroup,
    classSchedule,
    teacherSchedule,
    customSubjects,
    subjectsInGroup,
    hasTeacherName,
    trimmedTeacherName,
  ]);

  const hasTimetable = candidates.some((c) => !c.isCustom);

  const toggleSubject = useCallback((subject: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  }, []);

  const handleAddCustom = useCallback(() => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (subjectsInGroup.has(trimmed)) {
      setCustomInput('');
      return;
    }
    if (customSubjects.includes(trimmed)) {
      setCustomInput('');
      return;
    }
    const existsInSchedule = candidates.some((c) => !c.isCustom && c.subject === trimmed);
    if (existsInSchedule) {
      setCustomInput('');
      return;
    }
    setCustomSubjects((prev) => [...prev, trimmed]);
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      next.add(trimmed);
      return next;
    });
    setCustomInput('');
  }, [customInput, customSubjects, subjectsInGroup, candidates]);

  const removeCustom = useCallback((subject: string) => {
    setCustomSubjects((prev) => prev.filter((s) => s !== subject));
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      next.delete(subject);
      return next;
    });
  }, []);

  const canProceed = !!selectedGroup && selectedSubjects.size > 0;

  const handleComplete = useCallback(async () => {
    if (!selectedGroup || selectedSubjects.size === 0 || saving) return;
    setSaving(true);
    try {
      const list = [...selectedSubjects];
      await addSubjectsToGroup(selectedGroup.groupId, list);
      // 새로 추가된 과목 중 첫 번째 선택
      const updated = useTeachingClassStore.getState().classes;
      const newCls = updated.find(
        (c) => c.groupId === selectedGroup.groupId && list.includes(c.subject),
      );
      if (newCls) selectClass(newCls.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selectedGroup, selectedSubjects, saving, addSubjectsToGroup, selectClass, onClose]);

  // ─────────── 그룹 없음: 새 학급으로 폴백 ───────────
  if (groups.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
          <h2 className="text-base font-bold text-sp-text mb-3">기존 학급에 과목 추가</h2>
          <p className="text-sm text-sp-muted mb-4">
            아직 생성된 학급 그룹이 없습니다. 먼저 새 학급을 만들어주세요.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
            >
              취소
            </button>
            <button
              onClick={onSwitchToNew}
              className="flex-1 text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors"
            >
              새 학급 만들기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-sp-text">기존 학급에 과목 추가</h2>
          <button
            onClick={onSwitchToNew}
            className="text-detail text-sp-muted hover:text-sp-accent hover:underline"
          >
            ← 새 학급 만들기
          </button>
        </div>

        {/* 그룹 선택 단계 */}
        {!selectedGroup ? (
          <>
            <p className="text-sm text-sp-muted mb-3">
              어느 학급에 과목을 추가할까요?
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {groups.map((g) => (
                <button
                  key={g.groupId}
                  type="button"
                  onClick={() => setSelectedGroupId(g.groupId)}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-sp-bg hover:bg-sp-surface border border-sp-border hover:border-sp-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-sp-text">{g.name}</span>
                    <span className="text-detail text-sp-muted">
                      학생 {g.studentCount}명 · 과목 {g.classCount}개
                    </span>
                  </div>
                  <p className="text-detail text-sp-muted mt-1 truncate">
                    {g.subjects.join(', ')}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={onClose}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 그룹이 2개 이상일 때만 ← 그룹 선택으로 돌아가기 표시 */}
            {groups.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
                className="text-detail text-sp-muted hover:text-sp-accent hover:underline mb-2 flex items-center gap-1"
              >
                ← 다른 학급 선택
              </button>
            )}

            <div className="mb-3 px-3 py-2 bg-sp-accent/10 border border-sp-accent/30 rounded-lg text-xs text-sp-muted">
              <span className="text-sp-text font-medium">{selectedGroup.name}</span> 학급에
              과목을 추가합니다. 학생 명렬은 그룹 기존 {selectedGroup.studentCount}명이 그대로 공유됩니다.
            </div>

            {!hasTeacherName && hasTimetable && (
              <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-2 rounded-lg text-xs text-amber-300 mb-3">
                선생님 이름이 설정에 등록되지 않아 전담 과목을 구분할 수 없습니다.
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="py-6 text-center bg-sp-surface/40 border border-sp-border rounded-lg mb-3">
                <p className="text-sm text-sp-muted mb-2">
                  시간표에서 추출 가능한 과목이 없습니다
                </p>
                <p className="text-detail text-sp-muted/70">
                  아래에서 직접 입력해주세요
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {candidates.map((item) => {
                  const isChecked = selectedSubjects.has(item.subject);
                  const isDisabled = item.alreadyInGroup;
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
                          <span className="text-caption text-sp-accent bg-sp-accent/10 px-1.5 py-0.5 rounded">
                            직접 추가
                          </span>
                        ) : (
                          <span className="text-detail text-sp-muted">
                            주 {item.weeklyPeriods}시간
                          </span>
                        )}
                        {specialistLabel && (
                          <span className="text-caption text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                            {specialistLabel}
                          </span>
                        )}
                      </div>
                      {isDisabled && (
                        <span className="text-caption text-sp-muted bg-sp-surface px-1.5 py-0.5 rounded">
                          등록됨
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
            )}

            {/* 직접 입력 */}
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

            <div className="flex gap-2 mt-5">
              <button
                onClick={onClose}
                disabled={saving}
                className="flex-1 text-sm bg-sp-border text-sp-muted rounded-lg py-2 hover:bg-sp-border/80 transition-colors disabled:opacity-40"
              >
                취소
              </button>
              <button
                onClick={() => void handleComplete()}
                disabled={!canProceed || saving}
                className="flex-[1.2] text-sm bg-sp-accent text-white rounded-lg py-2 hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
              >
                {saving
                  ? '추가 중...'
                  : selectedSubjects.size > 0
                    ? `${selectedSubjects.size}개 과목 추가`
                    : '과목 추가'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
