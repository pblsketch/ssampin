/**
 * 수행평가 채점 (rubric-grading) 도메인 규칙 — 순수 함수.
 *
 * 계획서 §6 도메인 규칙:
 * - 수업반당 루브릭 ≤ 10 (D4)
 * - 요소 1~10개, 요소별 수준 2~6개
 * - 합계 = Σ (체크된 수준의 score) — 미채점 요소는 합계에서 제외, '부분 채점' 표시 (D1)
 * - 결시(absent) 학생은 합계 산출·통계에서 제외 (D8)
 * - 채점 기록 존재 시 구조 변경 가드 (FR-2)
 *
 * 외부 의존성 import 금지 — id/시각 생성은 호출자가 주입한다.
 */

import type {
  Rubric,
  RubricCriterion,
  RubricGrading,
  RubricGradingStatus,
  RubricLevel,
} from '../entities/Rubric';

/* ──────────────── 한도 상수 ──────────────── */

/** 수업반당 루브릭 최대 개수 (D4) */
export const MAX_RUBRICS_PER_CLASS = 10;
/** 루브릭당 평가 요소 개수 한도 */
export const MIN_CRITERIA_PER_RUBRIC = 1;
export const MAX_CRITERIA_PER_RUBRIC = 10;
/** 평가 요소당 수준 개수 한도 */
export const MIN_LEVELS_PER_CRITERION = 2;
export const MAX_LEVELS_PER_CRITERION = 6;

/** 기본 수준 4종 (이름·배점 수정 가능) — 계획서 FR-2 */
export const DEFAULT_LEVEL_PRESETS: ReadonlyArray<{ name: string; score: number }> = [
  { name: '탁월함', score: 10 },
  { name: '잘함', score: 8 },
  { name: '보통', score: 6 },
  { name: '노력 필요', score: 4 },
];

/* ──────────────── 생성 헬퍼 ──────────────── */

/** id 생성기 — 호출자(adapter)가 UUID 등 구현을 주입 */
export type IdGenerator = () => string;

/** 기본 수준 4개 생성 (탁월함 10 / 잘함 8 / 보통 6 / 노력 필요 4) */
export function createDefaultLevels(generateId: IdGenerator): RubricLevel[] {
  return DEFAULT_LEVEL_PRESETS.map((preset) => ({
    id: generateId(),
    name: preset.name,
    score: preset.score,
  }));
}

/**
 * 수준 구성 복제 — 새 평가 요소 추가 시 직전 요소의 수준(이름·배점·설명)을
 * 기본값으로 복제해 입력 반복을 줄인다 (FR-2 편의 기능). id는 새로 발급.
 */
export function cloneLevels(
  source: readonly RubricLevel[],
  generateId: IdGenerator,
): RubricLevel[] {
  return source.map((level) => ({
    id: generateId(),
    name: level.name,
    score: level.score,
    ...(level.description !== undefined ? { description: level.description } : {}),
  }));
}

/* ──────────────── 한도 가드 ──────────────── */

/** 해당 수업반의 루브릭 개수 */
export function countClassRubrics(rubrics: readonly Rubric[], classId: string): number {
  return rubrics.filter((r) => r.classId === classId).length;
}

/** 수업반에 루브릭을 더 추가할 수 있는지 (≤ 10, D4) */
export function canAddRubric(rubrics: readonly Rubric[], classId: string): boolean {
  return countClassRubrics(rubrics, classId) < MAX_RUBRICS_PER_CLASS;
}

/* ──────────────── 검증 ──────────────── */

export interface RubricValidationIssue {
  /** 사용자에게 그대로 보여줄 한국어 메시지 */
  readonly message: string;
}

/**
 * 루브릭 저장 가능 여부 검증. 빈 배열이면 유효.
 * 메시지는 UI에서 그대로 노출 가능한 한국어 문장.
 */
