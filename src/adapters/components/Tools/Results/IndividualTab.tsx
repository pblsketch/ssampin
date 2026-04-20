import { useEffect, useMemo, useCallback } from 'react';
import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  serializeAnswerCell,
  formatSubmissionLabel,
} from '@domain/rules/toolResultSerialization';

interface IndividualTabProps {
  data: MultiSurveyResultData;
  /** 보고있는 응답자 index (0-based). 탭 간 보존을 위해 부모에서 관리. */
  index: number;
  onIndexChange: (i: number) => void;
}

export function IndividualTab({ data, index, onIndexChange }: IndividualTabProps) {
  const total = data.submissions.length;
  const clampedIndex = Math.max(0, Math.min(index, total - 1));

  // 부모 state가 submissions 범위 밖이면 자동 보정
  useEffect(() => {
    if (index !== clampedIndex) onIndexChange(clampedIndex);
  }, [index, clampedIndex, onIndexChange]);

  const submission = data.submissions[clampedIndex];

  const goPrev = useCallback(() => {
    if (clampedIndex > 0) onIndexChange(clampedIndex - 1);
  }, [clampedIndex, onIndexChange]);

  const goNext = useCallback(() => {
    if (clampedIndex < total - 1) onIndexChange(clampedIndex + 1);
  }, [clampedIndex, total, onIndexChange]);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // input/textarea 포커스 중에는 무시
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goPrev, goNext]);

  const submittedTime = useMemo(() => {
    if (!submission) return '';
    const d = new Date(submission.submittedAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, [submission]);

  if (!submission) {
    return (
      <div className="p-8 text-center text-sm text-sp-muted">
        응답이 없습니다
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* 네비게이션 */}
      <div className="flex items-center justify-between rounded-xl border border-sp-border bg-sp-card px-4 py-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={clampedIndex === 0}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sp-border bg-sp-surface text-sp-text transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="이전 응답자"
        >
          ←
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-bold text-sp-text">
            {formatSubmissionLabel(clampedIndex)}
          </span>
          <span className="text-xs text-sp-muted tabular-nums">
            {clampedIndex + 1} / {total} · {submittedTime}
          </span>
        </div>
        <button
          type="button"
          onClick={goNext}
          disabled={clampedIndex === total - 1}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sp-border bg-sp-surface text-sp-text transition hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="다음 응답자"
        >
          →
        </button>
      </div>

      {/* 질문별 답변 카드 */}
      <div className="flex flex-col gap-3">
        {data.questions.map((q, i) => {
          const ans = submission.answers.find((a) => a.questionId === q.id);
          return (
            <AnswerCard key={q.id} index={i} question={q} answer={ans} />
          );
        })}
      </div>

      <p className="text-center text-[10px] text-sp-muted">
        ← / → 화살표 키로 이동할 수 있어요
      </p>
    </div>
  );
}

function AnswerCard({
  index,
  question,
  answer,
}: {
  index: number;
  question: MultiSurveyTemplateQuestion;
  answer: { questionId: string; value: string | string[] | number } | undefined;
}) {
  const { display, raw } = serializeAnswerCell(question, answer);
  const isEmpty = raw === null || (typeof raw === 'string' && raw === '');

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      <header className="mb-2 flex items-start gap-2">
        <span className="mt-0.5 rounded-md bg-sp-surface px-2 py-0.5 text-xs font-medium text-sp-muted">
          Q{index + 1}
        </span>
        <h3 className="flex-1 text-sm font-semibold text-sp-text">
          {question.question}
        </h3>
      </header>
      {isEmpty ? (
        <p className="text-xs text-sp-muted">미응답</p>
      ) : question.type === 'multi-choice' && Array.isArray(answer?.value) ? (
        <div className="flex flex-wrap gap-1.5">
          {answer!.value
            .map((id) => question.options.find((o) => o.id === id))
            .filter((o): o is { id: string; text: string } => !!o)
            .map((o) => (
              <span
                key={o.id}
                className="rounded-full border border-sp-border bg-sp-surface px-2.5 py-0.5 text-xs text-sp-text"
              >
                {o.text}
              </span>
            ))}
        </div>
      ) : question.type === 'scale' ? (
        <ScaleDisplay
          value={typeof answer?.value === 'number' ? answer.value : null}
          min={question.scaleMin}
          max={question.scaleMax}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-sp-text">{display}</p>
      )}
    </section>
  );
}

function ScaleDisplay({
  value,
  min,
  max,
}: {
  value: number | null;
  min: number;
  max: number;
}) {
  if (value === null) return null;
  const total = max - min + 1;
  const dots: number[] = [];
  for (let v = min; v <= max; v++) dots.push(v);
  return (
    <div className="flex items-center gap-2">
      <span className="text-lg font-bold text-sp-text tabular-nums">{value}</span>
      <div className="flex gap-1">
        {dots.map((v) => (
          <span
            key={v}
            className={`h-2 w-6 rounded ${
              v <= value ? 'bg-sp-highlight' : 'bg-sp-surface'
            }`}
            aria-hidden
          />
        ))}
      </div>
      <span className="text-xs text-sp-muted">/ {max}점</span>
      <span className="sr-only">
        {total}점 중 {value}점
      </span>
    </div>
  );
}
