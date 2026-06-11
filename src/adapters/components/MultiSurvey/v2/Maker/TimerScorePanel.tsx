/**
 * TimerScorePanel — 타이머·점수 ± 조절
 *
 * DN-01: 변경 시 즉시 LivePreview 반영 — store action 동기 호출
 * sp-* 토큰: sp-surface, sp-border, sp-text, sp-muted
 *
 * 설문 타입(v1)은 점수=0 강제 (Question.ts QuestionBase 주석 참조).
 */

import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import { isQuizType, type Question } from '@domain/entities/multiSurvey/Question';

interface TimerScorePanelProps {
  readonly sessionId: string;
  readonly question: Question;
}

const TIMER_MIN = 5;
const TIMER_MAX = 600;
const TIMER_STEP = 5;
const SCORE_MIN = 0;
const SCORE_MAX = 1000;
const SCORE_STEP = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function TimerScorePanel({ sessionId, question }: TimerScorePanelProps): JSX.Element {
  const updateSession = useMultiSurveyV2Store((s) => s.updateSession);
  const sessions = useMultiSurveyV2Store((s) => s.sessions);

  const isQuiz = isQuizType(question.type);
  // 자동 넘김 OFF면 타이머는 동작하지 않으므로 입력 자체를 숨김 (2026-06-11 사용자 결정)
  const autoAdvance =
    sessions.find((sess) => sess.id === sessionId)?.responseOpts.autoAdvance ?? false;

  const patchQuestion = (patch: Partial<Question>): void => {
    const current = sessions.find((sess) => sess.id === sessionId);
    if (!current) return;
    const nextQuestions = current.questions.map((q) =>
      q.id === question.id ? ({ ...q, ...patch } as Question) : q,
    );
    updateSession(sessionId, { questions: nextQuestions });
  };

  const adjustTimer = (delta: number): void => {
    const next = clamp(question.timerSeconds + delta, TIMER_MIN, TIMER_MAX);
    patchQuestion({ timerSeconds: next });
  };

  const adjustScore = (delta: number): void => {
    if (!isQuiz) return;
    const next = clamp(question.score + delta, SCORE_MIN, SCORE_MAX);
    patchQuestion({ score: next });
  };

  return (
    <div
      className="flex items-center gap-3 p-3 bg-sp-surface border border-sp-border rounded-lg"
      aria-label="타이머 및 점수 조절"
    >
      {autoAdvance && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs font-sp-medium text-sp-muted">타이머</span>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => adjustTimer(-TIMER_STEP)}
                disabled={question.timerSeconds <= TIMER_MIN}
                aria-label="타이머 감소"
                className="w-6 h-6 inline-flex items-center justify-center rounded border border-sp-border text-sp-text hover:bg-sp-bg/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
              >
                −
              </button>
              <span className="min-w-[3rem] text-center text-sm font-sp-semibold text-sp-text tabular-nums">
                {question.timerSeconds}초
              </span>
              <button
                type="button"
                onClick={() => adjustTimer(TIMER_STEP)}
                disabled={question.timerSeconds >= TIMER_MAX}
                aria-label="타이머 증가"
                className="w-6 h-6 inline-flex items-center justify-center rounded border border-sp-border text-sp-text hover:bg-sp-bg/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
              >
                +
              </button>
            </div>
          </div>

          <div className="h-5 w-px bg-sp-border" aria-hidden="true" />
        </>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs font-sp-medium text-sp-muted">점수</span>
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => adjustScore(-SCORE_STEP)}
            disabled={!isQuiz || question.score <= SCORE_MIN}
            aria-label="점수 감소"
            className="w-6 h-6 inline-flex items-center justify-center rounded border border-sp-border text-sp-text hover:bg-sp-bg/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-sm font-sp-semibold text-sp-text tabular-nums">
            {isQuiz ? question.score : '—'}
          </span>
          <button
            type="button"
            onClick={() => adjustScore(SCORE_STEP)}
            disabled={!isQuiz || question.score >= SCORE_MAX}
            aria-label="점수 증가"
            className="w-6 h-6 inline-flex items-center justify-center rounded border border-sp-border text-sp-text hover:bg-sp-bg/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent"
          >
            +
          </button>
        </div>
      </div>

      {!isQuiz && (
        <span className="ml-auto text-xs text-sp-muted">설문 타입은 점수가 없습니다</span>
      )}
    </div>
  );
}
