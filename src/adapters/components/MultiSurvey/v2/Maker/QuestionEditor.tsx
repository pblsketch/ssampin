/**
 * QuestionEditor — 중앙 편집 영역
 *
 * 책임:
 * - 유형 전환 세그먼트 탭 (9종) — Q11 결정에 따라 v2 quiz 5종만 전환 가능,
 *   v1 survey 4종은 read-only 표시 (변환 옵션 미채택)
 * - QuestionTextInput, ChoiceList, TimerScorePanel 합성
 *
 * sp-* 토큰: sp-card, sp-border, sp-text, sp-muted, sp-accent, sp-duration-base
 */

import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import {
  isQuizType,
  type Question,
  type QuestionType,
  type QuizQuestionType,
  type OXQuestion,
  type MultipleQuestion,
  type ShortQuestion,
  type BlankQuestion,
  type DescriptionQuestion,
} from '@domain/entities/multiSurvey/Question';
import { QuestionTypeChip, QUESTION_TYPE_LABELS } from './QuestionTypeChip';
import { QuestionTextInput } from './QuestionTextInput';
import { ChoiceList } from './ChoiceList';
import { TimerScorePanel } from './TimerScorePanel';

interface QuestionEditorProps {
  readonly sessionId: string;
  readonly question: Question;
}

const QUIZ_TYPES: readonly QuizQuestionType[] = ['ox', 'multiple', 'short', 'blank', 'description'];

function defaultQuestionForType(base: Question, nextType: QuizQuestionType): Question {
  const commonBase = {
    id: base.id,
    text: base.text,
    timerSeconds: base.timerSeconds,
    score: base.score,
    ...(base.mediaUrl ? { mediaUrl: base.mediaUrl } : {}),
    ...(base.explanation ? { explanation: base.explanation } : {}),
  };

  switch (nextType) {
    case 'ox': {
      const q: OXQuestion = { ...commonBase, type: 'ox', correctAnswer: 'O' };
      return q;
    }
    case 'multiple': {
      const q: MultipleQuestion = {
        ...commonBase,
        type: 'multiple',
        choices: [],
        correctChoiceIds: [],
      };
      return q;
    }
    case 'short': {
      const q: ShortQuestion = {
        ...commonBase,
        type: 'short',
        acceptedAnswers: [],
        caseSensitive: false,
      };
      return q;
    }
    case 'blank': {
      const q: BlankQuestion = {
        ...commonBase,
        type: 'blank',
        acceptedAnswers: [],
        isHangulInitial: false,
      };
      return q;
    }
    case 'description': {
      const q: DescriptionQuestion = {
        ...commonBase,
        type: 'description',
        minLength: 0,
        maxLength: 500,
      };
      return q;
    }
  }
}