export function validateRubric(rubric: {
  title: string;
  criteria: readonly Pick<RubricCriterion, 'name' | 'levels'>[];
}): RubricValidationIssue[] {
  const issues: RubricValidationIssue[] = [];

  if (rubric.title.trim().length === 0) {
    issues.push({ message: '루브릭 제목을 입력해주세요.' });
  }

  if (rubric.criteria.length < MIN_CRITERIA_PER_RUBRIC) {
    issues.push({ message: '평가 요소를 1개 이상 추가해주세요.' });
  }
  if (rubric.criteria.length > MAX_CRITERIA_PER_RUBRIC) {
    issues.push({
      message: `평가 요소는 최대 ${MAX_CRITERIA_PER_RUBRIC}개까지 만들 수 있습니다.`,
    });
  }

  rubric.criteria.forEach((criterion, index) => {
    const label = criterion.name.trim().length > 0 ? `'${criterion.name}'` : `${index + 1}번째`;

    if (criterion.name.trim().length === 0) {
      issues.push({ message: `${index + 1}번째 평가 요소의 이름을 입력해주세요.` });
    }
    if (criterion.levels.length < MIN_LEVELS_PER_CRITERION) {
      issues.push({
        message: `${label} 요소의 수준은 ${MIN_LEVELS_PER_CRITERION}개 이상이어야 합니다.`,
      });
    }
    if (criterion.levels.length > MAX_LEVELS_PER_CRITERION) {
      issues.push({
        message: `${label} 요소의 수준은 최대 ${MAX_LEVELS_PER_CRITERION}개까지 만들 수 있습니다.`,
      });
    }
    criterion.levels.forEach((level, levelIndex) => {
      if (level.name.trim().length === 0) {
        issues.push({
          message: `${label} 요소의 ${levelIndex + 1}번째 수준 이름을 입력해주세요.`,
        });
      }
      if (!Number.isFinite(level.score) || level.score < 0) {
        issues.push({
          message: `${label} 요소의 '${level.name}' 수준 배점은 0 이상의 숫자여야 합니다.`,
        });
      }
    });
  });

  return issues;
}

/* ──────────────── 합계 (D1: 단순 합계만) ──────────────── */

/**
 * 채점 합계 = Σ (체크된 수준의 score).
 * - 미채점 요소는 합계에서 제외 (부분 채점)
 * - 결시(absent)는 null 반환 — 합계 산출 제외 (D8)
 * - 루브릭에 더 이상 존재하지 않는 criterion/level 참조는 무시
 */
export function calculateTotal(
  rubric: Rubric,
  grading: Pick<RubricGrading, 'status' | 'marks'>,
): number | null {
  if (grading.status === 'absent') return null;

  let total = 0;
  for (const criterion of rubric.criteria) {
    const levelId = grading.marks[criterion.id];
    if (levelId === undefined) continue;
    const level = criterion.levels.find((l) => l.id === levelId);
    if (level === undefined) continue;
    total += level.score;
  }
  return total;
}

/** 만점 = Σ (요소별 최고 배점). 수준이 없는 요소는 0으로 취급. */
export function calculateMaxScore(rubric: Pick<Rubric, 'criteria'>): number {
  return rubric.criteria.reduce((sum, criterion) => {
    if (criterion.levels.length === 0) return sum;
    return sum + Math.max(...criterion.levels.map((l) => l.score));
  }, 0);
}

/**
 * marks로부터 채점 상태 유도.
 * 결시는 사용자가 명시 표시하는 상태이므로 absent는 그대로 보존하고,
 * 그 외에는 모든 요소에 유효한 체크가 있으면 graded, 아니면 partial.
 */
export function deriveGradingStatus(
  rubric: Rubric,
  grading: Pick<RubricGrading, 'status' | 'marks'>,
): RubricGradingStatus {
  if (grading.status === 'absent') return 'absent';
  const allMarked =
    rubric.criteria.length > 0 &&
    rubric.criteria.every((criterion) => {
      const levelId = grading.marks[criterion.id];
      if (levelId === undefined) return false;
      return criterion.levels.some((l) => l.id === levelId);
    });
  return allMarked ? 'graded' : 'partial';
}

