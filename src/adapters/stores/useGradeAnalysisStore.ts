import { create } from 'zustand';
import type {
  AssessmentPlanItem,
  AssessmentKind,
  AbsenceCode,
  WrittenExamResult,
  PerformanceAssessmentResult,
  SemesterGradeResult,
} from '@domain/entities/GradeAnalysis';
import { manageGradeAnalysis } from '@adapters/di/container';

/** 로컬 UUID 생성 — 어댑터 레이어는 infrastructure 비의존(crypto 우선, 폴백 보장). */
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `ga-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** 평가계획 생성 파라미터 — id/시각은 스토어가 발급. */
export interface CreatePlanParams {
  readonly teachingClassId: string;
  readonly semester: '1' | '2';
  readonly subject: string;
  readonly title: string;
  readonly kind: AssessmentKind;
  readonly areaName: string;
  readonly fullScore: number;
  readonly weightPercent: number;
  readonly method?: string;
  readonly source?: AssessmentPlanItem['source'];
}

/** 지필 점수 입력 옵션. */
export interface WrittenScoreOptions {
  readonly absenceCode?: AbsenceCode;
  readonly recognizedScore?: number;
  readonly confirmed?: boolean;
}

interface GradeAnalysisState {
  plans: readonly AssessmentPlanItem[];
  writtenResults: readonly WrittenExamResult[];
  performanceResults: readonly PerformanceAssessmentResult[];
  semesterResults: readonly SemesterGradeResult[];
  loaded: boolean;

  load: () => Promise<void>;
  upsertPlan: (params: CreatePlanParams, planId?: string) => Promise<AssessmentPlanItem>;
  removePlan: (planId: string) => Promise<void>;
  setWrittenScore: (
    assessmentId: string,
    studentKey: string,
    score: number | null,
    options?: WrittenScoreOptions,
  ) => Promise<void>;
  setPerformanceScore: (
    assessmentId: string,
    studentKey: string,
    score: number | null,
    confirmed?: boolean,
  ) => Promise<void>;
}

function currentData(state: GradeAnalysisState) {
  return {
    plans: state.plans,
    writtenResults: state.writtenResults,
    performanceResults: state.performanceResults,
    semesterResults: state.semesterResults,
  };
}

export const useGradeAnalysisStore = create<GradeAnalysisState>((set, get) => ({
  plans: [],
  writtenResults: [],
  performanceResults: [],
  semesterResults: [],
  loaded: false,

  load: async () => {
    const data = await manageGradeAnalysis.load();
    set({
      plans: data.plans,
      writtenResults: data.writtenResults,
      performanceResults: data.performanceResults,
      semesterResults: data.semesterResults,
      loaded: true,
    });
  },

  upsertPlan: async (params, planId) => {
    const now = new Date().toISOString();
    const existing = planId !== undefined ? get().plans.find((p) => p.id === planId) : undefined;
    const plan: AssessmentPlanItem = {
      id: existing?.id ?? planId ?? newId(),
      teachingClassId: params.teachingClassId,
      semester: params.semester,
      subject: params.subject,
      title: params.title.trim(),
      kind: params.kind,
      areaName: params.areaName.trim(),
      fullScore: params.fullScore,
      weightPercent: params.weightPercent,
      ...(params.method !== undefined && params.method.trim().length > 0
        ? { method: params.method.trim() }
        : {}),
      source: params.source ?? 'manual',
      status: existing?.status ?? 'draft',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = await manageGradeAnalysis.upsertPlan(currentData(get()), plan);
    set({ plans: next.plans });
    return plan;
  },

  removePlan: async (planId) => {
    const next = await manageGradeAnalysis.removePlan(currentData(get()), planId);
    set({
      plans: next.plans,
      writtenResults: next.writtenResults,
      performanceResults: next.performanceResults,
    });
  },

  setWrittenScore: async (assessmentId, studentKey, score, options) => {
    const existing = get().writtenResults.find(
      (r) => r.assessmentId === assessmentId && r.studentKey === studentKey,
    );
    const result: WrittenExamResult = {
      id: existing?.id ?? newId(),
      assessmentId,
      studentKey,
      score,
      ...(options?.absenceCode !== undefined ? { absenceCode: options.absenceCode } : {}),
      ...(options?.recognizedScore !== undefined
        ? { recognizedScore: options.recognizedScore }
        : {}),
      confirmed: options?.confirmed ?? false,
    };
    const next = await manageGradeAnalysis.upsertWrittenResult(currentData(get()), result);
    set({ writtenResults: next.writtenResults });
  },

  setPerformanceScore: async (assessmentId, studentKey, score, confirmed) => {
    const existing = get().performanceResults.find(
      (r) => r.assessmentId === assessmentId && r.studentKey === studentKey,
    );
    const result: PerformanceAssessmentResult = {
      id: existing?.id ?? newId(),
      assessmentId,
      studentKey,
      score,
      confirmed: confirmed ?? false,
    };
    const next = await manageGradeAnalysis.upsertPerformanceResult(currentData(get()), result);
    set({ performanceResults: next.performanceResults });
  },
}));
