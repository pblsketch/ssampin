import { useEffect, useMemo, useState } from 'react';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { isSubjectMatch } from '@domain/rules/matchingRules';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 모달 진입 시점의 현재 교시 (수업 중일 때만 호출) — default: 1 */
  defaultPeriod?: number;
  /** 시간표상 표시되는 과목명 (Today CurrentClassCard 진입점에서만 사용) */
  subject?: string;
  /** 시간표상 표시되는 교실명 (동상) */
  classroom?: string;
  /**
   * 모드 — 'add' (추가, default) | 'edit' (편집).
   * mode='edit'일 때는 entryToEdit의 값으로 폼이 prefill되고 저장 시 updateEntry가 호출된다.
   */
  mode?: 'add' | 'edit';
  /**
   * 학급 강제 지정 — 진도 서브탭 진입점에서 사용.
   * 설정 시 후보 자동 선택 단계 스킵 + lockClass와 함께 사용하면 학급 선택 UI를 숨김.
   */
  defaultClassId?: string;
  /**
   * 학급 선택 UI 잠금 — true면 학급 선택 영역 자체를 렌더하지 않고 학급명만 readonly 텍스트로 표시.
   * defaultClassId 또는 entryToEdit.classId가 있어야 의미 있음.
   */
  lockClass?: boolean;
  /**
   * 편집 모드 진입 시 prefill할 항목 (mode='edit'일 때 필수).
   */
  entryToEdit?: ProgressEntry;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 모바일 "오늘의 진도 기록" / "진도 항목 편집" 모달.
 * - mode='add' (default): 시간표 매칭으로 후보 학급 자동 선택, 또는 defaultClassId로 강제 지정.
 * - mode='edit': entryToEdit의 값으로 폼 prefill, 저장 시 updateEntry 호출.
 */
