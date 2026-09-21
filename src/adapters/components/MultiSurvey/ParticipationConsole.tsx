/**
 * ParticipationConsole — 퀴즈·설문·토론의 **교사 진행 화면**.
 *
 * 진행은 세 축으로 나뉜다 (설계: docs/02-design/features/participation-classroom-ux.design.md §3).
 *   ① 응답 받는 중 / 마감   ② 결과 공개   ③ 정답·해설 공개
 * 옛 구조는 `응답 마감 · 결과 공개` 한 단추라 "그만 내세요"만 하고 싶어도 분포가 바로 떴다.
 *
 * 직선형 절차로 가두지 않는다 — 공개 없이 다음 문항으로 넘어가거나,
 * 정답을 공개하기 전에 토론·재응답을 할 수 있어야 한다.
 *
 * 진행 단추는 **아래 고정 띠**에 둔다. 질문이 길거나 응답이 많아도 밀리지 않는다.
 */

import { useState } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { correctAnswerLabel, questionHasAnswer } from '@domain/rules/participationRules';
import {
  participationStage,
  responseTally,
  stageActions,
  stageLabel,
} from '@domain/rules/participationStage';
import { LobbyView } from './v2/Console/LobbyView';
import { ParticipationResults } from './ParticipationResults';
import { ParticipationRoundCompare } from './ParticipationRoundCompare';
import { participationButton } from './ParticipationEditor';
import type { TeacherConsoleProps } from './v2/Console/TeacherConsole';
import { PARTICIPATION_TOOL_NAME } from '@adapters/multiSurvey/participationBranding';

