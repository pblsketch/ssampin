import { useEffect } from 'react';
import { useMobileSurveyToolStore } from '@mobile/stores/useMobileSurveyToolStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import { TeacherCheckRow } from './TeacherCheckRow';
import type { Survey } from '@domain/entities/Survey';

export function SurveyDetail({ survey, onBack }: { survey: Survey; onBack: () => void }) {
  const { localData, responseStatus, responses, fetchResponses, setLocalEntry } =
    useMobileSurveyToolStore();
  const teachingClasses = useMobileTeachingClassStore((s) => s.classes);
  const students = useMobileStudentStore((s) => s.students);

  useEffect(() => {
    if (survey.mode === 'student' && survey.targetCount) {
      void fetchResponses(survey.id, survey.targetCount);
    }
  }, [survey.id, survey.mode, survey.targetCount, fetchResponses]);

  const isTeacherMode = survey.mode === 'teacher';
  const local = localData.find((d) => d.surveyId === survey.id);
  const status = responseStatus[survey.id];
  const resps = responses[survey.id] ?? [];

  // 학생 목록 구성: classId가 있으면 수업반에서, 아니면 담임 학생에서
  const studentList: { number: number; name: string; id: string }[] = (() => {
    if (survey.classId) {
      const cls = teachingClasses.find((c) => c.id === survey.classId);
      if (cls)
        return cls.students.map((s) => ({ number: s.number, name: s.name, id: `${s.number}` }));
    }
    // 담임 학생 목록 사용
    return students.map((s) => ({ number: s.studentNumber ?? 0, name: s.name, id: s.id }));
  })();

  // 학생 모드: 응답한 학생 번호 Set
  const respondedNumbers = new Set(resps.map((r) => r.studentNumber));

  // 교사 모드: 모든 질문이 체크된 학생 수
  const fullyCheckedCount = isTeacherMode
    ? studentList.filter((s) => {
        const studentEntries = (local?.entries ?? []).filter((e) => e.studentId === s.id);
        return (
          studentEntries.filter((e) => e.value === true || e.value === 'true').length ===
          survey.questions.length
        );
      }).length
    : resps.length;
  const totalCount = studentList.length || survey.targetCount || 0;

  // 교사 모드: 전체 선택/해제
  const handleCheckAll = () => {
    const allDone = fullyCheckedCount === totalCount && totalCount > 0;
    for (const student of studentList) {
      for (const q of survey.questions) {
        void setLocalEntry(survey.id, student.id, q.id, !allDone);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sp-text truncate">{survey.title}</h2>
          <p className="text-xs text-sp-muted">
            {isTeacherMode ? '교사 체크 모드' : '학생 응답 모드'}
            {survey.dueDate && ` · 마감 ${new Date(survey.dueDate).toLocaleDateString('ko-KR')}`}
          </p>
        </div>
      </header>

      {/* 현황 요약 */}
      <div className="px-4 py-3 border-b border-sp-border/20">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-sp-accent">{fullyCheckedCount}</span>
              <span className="text-sm text-sp-muted">
                / {totalCount}명 {isTeacherMode ? '완료' : '응답'}
              </span>
            </div>
            {totalCount > 0 && (
              <div className="mt-2 h-2 rounded-full bg-sp-border/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sp-accent transition-all duration-500"
                  style={{ width: `${Math.round((fullyCheckedCount / totalCount) * 100)}%` }}
                />
              </div>
            )}
          </div>
          {isTeacherMode ? (
            <button
              onClick={handleCheckAll}
              className="text-xs text-sp-accent px-3 py-1.5 rounded-lg bg-sp-accent/10 active:scale-95 transition-transform"
            >
              {fullyCheckedCount === totalCount && totalCount > 0 ? '전체 해제' : '전체 체크'}
            </button>
          ) : (
            <button
              onClick={() =>
                survey.targetCount && void fetchResponses(survey.id, survey.targetCount)
              }
              className="text-sp-muted active:scale-95 transition-transform p-2"
            >
              <span
                className={`material-symbols-outlined ${status?.loading ? 'animate-spin' : ''}`}
              >
                {status?.loading ? 'progress_activity' : 'refresh'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 응답 조회 실패 안내 (학생 응답 모드 전용) */}
      {!isTeacherMode && status?.error && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-300 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">error</span>
            응답을 불러오지 못했습니다
          </p>
          <p className="text-[11px] text-red-300/70 mt-1 break-all">{status.error}</p>
          <p className="text-[11px] text-sp-muted mt-1">
            네트워크를 확인하거나 새로고침 버튼을 다시 눌러주세요. 계속되면 개발자에게 위 메시지를
            전달해주세요.
          </p>
        </div>
      )}

      {/* 학생별 현황 */}
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {!isTeacherMode && status?.loading && resps.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
              progress_activity
            </span>
          </div>
        ) : studentList.length > 0 ? (
          studentList
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((student) => {
              if (isTeacherMode) {
                return (
                  <TeacherCheckRow
                    key={student.id}
                    student={student}
                    survey={survey}
                    entries={local?.entries ?? []}
                  />
                );
              }
              const done = respondedNumbers.has(student.number);
              const resp = resps.find((r) => r.studentNumber === student.number);
              return (
                <div
                  key={student.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                    done ? 'bg-green-500/5' : 'bg-red-500/5'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-lg ${done ? 'text-green-500' : 'text-red-400'}`}
                  >
                    {done ? 'check_circle' : 'cancel'}
                  </span>
                  <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
                  <span className="text-sm text-sp-text flex-1">{student.name}</span>
                  {resp && (
                    <span className="text-xs text-sp-muted">
                      {new Date(resp.submittedAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              );
            })
        ) : resps.length > 0 ? (
          resps.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-500/5"
            >
              <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
              <span className="text-xs text-sp-muted w-6 text-right">{r.studentNumber}</span>
              <span className="text-sm text-sp-text flex-1">
                {new Date(r.submittedAt).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))
        ) : (
          <p className="text-center text-sp-muted text-sm py-8">
            {isTeacherMode ? '아직 체크된 학생이 없습니다' : '아직 응답한 학생이 없습니다'}
          </p>
        )}
      </div>
    </div>
  );
}
