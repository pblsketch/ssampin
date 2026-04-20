import { describe, it, expect } from 'vitest';
import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  aggregateQuestion,
  aggregateAll,
  totalParticipants,
  completionRate,
} from './toolResultAggregation';

const mkQuestion = (
  overrides: Partial<MultiSurveyTemplateQuestion> & { id: string; type: MultiSurveyTemplateQuestion['type'] },
): MultiSurveyTemplateQuestion => ({
  id: overrides.id,
  type: overrides.type,
  question: overrides.question ?? '테스트 질문',
  required: overrides.required ?? true,
  options: overrides.options ?? [],
  maxLength: overrides.maxLength ?? 200,
  scaleMin: overrides.scaleMin ?? 1,
  scaleMax: overrides.scaleMax ?? 5,
  scaleMinLabel: overrides.scaleMinLabel ?? '매우 아니다',
  scaleMaxLabel: overrides.scaleMaxLabel ?? '매우 그렇다',
});

const mkSubmission = (
  id: string,
  answers: { questionId: string; value: string | string[] | number }[],
) => ({
  id,
  answers,
  submittedAt: Date.now(),
});

describe('aggregateQuestion', () => {
  describe('single-choice', () => {
    const question = mkQuestion({
      id: 'q1',
      type: 'single-choice',
      options: [
        { id: 'a', text: '옵션 A' },
        { id: 'b', text: '옵션 B' },
        { id: 'c', text: '옵션 C' },
      ],
    });

    it('옵션별 투표수를 정확히 집계', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q1', value: 'a' }]),
        mkSubmission('s2', [{ questionId: 'q1', value: 'a' }]),
        mkSubmission('s3', [{ questionId: 'q1', value: 'b' }]),
      ];
      const result = aggregateQuestion(question, submissions);
      expect(result.type).toBe('choice');
      if (result.type !== 'choice') return;

      expect(result.total).toBe(3);
      expect(result.counts).toHaveLength(3);
      expect(result.counts[0]!).toMatchObject({ optionId: 'a', count: 2 });
      expect(result.counts[1]!).toMatchObject({ optionId: 'b', count: 1 });
      expect(result.counts[2]!).toMatchObject({ optionId: 'c', count: 0 });
    });

    it('비율 계산 (ratio) 정확', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q1', value: 'a' }]),
        mkSubmission('s2', [{ questionId: 'q1', value: 'b' }]),
        mkSubmission('s3', [{ questionId: 'q1', value: 'b' }]),
        mkSubmission('s4', [{ questionId: 'q1', value: 'b' }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'choice') throw new Error('unexpected type');

      expect(result.counts[0]!.ratio).toBeCloseTo(0.25);
      expect(result.counts[1]!.ratio).toBeCloseTo(0.75);
      expect(result.counts[2]!.ratio).toBe(0);
    });

    it('빈 submissions → total 0, ratio 0', () => {
      const result = aggregateQuestion(question, []);
      if (result.type !== 'choice') throw new Error('unexpected type');
      expect(result.total).toBe(0);
      expect(result.counts.every((c) => c.count === 0 && c.ratio === 0)).toBe(true);
    });

    it('존재하지 않는 옵션 id는 counts에 반영되지 않음 (무시)', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q1', value: 'ghost' }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'choice') throw new Error('unexpected type');
      // 답은 받은 걸로 계산되어 total=1이지만 counts 어디에도 반영 안 됨
      expect(result.total).toBe(1);
      expect(result.counts.every((c) => c.count === 0)).toBe(true);
    });

    it('미응답 submissions는 total에 포함되지 않음', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q1', value: 'a' }]),
        mkSubmission('s2', []),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'choice') throw new Error('unexpected type');
      expect(result.total).toBe(1);
    });
  });

  describe('multi-choice', () => {
    const question = mkQuestion({
      id: 'q2',
      type: 'multi-choice',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ],
    });

    it('복수 선택 시 각 옵션별 카운트 누적', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q2', value: ['a', 'b'] }]),
        mkSubmission('s2', [{ questionId: 'q2', value: ['a', 'c'] }]),
        mkSubmission('s3', [{ questionId: 'q2', value: ['b'] }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'choice') throw new Error('unexpected type');

      expect(result.total).toBe(3);
      expect(result.counts[0]!.count).toBe(2); // a
      expect(result.counts[1]!.count).toBe(2); // b
      expect(result.counts[2]!.count).toBe(1); // c
    });

    it('빈 배열 선택은 total 증가 없음', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q2', value: [] }]),
        mkSubmission('s2', [{ questionId: 'q2', value: ['a'] }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'choice') throw new Error('unexpected type');
      expect(result.total).toBe(1);
    });
  });

  describe('scale', () => {
    const question = mkQuestion({
      id: 'q3',
      type: 'scale',
      scaleMin: 1,
      scaleMax: 5,
    });

    it('avg / median / distribution 계산 (홀수 개수)', () => {
      const submissions = [1, 3, 5].map((v, i) =>
        mkSubmission(`s${i}`, [{ questionId: 'q3', value: v }]),
      );
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'scale') throw new Error('unexpected type');

      expect(result.total).toBe(3);
      expect(result.avg).toBeCloseTo(3);
      expect(result.median).toBe(3);
      expect(result.distribution).toEqual([
        { value: 1, count: 1 },
        { value: 3, count: 1 },
        { value: 5, count: 1 },
      ]);
    });

    it('median — 짝수 개수일 때 중앙 두 값 평균', () => {
      const submissions = [1, 2, 3, 4].map((v, i) =>
        mkSubmission(`s${i}`, [{ questionId: 'q3', value: v }]),
      );
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'scale') throw new Error('unexpected type');
      expect(result.median).toBeCloseTo(2.5);
    });

    it('빈 submissions → total 0, avg/median 0', () => {
      const result = aggregateQuestion(question, []);
      if (result.type !== 'scale') throw new Error('unexpected type');
      expect(result.total).toBe(0);
      expect(result.avg).toBe(0);
      expect(result.median).toBe(0);
      expect(result.distribution).toEqual([]);
    });

    it('NaN 값 필터링', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q3', value: 3 }]),
        mkSubmission('s2', [{ questionId: 'q3', value: Number.NaN }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'scale') throw new Error('unexpected type');
      expect(result.total).toBe(1);
      expect(result.avg).toBe(3);
    });
  });

  describe('text', () => {
    const question = mkQuestion({ id: 'q4', type: 'text' });

    it('비어있지 않은 응답만 수집', () => {
      const submissions = [
        mkSubmission('s1', [{ questionId: 'q4', value: '좋았어요' }]),
        mkSubmission('s2', [{ questionId: 'q4', value: '' }]),
        mkSubmission('s3', [{ questionId: 'q4', value: '   ' }]),
        mkSubmission('s4', [{ questionId: 'q4', value: '배웠습니다' }]),
      ];
      const result = aggregateQuestion(question, submissions);
      if (result.type !== 'text') throw new Error('unexpected type');

      expect(result.total).toBe(2);
      expect(result.responses).toEqual([
        { submissionId: 's1', text: '좋았어요' },
        { submissionId: 's4', text: '배웠습니다' },
      ]);
    });

    it('빈 submissions → total 0, responses 빈 배열', () => {
      const result = aggregateQuestion(question, []);
      if (result.type !== 'text') throw new Error('unexpected type');
      expect(result.total).toBe(0);
      expect(result.responses).toEqual([]);
    });
  });
});

