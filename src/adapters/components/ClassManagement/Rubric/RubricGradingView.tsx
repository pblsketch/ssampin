/**
 * 채점 화면 (FR-3, D3: 학생별 카드 + 목록 병행).
 *
 * - 왼쪽: 학생 명단(번호·이름·상태 뱃지·합계 미리보기), 키보드 ↑↓ 이동 지원
 * - 오른쪽: 선택 학생의 루브릭 카드 — 요소 단위 블록(D7), 수준 클릭 즉시 저장,
 *   요소별 특이사항 메모 + 학생별 총평(D6, blur 시 저장)
 * - 결시(D8): 채점 입력 비활성 + 합계 산출 제외, 명단에 결시 뱃지
 */
import { useEffect, useMemo, useState } from 'react';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import { calculateMaxScore, calculateTotal, findGrading } from '@domain/rules/rubricRules';
import { RubricExportModal } from './RubricExportModal';
import { RubricFeedbackModal } from './RubricFeedbackModal';

interface StudentRow {
  readonly key: string;
  readonly number: number;
  readonly name: string;
}

/** 명단 표시용 상태: 결시 / 완료 / 부분 / 미채점 */
type RowStatus = 'absent' | 'graded' | 'partial' | 'none';

function rowStatus(grading: RubricGrading | undefined): RowStatus {
  if (grading === undefined) return 'none';
  if (grading.status === 'absent') return 'absent';
  if (grading.status === 'graded') return 'graded';
  const hasAnyInput =
    Object.keys(grading.marks).length > 0 ||
    Object.keys(grading.criterionNotes).length > 0 ||
    grading.overallFeedback !== undefined;
  return hasAnyInput ? 'partial' : 'none';
}

const STATUS_BADGE: Record<Exclude<RowStatus, 'none'>, { label: string; className: string }> = {
  graded: { label: '완료', className: 'bg-emerald-500/10 text-emerald-400' },
  partial: { label: '부분', className: 'bg-amber-500/10 text-amber-400' },
  absent: { label: '결시', className: 'bg-sp-surface text-sp-muted' },
};

interface RubricGradingViewProps {
  rubric: Rubric;
  classId: string;
  onBack: () => void;
}

