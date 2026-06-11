/**
 * QuestionView — 9종 variant 라우터 (Q11 결정).
 *
 * v1 survey 4종 (정답 없음, score=0):
 *   - single-choice / multi-choice / text / scale
 * v2 quiz 5종 (정답·점수 처리):
 *   - ox / multiple / short / blank / description
 *
 * isQuizType() narrowing으로 quiz 모드 분기. survey 타입 응답은 isCorrect=undefined로 표현.
 * 실제 응답 IPC 발송은 부모(StudentPageShell)가 처리. 본 컴포넌트는 UI + onAnswer 콜백만.
 */

import { memo, useCallback, useEffect, useState } from 'react';
import type {
  Question,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  TextQuestion,
  ScaleQuestion,
  OXQuestion,
  MultipleQuestion,
  ShortQuestion,
  BlankQuestion,
  DescriptionQuestion,
} from '@domain/entities/multiSurvey/Question';
import { isQuizType } from '@domain/entities/multiSurvey/Question';
import { ChoiceButton } from './ChoiceButton';
import { OXButton } from './OXButton';
import { SubmitButton } from './SubmitButton';
import { StudentTimerBar } from './StudentTimerBar';

/** 응답 값 — Response.answer와 호환 */
export type StudentAnswerValue = string | readonly string[] | number;

interface QuestionViewProps {
  readonly question: Question;
  readonly questionIndex: number;
  readonly totalQuestions: number;
  readonly remainingSec: number;
  /** 응답 변경 시 호출 (자동 submit 또는 미리보기) */
  readonly onAnswerChange: (answer: StudentAnswerValue | null) => void;
  /** T04 explicitSubmitButton ON 시 명시 제출 콜백 */
  readonly onSubmit?: (answer: StudentAnswerValue) => void;
  /** T04 explicitSubmitButton ON 여부 */
  readonly explicitSubmit?: boolean;
  readonly disabled?: boolean;
}

