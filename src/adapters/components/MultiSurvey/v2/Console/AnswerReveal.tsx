/**
 * AnswerReveal — 정답 공개 + 보기별 응답 분포.
 *
 * - 객관식/OX/multiple: groupResponsesByChoice 사용
 * - 주관식(text/short/blank/description): 응답 텍스트 샘플 N개 표시 (정답 여부 미지정 시 설문 취급)
 * - DistributionBar 각 보기마다 카운트업 막대.
 *
 * sp-* 토큰: sp-card / sp-border / sp-accent / sp-text / sp-muted / sp-duration-slow
 */

import { memo, useMemo } from 'react';
import type {
  Question,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  MultipleQuestion,
  OXQuestion,
} from '@domain/entities/multiSurvey/Question';
import { isQuizType } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { groupResponsesByChoice } from '@domain/rules/multiSurveyRules';
import { DistributionBar } from './DistributionBar';

interface AnswerRevealProps {
  readonly question: Question;
  readonly responses: readonly Response[];
}

interface ChoiceRow {
  readonly id: string;
  readonly label: string;
  readonly text?: string;
  readonly count: number;
  readonly percentage: number;
  readonly isCorrect: boolean;
}

function buildChoiceRows(question: Question, responses: readonly Response[]): readonly ChoiceRow[] {
  const grouped = groupResponsesByChoice(responses, question);
  if (grouped.length === 0) return [];

  switch (question.type) {
    case 'single-choice':
    case 'multi-choice': {
      const q = question as SingleChoiceQuestion | MultiChoiceQuestion;
      return grouped.map((g, i) => {
        const opt = q.options.find((o) => o.id === g.choiceId);
        return {
          id: g.choiceId,
          label: `${i + 1}`,
          text: opt?.text,
          count: g.count,
          percentage: Math.round(g.ratio * 100),
          isCorrect: false, // 설문 타입은 정답 개념 없음
        };
      });
    }
    case 'multiple': {
      const q = question as MultipleQuestion;
      const correctSet = new Set(q.correctChoiceIds);
      return grouped.map((g, i) => {
        const opt = q.choices.find((c) => c.id === g.choiceId);
        return {
          id: g.choiceId,
          label: `${i + 1}`,
          text: opt?.text,
          count: g.count,
          percentage: Math.round(g.ratio * 100),
          isCorrect: correctSet.has(g.choiceId),
        };
      });
    }
    case 'ox': {
      const q = question as OXQuestion;
      return grouped.map((g) => ({
        id: g.choiceId,
        label: g.choiceId,
        count: g.count,
        percentage: Math.round(g.ratio * 100),
        isCorrect: g.choiceId === q.correctAnswer,
      }));
    }
    default:
      return [];
  }
}

function isChoiceType(question: Question): boolean {
  return (
    question.type === 'single-choice' ||
    question.type === 'multi-choice' ||
    question.type === 'ox' ||
    question.type === 'multiple'
  );
}

function AnswerRevealImpl({ question, responses }: AnswerRevealProps): JSX.Element {
  const rows = useMemo(() => buildChoiceRows(question, responses), [question, responses]);
  const isQuiz = isQuizType(question.type);
  const sampleTexts = useMemo(() => {
    if (isChoiceType(question)) return [];
    return responses
      .map((r) => r.answer)
      .filter((a): a is string => typeof a === 'string')
      .slice(0, 6);
  }, [question, responses]);

  return (
    <section
      className="flex w-full flex-col gap-6 rounded-2xl border border-sp-border bg-sp-card p-8"
      aria-label="정답 공개"
    >
      <header className="flex items-baseline justify-between">
        <span className="font-sp-bold text-sp-text" style={{ fontSize: 28 }}>
          정답 공개
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
          응답 {responses.length}건
        </span>
      </header>

      <h2 className="font-sp-semibold text-sp-text" style={{ fontSize: 24, lineHeight: 1.4 }}>
        {question.text}
      </h2>

      {isChoiceType(question) ? (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <DistributionBar
              key={r.id}
              label={r.label}
              text={r.text}
              count={r.count}
              percentage={r.percentage}
              isCorrect={r.isCorrect}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-label="학생 응답 예시">
          {sampleTexts.length === 0 ? (
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
              응답이 없습니다.
            </span>
          ) : (
            sampleTexts.map((t, i) => (
              <div
                key={`${i}-${t.slice(0, 8)}`}
                className="rounded-lg border border-sp-border bg-sp-card px-4 py-3 font-sp-medium text-sp-text"
              >
                {t}
              </div>
            ))
          )}
        </div>
      )}

      {isQuiz && question.explanation !== undefined && question.explanation.length > 0 && (
        <div
          style={{
            backgroundColor: 'color-mix(in srgb, var(--sp-accent) 8%, var(--sp-card))',
            borderColor: 'color-mix(in srgb, var(--sp-accent) 22%, transparent)',
            fontSize: 18,
          }}
          className="rounded-lg border px-5 py-4 font-sp-medium text-sp-text"
          aria-label="해설"
        >
          {question.explanation}
        </div>
      )}
    </section>
  );
}

export const AnswerReveal = memo(AnswerRevealImpl);