describe('aggregateAll', () => {
  it('질문 순서 보존 + 타입별 결과 반환', () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: '테스트 설문',
      questions: [
        mkQuestion({ id: 'q1', type: 'single-choice', options: [{ id: 'a', text: 'A' }] }),
        mkQuestion({ id: 'q2', type: 'text' }),
        mkQuestion({ id: 'q3', type: 'scale' }),
      ],
      submissions: [
        mkSubmission('s1', [
          { questionId: 'q1', value: 'a' },
          { questionId: 'q2', value: '의견' },
          { questionId: 'q3', value: 4 },
        ]),
      ],
    };
    const result = aggregateAll(data);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe('choice');
    expect(result[1]!.type).toBe('text');
    expect(result[2]!.type).toBe('scale');
    expect(result[0]!.questionId).toBe('q1');
    expect(result[1]!.questionId).toBe('q2');
    expect(result[2]!.questionId).toBe('q3');
  });
});

describe('totalParticipants', () => {
  it('submissions 개수 반환', () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [],
      submissions: [
        mkSubmission('s1', []),
        mkSubmission('s2', []),
      ],
    };
    expect(totalParticipants(data)).toBe(2);
  });
});

describe('completionRate', () => {
  const required = mkQuestion({ id: 'q1', type: 'text', required: true });
  const optional = mkQuestion({ id: 'q2', type: 'text', required: false });

  it('required 질문 모두 채운 비율', () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [required, optional],
      submissions: [
        mkSubmission('s1', [{ questionId: 'q1', value: '답변' }]),
        mkSubmission('s2', [{ questionId: 'q1', value: '' }]),
        mkSubmission('s3', [{ questionId: 'q1', value: '답변2' }]),
        mkSubmission('s4', []),
      ],
    };
    expect(completionRate(data)).toBeCloseTo(0.5);
  });

  it('required 질문 없으면 1', () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [optional],
      submissions: [mkSubmission('s1', [])],
    };
    expect(completionRate(data)).toBe(1);
  });

  it('submissions 없으면 1', () => {
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [required],
      submissions: [],
    };
    expect(completionRate(data)).toBe(1);
  });

  it('multi-choice required → 빈 배열은 미완료', () => {
    const mc = mkQuestion({
      id: 'q',
      type: 'multi-choice',
      required: true,
      options: [{ id: 'a', text: 'A' }],
    });
    const data: MultiSurveyResultData = {
      type: 'multi-survey',
      title: 't',
      questions: [mc],
      submissions: [
        mkSubmission('s1', [{ questionId: 'q', value: ['a'] }]),
        mkSubmission('s2', [{ questionId: 'q', value: [] }]),
      ],
    };
    expect(completionRate(data)).toBeCloseTo(0.5);
  });
});
