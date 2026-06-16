import { describe, it, expect } from 'vitest';
import { planToRubricDraft, candidateToRubric, gradesToCandidates } from './evaluationPlanMapping';
import { validateRubric, MIN_LEVELS_PER_CRITERION } from '../rules/rubricRules';
import type { RubricCandidate, EvaluationPlanGrade } from '../entities/EvaluationPlan';

/** 결정적 id 생성기 (테스트용) */
function makeSeqId(): () => string {
  let n = 0;
  return () => `id-${n++}`;
}

const NOW = '2026-06-16T00:00:00.000Z';

describe('planToRubricDraft', () => {
  it('평가영역명을 criterion.name 으로 채운다', () => {
    const rubric = planToRubricDraft({
      classId: 'class-1',
      subject: '국어',
      grade: 1,
      areaNames: ['말하기·듣기', '읽기', '쓰기'],
      generateId: makeSeqId(),
      now: NOW,
    });
    expect(rubric.classId).toBe('class-1');
    expect(rubric.title).toBe('1학년 국어 수행평가');
    expect(rubric.criteria.map((c) => c.name)).toEqual(['말하기·듣기', '읽기', '쓰기']);
    expect(rubric.criteria.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(rubric.createdAt).toBe(NOW);
    expect(rubric.updatedAt).toBe(NOW);
  });

  it('각 요소는 빌더 표준 기본 수준으로 시드되어 validateRubric 을 통과한다', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '수학',
      grade: 2,
      areaNames: ['수와 연산', '함수'],
      generateId: makeSeqId(),
      now: NOW,
    });
    for (const c of rubric.criteria) {
      expect(c.levels.length).toBeGreaterThanOrEqual(MIN_LEVELS_PER_CRITERION);
    }
    expect(validateRubric({ title: rubric.title, criteria: rubric.criteria })).toEqual([]);
  });

  it('생성된 id 는 모두 고유하다(요소·수준)', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '영어',
      grade: null,
      areaNames: ['듣기', '읽기'],
      generateId: makeSeqId(),
      now: NOW,
    });
    const ids = [
      rubric.id,
      ...rubric.criteria.flatMap((c) => [c.id, ...c.levels.map((l) => l.id)]),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('학년이 없으면 제목에 학년 접두사를 붙이지 않는다', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '사회',
      grade: null,
      areaNames: ['정치'],
      generateId: makeSeqId(),
      now: NOW,
    });
    expect(rubric.title).toBe('사회 수행평가');
  });

  it('과목 미상이면 일반 제목을 쓴다', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '과목 미상',
      grade: 1,
      areaNames: ['영역1'],
      generateId: makeSeqId(),
      now: NOW,
    });
    expect(rubric.title).toBe('수행평가 루브릭');
  });

  it('빈/공백/중복 영역명은 제거한다', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '국어',
      grade: 1,
      areaNames: ['읽기', '  ', '읽기', '쓰기', ''],
      generateId: makeSeqId(),
      now: NOW,
    });
    expect(rubric.criteria.map((c) => c.name)).toEqual(['읽기', '쓰기']);
  });

  it('점수는 평가계획에서 자동 추출한 척하지 않는다 — 빌더 표준 기본 배점(편집 대상)', () => {
    const rubric = planToRubricDraft({
      classId: 'c',
      subject: '국어',
      grade: 1,
      areaNames: ['읽기'],
      generateId: makeSeqId(),
      now: NOW,
    });
    // 기본 수준 배점은 빌더가 새 요소에 부여하는 표준값과 동일(교사가 수정).
    const scores = rubric.criteria[0]!.levels.map((l) => l.score);
    expect(scores).toEqual([10, 8, 6, 4]);
  });
});

describe('candidateToRubric', () => {
  it('채점기준표 후보(점수 포함)를 그대로 Rubric 으로 옮기고 validateRubric 통과', () => {
    const candidate: RubricCandidate = {
      subject: '기술·가정',
      grade: 3,
      title: '진로 설계 발표',
      hasScores: true,
      criteria: [
        {
          name: '교과내용',
          levels: [
            { name: '15점', score: 15, description: '모두 설명한 경우' },
            { name: '10점', score: 10, description: '한 가지만' },
            { name: '5점', score: 5, description: '안 한 경우' },
          ],
        },
      ],
    };
    const rubric = candidateToRubric(candidate, 'class-1', makeSeqId(), NOW);
    expect(rubric.classId).toBe('class-1');
    expect(rubric.title).toBe('진로 설계 발표');
    expect(rubric.criteria[0]!.name).toBe('교과내용');
    expect(rubric.criteria[0]!.levels.map((l) => l.score)).toEqual([15, 10, 5]);
    expect(rubric.criteria[0]!.levels[0]!.description).toBe('모두 설명한 경우');
    expect(validateRubric({ title: rubric.title, criteria: rubric.criteria })).toEqual([]);
  });

  it('수준이 비어 있으면 빌더 기본 수준으로 채운다', () => {
    const candidate: RubricCandidate = {
      subject: '국어',
      grade: 1,
      title: '국어 수행평가',
      hasScores: false,
      criteria: [{ name: '읽기', levels: [] }],
    };
    const rubric = candidateToRubric(candidate, 'c', makeSeqId(), NOW);
    expect(rubric.criteria[0]!.levels.length).toBeGreaterThanOrEqual(MIN_LEVELS_PER_CRITERION);
  });
});

describe('gradesToCandidates', () => {
  it('단순 평가영역 → 과목별 후보(기본 수준, hasScores=false)', () => {
    const grades: EvaluationPlanGrade[] = [
      {
        grade: 1,
        label: '1학년',
        subjects: ['국어'],
        areasBySubject: { 국어: [{ name: '읽기' }, { name: '쓰기' }] },
      },
    ];
    const candidates = gradesToCandidates(grades);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.subject).toBe('국어');
    expect(candidates[0]!.title).toBe('1학년 국어 수행평가');
    expect(candidates[0]!.hasScores).toBe(false);
    expect(candidates[0]!.criteria.map((c) => c.name)).toEqual(['읽기', '쓰기']);
    expect(candidates[0]!.criteria[0]!.levels.length).toBeGreaterThanOrEqual(
      MIN_LEVELS_PER_CRITERION,
    );
  });
});
