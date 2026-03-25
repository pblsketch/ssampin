import { useEffect, useState } from 'react';
import { useMobileSurveyToolStore } from '@mobile/stores/useMobileSurveyToolStore';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import type { Survey } from '@domain/entities/Survey';

interface Props {
  onBack: () => void;
}

const COLOR_MAP: Record<string, string> = {
  yellow: 'bg-yellow-500/15 text-yellow-400',
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-green-500/15 text-green-400',
  purple: 'bg-purple-500/15 text-purple-400',
  pink: 'bg-pink-500/15 text-pink-400',
  red: 'bg-red-500/15 text-red-400',
  orange: 'bg-orange-500/15 text-orange-400',
  teal: 'bg-teal-500/15 text-teal-400',
};

function getColorClasses(color: string): string {
  return COLOR_MAP[color] ?? 'bg-sp-accent/15 text-sp-accent';
}

function TeacherCheckRow({
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
        <span className={`material-symbols-outlined text-lg ${checked ? 'text-green-500' : 'text-red-400'}`}>
          {checked ? 'check_circle' : 'cancel'}
        </span>
        <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
        <span className="text-sm text-sp-text flex-1">{student.name}</span>
      </button>
    );
  }

  // 질문이 여러 개: 탭하면 펼쳐서 질문별 토글
  return (
    <div className={`rounded-lg overflow-hidden ${allChecked ? 'bg-green-500/5' : checkedCount > 0 ? 'bg-yellow-500/5' : 'bg-red-500/5'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-3 py-2.5 w-full text-left active:scale-[0.98] transition-transform"
      >
        <span className={`material-symbols-outlined text-lg ${
          allChecked ? 'text-green-500' : checkedCount > 0 ? 'text-yellow-500' : 'text-red-400'
        }`}>
          {allChecked ? 'check_circle' : checkedCount > 0 ? 'remove_circle' : 'cancel'}
        </span>
        <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
        <span className="text-sm text-sp-text flex-1">{student.name}</span>
        <span className="text-xs text-sp-muted">{checkedCount}/{questions.length}</span>
        <span className={`material-symbols-outlined text-sp-muted text-sm transition-transform ${expanded ? 'rotate-180' : ''}`}>
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
                <span className={`material-symbols-outlined text-base ${checked ? 'text-green-500' : 'text-sp-muted'}`}>
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

function SurveyDetail({ survey, onBack }: { survey: Survey; onBack: () => void }) {
  const { localData, responseStatus, responses, fetchResponses, setLocalEntry } = useMobileSurveyToolStore();
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
      if (cls) return cls.students.map((s) => ({ number: s.number, name: s.name, id: `${s.number}` }));
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
        return studentEntries.filter((e) => e.value === true || e.value === 'true').length === survey.questions.length;
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
              <span className="text-sm text-sp-muted">/ {totalCount}명 {isTeacherMode ? '완료' : '응답'}</span>
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
              onClick={() => survey.targetCount && void fetchResponses(survey.id, survey.targetCount)}
              className="text-sp-muted active:scale-95 transition-transform p-2"
            >
              <span className={`material-symbols-outlined ${status?.loading ? 'animate-spin' : ''}`}>
                {status?.loading ? 'progress_activity' : 'refresh'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 학생별 현황 */}
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {!isTeacherMode && status?.loading && resps.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">progress_activity</span>
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
                  <span className={`material-symbols-outlined text-lg ${done ? 'text-green-500' : 'text-red-400'}`}>
                    {done ? 'check_circle' : 'cancel'}
                  </span>
                  <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
                  <span className="text-sm text-sp-text flex-1">{student.name}</span>
                  {resp && (
                    <span className="text-xs text-sp-muted">
                      {new Date(resp.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );
            })
        ) : resps.length > 0 ? (
          resps.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-green-500/5">
              <span className="material-symbols-outlined text-green-500 text-lg">check_circle</span>
              <span className="text-xs text-sp-muted w-6 text-right">{r.studentNumber}</span>
              <span className="text-sm text-sp-text flex-1">
                {new Date(r.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
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

export function ToolSurveyPage({ onBack }: Props) {
  const { surveys, loaded, load } = useMobileSurveyToolStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">progress_activity</span>
      </div>
    );
  }

  const selected = selectedId ? surveys.find((s) => s.id === selectedId) : null;
  if (selected) {
    return <SurveyDetail survey={selected} onBack={() => setSelectedId(null)} />;
  }

  const activeSurveys = surveys.filter((s) => !s.isArchived);
  const archivedSurveys = surveys.filter((s) => s.isArchived);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">설문/체크리스트</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {surveys.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-sp-muted text-4xl">poll</span>
            <p className="text-sp-muted text-sm mt-2">등록된 설문이 없습니다</p>
            <p className="text-sp-muted text-xs mt-1">PC 앱에서 설문을 생성한 후 동기화하세요</p>
          </div>
        ) : (
          <>
            {activeSurveys.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  진행 중 ({activeSurveys.length})
                </h3>
                <div className="space-y-2">
                  {activeSurveys.map((s) => {
                    const colorCls = getColorClasses(s.categoryColor);
                    const bgCls = colorCls.split(' ')[0] ?? '';
                    const textCls = colorCls.split(' ')[1] ?? '';
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 mt-0.5 ${bgCls}`}>
                            <span className={`material-symbols-outlined ${textCls}`}>
                              {s.mode === 'teacher' ? 'checklist' : 'poll'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-sp-text truncate">{s.title}</p>
                            <p className="text-xs text-sp-muted mt-0.5">
                              {s.mode === 'teacher' ? '교사 체크' : '학생 응답'}
                              {s.questions.length > 0 && ` · ${s.questions.length}문항`}
                            </p>
                            {s.dueDate && (
                              <p className="text-xs text-sp-muted mt-0.5">
                                마감 {new Date(s.dueDate).toLocaleDateString('ko-KR')}
                              </p>
                            )}
                          </div>
                          <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {archivedSurveys.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  보관됨 ({archivedSurveys.length})
                </h3>
                <div className="space-y-2">
                  {archivedSurveys.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-500/15 shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-gray-400">inventory_2</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sp-text truncate">{s.title}</p>
                          <p className="text-xs text-sp-muted mt-0.5">
                            {s.mode === 'teacher' ? '교사 체크' : '학생 응답'} · 보관됨
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