export function RubricGradingView({ rubric, classId, onBack }: RubricGradingViewProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const gradings = useRubricStore((s) => s.gradings);
  const toggleMark = useRubricStore((s) => s.toggleMark);
  const setCriterionNote = useRubricStore((s) => s.setCriterionNote);
  const setOverallFeedback = useRubricStore((s) => s.setOverallFeedback);
  const setAbsent = useRubricStore((s) => s.setAbsent);

  const currentClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const classDisplayName =
    currentClass !== undefined ? `${currentClass.name} ${currentClass.subject}`.trim() : undefined;

  const students: StudentRow[] = useMemo(() => {
    return (currentClass?.students ?? [])
      .filter(isStudentActive)
      .map((s) => ({ key: studentKey(s), number: s.number, name: s.name }))
      .sort((a, b) => a.number - b.number);
  }, [currentClass]);

  const [selectedKey, setSelectedKey] = useState<string | null>(students[0]?.key ?? null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const selectedIndex = students.findIndex((s) => s.key === selectedKey);
  const selectedStudent = selectedIndex >= 0 ? students[selectedIndex] : undefined;
  const selectedGrading =
    selectedStudent !== undefined
      ? findGrading(gradings, rubric.id, selectedStudent.key)
      : undefined;
  const isAbsent = selectedGrading?.status === 'absent';

  const maxScore = calculateMaxScore(rubric);
  const gradedCount = useMemo(
    () =>
      students.filter((s) => rowStatus(findGrading(gradings, rubric.id, s.key)) === 'graded')
        .length,
    [students, gradings, rubric.id],
  );

  function moveSelection(delta: number) {
    if (students.length === 0) return;
    const base = selectedIndex >= 0 ? selectedIndex : 0;
    const next = Math.min(students.length - 1, Math.max(0, base + delta));
    setSelectedKey(students[next]!.key);
  }

  // 키보드 ↑↓ 학생 이동 — 입력 중에는 간섭하지 않는다
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      moveSelection(e.key === 'ArrowUp' ? -1 : 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // moveSelection은 매 렌더 재생성되지만 의존 값은 아래 두 개로 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, students]);

  const total = selectedGrading !== undefined ? calculateTotal(rubric, selectedGrading) : 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-sp-muted hover:text-sp-text transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            목록
          </button>
          <span className="text-sp-border shrink-0">│</span>
          <h3 className="text-sm font-bold text-sp-text truncate">{rubric.title}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-sp-muted shrink-0">
          <span>
            완료 <span className="text-sp-text font-semibold">{gradedCount}</span>/{students.length}
            명
          </span>
          <span className="text-sp-border">│</span>
          <span>
            만점 <span className="text-sp-accent font-semibold">{maxScore}점</span>
          </span>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sp-border text-xs text-sp-text hover:border-sp-accent transition-colors"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            엑셀 내보내기
          </button>
          <button
            type="button"
            onClick={() => setShowFeedbackModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-sp-border text-xs text-sp-text hover:border-sp-accent transition-colors"
          >
            <span className="material-symbols-outlined text-sm">print</span>
            피드백 출력
          </button>
        </div>
      </div>

      {showExportModal && (
        <RubricExportModal
          rubric={rubric}
          students={students}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showFeedbackModal && (
        <RubricFeedbackModal
          rubric={rubric}
          {...(classDisplayName !== undefined ? { className: classDisplayName } : {})}
          students={students}
          onClose={() => setShowFeedbackModal(false)}
        />
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        {/* 왼쪽: 학생 명단 */}
        <div className="w-64 shrink-0 flex flex-col min-h-0 bg-sp-card border border-sp-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-sp-border shrink-0 flex items-center justify-between">
            <span className="text-xs font-semibold text-sp-text">학생 명단</span>
            <span className="text-caption text-sp-muted">↑↓ 키로 이동</span>
          </div>
          <div className="flex-1 overflow-y-auto" role="listbox" aria-label="채점할 학생 선택">
            {students.map((student) => {
              const grading = findGrading(gradings, rubric.id, student.key);
              const status = rowStatus(grading);
              const studentTotal = grading !== undefined ? calculateTotal(rubric, grading) : null;
              const isSelected = student.key === selectedKey;
              return (
                <button
                  key={student.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => setSelectedKey(student.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-l-2 ${
                    isSelected
                      ? 'border-sp-accent bg-sp-surface'
                      : 'border-transparent hover:bg-sp-surface'
                  }`}
                >
                  <span className="w-6 text-xs text-sp-muted text-right shrink-0">
                    {student.number}
                  </span>
                  <span
                    className={`flex-1 min-w-0 truncate text-sm ${
                      isSelected ? 'text-sp-text font-semibold' : 'text-sp-text'
                    }`}
                  >
                    {student.name}
                  </span>
                  {status !== 'none' && (
                    <span
                      className={`text-caption px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[status].className}`}
                    >
                      {STATUS_BADGE[status].label}
                    </span>
                  )}
                  {status !== 'absent' && studentTotal !== null && studentTotal > 0 && (
                    <span className="text-xs text-sp-accent font-semibold shrink-0 w-8 text-right">
                      {studentTotal}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 오른쪽: 선택 학생 채점 카드 */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {selectedStudent === undefined ? (
            <div className="h-full flex items-center justify-center text-sp-muted text-sm">
              왼쪽 명단에서 학생을 선택해주세요
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-4">
              {/* 학생 헤더 */}
              <div className="flex items-center justify-between gap-2 bg-sp-card border border-sp-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-sp-muted shrink-0">{selectedStudent.number}번</span>
                  <h4 className="text-base font-bold text-sp-text truncate">
                    {selectedStudent.name}
                  </h4>
                  {isAbsent && (
                    <span className="text-caption px-2 py-0.5 rounded-full bg-sp-surface text-sp-muted shrink-0">
                      결시 — 합계 제외
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void setAbsent(rubric.id, classId, selectedStudent.key, !isAbsent)
                    }
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      isAbsent
                        ? 'border-sp-accent text-sp-accent hover:bg-sp-surface'
                        : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
                    }`}
                  >
                    {isAbsent ? '결시 해제' : '결시로 표시'}
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelection(-1)}
                    disabled={selectedIndex <= 0}
                    aria-label="이전 학생"
                    className="p-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base block">
                      keyboard_arrow_up
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelection(1)}
                    disabled={selectedIndex >= students.length - 1}
                    aria-label="다음 학생"
                    className="p-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <span className="material-symbols-outlined text-base block">
                      keyboard_arrow_down
                    </span>
                  </button>
                </div>
              </div>

              {/* 요소 블록 (D7) */}
              {rubric.criteria.map((criterion, index) => {
                const checkedLevelId = selectedGrading?.marks[criterion.id];
                const checkedLevel = criterion.levels.find((l) => l.id === checkedLevelId);
                return (
                  <div
                    key={criterion.id}
                    className={`bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-3 ${
                      isAbsent ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="w-6 h-6 shrink-0 rounded-lg bg-sp-surface border border-sp-border text-sp-accent text-xs font-bold flex items-center justify-center"
                      >
                        {index + 1}
                      </span>
                      <h5 className="text-sm font-semibold text-sp-text flex-1 min-w-0 truncate">
                        {criterion.name}
                      </h5>
                      {checkedLevel !== undefined && (
                        <span className="text-xs text-sp-accent font-semibold shrink-0">
                          {checkedLevel.score}점
                        </span>
                      )}
                    </div>

                    {/* 수준 버튼 — 클릭 즉시 저장, 재클릭 시 해제 */}
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`${criterion.name} 수준 선택`}
                    >
                      {criterion.levels.map((level) => {
                        const isChecked = level.id === checkedLevelId;
                        return (
                          <button
                            key={level.id}
                            type="button"
                            disabled={isAbsent}
                            aria-pressed={isChecked}
                            title={level.description}
                            onClick={() =>
                              void toggleMark(
                                rubric.id,
                                classId,
                                selectedStudent.key,
                                criterion.id,
                                level.id,
                              )
                            }
                            className={`px-3 py-2 rounded-lg text-sm border transition-colors disabled:cursor-not-allowed ${
                              isChecked
                                ? 'bg-sp-accent border-sp-accent text-white font-semibold'
                                : 'bg-sp-surface border-sp-border text-sp-text hover:border-sp-accent'
                            }`}
                          >
                            {level.name}{' '}
                            <span className={isChecked ? 'text-white' : 'text-sp-muted'}>
                              {level.score}점
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 체크된 수준의 성취 설명 (D5) */}
                    {checkedLevel?.description !== undefined && (
                      <p className="text-xs text-sp-muted leading-relaxed">
                        {checkedLevel.description}
                      </p>
                    )}

                    {/* 요소별 특이사항 메모 — blur 시 저장 */}
                    <input
                      key={`note-${selectedStudent.key}-${criterion.id}`}
                      type="text"
                      defaultValue={selectedGrading?.criterionNotes[criterion.id] ?? ''}
                      disabled={isAbsent}
                      placeholder="특이사항 메모 (선택)"
                      aria-label={`${criterion.name} 특이사항 메모`}
                      onBlur={(e) => {
                        const value = e.target.value;
                        const prev = selectedGrading?.criterionNotes[criterion.id] ?? '';
                        if (value !== prev) {
                          void setCriterionNote(
                            rubric.id,
                            classId,
                            selectedStudent.key,
                            criterion.id,
                            value,
                          );
                        }
                      }}
                      className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent disabled:cursor-not-allowed transition-colors"
                    />
                  </div>
                );
              })}

              {/* 총평 (D6) — blur 시 저장 */}
              <div
                className={`bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-2 ${isAbsent ? 'opacity-50' : ''}`}
              >
                <h5 className="text-sm font-semibold text-sp-text">총평</h5>
                <textarea
                  key={`feedback-${selectedStudent.key}`}
                  defaultValue={selectedGrading?.overallFeedback ?? ''}
                  disabled={isAbsent}
                  rows={3}
                  placeholder="피드백 출력물의 마무리 문단으로 들어갑니다 (선택)"
                  aria-label={`${selectedStudent.name} 총평`}
                  onBlur={(e) => {
                    const value = e.target.value;
                    const prev = selectedGrading?.overallFeedback ?? '';
                    if (value !== prev) {
                      void setOverallFeedback(rubric.id, classId, selectedStudent.key, value);
                    }
                  }}
                  className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent resize-y disabled:cursor-not-allowed transition-colors"
                />
              </div>

              {/* 합계 (D1: 단순 합계만) */}
              <div className="flex items-center justify-between bg-sp-card border border-sp-border rounded-xl px-4 py-3">
                <span className="text-sm font-semibold text-sp-text">합계</span>
                {isAbsent ? (
                  <span className="text-sm text-sp-muted">결시 — 합계에서 제외</span>
                ) : (
                  <span className="text-sm text-sp-text">
                    <span className="text-lg font-bold text-sp-accent">{total ?? 0}점</span>
                    <span className="text-sp-muted"> / 만점 {maxScore}점</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
