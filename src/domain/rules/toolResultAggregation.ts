import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';

/**
 * 스프레드시트 뷰 · Excel 요약 시트의 통계 타입.
 * 순수 TypeScript — React/ExcelJS 의존 없음.
 */

export interface ChoiceAggregate {
  readonly type: 'choice';
  readonly questionId: string;
  readonly total: number;
  readonly counts: readonly {
    readonly optionId: string;
    readonly optionText: string;
    readonly count: number;
    readonly ratio: number;
  }[];
}

export interface ScaleAggregate {
  readonly type: 'scale';
  readonly questionId: string;
  readonly total: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
  readonly median: number;
  readonly distribution: readonly { readonly value: number; readonly count: number }[];
}

export interface TextAggregate {
  readonly type: 'text';
  readonly questionId: string;
  readonly total: number;
  readonly responses: readonly {
    readonly submissionId: string;
    readonly text: string;
  }[];
}

export type QuestionAggregate = ChoiceAggregate | ScaleAggregate | TextAggregate;

type Submissions = MultiSurveyResultData['submissions'];

function findAnswer(
  submission: Submissions[number],
  questionId: string,
): Submissions[number]['answers'][number] | undefined {
  return submission.answers.find((a) => a.questionId === questionId);
}

function aggregateChoice(
  question: MultiSurveyTemplateQuestion,
  submissions: Submissions,
  mode: 'single' | 'multi',
): ChoiceAggregate {
  const countMap = new Map<string, number>();
  let total = 0;

  for (const sub of submissions) {
    const ans = findAnswer(sub, question.id);
    if (!ans) continue;
    if (mode === 'single') {
      if (typeof ans.value !== 'string' || ans.value === '') continue;
      countMap.set(ans.value, (countMap.get(ans.value) ?? 0) + 1);
      total += 1;
    } else {
      const ids = Array.isArray(ans.value) ? ans.value : [];
      if (ids.length === 0) continue;
      for (const id of ids) {
        countMap.set(id, (countMap.get(id) ?? 0) + 1);
      }
      total += 1;
    }
  }

  const counts = question.options.map((opt) => {
    const count = countMap.get(opt.id) ?? 0;
    return {
      optionId: opt.id,
      optionText: opt.text,
      count,
      ratio: total === 0 ? 0 : count / total,
    };
  });

  return {
    type: 'choice',
    questionId: question.id,
    total,
    counts,
  };
}

function aggregateScale(
  question: MultiSurveyTemplateQuestion,
  submissions: Submissions,
): ScaleAggregate {
  const values: number[] = [];

  for (const sub of submissions) {
    const ans = findAnswer(sub, question.id);
    if (!ans) continue;
    if (typeof ans.value !== 'number' || Number.isNaN(ans.value)) continue;
    values.push(ans.value);
  }

  const total = values.length;
  if (total === 0) {
    return {
      type: 'scale',
      questionId: question.id,
      total: 0,
      min: question.scaleMin,
      max: question.scaleMax,
      avg: 0,
      median: 0,
      distribution: [],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const avg = sum / total;
  // total > 0 가드를 이미 통과했으므로 인덱스 접근은 안전
  const median =
    total % 2 === 1
      ? sorted[(total - 1) / 2]!
      : (sorted[total / 2 - 1]! + sorted[total / 2]!) / 2;

  const distMap = new Map<number, number>();
  for (const v of sorted) distMap.set(v, (distMap.get(v) ?? 0) + 1);
  const distribution = [...distMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));

  return {
    type: 'scale',
    questionId: question.id,
    total,
    min: question.scaleMin,
    max: question.scaleMax,
    avg,
    median,
    distribution,
  };
}

function aggregateText(
  question: MultiSurveyTemplateQuestion,
  submissions: Submissions,
): TextAggregate {
  const responses: { submissionId: string; text: string }[] = [];

  for (const sub of submissions) {
    const ans = findAnswer(sub, question.id);
    if (!ans) continue;
    if (typeof ans.value !== 'string') continue;
    const trimmed = ans.value.trim();
    if (trimmed === '') continue;
    responses.push({ submissionId: sub.id, text: ans.value });
  }

  return {
    type: 'text',
    questionId: question.id,
    total: responses.length,
    responses,
  };
}

/**
 * 단일 질문 집계.
 * 질문 타입에 따라 Choice / Scale / Text 중 하나의 QuestionAggregate 반환.
 */
export function aggregateQuestion(
  question: MultiSurveyTemplateQuestion,
  submissions: Submissions,
): QuestionAggregate {
  switch (question.type) {
    case 'single-choice':
      return aggregateChoice(question, submissions, 'single');
    case 'multi-choice':
      return aggregateChoice(question, submissions, 'multi');
    case 'scale':
      return aggregateScale(question, submissions);
    case 'text':
      return aggregateText(question, submissions);
  }
}

/** 전체 질문 집계. 질문 순서 보존. */
export function aggregateAll(
  data: MultiSurveyResultData,
): readonly QuestionAggregate[] {
  return data.questions.map((q) => aggregateQuestion(q, data.submissions));
}

/** 전체 참여자 수 = 어떤 질문에라도 응답한 submission 수 (= submissions.length) */
export function totalParticipants(data: MultiSurveyResultData): number {
  return data.submissions.length;
}

/**
 * 완료율 = 모든 required 질문에 유효 응답한 submission 비율 (0~1).
 * required 질문이 없으면 1로 간주.
 */
export function completionRate(data: MultiSurveyResultData): number {
  const requiredIds = data.questions.filter((q) => q.required).map((q) => q.id);
  if (requiredIds.length === 0 || data.submissions.length === 0) return 1;

  let completed = 0;
  for (const sub of data.submissions) {
    const hasAll = requiredIds.every((qid) => {
      const ans = sub.answers.find((a) => a.questionId === qid);
      if (!ans) return false;
      if (typeof ans.value === 'string') return ans.value.trim() !== '';
      if (Array.isArray(ans.value)) return ans.value.length > 0;
      if (typeof ans.value === 'number') return !Number.isNaN(ans.value);
      return false;
    });
    if (hasAll) completed += 1;
  }
  return completed / data.submissions.length;
}
