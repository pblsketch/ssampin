import { useState } from 'react';
import { useMobileSurveyToolStore } from '@mobile/stores/useMobileSurveyToolStore';
import type { Survey } from '@domain/entities/Survey';

export function TeacherCheckRow({
  student,
  survey,
  entries,
}: {
  student: { number: number; name: string; id: string };
  survey: Survey;
  entries: readonly { studentId: string; questionId: string; value: string | boolean }[];
}) {
  const setLocalEntry = useMobileSurveyToolStore((s) => s.setLocalEntry);
  const [expanded, setExpanded] = useState(false);
  const questions = survey.questions;

  // 이 학생의 체크된 질문 수
  const studentEntries = entries.filter((e) => e.studentId === student.id);
  const checkedCount = studentEntries.filter((e) => e.value === true || e.value === 'true').length;
  const allChecked = checkedCount === questions.length && questions.length > 0;

  const handleToggle = (questionId: string, currentValue: boolean) => {
    void setLocalEntry(survey.id, student.id, questionId, !currentValue);
  };

  // 질문이 1개인 경우: 탭으로 바로 토글
  if (questions.length === 1) {
    const q = questions[0]!;
    const entry = studentEntries.find((e) => e.questionId === q.id);
    const checked = entry?.value === true || entry?.value === 'true';
    return (
      <button
        onClick={() => handleToggle(q.id, checked)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-left active:scale-[0.98] transition-all ${
          checked ? 'bg-green-500/5' : 'bg-red-500/5'
        }`}
      >
        <span
          className={`material-symbols-outlined text-lg ${checked ? 'text-green-500' : 'text-red-400'}`}
        >
          {checked ? 'check_circle' : 'cancel'}
        </span>
        <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
        <span className="text-sm text-sp-text flex-1">{student.name}</span>
      </button>
    );
  }

  // 질문이 여러 개: 탭하면 펼쳐서 질문별 토글
  return (
    <div
      className={`rounded-lg overflow-hidden ${allChecked ? 'bg-green-500/5' : checkedCount > 0 ? 'bg-yellow-500/5' : 'bg-red-500/5'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-3 py-2.5 w-full text-left active:scale-[0.98] transition-transform"
      >
        <span
          className={`material-symbols-outlined text-lg ${
            allChecked ? 'text-green-500' : checkedCount > 0 ? 'text-yellow-500' : 'text-red-400'
          }`}
        >
          {allChecked ? 'check_circle' : checkedCount > 0 ? 'remove_circle' : 'cancel'}
        </span>
        <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
        <span className="text-sm text-sp-text flex-1">{student.name}</span>
        <span className="text-xs text-sp-muted">
          {checkedCount}/{questions.length}
        </span>
        <span
          className={`material-symbols-outlined text-sp-muted text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1 ml-11">
          {questions.map((q) => {
            const entry = studentEntries.find((e) => e.questionId === q.id);
            const checked = entry?.value === true || entry?.value === 'true';
            return (
              <button
                key={q.id}
                onClick={() => handleToggle(q.id, checked)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md active:bg-sp-border/20 transition-colors text-left"
              >
                <span
                  className={`material-symbols-outlined text-base ${checked ? 'text-green-500' : 'text-sp-muted'}`}
                >
                  {checked ? 'check_box' : 'check_box_outline_blank'}
                </span>
                <span className="text-xs text-sp-text flex-1 truncate">{q.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