/* ──────────────── 구조 변경 가드 (FR-2) ──────────────── */

/** 특정 루브릭의 채점 기록만 추출 */
export function findGradingsForRubric(
  gradings: readonly RubricGrading[],
  rubricId: string,
): RubricGrading[] {
  return gradings.filter((g) => g.rubricId === rubricId);
}

export interface StructureChangeImpact {
  /** 구조 변경(요소/수준 삭제)으로 체크·메모가 사라지는 채점 기록 수 */
  readonly affectedGradingCount: number;
  /** 삭제된 평가 요소 이름 목록 (변경 전 기준) */
  readonly removedCriterionNames: readonly string[];
  /** 수준이 삭제된 평가 요소 이름 목록 (요소는 유지되나 일부 수준 삭제) */
  readonly criteriaWithRemovedLevels: readonly string[];
}

/**
 * 루브릭 구조 변경이 기존 채점 기록에 미치는 영향 계산.
 * 요소/수준 '추가'는 기록을 훼손하지 않으므로 영향에 포함하지 않는다 —
 * 새 요소가 생기면 기존 graded 기록이 partial로 재계산될 뿐이다.
 */
export function calculateStructureChangeImpact(
  before: Rubric,
  after: Pick<Rubric, 'criteria'>,
  gradings: readonly RubricGrading[],
): StructureChangeImpact {
  const rubricGradings = findGradingsForRubric(gradings, before.id);

  const afterCriteriaById = new Map(after.criteria.map((c) => [c.id, c]));

  const removedCriterionNames: string[] = [];
  const criteriaWithRemovedLevels: string[] = [];
  /** criterionId → 삭제된 levelId 집합. 요소 자체가 삭제되면 전체 수준이 삭제된 것으로 본다. */
  const removedLevelIds = new Map<string, Set<string>>();

  for (const criterion of before.criteria) {
    const afterCriterion = afterCriteriaById.get(criterion.id);
    if (afterCriterion === undefined) {
      removedCriterionNames.push(criterion.name);
      removedLevelIds.set(criterion.id, new Set(criterion.levels.map((l) => l.id)));
      continue;
    }
    const afterLevelIds = new Set(afterCriterion.levels.map((l) => l.id));
    const removed = criterion.levels.filter((l) => !afterLevelIds.has(l.id));
    if (removed.length > 0) {
      criteriaWithRemovedLevels.push(criterion.name);
      removedLevelIds.set(criterion.id, new Set(removed.map((l) => l.id)));
    }
  }

  const affectedGradingCount = rubricGradings.filter((grading) => {
    return Object.entries(grading.marks).some(([criterionId, levelId]) => {
      const removed = removedLevelIds.get(criterionId);
      return removed !== undefined && removed.has(levelId);
    });
  }).length;

  return { affectedGradingCount, removedCriterionNames, criteriaWithRemovedLevels };
}

/**
 * 구조 변경 후 채점 기록 정합화 — 삭제된 요소/수준을 가리키는 체크·메모를
 * 제거하고 상태를 재계산한다. 결시 상태는 보존.
 */
export function sanitizeGradingsForRubric(
  rubric: Rubric,
  gradings: readonly RubricGrading[],
): RubricGrading[] {
  const validLevelIdsByCriterion = new Map(
    rubric.criteria.map((c) => [c.id, new Set(c.levels.map((l) => l.id))]),
  );

  return gradings.map((grading) => {
    if (grading.rubricId !== rubric.id) return grading;

    const marks: Record<string, string> = {};
    for (const [criterionId, levelId] of Object.entries(grading.marks)) {
      const validLevels = validLevelIdsByCriterion.get(criterionId);
      if (validLevels !== undefined && validLevels.has(levelId)) {
        marks[criterionId] = levelId;
      }
    }

    const criterionNotes: Record<string, string> = {};
    for (const [criterionId, note] of Object.entries(grading.criterionNotes)) {
      if (validLevelIdsByCriterion.has(criterionId)) {
        criterionNotes[criterionId] = note;
      }
    }

    const next: RubricGrading = { ...grading, marks, criterionNotes };
    return { ...next, status: deriveGradingStatus(rubric, next) };
  });
}

