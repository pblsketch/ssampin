/**
 * TeacherConsole — MultiSurveyV2 교사 진행 콘솔 루트.
 *
 * 책임:
 * - 현재 LiveSession.phase 기반 조건부 렌더링 (lobby / open / revealed / round_result / podium / end)
 * - phase 간 crossfade 트랜지션 (sp-duration-slow)
 * - DN-09: round_result는 displayOpts.showPerQuestionScore === true 일 때만 도달 (Store nextPhase 가 보장)
 * - prefers-reduced-motion 시 즉시 전환
 *
 * sp-* 토큰: sp-bg (배경) / sp-border (구획선)
 */

import { memo, useEffect, useState } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession, LivePhase } from '@domain/entities/multiSurvey/LiveSession';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import {
  useMultiSurveyV2Store,
  selectActiveLiveSurvey,
} from '@adapters/stores/useMultiSurveyV2Store';
import { ConsoleHeader } from './ConsoleHeader';
import { PhaseIndicator } from './PhaseIndicator';
import { LobbyView } from './LobbyView';
import { QuestionDisplay } from './QuestionDisplay';
import { TimerBar } from './TimerBar';
import { ResponseCounter } from './ResponseCounter';
import { AnswerReveal } from './AnswerReveal';
import { RoundResultTable } from './RoundResultTable';
import { Podium } from './Podium';
import { SidePanelConsole } from './SidePanelConsole';

interface TeacherConsoleProps {
  /** 학생 입장 URL (QR/LobbyView 전달용) */
  readonly entryUrl: string;
  /**
   * 다음 단계 진행 콜백 — 학생 페이지 IPC 동기화 포함 (LiveConsoleContainer 주입).
   * 미지정 시 store.nextPhase 만 호출 (학생 페이지 비동기화 — 테스트/프리뷰 전용).
   */
  readonly onAdvance?: () => void;
  /** 일시정지 콜백 */
  readonly onPause?: () => void;
  /** 종료 콜백 */
  readonly onEnd?: () => void;
  /** "다시 하기" 콜백 (end phase) */
  readonly onRestart?: () => void;
  /** 메이커로 복귀 콜백 (end phase) */
  readonly onExit?: () => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function currentQuestion(survey: MultiSurveyV2, live: LiveSession): Question | undefined {
  return survey.questions[live.currentQuestionIndex];
}

function currentResponses(live: LiveSession, question: Question | undefined): readonly Response[] {
  if (!question) return [];
  return live.responses.filter((r) => r.questionId === question.id);
}

function TeacherConsoleImpl({
  entryUrl,
  onAdvance,
  onPause,
  onEnd,
  onRestart,
  onExit,
}: TeacherConsoleProps): JSX.Element {
  const live = useMultiSurveyV2Store((s) => s.liveSession);
  const survey = useMultiSurveyV2Store(selectActiveLiveSurvey);
  const reducedMotion = usePrefersReducedMotion();

  if (!live || !survey) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-sp-bg text-sp-text"
        role="status"
      >
        <span className="font-sp-medium" style={{ fontSize: 24 }}>
          잠시만요...
        </span>
      </div>
    );
  }

  const phase: LivePhase = live.phase;
  const question = currentQuestion(survey, live);
  const responsesForQuestion = currentResponses(live, question);
  const expectedCount = live.students.length;
  const fadeStyle = reducedMotion
    ? undefined
    : { transition: 'opacity var(--sp-duration-slow) var(--sp-ease-out)' };

  return (
    <div
      className="grid h-full w-full grid-cols-[1fr_320px] grid-rows-[auto_auto_1fr] bg-sp-bg text-sp-text"
      role="region"
      aria-label="교사 진행 콘솔"
    >
      <div className="col-span-2">
        <ConsoleHeader surveyTitle={survey.title} phase={phase} onPause={onPause} onEnd={onEnd} />
      </div>
      <div className="col-span-2 border-b border-sp-border">
        <PhaseIndicator
          currentPhase={phase}
          showRoundResult={survey.displayOpts.showPerQuestionScore}
        />
      </div>

      <main
        key={phase}
        className="overflow-auto p-8"
        style={{ ...fadeStyle, opacity: 1 }}
        aria-live="polite"
      >
        {phase === 'lobby' && <LobbyView entryUrl={entryUrl} students={live.students} />}

        {phase === 'open' && question && (
          <div className="flex flex-col gap-6">
            <QuestionDisplay
              question={question}
              questionIndex={live.currentQuestionIndex}
              totalQuestions={survey.questions.length}
              showTimer={survey.responseOpts.autoAdvance}
            />
            {/* 자동 넘김 OFF면 타이머 비표시 — 교사 주도 진행 (2026-06-11 사용자 결정) */}
            {survey.responseOpts.autoAdvance && (
              <TimerBar
                totalSeconds={question.timerSeconds}
                remainingSeconds={question.timerSeconds}
              />
            )}
            <ResponseCounter
              responseCount={responsesForQuestion.length}
              expectedCount={expectedCount}
            />
          </div>
        )}

        {phase === 'revealed' && question && (
          <AnswerReveal question={question} responses={responsesForQuestion} />
        )}

        {phase === 'round_result' && survey.displayOpts.showPerQuestionScore && (
          <RoundResultTable
            students={live.students}
            responses={live.responses}
            questions={survey.questions}
          />
        )}

        {phase === 'podium' && (
          <Podium
            students={live.students}
            responses={live.responses}
            questions={survey.questions}
          />
        )}

        {phase === 'end' && (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <span className="font-sp-bold text-sp-text" style={{ fontSize: 48 }}>
              수업 마침
            </span>
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 20 }}>
              수고하셨습니다. 다시 진행하려면 아래 버튼을 누르세요.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onRestart}
                className="rounded-lg bg-sp-accent px-8 py-4 font-sp-semibold text-[color:var(--sp-accent-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg"
                style={{ fontSize: 20 }}
              >
                다시 하기
              </button>
              {onExit && (
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded-lg border border-sp-border bg-sp-surface px-8 py-4 font-sp-medium text-sp-text hover:border-sp-muted transition-colors duration-sp-base motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg"
                  style={{ fontSize: 20 }}
                >
                  편집 화면으로
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <aside className="border-l border-sp-border">
        <SidePanelConsole
          survey={survey}
          live={live}
          responsesForCurrent={responsesForQuestion}
          onAdvance={onAdvance}
          onPause={onPause}
          onEnd={onEnd}
        />
      </aside>
    </div>
  );
}

export const TeacherConsole = memo(TeacherConsoleImpl);
