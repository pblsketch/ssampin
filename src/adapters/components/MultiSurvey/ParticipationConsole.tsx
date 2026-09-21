import { useState } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { correctAnswerLabel, questionHasAnswer } from '@domain/rules/participationRules';
import { LobbyView } from './v2/Console/LobbyView';
import { ParticipationResults } from './ParticipationResults';
import { participationButton } from './ParticipationEditor';
import type { TeacherConsoleProps } from './v2/Console/TeacherConsole';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

export function ParticipationConsole(
  props: TeacherConsoleProps & { survey: MultiSurveyV2; live: LiveSession },
) {
  const {
    survey,
    live,
    entryUrl,
    entryCode,
    onChangeEntryCode,
    entryCodeError,
    onAdvance,
    onEnd,
    onExit,
    onRestart,
    onOpenShareWindow,
    onCloseShareWindow,
    onReopen,
    busy,
    actionError,
  } = props;
  const [ending, setEnding] = useState(false);
  /** 교실 화면(별도 창)을 이 활동에서 한 번이라도 띄웠는지 — 닫기 단추 노출 기준 */
  const [shareOpened, setShareOpened] = useState(false);
  const question = survey.questions[live.currentQuestionIndex];
  const quiz = !!question && questionHasAnswer(question);
  const finished = live.phase === 'end' || live.phase === 'podium';
  const responses = live.responses.filter((r) => r.questionId === question?.id);
  const last = live.currentQuestionIndex === survey.questions.length - 1;
  return (
    <div className="flex h-full flex-col bg-sp-bg text-sp-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-sp-border p-4">
        <div className="flex-1">
          <p className="flex items-center gap-2 text-sm">
            <span className="font-bold text-sp-accent">{PARTICIPATION_TOOL_NAME}</span>
            <span className="text-sp-muted">활동 진행</span>
          </p>
          <h1 className="text-xl font-bold">{survey.title}</h1>
        </div>
        <button
          className={participationButton}
          onClick={() => {
            setShareOpened(true);
            onOpenShareWindow?.();
          }}
        >
          교실 화면 띄우기
        </button>
        {shareOpened && (
          <button
            className={participationButton}
            onClick={() => {
              setShareOpened(false);
              onCloseShareWindow?.();
            }}
          >
            교실 화면 닫기
          </button>
        )}
        {!finished && (
          <button className={participationButton} onClick={() => setEnding(true)}>
            활동 종료
          </button>
        )}
      </header>
      <p className="border-b border-sp-border px-4 pb-3 text-xs text-sp-muted">
        교실 화면은 TV·빔프로젝터에 띄우는 별도 창이에요. 창을 모니터 쪽으로 옮겨 전체 화면으로
        쓰세요. 학생 이름은 교실 화면에 나오지 않습니다.
      </p>
      {actionError && (
        <p role="alert" className="p-4 text-sp-highlight">
          {actionError}
        </p>
      )}
      {ending && (
        <div role="alertdialog" aria-label="활동 종료 확인" className="flex items-center gap-3 p-4">
          <p>지금까지의 응답을 보관하고 종료할까요?</p>
          <button
            disabled={busy}
            className={participationButton}
            onClick={() => {
              setEnding(false);
              onEnd?.();
            }}
          >
            종료 확인
          </button>
          <button className={participationButton} onClick={() => setEnding(false)}>
            계속 진행
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto xl:flex-row">
        <main className="min-w-0 flex-1 p-6">
          {live.phase === 'lobby' ? (
            <>
              <p className="mb-4 text-sm text-sp-muted">
                {entryUrl.startsWith('http://')
                  ? '같은 Wi-Fi에 연결한 학생이 참여할 수 있어요. 인터넷 주소를 준비하지 못한 경우에도 사용할 수 있습니다.'
                  : 'QR을 찍거나 참여 주소와 코드로 들어오세요.'}{' '}
                활동 중에는 쌤핀을 켜 두세요.
              </p>
              <LobbyView
                entryUrl={entryUrl}
                entryCode={entryCode}
                onChangeEntryCode={onChangeEntryCode}
                entryCodeError={entryCodeError}
                students={live.students}
              />
              <button
                disabled={busy || !entryUrl}
                className={`${participationButton} mt-6 w-full bg-sp-accent text-white`}
                onClick={onAdvance}
              >
                활동 시작
              </button>
              <button className={`${participationButton} mt-3`} onClick={onExit}>
                초대 취소 · 편집 화면으로
              </button>
            </>
          ) : finished ? (
            <>
              <h2 className="mb-5 text-3xl font-bold">활동을 마쳤어요</h2>
              <ParticipationResults survey={survey} live={live} />
              <div className="mt-6 flex gap-3">
                <button
                  className={participationButton}
                  hidden={!survey.competitionMode}
                  aria-pressed={live.rankingVisible ?? false}
                  onClick={() =>
                    useMultiSurveyV2Store.getState().setRankingVisible(!live.rankingVisible)
                  }
                >
                  {live.rankingVisible ? '교실 순위 가리기' : '교실에 최종 순위 공개'}
                </button>
                <button className={participationButton} onClick={onRestart}>
                  다른 반에서 다시 사용
                </button>
                <button className={participationButton} onClick={onExit}>
                  편집 화면으로
                </button>
              </div>
            </>
          ) : (
            question && (
              <>
                <p className="mb-3 text-sp-muted">
                  {live.currentQuestionIndex + 1} / {survey.questions.length}문항 ·{' '}
                  {live.phase === 'open' ? '응답 받는 중' : '결과 살펴보기'}
                  {(live.attempt ?? 1) > 1 ? ` · ${live.attempt}차 응답` : ''}
                </p>
                <h2 className="mb-6 text-3xl font-bold leading-relaxed">{question.text}</h2>
                <div className="rounded-2xl border border-sp-border bg-sp-card p-6">
                  <p className="text-xl">
                    응답 <strong className="text-3xl text-sp-accent">{responses.length}</strong> /{' '}
                    {live.students.length}명
                  </p>
                  {quiz && live.phase === 'revealed' && (
                    <>
                      <p className="mt-4 text-2xl font-bold">
                        정답: {correctAnswerLabel(question)}
                      </p>
                      <p className="mt-3">
                        정답 {responses.filter((r) => r.isCorrect).length}명 · 미응답{' '}
                        {live.students.length - responses.length}명
                      </p>
                      {question.explanation && (
                        <p className="mt-4 text-lg">{question.explanation}</p>
                      )}
                    </>
                  )}
                </div>
                {!quiz && (
                  <div className="mt-5">
                    <ParticipationResults survey={survey} live={live} compact />
                  </div>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    disabled={busy}
                    className={`${participationButton} bg-sp-accent text-white`}
                    onClick={onAdvance}
                  >
                    {busy
                      ? '처리 중…'
                      : live.phase === 'open'
                        ? '응답 마감 · 결과 공개'
                        : last
                          ? '활동 결과 보기'
                          : '다음 문항'}
                  </button>
                  {!quiz && live.phase === 'revealed' && (
                    <button disabled={busy} className={participationButton} onClick={onReopen}>
                      같은 질문에 다시 응답받기
                    </button>
                  )}
                </div>
              </>
            )
          )}
        </main>
        {quiz && live.phase !== 'lobby' && !finished && (
          <aside className="border-l border-sp-border p-5 xl:w-96">
            <p className="mb-4 text-xs text-sp-muted">
              교사 전용 · 교실 화면과 학생 화면에는 나가지 않아요.
            </p>
            <ParticipationResults survey={survey} live={live} />
            {survey.competitionMode && (
              <button
                className={`${participationButton} mt-5 w-full`}
                aria-pressed={live.rankingVisible ?? false}
                onClick={() =>
                  useMultiSurveyV2Store.getState().setRankingVisible(!live.rankingVisible)
                }
              >
                {live.rankingVisible ? '교실 순위 가리기' : '교실에 순위 공개'}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