/* ──────────────── 채점 기록 갱신 (FR-3: 클릭 즉시 저장) ──────────────── */

/** 빈 채점 기록 생성 — 첫 입력 시점에 만들어진다 */
export function createEmptyGrading(
  id: string,
  rubricId: string,
  classId: string,
  studentId: string,
  now: string,
): RubricGrading {
  return {
    id,
    rubricId,
    classId,
    studentId,
    status: 'partial',
    marks: {},
    criterionNotes: {},
    gradedAt: now,
  };
}

/**
 * 수준 클릭 토글 — 같은 수준을 다시 클릭하면 체크 해제, 다른 수준이면 교체.
 * 상태(graded/partial)는 marks로부터 재유도. 결시 기록에는 적용하지 않는다(호출자 가드).
 */
export function toggleMark(
  rubric: Rubric,
  grading: RubricGrading,
  criterionId: string,
  levelId: string,
  now: string,
): RubricGrading {
  const marks: Record<string, string> = { ...grading.marks };
  if (marks[criterionId] === levelId) {
    delete marks[criterionId];
  } else {
    marks[criterionId] = levelId;
  }
  const next: RubricGrading = { ...grading, marks, gradedAt: now };
  return { ...next, status: deriveGradingStatus(rubric, next) };
}

/**
 * 결시 표시/해제 (D8).
 * - 결시로 표시: 기존 체크·메모는 보존하되 합계·상태에서 제외 (status='absent')
 * - 해제: marks로부터 graded/partial 재유도
 */
export function setAbsentStatus(
  rubric: Rubric,
  grading: RubricGrading,
  absent: boolean,
  now: string,
): RubricGrading {
  if (absent) {
    return { ...grading, status: 'absent', gradedAt: now };
  }
  const next: RubricGrading = { ...grading, gradedAt: now };
  return { ...next, status: deriveGradingStatus(rubric, { ...next, status: 'partial' }) };
}

/** 요소별 특이사항 메모 설정 — 빈 문자열이면 메모 제거 */
export function setCriterionNote(
  grading: RubricGrading,
  criterionId: string,
  note: string,
  now: string,
): RubricGrading {
  const criterionNotes: Record<string, string> = { ...grading.criterionNotes };
  if (note.trim().length === 0) {
    delete criterionNotes[criterionId];
  } else {
    criterionNotes[criterionId] = note;
  }
  return { ...grading, criterionNotes, gradedAt: now };
}

/** 학생별 총평 설정 (D6) — 빈 문자열이면 제거 */
export function setOverallFeedback(
  grading: RubricGrading,
  feedback: string,
  now: string,
): RubricGrading {
  if (feedback.trim().length === 0) {
    const { overallFeedback: _removed, ...rest } = grading;
    return { ...rest, gradedAt: now };
  }
  return { ...grading, overallFeedback: feedback, gradedAt: now };
}

/** (rubricId, studentId) 기준 채점 기록 찾기 — 학생당 1건 */
export function findGrading(
  gradings: readonly RubricGrading[],
  rubricId: string,
  studentId: string,
): RubricGrading | undefined {
  return gradings.find((g) => g.rubricId === rubricId && g.studentId === studentId);
}

/* ──────────────── 엑셀 내보내기 행 구성 (FR-5) ──────────────── */

/** 내보내기 대상 학생 (어댑터가 TeachingClass 명단에서 변환해 전달) */
export interface RubricExportStudent {
  /** studentKey — 채점 기록 매칭 키 */
  readonly key: string;
  readonly number: number;
  readonly name: string;
}