export function MobileProgressLogModal({
  isOpen,
  onClose,
  defaultPeriod = 1,
  subject = '',
  classroom = '',
  mode = 'add',
  defaultClassId,
  lockClass = false,
  entryToEdit,
}: Props) {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const loadClasses = useMobileTeachingClassStore((s) => s.load);
  const loadProgress = useMobileProgressStore((s) => s.load);
  const addEntry = useMobileProgressStore((s) => s.addEntry);
  const updateEntry = useMobileProgressStore((s) => s.updateEntry);
  const getTodayEntries = useMobileProgressStore((s) => s.getTodayEntries);
  const settings = useMobileSettingsStore((s) => s.settings);

  // 시간표(과목+교실)에 매칭되는 후보 학급들 (mode='add' && defaultClassId 미지정 시에만 의미 있음)
  const candidates = useMemo(() => {
    if (defaultClassId) {
      const cls = classes.find((c) => c.id === defaultClassId);
      return cls ? [cls] : [];
    }
    if (!subject && !classroom) return classes;
    const exact: TeachingClass[] = [];
    const partial: TeachingClass[] = [];
    for (const cls of classes) {
      const subjMatch = subject ? isSubjectMatch(subject, cls.subject) : true;
      const roomMatch =
        !classroom ||
        cls.name === classroom ||
        cls.name.includes(classroom) ||
        classroom.includes(cls.name);
      if (subjMatch && roomMatch) exact.push(cls);
      else if (subjMatch || roomMatch) partial.push(cls);
    }
    return exact.length > 0 ? exact : partial;
  }, [classes, subject, classroom, defaultClassId]);

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [unit, setUnit] = useState('');
  const [lesson, setLesson] = useState('');
  const [note, setNote] = useState('');
  const [period, setPeriod] = useState(defaultPeriod);
  const [formDate, setFormDate] = useState<string>(todayString);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      void loadClasses();
      void loadProgress();
    }
  }, [isOpen, loadClasses, loadProgress]);

  // 모달 오픈마다 폼 초기화 — mode 분기
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && entryToEdit) {
      // 편집 모드: 기존 값으로 prefill
      setSelectedClassId(entryToEdit.classId);
      setUnit(entryToEdit.unit);
      setLesson(entryToEdit.lesson);
      setNote(entryToEdit.note ?? '');
      setPeriod(entryToEdit.period);
      setFormDate(entryToEdit.date);
      setSavedAt(null);
      return;
    }

    // 추가 모드
    setUnit('');
    setLesson('');
    setNote('');
    setPeriod(defaultPeriod);
    setFormDate(todayString());
    setSavedAt(null);

    // 학급 선택: defaultClassId 우선, 그다음 후보 첫 번째
    if (defaultClassId) {
      setSelectedClassId(defaultClassId);
    } else if (candidates.length > 0 && candidates[0]) {
      setSelectedClassId(candidates[0].id);
    } else {
      setSelectedClassId('');
    }
  }, [isOpen, mode, entryToEdit, defaultPeriod, defaultClassId, candidates]);

  // 오늘 이미 기록된 같은 학급의 진도 (요약 표시용 — 추가 모드 + 오늘 기록일 때만 가치 있음)
  const todayEntries = useMemo(() => {
    if (!selectedClassId || mode === 'edit') return [];
    return getTodayEntries(selectedClassId);
  }, [selectedClassId, getTodayEntries, mode]);

  // 같은 학급 가장 최근 단원 (자동 채우기 힌트, 추가 모드만)
  const recentUnit = useMemo(() => {
    if (!selectedClassId || mode === 'edit') return '';
    const all = useMobileProgressStore.getState().getEntriesByClass(selectedClassId);
    return all[0]?.unit ?? '';
  }, [selectedClassId, mode]);

  // 학급 표시 정보 (lockClass=true일 때 readonly 한 줄로 보여줄 때 사용)
  const lockedClass = useMemo(() => {
    if (!lockClass) return null;
    const id = mode === 'edit' && entryToEdit ? entryToEdit.classId : (defaultClassId ?? selectedClassId);
    return classes.find((c) => c.id === id) ?? null;
  }, [lockClass, mode, entryToEdit, defaultClassId, selectedClassId, classes]);

  if (!isOpen) return null;

  const canSave = !!selectedClassId && unit.trim() !== '' && lesson.trim() !== '' && !saving;
  const headerLabel = mode === 'edit' ? '진도 항목 편집' : '오늘 진도 기록';
  const successLabel = mode === 'edit' ? '진도가 수정되었습니다' : '진도가 기록되었습니다';

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (mode === 'edit' && entryToEdit) {
        const updated: ProgressEntry = {
          ...entryToEdit,
          date: formDate,
          period,
          unit: unit.trim(),
          lesson: lesson.trim(),
          note: note.trim(),
        };
        await updateEntry(updated);
      } else {
        // 미래 날짜로 추가하면 'planned'(예정), 그 외엔 'completed'(완료) 기본값
        const targetDate = formDate || todayString();
        const inferredStatus: ProgressStatus =
          targetDate > todayString() ? 'planned' : 'completed';
        await addEntry(
          selectedClassId,
          targetDate,
          period,
          unit.trim(),
          lesson.trim(),
          note.trim() || undefined,
          inferredStatus,
        );
      }
      setSavedAt(Date.now());
      setTimeout(() => onClose(), 700);
    } finally {
      setSaving(false);
    }
  };

  const maxPeriods = settings.periodTimes.length || 8;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-sp-card border border-sp-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sp-border">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent">
              {mode === 'edit' ? 'edit_note' : 'trending_up'}
            </span>
            <span className="text-sp-text font-bold">{headerLabel}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-sp-muted hover:text-sp-text transition-colors rounded-lg"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto">
          {savedAt !== null ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <span className="material-symbols-outlined text-5xl text-green-400">check_circle</span>
              <p className="text-sp-text font-medium">{successLabel}</p>
            </div>
          ) : (
            <>
              {/* 학급 — lockClass=true면 readonly 한 줄, 아니면 선택 UI */}
              {lockClass ? (
                lockedClass && (
                  <div>
                    <label className="block text-xs text-sp-muted mb-1">학급</label>
                    <div className="px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text">
                      {lockedClass.subject}
                      <span className="text-sp-muted mx-1.5">·</span>
                      {lockedClass.name}
                    </div>
                  </div>
                )
              ) : (
                <div>
                  <label className="block text-xs text-sp-muted mb-1">학급</label>
                  {candidates.length === 0 ? (
                    <div className="px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-muted">
                      현재 시간표({subject} · {classroom})에 매칭되는 학급이 없습니다.
                      <br />
                      데스크톱에서 학급을 먼저 등록하세요.
                    </div>
                  ) : candidates.length === 1 && candidates[0] ? (
                    <div className="px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text">
                      {candidates[0].subject}
                      <span className="text-sp-muted mx-1.5">·</span>
                      {candidates[0].name}
                    </div>
                  ) : (
                    <select
                      value={selectedClassId}
                      onChange={(e) => setSelectedClassId(e.target.value)}
                      className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
                    >
                      {candidates.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.subject} · {cls.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* 날짜 — 편집 모드에서만 표시 (추가는 항상 오늘) */}
              {mode === 'edit' && (
                <div>
                  <label className="block text-xs text-sp-muted mb-1">날짜</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
                  />
                </div>
              )}

              {/* 교시 */}
              <div>
                <label className="block text-xs text-sp-muted mb-1">교시</label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent"
                >
                  {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>
                      {p}교시
                    </option>
                  ))}
                </select>
              </div>

              {/* 단원 */}
              <div>
                <label className="block text-xs text-sp-muted mb-1">단원</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={recentUnit ? `예: ${recentUnit}` : '예: 1단원 - 문학의 이해'}
                  className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent placeholder:text-sp-muted/50"
                />
                {recentUnit && unit === '' && (
                  <button
                    type="button"
                    onClick={() => setUnit(recentUnit)}
                    className="mt-1 text-xs text-sp-accent hover:underline"
                  >
                    최근 단원 그대로 사용 ({recentUnit})
                  </button>
                )}
              </div>

              {/* 차시/주제 */}
              <div>
                <label className="block text-xs text-sp-muted mb-1">차시 / 주제</label>
                <input
                  type="text"
                  value={lesson}
                  onChange={(e) => setLesson(e.target.value)}
                  placeholder="예: 1차시 - 소설의 구성요소"
                  className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent placeholder:text-sp-muted/50"
                />
              </div>

              {/* 비고 (선택) */}
              <div>
                <label className="block text-xs text-sp-muted mb-1">메모 (선택)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 모둠 활동 / 진도 조정"
                  className="w-full px-3 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-text text-sm focus:outline-none focus:border-sp-accent placeholder:text-sp-muted/50"
                />
              </div>

              {/* 오늘 이미 기록된 진도 요약 (추가 모드 한정) */}
              {mode === 'add' && todayEntries.length > 0 && (
                <div className="bg-sp-surface/60 border border-sp-border rounded-lg px-3 py-2">
                  <p className="text-xs text-sp-muted mb-1">오늘 이미 기록한 진도</p>
                  <ul className="space-y-0.5">
                    {todayEntries.map((e) => (
                      <li key={e.id} className="text-xs text-sp-text">
                        {e.period}교시 · {e.unit}
                        <span className="text-sp-muted mx-1">›</span>
                        {e.lesson}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        {savedAt === null && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t border-sp-border">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="flex items-center gap-1.5 px-4 py-2 bg-sp-accent text-white text-sm rounded-lg hover:bg-sp-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                  저장 중
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">check</span>
                  저장
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
