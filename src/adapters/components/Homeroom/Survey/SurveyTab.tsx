import { useState, useEffect, useMemo } from 'react';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import {
  getActiveSurveys,
  getArchivedSurveys,
  getTeacherCheckProgress,
  getStudentResponseProgress,
} from '@domain/rules/surveyRules';
import type { Survey } from '@domain/entities/Survey';
import { SurveyCreateModal } from './SurveyCreateModal';
import { SurveyDetail } from './SurveyDetail';
import { SurveyStudentDetail } from './SurveyStudentDetail';

/* ──────────────── 색상 매핑 ──────────────── */

const COLOR_MAP: Record<string, { bg: string; dot: string; bar: string }> = {
  blue:   { bg: 'bg-blue-500/10',   dot: 'bg-blue-400',   bar: 'bg-blue-400' },
  green:  { bg: 'bg-green-500/10',  dot: 'bg-green-400',  bar: 'bg-green-400' },
  yellow: { bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', bar: 'bg-yellow-400' },
  purple: { bg: 'bg-purple-500/10', dot: 'bg-purple-400', bar: 'bg-purple-400' },
  red:    { bg: 'bg-red-500/10',    dot: 'bg-red-400',    bar: 'bg-red-400' },
  pink:   { bg: 'bg-pink-500/10',   dot: 'bg-pink-400',   bar: 'bg-pink-400' },
  indigo: { bg: 'bg-indigo-500/10', dot: 'bg-indigo-400', bar: 'bg-indigo-400' },
  teal:   { bg: 'bg-teal-500/10',   dot: 'bg-teal-400',   bar: 'bg-teal-400' },
};

function getColor(color: string) {
  return COLOR_MAP[color] ?? COLOR_MAP.blue!;
}

/* ──────────────── SurveyCard ──────────────── */

interface SurveyCardProps {
  survey: Survey;
  totalStudents: number;
  onSelect: (id: string) => void;
}

function SurveyCard({ survey, totalStudents, onSelect }: SurveyCardProps) {
  const localData = useSurveyStore((s) => s.getLocalData(survey.id));
  const color = getColor(survey.categoryColor);

  const progress = survey.mode === 'teacher'
    ? getTeacherCheckProgress(survey, localData, totalStudents)
    : getStudentResponseProgress([], totalStudents); // 서버 응답은 프롬프트 7~8에서

  const modeLabel = survey.mode === 'teacher' ? '✏️ 교사 체크' : '📱 학생 응답';
  const questionTypes = survey.questions
    .map((q) => {
      if (q.type === 'yesno') return '○/×';
      if (q.type === 'choice') return '선택형';
      return '텍스트';
    })
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  return (
    <button
      onClick={() => onSelect(survey.id)}
      className={`w-full text-left rounded-xl border border-sp-border p-4 transition-all hover:border-sp-accent/50 hover:shadow-lg ${color.bg}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${color.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-sp-text truncate">{survey.title}</h4>
            <span className="text-xs text-sp-muted whitespace-nowrap">
              {progress.completed}/{progress.total}명
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-sp-muted">
            <span>{modeLabel}</span>
            <span>·</span>
            <span>{questionTypes}</span>
            {survey.dueDate && (
              <>
                <span>·</span>
                <span>마감 {survey.dueDate.slice(5).replace('-', '/')}</span>
              </>
            )}
          </div>

          {/* 진행률 바 */}
          <div className="mt-2.5 h-1.5 bg-sp-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color.bar}`}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className="text-[10px] text-sp-muted mt-1 text-right">
            {progress.percentage}%
          </div>

          {/* 학생 응답 모드 → 링크 공유 */}
          {survey.mode === 'student' && survey.shareUrl && (
            <div className="mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(survey.shareUrl!);
                }}
                className="text-[11px] text-sp-accent hover:text-sp-accent/80 transition-colors"
              >
                🔗 링크 공유
              </button>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ──────────────── SurveyTab ──────────────── */

export function SurveyTab() {
  const { surveys, loaded, load } = useSurveyStore();
  const { students, load: loadStudents, loaded: studentsLoaded } = useStudentStore();
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void load();
    if (!studentsLoaded) void loadStudents();
  }, [loaded, load, studentsLoaded, loadStudents]);

  const activeSurveys = useMemo(() => getActiveSurveys(surveys), [surveys]);
  const archivedSurveys = useMemo(() => getArchivedSurveys(surveys), [surveys]);

  const totalStudents = useMemo(
    () => students.filter((s) => !s.isVacant).length,
    [students],
  );

  const handleSelect = (id: string) => {
    setSelectedSurveyId(id);
    setView('detail');
  };

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  /* 상세 화면 (교사 체크 모드) */
  if (view === 'detail' && selectedSurveyId) {
    const survey = surveys.find((s) => s.id === selectedSurveyId);
    const handleBack = () => { setView('list'); setSelectedSurveyId(null); };
    if (survey?.mode === 'teacher') {
      return <SurveyDetail survey={survey} onBack={handleBack} />;
    }
    if (survey?.mode === 'student') {
      return <SurveyStudentDetail survey={survey} onBack={handleBack} />;
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">checklist</span>
          설문/체크리스트
          {activeSurveys.length > 0 && (
            <span className="text-sp-muted font-normal">({activeSurveys.length}개)</span>
          )}
        </h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          새로 만들기
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {activeSurveys.length === 0 && archivedSurveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-medium">아직 설문이 없습니다</p>
            <p className="text-xs">위의 &quot;새로 만들기&quot; 버튼으로 첫 설문을 만들어보세요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 진행 중 */}
            {activeSurveys.length > 0 && (
              <>
                <p className="text-xs text-sp-muted font-medium px-1">
                  진행 중 ({activeSurveys.length})
                </p>
                {activeSurveys.map((s) => (
                  <SurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                  />
                ))}
              </>
            )}

            {/* 완료/보관 */}
            {archivedSurveys.length > 0 && (
              <>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors px-1 mt-2"
                >
                  <span className="material-symbols-outlined text-sm">
                    {showArchived ? 'expand_less' : 'expand_more'}
                  </span>
                  완료/보관 ({archivedSurveys.length})
                </button>
                {showArchived && archivedSurveys.map((s) => (
                  <SurveyCard
                    key={s.id}
                    survey={s}
                    totalStudents={totalStudents}
                    onSelect={handleSelect}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {showCreateModal && (
        <SurveyCreateModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}
