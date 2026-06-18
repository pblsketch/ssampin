import { describe, it, expect, beforeEach } from 'vitest';
import type {
  GradeAnalysisData,
  AssessmentPlanItem,
  WrittenExamResult,
} from '@domain/entities/GradeAnalysis';
import type { IGradeAnalysisRepository } from '@domain/repositories/IGradeAnalysisRepository';
import { ManageGradeAnalysis, EMPTY_GRADE_ANALYSIS } from './ManageGradeAnalysis';

class FakeRepo implements IGradeAnalysisRepository {
  data: GradeAnalysisData | null = null;
  load(): Promise<GradeAnalysisData | null> {
    return Promise.resolve(this.data);
  }
  save(data: GradeAnalysisData): Promise<void> {
    this.data = data;
    return Promise.resolve();
  }
}

function plan(id: string, overrides: Partial<AssessmentPlanItem> = {}): AssessmentPlanItem {
  return {
    id,
    teachingClassId: 'tc1',
    semester: '1',
    subject: '통합과학',
    title: '1차 지필',
    kind: 'written-exam',
    areaName: '지필',
    fullScore: 100,
    weightPercent: 70,
    source: 'manual',
    status: 'draft',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    ...overrides,
  };
}

function written(assessmentId: string, studentKey: string, score: number): WrittenExamResult {
  return { id: `${assessmentId}:${studentKey}`, assessmentId, studentKey, score, confirmed: false };
}

describe('ManageGradeAnalysis', () => {
  let repo: FakeRepo;
  let mgr: ManageGradeAnalysis;
  beforeEach(() => {
    repo = new FakeRepo();
    mgr = new ManageGradeAnalysis(repo);
  });

  it('load는 저장값이 없으면 빈 데이터', async () => {
    expect(await mgr.load()).toEqual(EMPTY_GRADE_ANALYSIS);
  });

  it('upsertPlan: 추가 후 같은 id면 교체(중복 없음)', async () => {
    const a = await mgr.upsertPlan(EMPTY_GRADE_ANALYSIS, plan('p1'));
    expect(a.plans).toHaveLength(1);
    const b = await mgr.upsertPlan(a, plan('p1', { title: '수정됨' }));
    expect(b.plans).toHaveLength(1);
    expect(b.plans[0]!.title).toBe('수정됨');
    expect(repo.data).toEqual(b); // 저장됨
  });

  it('upsertWrittenResult: (assessmentId, studentKey)로 교체', async () => {
    const a = await mgr.upsertWrittenResult(
      EMPTY_GRADE_ANALYSIS,
      written('p1', '2-3-5-홍길동', 80),
    );
    expect(a.writtenResults).toHaveLength(1);
    const b = await mgr.upsertWrittenResult(a, written('p1', '2-3-5-홍길동', 95));
    expect(b.writtenResults).toHaveLength(1);
    expect(b.writtenResults[0]!.score).toBe(95);
    const c = await mgr.upsertWrittenResult(b, written('p1', '2-3-6-김철수', 70));
    expect(c.writtenResults).toHaveLength(2);
  });

  it('removePlan: 평가계획 + 해당 지필/수행 결과 cascade 삭제', async () => {
    let data = await mgr.upsertPlan(EMPTY_GRADE_ANALYSIS, plan('p1'));
    data = await mgr.upsertWrittenResult(data, written('p1', '2-3-5-홍길동', 80));
    data = await mgr.upsertWrittenResult(data, written('p2', '2-3-5-홍길동', 60));
    const after = await mgr.removePlan(data, 'p1');
    expect(after.plans).toHaveLength(0);
    expect(after.writtenResults).toHaveLength(1); // p2 결과는 남음
    expect(after.writtenResults[0]!.assessmentId).toBe('p2');
  });
});