export interface RubricExportRow {
  readonly number: number;
  readonly name: string;
  /** 요소 순서대로 체크된 수준의 배점 — 미채점·결시는 null(빈칸, 0점 강제 금지) */
  readonly scores: ReadonlyArray<number | null>;
  /** 합계 — 체크가 하나도 없거나 결시면 null(빈칸) */
  readonly total: number | null;
  /** 요소 순서대로 특이사항 메모 (없으면 빈 문자열) */
  readonly notes: ReadonlyArray<string>;
  /** 비고 — 결시 '결시', 일부만 채점 '부분 채점', 그 외 빈 문자열 */
  readonly remark: string;
}

/**
 * 엑셀 시트 행 데이터 구성 (FR-5).
 * - 미채점 요소·결시 학생의 점수 칸은 null(빈칸) — 0점으로 강제하지 않는다 (D8)
 * - 결시 학생은 비고에 '결시', 부분 채점 학생은 '부분 채점' 표기
 * - 학생은 번호 오름차순 정렬
 */
export function buildRubricExportRows(
  rubric: Rubric,
  gradings: readonly RubricGrading[],
  students: readonly RubricExportStudent[],
): RubricExportRow[] {
  return [...students]
    .sort((a, b) => a.number - b.number)
    .map((student) => {
      const grading = findGrading(gradings, rubric.id, student.key);
      const isAbsent = grading?.status === 'absent';

      const scores = rubric.criteria.map((criterion) => {
        if (grading === undefined || isAbsent) return null;
        const levelId = grading.marks[criterion.id];
        if (levelId === undefined) return null;
        const level = criterion.levels.find((l) => l.id === levelId);
        return level?.score ?? null;
      });

      const notes = rubric.criteria.map((criterion) => grading?.criterionNotes[criterion.id] ?? '');

      const hasAnyScore = scores.some((score) => score !== null);
      const total =
        grading !== undefined && !isAbsent && hasAnyScore ? calculateTotal(rubric, grading) : null;

      let remark = '';
      if (isAbsent) {
        remark = '결시';
      } else if (grading !== undefined && hasAnyScore && grading.status === 'partial') {
        remark = '부분 채점';
      }

      return { number: student.number, name: student.name, scores, total, notes, remark };
    });
}

/* ──────────────── 피드백 문서 데이터 (FR-6) ──────────────── */

export interface RubricFeedbackLevelLine {
  readonly name: string;
  /** 배점 — 점수 포함 토글 OFF면 null (렌더러에 점수가 아예 전달되지 않음) */
  readonly score: number | null;
  /** 학생이 받은(체크된) 수준 여부 */
  readonly checked: boolean;
  /** 성취 설명 (D5 — 비워두면 출력물에서 생략) */
  readonly description?: string;
}

export interface RubricFeedbackBlock {
  readonly criterionName: string;
  readonly levels: readonly RubricFeedbackLevelLine[];
  /** 요소별 특이사항 메모 */
  readonly note?: string;
}

/** 학생 1명분 피드백 문서 데이터 — PDF/HWPX 렌더러 공용 입력 */
export interface RubricFeedbackDoc {
  readonly studentNumber: number;
  readonly studentName: string;
  /** 결시 (D8) — 렌더러는 수준 목록 대신 결시 안내를 출력 */
  readonly isAbsent: boolean;
  readonly blocks: readonly RubricFeedbackBlock[];
  /** 총평 (D6) */
  readonly overallFeedback?: string;
  /** 합계 — 점수 토글 OFF·결시·체크 없음이면 null */
  readonly total: number | null;
  /** 만점 — 점수 토글 OFF면 null */
  readonly maxScore: number | null;
}

/**
 * 피드백 출력물(FR-6) 데이터 구성 — 점수 포함 토글이 핵심 규칙.
 * includeScores=false면 배점·합계·만점이 데이터에서 제거되어
 * 렌더러(PDF/HWPX)가 점수를 실수로도 그릴 수 없다.
 * 대상 선택(1명/다중/전체)은 호출자가 students 배열로 전달한다.
 */
