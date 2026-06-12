/**
 * 수행평가 루브릭 CRUD 유스케이스.
 *
 * 도메인 규칙(한도·검증·구조 변경 정합화)을 강제한 뒤 저장소에 영속한다.
 * 상태(zustand)는 adapters의 useRubricStore가 들고 있고, 본 유스케이스는
 * "현재 데이터 + 변경"을 받아 "다음 데이터"를 돌려주는 순수한 흐름만 담당한다.
 */
import type { Rubric, RubricGrading, RubricsData } from '@domain/entities/Rubric';
import type { IRubricRepository } from '@domain/repositories/IRubricRepository';
import {
  MAX_RUBRICS_PER_CLASS,
  canAddRubric,
  copyRubricToClass,
  planRubricCopy,
  validateRubric,
  sanitizeGradingsForRubric,
  type IdGenerator,
} from '@domain/rules/rubricRules';

export class ManageRubrics {
  constructor(private readonly repository: IRubricRepository) {}

  load(): Promise<RubricsData | null> {
    return this.repository.load();
  }

  /** 루브릭 생성 — 수업반당 10개 한도(D4) + 구조 검증 후 저장 */
  async createRubric(current: RubricsData, rubric: Rubric): Promise<RubricsData> {
    if (!canAddRubric(current.rubrics, rubric.classId)) {
      throw new Error(
        `한 수업반에는 루브릭을 최대 ${MAX_RUBRICS_PER_CLASS}개까지 만들 수 있습니다.`,
      );
    }
    const issues = validateRubric(rubric);
    if (issues.length > 0) {
      throw new Error(issues[0]!.message);
    }
    const next: RubricsData = {
      rubrics: [rubric, ...current.rubrics],
      gradings: current.gradings,
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 루브릭 수정 — 구조 변경 시 삭제된 요소/수준을 가리키는 채점 기록을
   * 정합화한다(고아 체크·메모 제거 + 상태 재계산). 경고 표시는 UI 책임.
   */
  async updateRubric(current: RubricsData, rubric: Rubric): Promise<RubricsData> {
    const issues = validateRubric(rubric);
    if (issues.length > 0) {
      throw new Error(issues[0]!.message);
    }
    const next: RubricsData = {
      rubrics: current.rubrics.map((r) => (r.id === rubric.id ? rubric : r)),
      gradings: sanitizeGradingsForRubric(rubric, current.gradings),
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 채점 기록 upsert — (rubricId, studentId)당 1건. 수준 클릭·메모·총평·결시
   * 어떤 입력이든 즉시 저장(FR-3 자동 저장)되는 단일 경로.
   */
  async upsertGrading(current: RubricsData, grading: RubricGrading): Promise<RubricsData> {
    const exists = current.gradings.some(
      (g) => g.rubricId === grading.rubricId && g.studentId === grading.studentId,
    );
    const next: RubricsData = {
      rubrics: current.rubrics,
      gradings: exists
        ? current.gradings.map((g) =>
            g.rubricId === grading.rubricId && g.studentId === grading.studentId ? grading : g,
          )
        : [...current.gradings, grading],
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 다른 수업반(다중)으로 독립 복사본 생성 (FR-4, D2).
   * - 구조만 복제, 채점 기록 미포함, id 전부 새로 발급
   * - 대상 반이 이미 한도(10개)면 그 반만 건너뛰고 나머지는 진행
   */
  async copyRubric(
    current: RubricsData,
    rubricId: string,
    targetClassIds: readonly string[],
    generateId: IdGenerator,
    now: string,
  ): Promise<{
    data: RubricsData;
    copiedClassIds: readonly string[];
    skippedClassIds: readonly string[];
  }> {
    const source = current.rubrics.find((r) => r.id === rubricId);
    if (source === undefined) {
      throw new Error('복사할 루브릭을 찾을 수 없습니다.');
    }
    const plan = planRubricCopy(current.rubrics, targetClassIds);
    if (plan.allowedClassIds.length === 0) {
      return { data: current, copiedClassIds: [], skippedClassIds: plan.skippedClassIds };
    }
    const copies = plan.allowedClassIds.map((classId) =>
      copyRubricToClass(source, classId, generateId, now),
    );
    const data: RubricsData = {
      rubrics: [...copies, ...current.rubrics],
      gradings: current.gradings,
    };
    await this.repository.save(data);
    return { data, copiedClassIds: plan.allowedClassIds, skippedClassIds: plan.skippedClassIds };
  }

  /** 루브릭 삭제 — 해당 루브릭의 채점 기록도 함께 삭제 */
  async deleteRubric(current: RubricsData, rubricId: string): Promise<RubricsData> {
    const next: RubricsData = {
      rubrics: current.rubrics.filter((r) => r.id !== rubricId),
      gradings: current.gradings.filter((g) => g.rubricId !== rubricId),
    };
    await this.repository.save(next);
    return next;
  }
}
