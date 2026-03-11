import { useEffect, useMemo } from 'react';
import { useSurveyStore } from '@adapters/stores/useSurveyStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { getActiveSurveys, getTeacherCheckProgress } from '@domain/rules/surveyRules';

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-400', green: 'bg-green-400', yellow: 'bg-yellow-400',
  purple: 'bg-purple-400', red: 'bg-red-400', pink: 'bg-pink-400',
  indigo: 'bg-indigo-400', teal: 'bg-teal-400',
};

const COLOR_BAR: Record<string, string> = {
  blue: 'bg-blue-400', green: 'bg-green-400', yellow: 'bg-yellow-400',
  purple: 'bg-purple-400', red: 'bg-red-400', pink: 'bg-pink-400',
  indigo: 'bg-indigo-400', teal: 'bg-teal-400',
};

export function SurveyWidget() {
  const { surveys, loaded, load } = useSurveyStore();
  const { students, loaded: studentsLoaded, load: loadStudents } = useStudentStore();

  useEffect(() => {
    if (!loaded) void load();
    if (!studentsLoaded) void loadStudents();
  }, [loaded, load, studentsLoaded, loadStudents]);

  const activeSurveys = useMemo(() => getActiveSurveys(surveys), [surveys]);
  const totalStudents = useMemo(
    () => students.filter((s) => !s.isVacant).length,
    [students],
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-xs">불러오는 중...</p>
      </div>
    );
  }

  if (activeSurveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-sp-muted">
        <span className="text-2xl">📋</span>
        <p className="text-xs">진행 중인 설문 없음</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {activeSurveys.slice(0, 3).map((survey) => {
        const localData = useSurveyStore.getState().getLocalData(survey.id);
        const progress = survey.mode === 'teacher'
          ? getTeacherCheckProgress(survey, localData, totalStudents)
          : { completed: 0, total: totalStudents, percentage: 0 };

        const dot = COLOR_DOT[survey.categoryColor] ?? 'bg-blue-400';
        const bar = COLOR_BAR[survey.categoryColor] ?? 'bg-blue-400';

        return (
          <div key={survey.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
              <span className="text-xs text-sp-text font-medium truncate flex-1">
                {survey.title}
              </span>
              <span className="text-[10px] text-sp-muted whitespace-nowrap">
                {progress.completed}/{progress.total}
              </span>
            </div>
            <div className="h-1.5 bg-sp-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${bar}`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        );
      })}

      {activeSurveys.length > 3 && (
        <p className="text-[10px] text-sp-muted text-right">
          외 {activeSurveys.length - 3}건
        </p>
      )}

      <p className="text-[10px] text-sp-muted mt-auto">
        진행 중 {activeSurveys.length}건
      </p>
    </div>
  );
}
