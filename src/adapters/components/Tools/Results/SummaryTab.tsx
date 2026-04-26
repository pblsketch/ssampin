import { useMemo, useState } from 'react';
import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  aggregateAll,
  completionRate,
  type QuestionAggregate,
  type ChoiceAggregate,
  type ScaleAggregate,
  type TextAggregate,
} from '@domain/rules/toolResultAggregation';

interface SummaryTabProps {
  data: MultiSurveyResultData;
}

const TEXT_PREVIEW_LIMIT = 5;

export function SummaryTab({ data }: SummaryTabProps) {
  const aggregates = useMemo(() => aggregateAll(data), [data]);
  const completion = useMemo(() => Math.round(completionRate(data) * 100), [data]);

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* 메타 바 */}
      <div className="rounded-xl border border-sp-border bg-sp-card px-4 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-sp-muted">참여 인원</span>
          <span className="font-bold text-sp-text">{data.submissions.length}명</span>
          <span className="h-3 w-px bg-sp-border" aria-hidden />
          <span className="text-sp-muted">완료율</span>
          <span className="font-bold text-sp-text">{completion}%</span>
        </div>
      </div>

      {/* 질문별 블록 */}
      <div className="flex flex-col gap-4">
        {data.questions.map((q, i) => {
          const agg = aggregates[i];
          if (!agg) return null;
          return (
            <QuestionBlock key={q.id} index={i} question={q} aggregate={agg} />
          );
        })}
      </div>
    </div>
  );
}

function QuestionBlock({
  index,
  question,
  aggregate,
}: {
  index: number;
  question: MultiSurveyTemplateQuestion;
  aggregate: QuestionAggregate;
}) {
  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      <header className="mb-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 rounded-md bg-sp-surface px-2 py-0.5 text-xs font-medium text-sp-muted">
            Q{index + 1}
          </span>
          <h3 className="flex-1 text-sm font-semibold text-sp-text">
            {question.question}
          </h3>
          {question.required && (
            <span className="rounded bg-sp-surface px-1.5 py-0.5 text-caption text-sp-muted">
              필수
            </span>
          )}
        </div>
      </header>
      {aggregate.type === 'choice' && (
        <ChoiceChart aggregate={aggregate} />
      )}
      {aggregate.type === 'scale' && (
        <ScaleSummary aggregate={aggregate} question={question} />
      )}
      {aggregate.type === 'text' && (
        <TextSummary aggregate={aggregate} />
      )}
    </section>
  );
}

function ChoiceChart({ aggregate }: { aggregate: ChoiceAggregate }) {
  if (aggregate.total === 0) {
    return <p className="text-xs text-sp-muted">응답 없음</p>;
  }
  const maxCount = Math.max(...aggregate.counts.map((c) => c.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {aggregate.counts.map((c) => (
        <div key={c.optionId} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-xs text-sp-text" title={c.optionText}>
            {c.optionText}
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded bg-sp-surface">
            <div
              className="h-full rounded bg-sp-accent"
              style={{ width: `${(c.count / maxCount) * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-sp-muted">
            {c.count}명 ({Math.round(c.ratio * 100)}%)
          </span>
        </div>
      ))}
    </div>
  );
}

function ScaleSummary({
  aggregate,
  question,
}: {
  aggregate: ScaleAggregate;
  question: MultiSurveyTemplateQuestion;
}) {
  if (aggregate.total === 0) {
    return <p className="text-xs text-sp-muted">응답 없음</p>;
  }
  const maxCount = Math.max(...aggregate.distribution.map((d) => d.count), 1);
  const range: number[] = [];
  for (let v = question.scaleMin; v <= question.scaleMax; v++) range.push(v);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-sp-muted">평균 </span>
          <span className="font-bold text-sp-text">{aggregate.avg.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-sp-muted">중앙값 </span>
          <span className="font-bold text-sp-text">{aggregate.median}</span>
        </div>
        <div>
          <span className="text-sp-muted">응답 </span>
          <span className="font-bold text-sp-text">{aggregate.total}명</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        {range.map((v) => {
          const match = aggregate.distribution.find((d) => d.value === v);
          const count = match?.count ?? 0;
          const heightPct = (count / maxCount) * 100;
          return (
            <div key={v} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-caption text-sp-muted tabular-nums">{count}</span>
              <div
                className="w-full rounded-t bg-sp-accent"
                style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: '4px' }}
                title={`${v}: ${count}명`}
              />
              <span className="text-caption text-sp-muted">{v}</span>
            </div>
          );
        })}
      </div>
      {(question.scaleMinLabel || question.scaleMaxLabel) && (
        <div className="flex justify-between text-caption text-sp-muted">
          <span>{question.scaleMinLabel || `${question.scaleMin}`}</span>
          <span>{question.scaleMaxLabel || `${question.scaleMax}`}</span>
        </div>
      )}
    </div>
  );
}

function TextSummary({ aggregate }: { aggregate: TextAggregate }) {
  const [expanded, setExpanded] = useState(false);
  if (aggregate.total === 0) {
    return <p className="text-xs text-sp-muted">응답 없음</p>;
  }
  const visible = expanded ? aggregate.responses : aggregate.responses.slice(0, TEXT_PREVIEW_LIMIT);
  const hasMore = aggregate.responses.length > TEXT_PREVIEW_LIMIT;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-sp-muted">응답 {aggregate.total}개</p>
      <ul className="flex flex-col gap-1.5">
        {visible.map((r, i) => (
          <li
            key={`${r.submissionId}-${i}`}
            className="rounded-md border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text"
          >
            {r.text}
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start rounded border border-sp-border bg-sp-surface px-2.5 py-1 text-xs text-sp-muted transition hover:text-sp-text"
        >
          {expanded ? '접기' : `모두 보기 (+${aggregate.responses.length - TEXT_PREVIEW_LIMIT})`}
        </button>
      )}
    </div>
  );
}
