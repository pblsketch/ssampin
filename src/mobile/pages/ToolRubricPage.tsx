import { useEffect, useMemo, useState } from 'react';
import { useMobileRubricStore } from '@mobile/stores/useMobileRubricStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';

interface Props {
  onBack: () => void;
}

type View = 'classes' | 'rubrics' | 'students';
type GradingTone = 'muted' | 'partial' | 'done' | 'absent';

const TONE_CLASS: Record<GradingTone, string> = {
  muted: 'bg-black/5 text-sp-muted',
  partial: 'bg-amber-500/15 text-amber-500',
  done: 'bg-green-500/15 text-green-500',
  absent: 'bg-red-500/10 text-red-400',
};

/** 채점된 수준의 배점 합계 / 요소별 최고 배점 합계(만점) */
function calcScores(
  rubric: Rubric,
  grading: RubricGrading | undefined,
): { earned: number; possible: number } {
  let earned = 0;
  let possible = 0;
  for (const criterion of rubric.criteria) {
    const maxScore = criterion.levels.reduce((max, level) => Math.max(max, level.score), 0);
    possible += maxScore;
    const markedLevelId = grading?.marks[criterion.id];
    if (markedLevelId !== undefined) {
      const level = criterion.levels.find((l) => l.id === markedLevelId);
      if (level !== undefined) earned += level.score;
    }
  }
  return { earned, possible };
}

function gradingSummary(
  grading: RubricGrading | undefined,
  criteriaCount: number,
): { label: string; tone: GradingTone } {
  if (grading === undefined) return { label: '미채점', tone: 'muted' };
  if (grading.status === 'absent') return { label: '결시', tone: 'absent' };
  const markedCount = Object.keys(grading.marks).length;
  if (criteriaCount > 0 && markedCount >= criteriaCount)
    return { label: '채점 완료', tone: 'done' };
  if (markedCount > 0) return { label: `${markedCount}/${criteriaCount} 요소`, tone: 'partial' };
  return { label: '미채점', tone: 'muted' };
}

interface GradingSheetProps {
  rubric: Rubric;
  classId: string;
  student: TeachingClassStudent;
  gradingFor: (rubricId: string, studentId: string) => RubricGrading | undefined;
  toggleMark: (
    rubricId: string,
    classId: string,
    studentId: string,
    criterionId: string,
    levelId: string,
  ) => Promise<void>;
  setAbsent: (
    rubricId: string,
    classId: string,
    studentId: string,
    absent: boolean,
  ) => Promise<void>;
  setCriterionNote: (
    rubricId: string,
    classId: string,
    studentId: string,
    criterionId: string,
    note: string,
  ) => Promise<void>;
  setOverallFeedback: (
    rubricId: string,
    classId: string,
    studentId: string,
    feedback: string,
  ) => Promise<void>;
  onClose: () => void;
}

