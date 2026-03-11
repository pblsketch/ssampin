import { useState, useMemo, useCallback } from 'react';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { StudentGrid } from '@adapters/components/Homeroom/shared/StudentGrid';
import { ExportModal } from '@adapters/components/Homeroom/shared/ExportModal';
import type { CycleModeProps } from '@adapters/components/Homeroom/shared/StudentGrid';
import type { Survey, SurveyQuestion } from '@domain/entities/Survey';
import {
  aggregateAnswers,
  formatSurveyForCSV,
  getTeacherCheckProgress,
} from '@domain/rules/surveyRules';

/* ──────────────── Props ──────────────── */

interface SurveyDetailProps {
  survey: Survey;
  onBack: () => void;
}

/* ──────────────── 색상 팔레트 (옵션 인덱스별) ──────────────── */

const OPTION_COLORS = [
  'bg-blue-500/20 text-blue-400',
  'bg-green-500/20 text-green-400',
  'bg-yellow-500/20 text-yellow-400',
  'bg-purple-500/20 text-purple-400',
  'bg-red-500/20 text-red-400',
  'bg-pink-500/20 text-pink-400',
  'bg-indigo-500/20 text-indigo-400',
  'bg-teal-500/20 text-teal-400',
];

/* ──────────────── 컴포넌트 ──────────────── */

