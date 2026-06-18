/**
 * 성적 분석 CRUD 유스케이스.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§5)
 * "현재 데이터 + 변경"을 받아 "다음 데이터"를 돌려주고 저장하는 흐름만 담당한다.
 * 상태(zustand)는 adapters의 useGradeAnalysisStore가 들고 있다.
 * domain만 import (외부 의존성 없음).
 *
 * 식별 규칙:
 * - 평가계획(plan): id 기준 upsert.
 * - 지필/수행 결과: (assessmentId, studentKey) 기준 upsert (학생·평가당 1건).
 * - 학기 산출: (teachingClassId, semester, studentKey) 기준 upsert.
 * - 평가계획 삭제 시 해당 평가의 지필/수행 결과를 함께 제거(고아 방지).
 */
import type {
  GradeAnalysisData,
  AssessmentPlanItem,
  WrittenExamResult,
  PerformanceAssessmentResult,
  SemesterGradeResult,
} from '@domain/entities/GradeAnalysis';
import type { IGradeAnalysisRepository } from '@domain/repositories/IGradeAnalysisRepository';

/** 빈 성적 분석 데이터. */
export const EMPTY_GRADE_ANALYSIS: GradeAnalysisData = {
  plans: [],
  writtenResults: [],
  performanceResults: [],
  semesterResults: [],
};

export class ManageGradeAnalysis {
  constructor(private readonly repository: IGradeAnalysisRepository) {}

  /** 저장된 데이터를 불러온다(없으면 빈 데이터). */
  async load(): Promise<GradeAnalysisData> {
    return (await this.repository.load()) ?? EMPTY_GRADE_ANALYSIS;
  }

  /** 평가계획 upsert (id 기준). */
  async upsertPlan(
    current: GradeAnalysisData,
    plan: AssessmentPlanItem,
  ): Promise<GradeAnalysisData> {
    const exists = current.plans.some((p) => p.id === plan.id);
    const next: GradeAnalysisData = {
      ...current,
      plans: exists
        ? current.plans.map((p) => (p.id === plan.id ? plan : p))
        : [...current.plans, plan],
    };
    await this.repository.save(next);
    return next;
  }

  /** 평가계획 삭제 — 해당 평가의 지필/수행 결과도 함께 제거. */
  async removePlan(current: GradeAnalysisData, planId: string): Promise<GradeAnalysisData> {
    const next: GradeAnalysisData = {
      plans: current.plans.filter((p) => p.id !== planId),
      writtenResults: current.writtenResults.filter((r) => r.assessmentId !== planId),
      performanceResults: current.performanceResults.filter((r) => r.assessmentId !== planId),
      semesterResults: current.semesterResults,
    };
    await this.repository.save(next);
    return next;
  }

  /** 지필 결과 upsert ((assessmentId, studentKey) 기준). */
  async upsertWrittenResult(
    current: GradeAnalysisData,
    result: WrittenExamResult,
  ): Promise<GradeAnalysisData> {
    const isSame = (r: WrittenExamResult): boolean =>
      r.assessmentId === result.assessmentId && r.studentKey === result.studentKey;
    const exists = current.writtenResults.some(isSame);
    const next: GradeAnalysisData = {
      ...current,
      writtenResults: exists
        ? current.writtenResults.map((r) => (isSame(r) ? result : r))
        : [...current.writtenResults, result],
    };
    await this.repository.save(next);
    return next;
  }

  /** 수행 결과 upsert ((assessmentId, studentKey) 기준). */
  async upsertPerformanceResult(
    current: GradeAnalysisData,
    result: PerformanceAssessmentResult,
  ): Promise<GradeAnalysisData> {
    const isSame = (r: PerformanceAssessmentResult): boolean =>
      r.assessmentId === result.assessmentId && r.studentKey === result.studentKey;
    const exists = current.performanceResults.some(isSame);
    const next: GradeAnalysisData = {
      ...current,
      performanceResults: exists
        ? current.performanceResults.map((r) => (isSame(r) ? result : r))
        : [...current.performanceResults, result],
    };
    await this.repository.save(next);
    return next;
  }

  /** 학기 산출 결과 upsert ((teachingClassId, semester, studentKey) 기준). */
  async upsertSemesterResult(
    current: GradeAnalysisData,
    result: SemesterGradeResult,
  ): Promise<GradeAnalysisData> {
    const isSame = (r: SemesterGradeResult): boolean =>
      r.teachingClassId === result.teachingClassId &&
      r.semester === result.semester &&
      r.studentKey === result.studentKey;
    const exists = current.semesterResults.some(isSame);
    const next: GradeAnalysisData = {
      ...current,
      semesterResults: exists
        ? current.semesterResults.map((r) => (isSame(r) ? result : r))
        : [...current.semesterResults, result],
    };
    await this.repository.save(next);
    return next;
  }
}
