import { create } from 'zustand';
import type { Rubric, RubricCriterion, RubricGrading, RubricsData } from '@domain/entities/Rubric';
import {
  createEmptyGrading,
  findGrading,
  setAbsentStatus,
  setCriterionNote,
  setOverallFeedback,
  toggleMark,
} from '@domain/rules/rubricRules';
import { manageRubrics } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

/** 루브릭 생성 파라미터 — id/시각은 스토어가 발급 */
export interface CreateRubricParams {
  readonly classId: string;
  readonly title: string;
  readonly description?: string;
  readonly criteria: readonly RubricCriterion[];
}

interface RubricState {
  rubrics: readonly Rubric[];
  gradings: readonly RubricGrading[];
  loaded: boolean;

  load: () => Promise<void>;
  /** 생성 — 한도(10개)·구조 검증 실패 시 한국어 메시지의 Error를 던진다 */
  createRubric: (params: CreateRubricParams) => Promise<Rubric>;
  /** 수정 — 구조 변경 시 고아 채점 기록은 도메인 규칙으로 자동 정합화 */
  updateRubric: (rubric: Rubric) => Promise<void>;
  /** 삭제 — 해당 루브릭의 채점 기록도 함께 삭제 */
  deleteRubric: (rubricId: string) => Promise<void>;
  /**
   * 다른 수업반(다중)으로 독립 복사본 생성 (FR-4, D2).
   * 한도(10개) 초과 반은 건너뛰며, 건너뛴 반 id 목록을 돌려준다.
   */
  copyRubricToClasses: (
    rubricId: string,
    targetClassIds: readonly string[],
  ) => Promise<{ copiedCount: number; skippedClassIds: readonly string[] }>;

  /* ── 채점 (FR-3: 모든 입력 즉시 저장) ── */

  /** 수준 클릭 토글 — 같은 수준 재클릭 시 해제. 결시 학생에는 무시. */
  toggleMark: (
    rubricId: string,
    classId: string,
    studentId: string,
    criterionId: string,
    levelId: string,
  ) => Promise<void>;
  /** 요소별 특이사항 메모 — 빈 문자열이면 제거 */
  setCriterionNote: (
    rubricId: string,
    classId: string,
    studentId: string,
    criterionId: string,
    note: string,
  ) => Promise<void>;
  /** 학생별 총평 (D6) — 빈 문자열이면 제거 */
  setOverallFeedback: (
    rubricId: string,
    classId: string,
    studentId: string,
    feedback: string,
  ) => Promise<void>;
  /** 결시 표시/해제 (D8) */
  setAbsent: (
    rubricId: string,
    classId: string,
    studentId: string,
    absent: boolean,
  ) => Promise<void>;
}

function currentData(state: Pick<RubricState, 'rubrics' | 'gradings'>): RubricsData {
  return { rubrics: state.rubrics, gradings: state.gradings };
}

export const useRubricStore = create<RubricState>((set, get) => ({
  rubrics: [],
  gradings: [],
  loaded: false,

  load: async () => {
    const data = await manageRubrics.load();
    if (data) {
      set({ rubrics: data.rubrics, gradings: data.gradings, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  createRubric: async (params) => {
    const now = new Date().toISOString();
    const rubric: Rubric = {
      id: generateUUID(),
      classId: params.classId,
      title: params.title.trim(),
      ...(params.description !== undefined && params.description.trim().length > 0
        ? { description: params.description.trim() }
        : {}),
      criteria: params.criteria.map((criterion, index) => ({ ...criterion, order: index })),
      createdAt: now,
      updatedAt: now,
    };
    const next = await manageRubrics.createRubric(currentData(get()), rubric);
    set({ rubrics: next.rubrics, gradings: next.gradings });
    return rubric;
  },

  updateRubric: async (rubric) => {
    const updated: Rubric = {
      ...rubric,
      title: rubric.title.trim(),
      criteria: rubric.criteria.map((criterion, index) => ({ ...criterion, order: index })),
      updatedAt: new Date().toISOString(),
    };
    const next = await manageRubrics.updateRubric(currentData(get()), updated);
    set({ rubrics: next.rubrics, gradings: next.gradings });
  },

  deleteRubric: async (rubricId) => {
    const next = await manageRubrics.deleteRubric(currentData(get()), rubricId);
    set({ rubrics: next.rubrics, gradings: next.gradings });
  },

  copyRubricToClasses: async (rubricId, targetClassIds) => {
    const result = await manageRubrics.copyRubric(
      currentData(get()),
      rubricId,
      targetClassIds,
      generateUUID,
      new Date().toISOString(),
    );
    set({ rubrics: result.data.rubrics, gradings: result.data.gradings });
    return {
      copiedCount: result.copiedClassIds.length,
      skippedClassIds: result.skippedClassIds,
    };
  },

  toggleMark: async (rubricId, classId, studentId, criterionId, levelId) => {
    const { rubrics, gradings } = get();
    const rubric = rubrics.find((r) => r.id === rubricId);
    if (rubric === undefined) return;
    const now = new Date().toISOString();
    const grading =
      findGrading(gradings, rubricId, studentId) ??
      createEmptyGrading(generateUUID(), rubricId, classId, studentId, now);
    if (grading.status === 'absent') return; // 결시 학생은 채점 입력 비활성 (D8)
    const next = await manageRubrics.upsertGrading(
      currentData(get()),
      toggleMark(rubric, grading, criterionId, levelId, now),
    );
    set({ gradings: next.gradings });
  },

  setCriterionNote: async (rubricId, classId, studentId, criterionId, note) => {
    const { gradings } = get();
    const now = new Date().toISOString();
    const grading =
      findGrading(gradings, rubricId, studentId) ??
      createEmptyGrading(generateUUID(), rubricId, classId, studentId, now);
    const next = await manageRubrics.upsertGrading(
      currentData(get()),
      setCriterionNote(grading, criterionId, note, now),
    );
    set({ gradings: next.gradings });
  },

  setOverallFeedback: async (rubricId, classId, studentId, feedback) => {
    const { gradings } = get();
    const now = new Date().toISOString();
    const grading =
      findGrading(gradings, rubricId, studentId) ??
      createEmptyGrading(generateUUID(), rubricId, classId, studentId, now);
    const next = await manageRubrics.upsertGrading(
      currentData(get()),
      setOverallFeedback(grading, feedback, now),
    );
    set({ gradings: next.gradings });
  },

  setAbsent: async (rubricId, classId, studentId, absent) => {
    const { rubrics, gradings } = get();
    const rubric = rubrics.find((r) => r.id === rubricId);
    if (rubric === undefined) return;
    const now = new Date().toISOString();
    const grading =
      findGrading(gradings, rubricId, studentId) ??
      createEmptyGrading(generateUUID(), rubricId, classId, studentId, now);
    const next = await manageRubrics.upsertGrading(
      currentData(get()),
      setAbsentStatus(rubric, grading, absent, now),
    );
    set({ gradings: next.gradings });
  },
}));
