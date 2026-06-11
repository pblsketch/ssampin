/**
 * QuestionDisplay — 교사 진행 화면의 문항 표시 카드.
 *
 * 9종 Question union 모두 처리. v1 survey 4종은 isQuizType=false.
 *
 * sp-* 토큰: sp-card / sp-text / sp-accent / sp-border / sp-shadow-card
 */

import { memo } from 'react';
import type {
  Question,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  MultipleQuestion,
  OXQuestion,
  ScaleQuestion,
} from '@domain/entities/multiSurvey/Question';

interface QuestionDisplayProps {
  readonly question: Question;
  readonly questionIndex: number;
  readonly totalQuestions: number;
  /** 자동 넘김 ON일 때만 제한 시간 표시 (기본 false) */
  readonly showTimer?: boolean;
}

function ChoiceList({
  options,
  prefix = '',
}: {
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly prefix?: string;
}): JSX.Element {
  return (
    <ul className="grid w-full grid-cols-1 gap-3 md:grid-cols-2" aria-label="보기">
      {options.map((opt, i) => (
        <li
          key={opt.id}
          className="flex items-center gap-3 rounded-lg border border-sp-border bg-sp-card px-4 py-3 font-sp-medium text-sp-text"
          style={{ fontSize: 20 }}
        >
          <span className="font-sp-bold text-sp-accent" style={{ fontSize: 22 }}>
            {prefix}
            {i + 1}
          </span>
          <span>{opt.text}</span>
        </li>
      ))}
    </ul>
  );
}

function renderBody(question: Question): JSX.Element | null {
  switch (question.type) {
    case 'single-choice':
    case 'multi-choice': {
      const q = question as SingleChoiceQuestion | MultiChoiceQuestion;
      return <ChoiceList options={q.options} />;
    }
    case 'multiple': {
      const q = question as MultipleQuestion;
      return <ChoiceList options={q.choices} />;
    }
    case 'ox': {
      const q = question as OXQuestion;
      return (
        <div className="flex w-full items-center justify-center gap-8" aria-label="OX 보기">
          {(['O', 'X'] as const).map((mark) => (
            <div
              key={mark}
              className="flex h-32 w-32 items-center justify-center rounded-2xl border border-sp-border bg-sp-card font-sp-bold text-sp-text"
              style={{ fontSize: 72 }}
              aria-hidden="true"
            >
              {mark}
            </div>
          ))}
          <span className="sr-only">정답: {q.correctAnswer}</span>
        </div>
      );
    }
    case 'scale': {
      const q = question as ScaleQuestion;
      return (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
            {q.scaleMinLabel ?? q.scaleMin}
          </span>
          <div className="flex flex-1 items-center justify-center gap-2">
            {Array.from({ length: q.scaleMax - q.scaleMin + 1 }).map((_, i) => (
              <div
                key={i}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-sp-border bg-sp-card font-sp-semibold text-sp-text"
                style={{ fontSize: 18 }}
                aria-hidden="true"
              >
                {q.scaleMin + i}
              </div>
            ))}
          </div>
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
            {q.scaleMaxLabel ?? q.scaleMax}
          </span>
        </div>
      );
    }
    case 'text':
    case 'short':
    case 'blank':
    case 'description':
      return (
        <div
          className="w-full rounded-lg border border-dashed border-sp-border bg-sp-card px-4 py-6 text-center font-sp-medium text-sp-text"
          style={{ fontSize: 18 }}
          aria-label="주관식 입력 안내"
        >
          학생 화면에서 답을 입력하세요.
        </div>
      );
  }
}

function QuestionDisplayImpl({
  question,
  questionIndex,
  totalQuestions,
  showTimer = false,
}: QuestionDisplayProps): JSX.Element {
  return (
    <article
      className="flex w-full flex-col gap-6 rounded-2xl border border-sp-border bg-sp-card p-8 shadow-sp-md"
      aria-label="현재 문항"
    >
      <header className="flex items-baseline justify-between">
        <span className="font-sp-semibold text-sp-accent" style={{ fontSize: 18 }}>
          문항 {questionIndex + 1} / {totalQuestions}
        </span>
        <span className="font-sp-medium text-sp-text" style={{ fontSize: 16 }}>
          {showTimer
            ? `제한 시간 ${question.timerSeconds}초 · 배점 ${question.score}점`
            : `배점 ${question.score}점`}
        </span>
      </header>
      <h2 className="font-sp-bold text-sp-text" style={{ fontSize: 32, lineHeight: 1.4 }}>
        {question.text}
      </h2>
      {question.mediaUrl !== undefined && question.mediaUrl.length > 0 && (
        <img
          src={question.mediaUrl}
          alt="문항 보조 이미지"
          className="max-h-80 w-auto self-center rounded-lg border border-sp-border"
        />
      )}
      {renderBody(question)}
    </article>
  );
}

export const QuestionDisplay = memo(QuestionDisplayImpl);
