/**
 * ResultView — 정답/오답 + 점수 카운트업 + 해설.
 *
 * - quiz 타입(v2 5종)만 정답/오답 표시. survey 타입(v1 4종)은 "응답 완료"만 표시.
 * - 점수 카운트업 애니메이션 (prefers-reduced-motion 시 즉시 표시).
 * - 해설은 T02 revealExplanation ON 시만 표시 (부모가 props로 제어).
 */

import { memo, useEffect, useState } from 'react';
import type { Question } from '@domain/entities/multiSurvey/Question';
import { isQuizType } from '@domain/entities/multiSurvey/Question';

interface ResultViewProps {
  readonly question: Question;
  readonly isCorrect: boolean | undefined;
  readonly scoreEarned: number;
  readonly cumulativeScore: number;
  readonly showExplanation: boolean;
  readonly showCumulativeScore: boolean;
}

function ResultViewImpl({
  question,
  isCorrect,
  scoreEarned,
  cumulativeScore,
  showExplanation,
  showCumulativeScore,
}: ResultViewProps): JSX.Element {
  const [displayScore, setDisplayScore] = useState<number>(0);
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduce = mq.matches;
    setReduceMotion(reduce);
    if (reduce) {
      setDisplayScore(cumulativeScore);
      return;
    }
    // 누적 점수 카운트업 (600ms 동안)
    const start = cumulativeScore - scoreEarned;
    const duration = 600;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + eased * scoreEarned);
      setDisplayScore(current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cumulativeScore, scoreEarned]);

  const isQuiz = isQuizType(question.type);

  // 헤더 배지: quiz 타입만 정답/오답, survey는 응답완료
  const badgeNode = (() => {
    if (!isQuiz || isCorrect === undefined) {
      return (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-accent, #60a5fa) 15%, transparent)',
            color: 'var(--color-accent, #60a5fa)',
          }}
        >
          <span style={{ fontSize: 28 }} aria-hidden="true">
            📨
          </span>
          <span className="font-sp-bold" style={{ fontSize: 18 }}>
            응답 완료
          </span>
        </div>
      );
    }
    return isCorrect ? (
      <div
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
          reduceMotion ? '' : 'sp-result-correct'
        }`}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent, #60a5fa) 20%, transparent)',
          color: 'var(--color-accent, #60a5fa)',
        }}
      >
        <span style={{ fontSize: 32 }} aria-hidden="true">
          ⭕
        </span>
        <span className="font-sp-bold" style={{ fontSize: 22 }}>
          정답!
        </span>
      </div>
    ) : (
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-highlight, #fbbf24) 20%, transparent)',
          color: 'var(--color-highlight, #fbbf24)',
        }}
      >
        <span style={{ fontSize: 32 }} aria-hidden="true">
          ❌
        </span>
        <span className="font-sp-bold" style={{ fontSize: 22 }}>
          오답
        </span>
      </div>
    );
  })();

  return (
    <div
      className="flex flex-col gap-5 rounded-3xl bg-sp-card p-6"
      role="region"
      aria-label="응답 결과"
      style={{ backgroundColor: 'var(--color-card, #1a1f2e)' }}
    >
      {badgeNode}

      {isQuiz && scoreEarned > 0 ? (
        <div className="flex items-baseline gap-2">
          <span
            className="font-sp-semibold text-sp-muted"
            style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
          >
            획득
          </span>
          <span
            className="font-sp-bold"
            style={{ color: 'var(--color-highlight, #fbbf24)', fontSize: 32 }}
          >
            +{scoreEarned}
          </span>
          <span
            className="font-sp-medium text-sp-muted"
            style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
          >
            점
          </span>
        </div>
      ) : null}

      {showCumulativeScore ? (
        <div
          className="flex items-baseline justify-between rounded-2xl px-4 py-3"
          role="status"
          aria-live="polite"
          style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
        >
          <span
            className="font-sp-medium text-sp-muted"
            style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
          >
            누적 점수
          </span>
          <span
            className="font-sp-bold"
            style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 28 }}
          >
            {displayScore}점
          </span>
        </div>
      ) : null}

      {showExplanation && question.explanation !== undefined && question.explanation.length > 0 ? (
        <div
          className="flex flex-col gap-2 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-muted, #94a3b8) 10%, transparent)',
          }}
        >
          <span
            className="font-sp-semibold"
            style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 14 }}
          >
            해설
          </span>
          <p
            className="font-sp-medium"
            style={{
              color: 'var(--color-text, #e2e8f0)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {question.explanation}
          </p>
        </div>
      ) : null}

      <style>{`
        @keyframes sp-result-correct-kf {
          0%   { transform: scale(0.9); opacity: 0; }
          50%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .sp-result-correct {
          animation: sp-result-correct-kf 400ms var(--sp-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
        }
      `}</style>
    </div>
  );
}

export const ResultView = memo(ResultViewImpl);
