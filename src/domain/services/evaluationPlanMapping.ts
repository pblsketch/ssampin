/**
 * 평가 운영계획 → 루브릭 초안 매핑 (순수 함수).
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§7, §8, §14)
 * 선택한 평가영역명들을 루브릭 평가요소(criterion.name)로 채운 **초안 Rubric** 을 만든다.
 *
 * Scope Guard(§14):
 * - 평가계획 문서에는 점수(척도)가 없다 → 평가계획에서 점수를 "추출한 척" 하지 않는다.
 *   각 요소의 수준/배점은 빌더의 표준 기본 수준(탁월함10/잘함8/보통6/노력필요4)으로 시드하며,
 *   이는 교사가 새 요소를 직접 추가할 때와 동일한 기본값이다(교사가 확인·수정한다).
 * - 반영비율·학기 등 보조 정보는 모달 선택 단계에서만 쓰고, 루브릭 엔티티엔 담지 않는다.
 */
import type { Rubric, RubricCriterion } from '../entities/Rubric';
import type {
  EvaluationPlanGrade,
  RubricCandidate,
  RubricLevelDraft,
} from '../entities/EvaluationPlan';
import {
  createDefaultLevels,
  DEFAULT_LEVEL_PRESETS,
  MAX_LEVELS_PER_CRITERION,
  type IdGenerator,
} from '../rules/rubricRules';

export interface PlanToRubricDraftInput {
  readonly classId: string;
  /** 선택한 과목 (루브릭 제목 구성용) */
  readonly subject: string;
  /** 학년 (제목 구성용, 없으면 생략) */
  readonly grade: number | null;
  /** 선택한 평가영역명 — criterion.name 으로 채워진다 */
  readonly areaNames: readonly string[];
  readonly generateId: IdGenerator;
  /** ISO 시각 (createdAt/updatedAt) */
  readonly now: string;
}

/** 제목 구성: "1학년 국어 수행평가" / "수행평가 루브릭" (과목 미상 시) */
function buildTitle(subject: string, grade: number | null): string {
  const subj = subject.trim();
  const isUnknownSubject = subj.length === 0 || subj === '과목 미상';
  if (isUnknownSubject) return '수행평가 루브릭';
  const gradePrefix = grade !== null ? `${grade}학년 ` : '';
  return `${gradePrefix}${subj} 수행평가`;
}

/**
 * 선택한 평가영역명들로 루브릭 초안(Rubric)을 만든다.
 * - 평가영역명 → criterion.name (공백 제거·중복 제거, 입력 순서 유지)
 * - 각 요소의 수준은 빌더 표준 기본값(탁월함/잘함/보통/노력 필요)으로 시드 — 교사가 수정
 * - 반환된 초안은 빌더에 prefill 되며, 교사가 점수 확인 후 저장한다(미저장 상태로 반환).
 */
export function planToRubricDraft(input: PlanToRubricDraftInput): Rubric {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of input.areaNames) {
    const name = raw.trim();
    if (name.length === 0 || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  const criteria: RubricCriterion[] = names.map((name, index) => ({
    id: input.generateId(),
    name,
    order: index,
    levels: createDefaultLevels(input.generateId),
  }));

  return {
    id: input.generateId(),
    classId: input.classId,
    title: buildTitle(input.subject, input.grade),
    criteria,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/* ──────────────── 루브릭 후보(RubricCandidate) → Rubric ──────────────── */

/** 빌더 표준 기본 수준 초안 (점수 미상 후보용 — 교사가 배점 입력) */
function defaultLevelDrafts(): RubricLevelDraft[] {
  return DEFAULT_LEVEL_PRESETS.map((p) => ({ name: p.name, score: p.score }));
}

/**
 * 단순 평가영역 목록(EvaluationPlanGrade[]) → 루브릭 후보.
 * 평가영역명만 있으므로 수준은 빌더 기본값으로 채우고 hasScores=false(교사 배점 입력).
 */
export function gradesToCandidates(grades: readonly EvaluationPlanGrade[]): RubricCandidate[] {
  const out: RubricCandidate[] = [];
  for (const g of grades) {
    for (const subject of g.subjects) {
      const areas = g.areasBySubject[subject] ?? [];
      if (areas.length === 0) continue;
      out.push({
        subject,
        grade: g.grade,
        title: buildTitle(subject, g.grade),
        criteria: areas.map((a) => ({ name: a.name, levels: defaultLevelDrafts() })),
        hasScores: false,
      });
    }
  }
  return out;
}

/**
 * 루브릭 후보(채점기준표/단순영역 공통) → 저장 가능한 Rubric 초안.
 * criteria/levels 의 id 와 메타(classId/시각)를 채운다. 점수·설명은 후보 값 그대로.
 */
export function candidateToRubric(
  candidate: RubricCandidate,
  classId: string,
  generateId: IdGenerator,
  now: string,
): Rubric {
  const title = candidate.title.trim().length > 0 ? candidate.title.trim() : '수행평가 루브릭';
  const criteria: RubricCriterion[] = candidate.criteria.map((c, index) => {
    const levels = c.levels.slice(0, MAX_LEVELS_PER_CRITERION).map((l) => ({
      id: generateId(),
      name: l.name,
      score: l.score,
      ...(l.description !== undefined && l.description.length > 0
        ? { description: l.description }
        : {}),
    }));
    return {
      id: generateId(),
      name: c.name,
      order: index,
      levels: levels.length > 0 ? levels : createDefaultLevels(generateId),
    };
  });
  return {
    id: generateId(),
    classId,
    title,
    criteria,
    // 평가계획서에서 읽은 성취기준 코드를 루브릭까지 그대로 들고 온다.
    // 이 한 줄이 없으면 파서가 애써 살려 둔 코드가 여기서 조용히 사라진다.
    ...(candidate.standardCodes && candidate.standardCodes.length > 0
      ? { standardCodes: [...candidate.standardCodes] }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}