/** 주요 행동 — 지금 할 일 하나만 채움 단추로 둔다. */
const primaryButton = `${participationButton} bg-sp-accent font-bold text-sp-accent-fg hover:border-sp-accent`;

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
    onClose,
    onPublishResults,
    onPublishAnswer,
    onEnd,
    onExit,
    onRestart,
    onOpenShareWindow,
    onCloseShareWindow,
    shareWindowOpen,
    onReopen,
    busy,
    actionError,
  } = props;
  const [ending, setEnding] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const question = survey.questions[live.currentQuestionIndex] ?? null;
  const quiz = !!question && questionHasAnswer(question);
  const stage = participationStage(live);
  const finished = stage === 'finished';
  const can = stageActions(stage, question);
  const tally = responseTally(live, question);
  const last = live.currentQuestionIndex === survey.questions.length - 1;
  const attempt = live.attempt ?? 1;

  return (
    <div className="flex h-full flex-col bg-sp-bg text-sp-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-sp-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-bold text-sp-accent">{PARTICIPATION_TOOL_NAME}</span>
            <span className="text-sp-muted">활동 진행</span>
            {!finished && question && (
              <>
                <span aria-hidden="true" className="text-sp-muted">
                  ·
                </span>
                <span className="text-sp-muted">
                  {live.currentQuestionIndex + 1}/{survey.questions.length}문항
                  {attempt > 1 ? ` · ${attempt}차 응답` : ''}
                </span>
              </>
            )}
          </p>
          <h1 className="truncate text-xl font-bold">{survey.title}</h1>
        </div>
        <button
          className={participationButton}
          onClick={shareWindowOpen ? onCloseShareWindow : onOpenShareWindow}
          title="TV·빔프로젝터에 띄우는 별도 창이에요. 학생 이름과 미응답자는 나오지 않아요."
        >
          {shareWindowOpen ? '교실 화면 닫기' : '교실 화면 띄우기'}
        </button>
        {!finished && (
          <button className={participationButton} onClick={() => setEnding(true)}>
            활동 종료
          </button>
        )}
      </header>

      {actionError && (
        <p role="alert" className="border-b border-sp-border px-4 py-3 text-sp-highlight">
          {actionError}
        </p>
      )}

      {ending && (
        <div
          role="alertdialog"
          aria-label="활동 종료 확인"
          className="flex flex-wrap items-center gap-3 border-b border-sp-border px-4 py-3"
        >
          <p className="flex-1">지금까지의 응답을 보관하고 종료할까요?</p>
          <button
            disabled={busy}
            className={primaryButton}
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
          {stage === 'lobby' ? (
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
            </>
          ) : finished ? (
            <>
              <h2 className="mb-5 text-3xl font-bold">활동을 마쳤어요</h2>
              <ParticipationResults survey={survey} live={live} />
            </>
          ) : (
            question && (
              <>
                <h2 className="mb-5 text-3xl font-bold leading-relaxed">{question.text}</h2>

                <section
                  aria-label="응답 현황"
                  className="rounded-2xl border border-sp-border bg-sp-card p-5"
                >
                  <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    <span className="text-sp-muted">
                      입장 <strong className="text-2xl text-sp-text">{tally.joined}</strong>명
                    </span>
                    <span className="text-sp-muted">
                      이번 문항 응답{' '}
                      <strong className="text-3xl text-sp-accent">{tally.answered}</strong>명
                    </span>
                    <span className="text-sp-muted">
                      미응답 <strong className="text-2xl text-sp-text">{tally.pending}</strong>명
                    </span>
                  </p>
                  <p className="mt-2 text-xs text-sp-muted">
                    입장 인원은 지금 접속한 학생 수예요. 학급 전체 인원과 다를 수 있어요.
                  </p>
                  {tally.pending > 0 && (
                    <div className="mt-3">
                      <button
                        className={participationButton}
                        aria-expanded={showPending}
                        onClick={() => setShowPending((v) => !v)}
                      >
                        {showPending ? '미응답자 명단 접기' : '미응답자 명단 보기'}
                      </button>
                      {showPending && (
                        <>
                          <p className="mt-3 text-xs text-sp-muted">
                            교사 전용 · 교실 화면과 학생 화면에는 나가지 않아요.
                          </p>
                          <ul className="mt-2 flex flex-wrap gap-2">
                            {tally.pendingNames.map((name) => (
                              <li
                                key={name}
                                className="rounded-full border border-sp-border px-3 py-1 text-sm"
                              >
                                {name}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </section>

                {quiz && stage === 'answer' && (
                  <section className="mt-5 rounded-2xl border-2 border-sp-accent bg-sp-card p-5">
                    <p className="text-sm font-bold text-sp-muted">공개한 정답</p>
                    <p className="mt-1 text-2xl font-bold">{correctAnswerLabel(question)}</p>
                    <p className="mt-2 text-sm">
                      맞힌 학생{' '}
                      {
                        live.responses.filter((r) => r.questionId === question.id && r.isCorrect)
                          .length
                      }
                      명 · 미응답 {tally.pending}명
                    </p>
                    {question.explanation && <p className="mt-3 text-lg">{question.explanation}</p>}
                  </section>
                )}

                {attempt > 1 && (
                  <div className="mt-5">
                    <ParticipationRoundCompare survey={survey} live={live} question={question} />
                  </div>
                )}

                {!quiz ? (
                  <div className="mt-5">
                    <ParticipationResults survey={survey} live={live} compact />
                  </div>
                ) : (
                  stage === 'collecting' && (
                    <p className="mt-5 rounded-2xl border border-dashed border-sp-border p-5 text-sp-muted">
                      정답이 있는 문항이라 결과는 교실 화면에 바로 띄우지 않아요. 오른쪽에서 지금
                      들어오는 응답을 확인하고, 다 모이면 [응답 마감]을 누르세요.
                    </p>
                  )
                )}
              </>
            )
          )}
        </main>

        {quiz && !finished && stage !== 'lobby' && (
          <aside className="border-sp-border p-5 xl:w-96 xl:border-l">
            <p className="mb-4 text-xs text-sp-muted">
              교사 전용 · 교실 화면과 학생 화면에는 나가지 않아요.
            </p>
            <ParticipationResults survey={survey} live={live} />
          </aside>
        )}
      </div>

      {/* 아래 고정 띠 — 질문이 길거나 응답이 많아도 진행 단추가 밀리지 않는다. */}
      <footer className="flex flex-wrap items-center gap-3 border-t border-sp-border bg-sp-surface px-4 py-3">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              stage === 'collecting' ? 'bg-sp-success' : 'bg-sp-border'
            }`}
          />
          <span className="font-bold">{stageLabel(stage)}</span>
          {stage === 'closed' && (
            <span className="text-sp-muted">· 아직 학생에게 공개하지 않았어요</span>
          )}
          {stage === 'results' && (
            <span className="text-sp-muted">· 정답은 아직 감춰져 있어요</span>
          )}
        </p>

        {stage === 'lobby' && (
          <>
            <button className={participationButton} onClick={onExit}>
              초대 취소 · 편집 화면으로
            </button>
            <button disabled={busy || !entryUrl} className={primaryButton} onClick={onAdvance}>
              활동 시작
            </button>
          </>
        )}

        {finished && (
          <>
            {survey.competitionMode && (
              <button
                className={participationButton}
                aria-pressed={live.rankingVisible ?? false}
                onClick={() =>
                  useMultiSurveyV2Store.getState().setRankingVisible(!live.rankingVisible)
                }
              >
                {live.rankingVisible ? '교실 순위 가리기' : '교실에 최종 순위 공개'}
              </button>
            )}
            <button className={participationButton} onClick={onRestart}>
              다른 반에서 다시 사용
            </button>
            <button className={primaryButton} onClick={onExit}>
              편집 화면으로
            </button>
          </>
        )}

        {!finished && stage !== 'lobby' && (
          <>
            {can.canReopen && !quiz && (
              <button disabled={busy} className={participationButton} onClick={onReopen}>
                토론 후 다시 답하기
              </button>
            )}
            {can.canPublishAnswer && (
              <button disabled={busy} className={participationButton} onClick={onPublishAnswer}>
                정답·해설 공개
              </button>
            )}
            {can.canAdvance && (
              <button
                disabled={busy}
                className={stage === 'closed' ? participationButton : primaryButton}
                onClick={onAdvance}
              >
                {last ? '활동 결과 보기' : '다음 문항'}
              </button>
            )}
            {can.canPublishResults && (
              <button disabled={busy} className={primaryButton} onClick={onPublishResults}>
                결과 공개
              </button>
            )}
            {can.canClose && (
              <button disabled={busy} className={primaryButton} onClick={onClose}>
                {busy ? '처리 중…' : '응답 마감'}
              </button>
            )}
            {survey.competitionMode && stage !== 'collecting' && (
              <button
                className={participationButton}
                aria-pressed={live.rankingVisible ?? false}
                onClick={() =>
                  useMultiSurveyV2Store.getState().setRankingVisible(!live.rankingVisible)
                }
              >
                {live.rankingVisible ? '교실 순위 가리기' : '교실에 순위 공개'}
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