/** 학생 1명 채점 바텀시트 — 결시 토글 + 요소별 수준 선택 칩 + 요소 메모(선택) + 총평(선택) */
function GradingSheet({
  rubric,
  classId,
  student,
  gradingFor,
  toggleMark,
  setAbsent,
  setCriterionNote,
  setOverallFeedback,
  onClose,
}: GradingSheetProps) {
  useBottomSheet(true, onClose);

  const studentId = studentKey(student);
  const grading = gradingFor(rubric.id, studentId);
  const isAbsent = grading?.status === 'absent';
  const { earned, possible } = calcScores(rubric, grading);

  const [savingAbsent, setSavingAbsent] = useState(false);
  const [feedback, setFeedback] = useState(grading?.overallFeedback ?? '');
  const [openNoteIds, setOpenNoteIds] = useState<ReadonlySet<string>>(new Set());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const sortedCriteria = useMemo(
    () => rubric.criteria.slice().sort((a, b) => a.order - b.order),
    [rubric.criteria],
  );

  const handleToggleAbsent = async () => {
    setSavingAbsent(true);
    try {
      await setAbsent(rubric.id, classId, studentId, !isAbsent);
    } finally {
      setSavingAbsent(false);
    }
  };

  const handleFeedbackBlur = () => {
    const trimmed = feedback.trim();
    if (trimmed === (grading?.overallFeedback ?? '')) return;
    void setOverallFeedback(rubric.id, classId, studentId, trimmed);
  };

  const toggleNoteOpen = (criterionId: string) => {
    setOpenNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(criterionId)) {
        next.delete(criterionId);
      } else {
        next.add(criterionId);
      }
      return next;
    });
    setNoteDrafts((prev) =>
      criterionId in prev
        ? prev
        : { ...prev, [criterionId]: grading?.criterionNotes[criterionId] ?? '' },
    );
  };

  const handleNoteBlur = (criterionId: string) => {
    const draft = (noteDrafts[criterionId] ?? '').trim();
    const original = grading?.criterionNotes[criterionId] ?? '';
    if (draft === original) return;
    void setCriterionNote(rubric.id, classId, studentId, criterionId, draft);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] bg-sp-card border-t border-sp-border rounded-t-2xl pb-[env(safe-area-inset-bottom)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="px-2 pt-2 flex justify-center shrink-0">
          <div className="w-12 h-1 bg-sp-border rounded-full" aria-hidden />
        </div>

        <div className="px-5 pt-3 pb-2 shrink-0 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sp-text font-bold text-base truncate">
              {student.number}번 {student.name}
            </h3>
            <p className="text-xs text-sp-muted mt-0.5">
              {rubric.title} · {isAbsent ? '결시' : `${earned} / ${possible}점`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sp-muted active:scale-95 transition-transform p-1 -mr-1"
            aria-label="닫기"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <button
            onClick={() => void handleToggleAbsent()}
            disabled={savingAbsent}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-60 ${
              isAbsent
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-black/5 border-sp-border text-sp-muted'
            }`}
            style={{ minHeight: 44 }}
          >
            <span className="material-symbols-outlined text-lg">
              {isAbsent ? 'event_busy' : 'event_available'}
            </span>
            {isAbsent ? '결시 처리됨 · 눌러서 해제' : '결시 처리'}
          </button>
        </div>

        <div
          className={`flex-1 overflow-auto px-5 pb-4 space-y-5 ${
            isAbsent ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          {sortedCriteria.map((criterion) => {
            const markedLevelId = grading?.marks[criterion.id];
            const noteOpen = openNoteIds.has(criterion.id);
            return (
              <div key={criterion.id}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-sp-text flex-1 truncate">
                    {criterion.name}
                  </p>
                  <button
                    onClick={() => toggleNoteOpen(criterion.id)}
                    disabled={isAbsent}
                    className={`p-1.5 rounded-lg transition-colors ${
                      noteOpen ? 'text-sp-accent' : 'text-sp-muted'
                    }`}
                    aria-label="요소 메모"
                    style={{ minWidth: 32, minHeight: 32 }}
                  >
                    <span className="material-symbols-outlined text-lg">edit_note</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {criterion.levels.map((level) => {
                    const selected = markedLevelId === level.id;
                    return (
                      <button
                        key={level.id}
                        onClick={() =>
                          void toggleMark(rubric.id, classId, studentId, criterion.id, level.id)
                        }
                        disabled={isAbsent}
                        className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                          selected
                            ? 'bg-sp-accent text-white border-sp-accent'
                            : 'bg-sp-surface text-sp-text border-sp-border'
                        }`}
                        style={{ minHeight: 44 }}
                      >
                        {level.name}{' '}
                        <span className="tabular-nums opacity-80">· {level.score}점</span>
                      </button>
                    );
                  })}
                </div>
                {noteOpen && (
                  <input
                    type="text"
                    value={noteDrafts[criterion.id] ?? ''}
                    onChange={(e) =>
                      setNoteDrafts((prev) => ({
                        ...prev,
                        [criterion.id]: e.target.value.slice(0, 200),
                      }))
                    }
                    onBlur={() => handleNoteBlur(criterion.id)}
                    disabled={isAbsent}
                    placeholder="이 요소에 대한 특이사항 (선택)"
                    className="glass-input w-full rounded-xl px-3 py-2 mt-2 text-sp-text text-sm"
                    style={{ minHeight: 44 }}
                  />
                )}
              </div>
            );
          })}

          <div>
            <label className="block text-sp-muted text-xs mb-1.5">
              총평 (선택) <span className="tabular-nums">({feedback.length}/500자)</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, 500))}
              onBlur={handleFeedbackBlur}
              disabled={isAbsent}
              placeholder="학생에게 남길 총평을 입력하세요."
              rows={3}
              className="glass-input w-full rounded-xl px-3 py-2 text-sp-text text-sm resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToolRubricPage({ onBack }: Props) {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const classesLoaded = useMobileTeachingClassStore((s) => s.loaded);

  const rubricsForClass = useMobileRubricStore((s) => s.rubricsForClass);
  // rubrics 배열을 직접 구독해야 동기화 재로드로 평가지가 바뀌면 목록이 반응한다.
  const allRubrics = useMobileRubricStore((s) => s.rubrics);
  const gradingFor = useMobileRubricStore((s) => s.gradingFor);
  const toggleMark = useMobileRubricStore((s) => s.toggleMark);
  const setAbsent = useMobileRubricStore((s) => s.setAbsent);
  const setCriterionNote = useMobileRubricStore((s) => s.setCriterionNote);
  const setOverallFeedback = useMobileRubricStore((s) => s.setOverallFeedback);
  // gradingFor는 함수(참조 불변)라 gradings를 직접 구독해야 채점 변경 시 리렌더된다.
  const gradings = useMobileRubricStore((s) => s.gradings);
  const rubricsLoaded = useMobileRubricStore((s) => s.loaded);

  const [view, setView] = useState<View>('classes');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedRubricId, setSelectedRubricId] = useState<string | null>(null);
  const [gradingStudent, setGradingStudent] = useState<TeachingClassStudent | null>(null);

  useEffect(() => {
    void useMobileRubricStore.getState().load();
    void useMobileTeachingClassStore.getState().load();
  }, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );
  const rubrics = useMemo(
    () => (selectedClassId !== null ? allRubrics.filter((r) => r.classId === selectedClassId) : []),
    [allRubrics, selectedClassId],
  );
  const selectedRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) ?? null,
    [rubrics, selectedRubricId],
  );

  const goBack = () => {
    if (view === 'students') {
      setView('rubrics');
      setSelectedRubricId(null);
      return;
    }
    if (view === 'rubrics') {
      setView('classes');
      setSelectedClassId(null);
      return;
    }
    onBack();
  };

  const headerTitle =
    view === 'classes'
      ? '수행평가 채점'
      : view === 'rubrics'
        ? (selectedClass?.name ?? '평가지 선택')
        : (selectedRubric?.title ?? '학생 목록');

  if (!classesLoaded || !rubricsLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={goBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text truncate">{headerTitle}</h2>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {/* 1단계: 수업반 선택 */}
        {view === 'classes' &&
          (classes.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-sp-muted text-4xl">school</span>
              <p className="text-sp-muted text-sm mt-2">등록된 수업반이 없어요</p>
              <p className="text-sp-muted text-xs mt-1">
                PC 앱에서 수업반을 추가한 후 동기화하세요
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {classes.map((tc) => (
                <button
                  key={tc.id}
                  onClick={() => {
                    setSelectedClassId(tc.id);
                    setView('rubrics');
                  }}
                  className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform flex items-center gap-3"
                  style={{ minHeight: 44 }}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-black/5 shrink-0">
                    <span className="material-symbols-outlined text-sp-accent">school</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-sp-text truncate">{tc.name}</p>
                    <p className="text-xs text-sp-muted mt-0.5">
                      {tc.subject} · {tc.students.length}명 · 평가지 {rubricsForClass(tc.id).length}
                      개
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                    chevron_right
                  </span>
                </button>
              ))}
            </div>
          ))}

        {/* 2단계: 평가지 선택 */}
        {view === 'rubrics' &&
          (selectedClass === null ? null : rubrics.length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-sp-muted text-4xl">grading</span>
              <p className="text-sp-muted text-sm mt-2">이 반의 평가지가 없어요</p>
              <p className="text-sp-muted text-xs mt-1">PC 앱에서 평가지를 만든 뒤 동기화하세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rubrics.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedRubricId(r.id);
                    setView('students');
                  }}
                  className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform flex items-center gap-3"
                  style={{ minHeight: 44 }}
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-black/5 shrink-0">
                    <span className="material-symbols-outlined text-sp-accent">grading</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-sp-text truncate">{r.title}</p>
                    <p className="text-xs text-sp-muted mt-0.5">
                      평가 요소 {r.criteria.length}개
                      {r.description !== undefined && r.description.length > 0
                        ? ` · ${r.description}`
                        : ''}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                    chevron_right
                  </span>
                </button>
              ))}
            </div>
          ))}

        {/* 3단계: 학생 목록 + 채점 */}
        {view === 'students' &&
          (selectedClass === null || selectedRubric === null ? null : selectedClass.students
              .length === 0 ? (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-sp-muted text-4xl">group_off</span>
              <p className="text-sp-muted text-sm mt-2">이 반에 등록된 학생이 없어요</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {selectedClass.students
                .slice()
                .sort((a, b) => a.number - b.number)
                .map((student) => {
                  const sid = studentKey(student);
                  const grading = gradings.find(
                    (g) => g.rubricId === selectedRubric.id && g.studentId === sid,
                  );
                  const summary = gradingSummary(grading, selectedRubric.criteria.length);
                  return (
                    <button
                      key={sid}
                      onClick={() => setGradingStudent(student)}
                      className="w-full glass-card p-3.5 text-left active:scale-[0.98] transition-transform flex items-center gap-3"
                      style={{ minHeight: 44 }}
                    >
                      <span className="text-xs text-sp-muted w-6 text-right shrink-0">
                        {student.number}
                      </span>
                      <span className="text-sm text-sp-text flex-1 truncate">{student.name}</span>
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${TONE_CLASS[summary.tone]}`}
                      >
                        {summary.label}
                      </span>
                      <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                        chevron_right
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
      </div>

      {gradingStudent !== null && selectedClassId !== null && selectedRubric !== null && (
        <GradingSheet
          key={studentKey(gradingStudent)}
          rubric={selectedRubric}
          classId={selectedClassId}
          student={gradingStudent}
          gradingFor={gradingFor}
          toggleMark={toggleMark}
          setAbsent={setAbsent}
          setCriterionNote={setCriterionNote}
          setOverallFeedback={setOverallFeedback}
          onClose={() => setGradingStudent(null)}
        />
      )}
    </div>
  );
}