export function QuestionEditor({ sessionId, question }: QuestionEditorProps): JSX.Element {
  const updateSession = useMultiSurveyV2Store((s) => s.updateSession);
  const sessions = useMultiSurveyV2Store((s) => s.sessions);

  const isV1Survey = !isQuizType(question.type);

  const patchQuestion = (next: Question): void => {
    const current = sessions.find((sess) => sess.id === sessionId);
    if (!current) return;
    const nextQuestions = current.questions.map((q) => (q.id === next.id ? next : q));
    updateSession(sessionId, { questions: nextQuestions });
  };

  const handleTextChange = (nextText: string): void => {
    patchQuestion({ ...question, text: nextText });
  };

  const handleExplanationChange = (nextExplanation: string): void => {
    patchQuestion({ ...question, explanation: nextExplanation });
  };

  const handleTypeChange = (nextType: QuestionType): void => {
    if (nextType === question.type) return;
    if (!isQuizType(nextType)) return; // Q11: v1 변환 미지원
    if (isV1Survey) return; // v1 → v2 변환 금지 (Q11)
    patchQuestion(defaultQuestionForType(question, nextType));
  };

  const handleOXAnswerChange = (answer: 'O' | 'X'): void => {
    if (question.type !== 'ox') return;
    const next: OXQuestion = { ...question, correctAnswer: answer };
    patchQuestion(next);
  };

  const handleShortAnswerChange = (raw: string): void => {
    if (question.type !== 'short' && question.type !== 'blank') return;
    const answers = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (question.type === 'short') {
      const next: ShortQuestion = { ...question, acceptedAnswers: answers };
      patchQuestion(next);
    } else {
      const next: BlankQuestion = { ...question, acceptedAnswers: answers };
      patchQuestion(next);
    }
  };

  return (
    <div
      className={[
        'flex flex-col gap-4 p-4 bg-sp-card border border-sp-border rounded-lg',
        'transition-colors duration-sp-base motion-reduce:transition-none',
      ].join(' ')}
      aria-label="문항 편집"
    >
      {/* 유형 전환 세그먼트 탭 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-sp-medium text-sp-muted">문항 유형</span>
          <QuestionTypeChip type={question.type} />
        </div>
        {isV1Survey ? (
          <p className="text-xs text-sp-muted leading-relaxed">
            v1 설문 유형은 표시 전용입니다. (v2 퀴즈로 변환 불가)
          </p>
        ) : (
          <div
            role="tablist"
            aria-label="문항 유형 선택"
            className="inline-flex items-center gap-1 p-1 bg-sp-bg/40 border border-sp-border rounded-lg"
          >
            {QUIZ_TYPES.map((t) => {
              const active = question.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => handleTypeChange(t)}
                  className={[
                    'px-3 py-1.5 text-xs font-sp-medium rounded transition-colors duration-sp-base motion-reduce:transition-none',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
                    active
                      ? 'bg-sp-accent text-white'
                      : 'text-sp-muted hover:text-sp-text hover:bg-sp-card',
                  ].join(' ')}
                >
                  {QUESTION_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 문항 본문 */}
      <QuestionTextInput
        value={question.text}
        onChange={handleTextChange}
        label="문항 본문"
        rows={3}
      />

      {/* 유형별 입력 영역 */}
      {question.type === 'ox' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-sp-medium text-sp-muted">정답</span>
          {(['O', 'X'] as const).map((ans) => (
            <button
              key={ans}
              type="button"
              aria-pressed={question.correctAnswer === ans}
              onClick={() => handleOXAnswerChange(ans)}
              className={[
                'w-10 h-10 inline-flex items-center justify-center rounded-lg border text-base font-sp-bold',
                'transition-colors duration-sp-base motion-reduce:transition-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
                question.correctAnswer === ans
                  ? 'bg-sp-accent text-white border-sp-accent'
                  : 'border-sp-border text-sp-text hover:border-sp-accent',
              ].join(' ')}
            >
              {ans}
            </button>
          ))}
        </div>
      )}

      {question.type === 'multiple' && (
        <ChoiceList sessionId={sessionId} question={question} maxChoices={5} />
      )}

      {(question.type === 'single-choice' || question.type === 'multi-choice') && (
        <ChoiceList sessionId={sessionId} question={question} maxChoices={10} />
      )}

      {(question.type === 'short' || question.type === 'blank') && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-sp-medium text-sp-muted">정답 (쉼표로 구분)</label>
          <input
            type="text"
            value={question.acceptedAnswers.join(', ')}
            onChange={(e) => handleShortAnswerChange(e.target.value)}
            placeholder="정답1, 정답2, 정답3"
            aria-label="허용 정답 목록"
            className={[
              'w-full px-3 py-2 bg-sp-bg text-sp-text text-sm',
              'border border-sp-border rounded-lg',
              'placeholder:text-sp-muted',
              'focus:outline-none focus:border-sp-accent focus:ring-2 focus:ring-sp-accent/30',
              'transition-colors duration-sp-base motion-reduce:transition-none',
            ].join(' ')}
          />
        </div>
      )}

      {question.type === 'description' && (
        <div className="text-xs text-sp-muted">
          서술형 — 최소 {question.minLength}자 / 최대 {question.maxLength}자
        </div>
      )}

      {question.type === 'scale' && (
        <div className="text-xs text-sp-muted">
          척도 — {question.scaleMin} ~ {question.scaleMax}
        </div>
      )}

      {question.type === 'text' && (
        <div className="text-xs text-sp-muted">단답 주관식 — 정답 없음</div>
      )}

      {/* 해설 (선택) */}
      <QuestionTextInput
        value={question.explanation ?? ''}
        onChange={handleExplanationChange}
        label="해설 (선택)"
        placeholder="정답 공개 시 학생에게 보여줄 해설"
        rows={2}
      />

      {/* 타이머·점수 */}
      <TimerScorePanel sessionId={sessionId} question={question} />
    </div>
  );
}
