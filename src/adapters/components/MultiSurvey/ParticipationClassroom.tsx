import { useState, type ReactNode } from 'react';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { ParticipationEditor, participationButton } from './ParticipationEditor';
import { LiveConsoleContainer } from './v2/Console/LiveConsoleContainer';
import { ParticipationResults } from './ParticipationResults';
import { ToolPoll } from '../Tools/ToolPoll';
import { ToolSurvey } from '../Tools/ToolSurvey';
import { ToolWordCloud } from '../Tools/ToolWordCloud';
import { ToolValueLine } from '../Tools/Discussion/ToolValueLine';
import { ToolTrafficLightDiscussion } from '../Tools/Discussion/ToolTrafficLightDiscussion';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

export function ParticipationClassroom({
  onBack,
  isFullscreen,
  renderLegacy,
}: {
  onBack: () => void;
  isFullscreen: boolean;
  renderLegacy: (back: () => void) => ReactNode;
}) {
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const results = useMultiSurveyV2Store((s) => s.participationResults);
  const live = useMultiSurveyV2Store((s) => s.liveSession);
  const [editing, setEditing] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<string | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (live)
    return <LiveConsoleContainer onExit={() => useMultiSurveyV2Store.getState().exitLive()} />;
  const back = () => setLegacy(null);
  if (legacy === 'multi') return <>{renderLegacy(back)}</>;
  if (legacy === 'poll') return <ToolPoll onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'survey') return <ToolSurvey onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'wordcloud') return <ToolWordCloud onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'valueline') return <ToolValueLine onBack={back} isFullscreen={isFullscreen} />;
  if (legacy === 'traffic')
    return <ToolTrafficLightDiscussion onBack={back} isFullscreen={isFullscreen} />;
  const current = sessions.find((s) => s.id === editing);
  if (current?.purpose)
    return (
      <ParticipationEditor key={current.id} session={current} onBack={() => setEditing(null)} />
    );
  const result = results.find((r) => r.id === resultId);
  if (result)
    return (
      <div className="h-full overflow-auto bg-sp-bg p-6 text-sp-text">
        <button className={participationButton} onClick={() => setResultId(null)}>
          목록으로
        </button>
        <h1 className="my-5 text-2xl font-bold">{result.survey.title} · 활동 결과</h1>
        <ParticipationResults survey={result.survey} live={result.live} />
      </div>
    );
  const create = () => {
    try {
      const session = useMultiSurveyV2Store
        .getState()
        .createSession({ title: '새 활동', purpose: 'activity' });
      setEditing(session.id);
    } catch {
      setError('활동을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.');
    }
  };
  return (
    <div className="h-full overflow-auto bg-sp-bg p-6 text-sp-text">
      <div className="mx-auto max-w-5xl">
        <button className={participationButton} onClick={onBack}>
          쌤도구로
        </button>
        <header className="py-10">
          <p className="mb-2 text-sm font-bold text-sp-accent">함께 생각하는 시간</p>
          <h1 className="text-4xl font-bold">{PARTICIPATION_TOOL_NAME}</h1>
          <p className="mt-4 text-lg text-sp-muted">
            문항을 자유롭게 섞고, 하나의 링크로 함께 참여해요.
          </p>
        </header>
        {error && <p role="alert">{error}</p>}
        <button
          onClick={create}
          className="w-full rounded-3xl border-2 border-sp-accent bg-sp-card p-8 text-left hover:shadow-sp-md focus-visible:ring-2 focus-visible:ring-sp-accent"
        >
          <h2 className="text-2xl font-bold text-sp-accent">+ 활동 만들기</h2>
          <p className="mt-3 text-sp-muted">문항 유형을 직접 체험하고 필요한 문항을 추가하세요.</p>
        </button>
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold">내 활동</h2>
          {!sessions.some((s) => s.purpose) && (
            <p className="text-sp-muted">
              만든 활동을 저장해 두고 다른 반에서도 다시 사용할 수 있어요.
            </p>
          )}
          <div className="space-y-3">
            {sessions
              .filter((s) => s.purpose)
              .map((s) => (
                <article
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-sp-border bg-sp-card p-4"
                >
                  <button className="flex-1 text-left" onClick={() => setEditing(s.id)}>
                    <span className="text-xs text-sp-accent">활동</span>
                    <h3 className="font-bold">{s.title}</h3>
                    <span className="text-sm text-sp-muted">{s.questions.length}문항</span>
                  </button>
                  <button className={participationButton} onClick={() => setEditing(s.id)}>
                    열기
                  </button>
                  <button className={participationButton} onClick={() => setDeleteId(s.id)}>
                    삭제
                  </button>
                </article>
              ))}
          </div>
        </section>
        {deleteId && (
          <div
            role="alertdialog"
            aria-label="활동 삭제 확인"
            className="my-4 rounded-xl border border-sp-border p-4"
          >
            <p>활동을 삭제할까요? 이전 실행 결과는 남겨 둡니다.</p>
            <button
              className={participationButton}
              onClick={() => {
                try {
                  useMultiSurveyV2Store.getState().deleteSession(deleteId);
                  setDeleteId(null);
                } catch {
                  setError('삭제하지 못했어요. 다시 시도해 주세요.');
                }
              }}
            >
              삭제 확인
            </button>
            <button className={participationButton} onClick={() => setDeleteId(null)}>
              취소
            </button>
          </div>
        )}
        {results.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-4 text-xl font-bold">지난 활동 결과</h2>
            <div className="space-y-2">
              {[...results].reverse().map((r) => (
                <button
                  key={r.id}
                  className={`${participationButton} flex w-full justify-between text-left`}
                  onClick={() => setResultId(r.id)}
                >
                  <span>{r.survey.title}</span>
                  <span>
                    {new Date(r.live.startedAt).toLocaleString('ko-KR')} · {r.live.students.length}
                    명
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <details className="mt-10 border-t border-sp-border py-5">
          <summary className="cursor-pointer text-sp-muted">이전 도구와 저장 자료 열기</summary>
          <p className="my-3 text-sm text-sp-muted">
            이전에 만든 설문과 논제는 그대로 사용할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              ['multi', '복합 설문·퀴즈'],
              ['poll', '객관식 설문'],
              ['survey', '주관식 설문'],
              ['wordcloud', '워드클라우드'],
              ['valueline', '가치수직선 토론'],
              ['traffic', '신호등 토론'],
            ].map(([id, label]) => (
              <button key={id} className={participationButton} onClick={() => setLegacy(id!)}>
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}