export function SurveyDetail({ survey, onBack }: SurveyDetailProps) {
  const { students } = useStudentStore();
  const { setLocalEntry, archiveSurvey, deleteSurvey } = useSurveyStore();
  const showToast = useToastStore((s) => s.show);

  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [showExport, setShowExport] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const localData = useSurveyStore((s) => s.getLocalData(survey.id));
  const totalStudents = useMemo(
    () => students.filter((s) => !s.isVacant).length,
    [students],
  );
  const progress = getTeacherCheckProgress(survey, localData, totalStudents);
  const activeQuestion = survey.questions[activeQuestionIdx];

  /* ── 값 맵 구성 ── */

  const valuesMap = useMemo(() => {
    if (!activeQuestion || !localData) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const entry of localData.entries) {
      if (entry.questionId === activeQuestion.id) {
        map.set(entry.studentId, String(entry.value));
      }
    }
    return map;
  }, [activeQuestion, localData]);

  /* ── CycleMode 설정 ── */

  const handleCycle = useCallback(
    (studentId: string, next: string) => {
      if (!activeQuestion) return;
      void setLocalEntry(survey.id, studentId, activeQuestion.id, next);
    },
    [survey.id, activeQuestion, setLocalEntry],
  );

  /* ── 통계 ── */

  const stats = useMemo(() => {
    if (!activeQuestion || !localData) return null;
    if (activeQuestion.type === 'yesno') {
      return aggregateAnswers(activeQuestion.id, localData.entries, ['yes', 'no']);
    }
    if (activeQuestion.type === 'choice' && activeQuestion.options) {
      return aggregateAnswers(activeQuestion.id, localData.entries, [...activeQuestion.options]);
    }
    return null;
  }, [activeQuestion, localData]);

  /* ── 내보내기 데이터 ── */

  const exportData = useMemo(() => {
    return formatSurveyForCSV(survey, localData?.entries ?? [], students);
  }, [survey, localData, students]);

  /* ── 메뉴 핸들러 ── */

  const handleArchive = useCallback(async () => {
    await archiveSurvey(survey.id);
    showToast('보관 처리되었습니다', 'success');
    onBack();
  }, [archiveSurvey, survey.id, showToast, onBack]);

  const handleDelete = useCallback(async () => {
    await deleteSurvey(survey.id);
    showToast('삭제되었습니다', 'success');
    onBack();
  }, [deleteSurvey, survey.id, showToast, onBack]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="text-sp-muted hover:text-sp-text transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-xl">arrow_back</span>
          </button>
          <h3 className="text-sm font-bold text-sp-text truncate">{survey.title}</h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-muted text-xs hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-sm">file_download</span>
            내보내기
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-lg">more_vert</span>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[120px]">
                  <button
                    onClick={() => { setShowMenu(false); void handleArchive(); }}
                    className="w-full text-left px-3 py-2 text-xs text-sp-text hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">archive</span>
                    보관
                  </button>
                  <button
                    onClick={() => { setShowMenu(false); void handleDelete(); }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-sp-surface transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 부제 */}
      <div className="text-xs text-sp-muted mb-3 flex items-center gap-2">
        <span>✏️ 교사 체크</span>
        <span>·</span>
        <span>{progress.completed}/{progress.total}명 완료 ({progress.percentage}%)</span>
      </div>

      {/* 질문 탭 (여러 개일 때) */}
      {survey.questions.length > 1 && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          {survey.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setActiveQuestionIdx(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                i === activeQuestionIdx
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text bg-sp-surface'
              }`}
            >
              Q{i + 1}. {q.label.length > 12 ? q.label.slice(0, 12) + '…' : q.label}
            </button>
          ))}
        </div>
      )}

      {/* 질문 라벨 */}
      {activeQuestion && (
        <div className="text-sm text-sp-text font-medium mb-3">
          {survey.questions.length === 1 ? '' : `Q${activeQuestionIdx + 1}. `}
          {activeQuestion.label}
        </div>
      )}

      {/* 본문: 그리드 또는 텍스트 입력 */}
      <div className="flex-1 overflow-y-auto">
        {activeQuestion && activeQuestion.type === 'text' ? (
          <TextQuestionList
            survey={survey}
            question={activeQuestion}
            students={students}
            localData={localData}
          />
        ) : activeQuestion ? (
          <QuestionGrid
            question={activeQuestion}
            students={students}
            valuesMap={valuesMap}
            onCycle={handleCycle}
          />
        ) : null}
      </div>

      {/* 하단 통계 */}
      {stats && activeQuestion && (
        <div className="mt-3 pt-3 border-t border-sp-border flex flex-wrap gap-3 text-xs text-sp-muted">
          {activeQuestion.type === 'yesno' && (
            <>
              <span>○ 신청: <strong className="text-green-400">{stats.get('yes') ?? 0}명</strong></span>
              <span>× 미신청: <strong className="text-red-400">{stats.get('no') ?? 0}명</strong></span>
              <span>- 미응답: <strong>{stats.get('미응답') ?? 0}명</strong></span>
            </>
          )}
          {activeQuestion.type === 'choice' && activeQuestion.options?.map((opt, i) => (
            <span key={opt}>
              {opt}: <strong className={OPTION_COLORS[i % OPTION_COLORS.length]?.split(' ')[1] ?? 'text-sp-text'}>
                {stats.get(opt) ?? 0}명
              </strong>
            </span>
          ))}
        </div>
      )}

      {/* 내보내기 모달 */}
      {showExport && (
        <ExportModal
          title={`${survey.title} — 내보내기`}
          columns={exportData.columns}
          rows={exportData.rows}
          onClose={() => setShowExport(false)}
          fileName={survey.title}
        />
      )}
    </div>
  );
}

/* ──────────────── QuestionGrid (○/× · 선택형) ──────────────── */

interface QuestionGridProps {
  question: SurveyQuestion;
  students: readonly import('@domain/entities/Student').Student[];
  valuesMap: ReadonlyMap<string, string>;
  onCycle: (studentId: string, next: string) => void;
}

function QuestionGrid({ question, students, valuesMap, onCycle }: QuestionGridProps) {
  const cycleConfig = useMemo((): CycleModeProps<string> => {
    if (question.type === 'yesno') {
      return {
        mode: 'cycle',
        values: valuesMap,
        cycle: ['', 'yes', 'no'],
        renderValue: (v) => {
          if (v === 'yes') return '○';
          if (v === 'no') return '×';
          return '-';
        },
        onCycle,
        valueStyle: (v) => {
          if (v === 'yes') return 'bg-green-500/20 text-green-400';
          if (v === 'no') return 'bg-red-500/20 text-red-400';
          return 'bg-sp-surface text-sp-muted';
        },
      };
    }

    // choice
    const options = question.options ?? [];
    const cycle = ['', ...options];
    return {
      mode: 'cycle',
      values: valuesMap,
      cycle,
      renderValue: (v) => v || '-',
      onCycle,
      valueStyle: (v) => {
        if (!v) return 'bg-sp-surface text-sp-muted';
        const idx = options.indexOf(v);
        return OPTION_COLORS[idx % OPTION_COLORS.length] ?? 'bg-sp-surface text-sp-text';
      },
    };
  }, [question, valuesMap, onCycle]);

  return (
    <StudentGrid
      students={students}
      gridMode={cycleConfig}
      columns={5}
      hideVacant
    />
  );
}

/* ──────────────── TextQuestionList (텍스트 질문) ──────────────── */

interface TextQuestionListProps {
  survey: Survey;
  question: SurveyQuestion;
  students: readonly import('@domain/entities/Student').Student[];
  localData: import('@domain/entities/Survey').SurveyLocalData | undefined;
}

function TextQuestionList({ survey, question, students, localData }: TextQuestionListProps) {
  const setLocalEntry = useSurveyStore((s) => s.setLocalEntry);
  const nonVacant = useMemo(() => students.filter((s) => !s.isVacant), [students]);

  const getEntryValue = useCallback(
    (studentId: string): string => {
      if (!localData) return '';
      const entry = localData.entries.find(
        (e) => e.studentId === studentId && e.questionId === question.id,
      );
      return entry ? String(entry.value) : '';
    },
    [localData, question.id],
  );

  const handleChange = useCallback(
    (studentId: string, value: string) => {
      void setLocalEntry(survey.id, studentId, question.id, value);
    },
    [survey.id, question.id, setLocalEntry],
  );

  return (
    <div className="flex flex-col gap-2">
      {nonVacant.map((student, idx) => {
        const value = getEntryValue(student.id);
        return (
          <div key={student.id} className="flex items-center gap-3 bg-sp-surface rounded-lg p-2.5">
            <span className="text-xs text-sp-muted w-14 shrink-0">
              {idx + 1} {student.name}
            </span>
            <input
              type="text"
              defaultValue={value}
              onBlur={(e) => {
                if (e.target.value !== value) handleChange(student.id, e.target.value);
              }}
              placeholder="입력"
              className="flex-1 bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-xs text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
            />
            {value && (
              <span className="text-green-400 text-xs shrink-0">✓</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