function QuestionViewImpl({
  question,
  questionIndex,
  totalQuestions,
  remainingSec,
  onAnswerChange,
  onSubmit,
  explicitSubmit,
  disabled,
}: QuestionViewProps): JSX.Element {
  // 응답 상태 — 타입별 별도 관리
  const [singleChoice, setSingleChoice] = useState<string | null>(null);
  const [multiChoice, setMultiChoice] = useState<readonly string[]>([]);
  const [textValue, setTextValue] = useState<string>('');
  const [scaleValue, setScaleValue] = useState<number | null>(null);
  const [ox, setOX] = useState<'O' | 'X' | null>(null);

  // 문항 변경 시 응답 리셋
  useEffect(() => {
    setSingleChoice(null);
    setMultiChoice([]);
    setTextValue('');
    setScaleValue(null);
    setOX(null);
  }, [question.id]);

  const emit = useCallback(
    (value: StudentAnswerValue | null): void => {
      onAnswerChange(value);
      if (explicitSubmit !== true && value !== null && onSubmit !== undefined) {
        // 즉시 submit (T04 OFF): 첫 선택 시 자동 전송. 객관식 복수선택 등은 부모가 별도 처리.
      }
    },
    [onAnswerChange, explicitSubmit, onSubmit],
  );

  const handleExplicitSubmit = (): void => {
    if (onSubmit === undefined) return;
    if (singleChoice !== null) onSubmit([singleChoice]);
    else if (multiChoice.length > 0) onSubmit(multiChoice);
    else if (textValue.trim().length > 0) onSubmit(textValue);
    else if (scaleValue !== null) onSubmit(scaleValue);
    else if (ox !== null) onSubmit(ox);
  };

  const headerNode = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
        >
          {questionIndex + 1} / {totalQuestions}
        </span>
        {isQuizType(question.type) ? (
          <span
            className="font-sp-semibold"
            style={{ color: 'var(--color-highlight, #fbbf24)', fontSize: 12 }}
          >
            {question.score}점
          </span>
        ) : (
          <span
            className="font-sp-semibold"
            style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
          >
            설문
          </span>
        )}
      </div>
      <StudentTimerBar remainingSec={remainingSec} totalSec={question.timerSeconds} />
      <h2
        className="font-sp-bold text-sp-text"
        style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 22, lineHeight: 1.4 }}
      >
        {question.text}
      </h2>
    </div>
  );

  // ──────────────────────────────────────────────
  // 9종 variant 라우팅
  // ──────────────────────────────────────────────
  return (
    <div
      className="flex flex-col gap-6 rounded-3xl bg-sp-card p-6"
      style={{ backgroundColor: 'var(--color-card, #1a1f2e)' }}
    >
      {headerNode}

      {/* v1: single-choice */}
      {question.type === 'single-choice' ? (
        <SingleChoiceView
          question={question}
          selected={singleChoice}
          disabled={disabled === true}
          onSelect={(id) => {
            setSingleChoice(id);
            emit([id]);
            if (explicitSubmit !== true && onSubmit !== undefined) onSubmit([id]);
          }}
        />
      ) : null}

      {/* v1: multi-choice */}
      {question.type === 'multi-choice' ? (
        <MultiChoiceView
          question={question}
          selected={multiChoice}
          disabled={disabled === true}
          onToggle={(id) => {
            const next = multiChoice.includes(id)
              ? multiChoice.filter((x) => x !== id)
              : [...multiChoice, id];
            setMultiChoice(next);
            emit(next.length > 0 ? next : null);
          }}
        />
      ) : null}

      {/* v1: text */}
      {question.type === 'text' ? (
        <TextView
          question={question}
          value={textValue}
          disabled={disabled === true}
          onChange={(v) => {
            setTextValue(v);
            emit(v.trim().length > 0 ? v : null);
          }}
        />
      ) : null}

      {/* v1: scale */}
      {question.type === 'scale' ? (
        <ScaleView
          question={question}
          value={scaleValue}
          disabled={disabled === true}
          onSelect={(v) => {
            setScaleValue(v);
            emit(v);
            if (explicitSubmit !== true && onSubmit !== undefined) onSubmit(v);
          }}
        />
      ) : null}

      {/* v2 quiz: ox */}
      {question.type === 'ox' ? (
        <OXView
          question={question}
          selected={ox}
          disabled={disabled === true}
          onSelect={(v) => {
            setOX(v);
            emit(v);
            if (explicitSubmit !== true && onSubmit !== undefined) onSubmit(v);
          }}
        />
      ) : null}

      {/* v2 quiz: multiple */}
      {question.type === 'multiple' ? (
        <MultipleView
          question={question}
          selected={multiChoice}
          disabled={disabled === true}
          onToggle={(id) => {
            const next = multiChoice.includes(id)
              ? multiChoice.filter((x) => x !== id)
              : [...multiChoice, id];
            setMultiChoice(next);
            emit(next.length > 0 ? next : null);
          }}
        />
      ) : null}

      {/* v2 quiz: short */}
      {question.type === 'short' ? (
        <ShortView
          question={question}
          value={textValue}
          disabled={disabled === true}
          onChange={(v) => {
            setTextValue(v);
            emit(v.trim().length > 0 ? v : null);
          }}
        />
      ) : null}

      {/* v2 quiz: blank */}
      {question.type === 'blank' ? (
        <BlankView
          question={question}
          value={textValue}
          disabled={disabled === true}
          onChange={(v) => {
            setTextValue(v);
            emit(v.trim().length > 0 ? v : null);
          }}
        />
      ) : null}

      {/* v2 quiz: description */}
      {question.type === 'description' ? (
        <DescriptionView
          question={question}
          value={textValue}
          disabled={disabled === true}
          onChange={(v) => {
            setTextValue(v);
            emit(v.length >= question.minLength ? v : null);
          }}
        />
      ) : null}

      {/* T04 explicit submit 버튼 */}
      {explicitSubmit === true && onSubmit !== undefined ? (
        <SubmitButton
          onSubmit={handleExplicitSubmit}
          disabled={
            disabled === true ||
            (singleChoice === null &&
              multiChoice.length === 0 &&
              textValue.trim().length === 0 &&
              scaleValue === null &&
              ox === null)
          }
        />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// 9종 내부 sub-view (variant별 UI)
// ──────────────────────────────────────────────

interface SingleChoiceViewProps {
  readonly question: SingleChoiceQuestion;
  readonly selected: string | null;
  readonly disabled: boolean;
  readonly onSelect: (id: string) => void;
}
function SingleChoiceView({
  question,
  selected,
  disabled,
  onSelect,
}: SingleChoiceViewProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3" role="radiogroup" aria-label="단일 선택 보기">
      {question.options.map((option, i) => (
        <ChoiceButton
          key={option.id}
          label={String(i + 1)}
          text={option.text}
          selected={selected === option.id}
          disabled={disabled}
          onSelect={() => onSelect(option.id)}
        />
      ))}
    </div>
  );
}

interface MultiChoiceViewProps {
  readonly question: MultiChoiceQuestion;
  readonly selected: readonly string[];
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
}
function MultiChoiceView({
  question,
  selected,
  disabled,
  onToggle,
}: MultiChoiceViewProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="복수 선택 보기">
      {question.options.map((option, i) => (
        <ChoiceButton
          key={option.id}
          label={String(i + 1)}
          text={option.text}
          selected={selected.includes(option.id)}
          disabled={disabled}
          onSelect={() => onToggle(option.id)}
        />
      ))}
    </div>
  );
}

interface TextViewProps {
  readonly question: TextQuestion;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}
function TextView({ question, value, disabled, onChange }: TextViewProps): JSX.Element {
  const max = question.maxLength ?? 500;
  return (
    <label className="flex flex-col gap-2">
      <textarea
        value={value}
        disabled={disabled}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="답변을 입력하세요"
        aria-label="단답 주관식 답변 입력"
        className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-3 font-sp-medium text-sp-text outline-none focus:border-sp-accent"
        style={{
          borderColor: 'var(--color-border, #334155)',
          backgroundColor: 'var(--color-bg, #0a0e17)',
          color: 'var(--color-text, #e2e8f0)',
          fontSize: 16,
        }}
      />
      <span
        className="self-end font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
      >
        {value.length} / {max}
      </span>
    </label>
  );
}

interface ScaleViewProps {
  readonly question: ScaleQuestion;
  readonly value: number | null;
  readonly disabled: boolean;
  readonly onSelect: (value: number) => void;
}
function ScaleView({ question, value, disabled, onSelect }: ScaleViewProps): JSX.Element {
  const items: number[] = [];
  for (let v = question.scaleMin; v <= question.scaleMax; v += 1) items.push(v);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
        >
          {question.scaleMinLabel ?? `${question.scaleMin}`}
        </span>
        <span
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
        >
          {question.scaleMaxLabel ?? `${question.scaleMax}`}
        </span>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="척도 선택">
        {items.map((v) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`척도 ${v}`}
              disabled={disabled}
              onClick={() => onSelect(v)}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 font-sp-bold transition-all active:scale-95"
              style={{
                borderColor: selected
                  ? 'var(--color-accent, #60a5fa)'
                  : 'var(--color-border, #334155)',
                backgroundColor: selected
                  ? 'var(--color-accent, #60a5fa)'
                  : 'var(--color-card, #1a1f2e)',
                color: selected ? 'var(--color-bg, #0a0e17)' : 'var(--color-text, #e2e8f0)',
                fontSize: 18,
              }}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface OXViewProps {
  readonly question: OXQuestion;
  readonly selected: 'O' | 'X' | null;
  readonly disabled: boolean;
  readonly onSelect: (value: 'O' | 'X') => void;
}
function OXView({ selected, disabled, onSelect }: OXViewProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-4">
      <OXButton
        variant="O"
        selected={selected === 'O'}
        disabled={disabled}
        onSelect={() => onSelect('O')}
      />
      <OXButton
        variant="X"
        selected={selected === 'X'}
        disabled={disabled}
        onSelect={() => onSelect('X')}
      />
    </div>
  );
}

interface MultipleViewProps {
  readonly question: MultipleQuestion;
  readonly selected: readonly string[];
  readonly disabled: boolean;
  readonly onToggle: (id: string) => void;
}
function MultipleView({ question, selected, disabled, onToggle }: MultipleViewProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="객관식 보기 (복수 정답 가능)">
      {question.choices.map((choice, i) => (
        <ChoiceButton
          key={choice.id}
          label={String(i + 1)}
          text={choice.text}
          selected={selected.includes(choice.id)}
          disabled={disabled}
          onSelect={() => onToggle(choice.id)}
        />
      ))}
    </div>
  );
}

interface ShortViewProps {
  readonly question: ShortQuestion;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}
function ShortView({ value, disabled, onChange }: ShortViewProps): JSX.Element {
  return (
    <label className="flex flex-col gap-2">
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder="단답을 입력하세요"
        aria-label="단답 정답 입력"
        className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-3 font-sp-medium text-sp-text outline-none focus:border-sp-accent"
        style={{
          borderColor: 'var(--color-border, #334155)',
          backgroundColor: 'var(--color-bg, #0a0e17)',
          color: 'var(--color-text, #e2e8f0)',
          fontSize: 18,
        }}
      />
    </label>
  );
}

interface BlankViewProps {
  readonly question: BlankQuestion;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}
function BlankView({ question, value, disabled, onChange }: BlankViewProps): JSX.Element {
  return (
    <label className="flex flex-col gap-2">
      <span
        className="font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
      >
        {question.isHangulInitial ? '초성으로 입력 가능' : '빈칸을 채워주세요'}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        placeholder="정답"
        aria-label="빈칸 정답 입력"
        className="rounded-2xl border-2 border-sp-border bg-sp-bg px-4 py-3 font-sp-medium text-sp-text outline-none focus:border-sp-accent"
        style={{
          borderColor: 'var(--color-border, #334155)',
          backgroundColor: 'var(--color-bg, #0a0e17)',
          color: 'var(--color-text, #e2e8f0)',
          fontSize: 18,
        }}
      />
    </label>
  );
}

interface DescriptionViewProps {
  readonly question: DescriptionQuestion;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}
function DescriptionView({
  question,
  value,
  disabled,
  onChange,
}: DescriptionViewProps): JSX.Element {
  const tooShort = value.length > 0 && value.length < question.minLength;
  return (
    <label className="flex flex-col gap-2">
      <textarea
        value={value}
        disabled={disabled}
        maxLength={question.maxLength}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={`서술형 답변 (${question.minLength}자 이상)`}
        aria-label="서술형 답변 입력"
        className="rounded-2xl border-2 bg-sp-bg px-4 py-3 font-sp-medium text-sp-text outline-none focus:border-sp-accent"
        style={{
          borderColor: tooShort
            ? 'var(--color-highlight, #fbbf24)'
            : 'var(--color-border, #334155)',
          backgroundColor: 'var(--color-bg, #0a0e17)',
          color: 'var(--color-text, #e2e8f0)',
          fontSize: 16,
        }}
      />
      <span
        className="self-end font-sp-medium"
        style={{
          color: tooShort ? 'var(--color-highlight, #fbbf24)' : 'var(--color-muted, #94a3b8)',
          fontSize: 12,
        }}
      >
        {value.length} / {question.maxLength} (최소 {question.minLength}자)
      </span>
    </label>
  );
}

export const QuestionView = memo(QuestionViewImpl);
