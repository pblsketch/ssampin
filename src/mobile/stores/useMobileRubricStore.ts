import { create } from 'zustand';
import type { Rubric, RubricGrading, RubricsData } from '@domain/entities/Rubric';
import {
  createEmptyGrading,
  findGrading,
  setAbsentStatus,
  setCriterionNote,
  setOverallFeedback,
  toggleMark,
} from '@domain/rules/rubricRules';
import { ManageRubrics } from '@usecases/rubric/ManageRubrics';
import { rubricRepository } from '@mobile/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

const manageRubrics = new ManageRubrics(rubricRepository);

/**
 * 모바일 루브릭 채점 스토어 — PC `useRubricStore`의 **채점(grading) 경로만** 이식한 축소판.
 *
 * 평가지 생성/수정/삭제/복사는 PC 전용(설계 의도)이라 여기 없다. 모바일은
 * "PC에서 만든 평가지에 점수만 입력"한다. 각 쓰기 메서드는 PC useRubricStore
 * (src/adapters/stores/useRubricStore.ts:144-199)의 시그니처(classId 포함)와
 * 본문 가드(결시생 채점 차단·루브릭 undefined 가드)를 그대로 미러하며, PC와
 * 동일한 studentKey를 studentId로 써야 채점이 정확히 매칭된다.
 */
interface MobileRubricState {
  rubrics: readonly Rubric[];
  gradings: readonly RubricGrading[];
  loaded: boolean;

  load: () => Promise<void>;
  reload: () => Promise<void>;

  /** 특정 수업반의 평가지 목록 */
  rubricsForClass: (classId: string) => readonly Rubric[];
  /** (rubricId, studentId)의 채점 기록 조회 */
  gradingFor: (rubricId: string, studentId: string) => RubricGrading | undefined;

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
  /** 학생별 총평 — 빈 문자열이면 제거 */
  setOverallFeedback: (
    rubricId: string,
    classId: string,
    studentId: string,
    feedback: string,
  ) => Promise<void>;
  /** 결시 표시/해제 */
  setAbsent: (
    rubricId: string,
    classId: string,
    studentId: string,
    absent: boolean,
  ) => Promise<void>;
}

function currentData(state: Pick<MobileRubricState, 'rubrics' | 'gradings'>): RubricsData {
  return { rubrics: state.rubrics, gradings: state.gradings };
}

export const useMobileRubricStore = create<MobileRubricState>((set, get) => ({
  rubrics: [],
  gradings: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await manageRubrics.load();
      if (data) {
        set({ rubrics: data.rubrics, gradings: data.gradings, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  rubricsForClass: (classId) => {
    return get().rubrics.filter((r) => r.classId === classId);
  },

  gradingFor: (rubricId, studentId) => {
    return findGrading(get().gradings, rubricId, studentId);
  },

  toggleMark: async (rubricId, classId, studentId, criterionId, levelId) => {
    const { rubrics, gradings } = get();
    const rubric = rubrics.find((r) => r.id === rubricId);
    if (rubric === undefined) return;
    const now = new Date().toISOString();
    const grading =
      findGrading(gradings, rubricId, studentId) ??
      createEmptyGrading(generateUUID(), rubricId, classId, studentId, now);
    if (grading.status === 'absent') return; // 결시 학생은 채점 입력 비활성
    const next = await manageRubrics.upsertGrading(
      currentData(get()),
      toggleMark(rubric, grading, criterionId, levelId, now),
    );
    set({ gradings: next.gradings });
    useMobileDriveSyncStore.getState().triggerSaveSync();
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
    useMobileDriveSyncStore.getState().triggerSaveSync();
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
    useMobileDriveSyncStore.getState().triggerSaveSync();
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
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