export function buildRubricFeedbackDocs(
  rubric: Rubric,
  gradings: readonly RubricGrading[],
  students: readonly RubricExportStudent[],
  includeScores: boolean,
): RubricFeedbackDoc[] {
  return [...students]
    .sort((a, b) => a.number - b.number)
    .map((student) => {
      const grading = findGrading(gradings, rubric.id, student.key);
      const isAbsent = grading?.status === 'absent';

      const blocks: RubricFeedbackBlock[] = rubric.criteria.map((criterion) => {
        const checkedLevelId = isAbsent ? undefined : grading?.marks[criterion.id];
        const note = grading?.criterionNotes[criterion.id];
        return {
          criterionName: criterion.name,
          levels: criterion.levels.map((level) => ({
            name: level.name,
            score: includeScores ? level.score : null,
            checked: level.id === checkedLevelId,
            ...(level.description !== undefined ? { description: level.description } : {}),
          })),
          ...(note !== undefined && note.trim().length > 0 ? { note } : {}),
        };
      });

      const hasAnyCheck = blocks.some((b) => b.levels.some((l) => l.checked));
      const total =
        includeScores && grading !== undefined && !isAbsent && hasAnyCheck
          ? calculateTotal(rubric, grading)
          : null;

      const overallFeedback = grading?.overallFeedback;

      return {
        studentNumber: student.number,
        studentName: student.name,
        isAbsent,
        blocks,
        ...(overallFeedback !== undefined && overallFeedback.trim().length > 0
          ? { overallFeedback }
          : {}),
        total,
        maxScore: includeScores ? calculateMaxScore(rubric) : null,
      };
    });
}

/* ──────────────── 복사 (D2: 독립 복사본) ──────────────── */

export interface RubricCopyPlan {
  /** 복사를 진행할 수 있는 대상 반 */
  readonly allowedClassIds: readonly string[];
  /** 한도(10개) 초과로 건너뛰는 반 (FR-4) */
  readonly skippedClassIds: readonly string[];
}

/**
 * 다중 반 복사 계획 — 대상 반이 이미 한도(10개)면 그 반은 건너뛴다 (FR-4).
 * 같은 호출 안에서 여러 반에 복사해도 한도를 정확히 지키도록 누적 계산.
 */
export function planRubricCopy(
  rubrics: readonly Rubric[],
  targetClassIds: readonly string[],
): RubricCopyPlan {
  const counts = new Map<string, number>();
  for (const rubric of rubrics) {
    counts.set(rubric.classId, (counts.get(rubric.classId) ?? 0) + 1);
  }
  const allowedClassIds: string[] = [];
  const skippedClassIds: string[] = [];
  for (const classId of targetClassIds) {
    const count = counts.get(classId) ?? 0;
    if (count < MAX_RUBRICS_PER_CLASS) {
      allowedClassIds.push(classId);
      counts.set(classId, count + 1);
    } else {
      skippedClassIds.push(classId);
    }
  }
  return { allowedClassIds, skippedClassIds };
}

/**
 * 다른 수업반으로 독립 복사본 생성 (FR-4).
 * 구조(요소·수준·점수·설명)만 복제하고 id는 전부 새로 발급 —
 * 이후 수정은 서로 영향 없음. 채점 기록은 복사하지 않는다.
 */
export function copyRubricToClass(
  source: Rubric,
  targetClassId: string,
  generateId: IdGenerator,
  now: string,
): Rubric {
  return {
    id: generateId(),
    classId: targetClassId,
    title: source.title,
    ...(source.description !== undefined ? { description: source.description } : {}),
    criteria: source.criteria.map((criterion, index) => ({
      id: generateId(),
      name: criterion.name,
      order: index,
      levels: cloneLevels(criterion.levels, generateId),
    })),
    createdAt: now,
    updatedAt: now,
  };
}
