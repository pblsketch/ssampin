/**
 * 루브릭 채점을 **분포**로 집계한다(순수 함수).
 *
 * ★학생별 총평(`overallFeedback`)·요소별 메모(`criterionNotes`)는 인자 타입에서 아예 받지
 * 않는다. 그 자리가 정확히 "개별 학생에 대해 선생님이 쓴 글"이라 어느 Phase 에서도 나가지
 * 않는다(계획서 §2 영구 제외 — 학생별 기록 내용).
 *
 * ★총점·만점 계산은 `calculateTotal`·`calculateMaxScore` 를 그대로 쓴다. 채점 화면이 쓰는
 * 것과 같은 함수라야 "루브릭 화면 평균"과 "AI 가 말한 평균"이 같아진다.
 *
 * 결과가 두 갈래인 이유: 선생님이 묻는 것이 두 가지다 —
 * "이 채점표 얼마나 했어?"(sheets) 와 "어느 요소에서 애들이 막혔어?"(criteria).
 */
import type { Rubric, RubricGrading } from '@domain/entities/Rubric';
import { calculateMaxScore, calculateTotal } from '@domain/rules/rubricRules';

export interface SummarizeAssessmentOptions {
  /** classId → 수업반 이름 */
  readonly classNames: Readonly<Record<string, string>>;
  /** 특정 수업반만. 생략하면 전부 */
  readonly className?: string;
  /** 담을 채점표 수 상한. 기본 10개(반당 루브릭 한도와 같다) */
  readonly maxSheets?: number;
  /** 담을 요소 줄 수 상한. 기본 40줄 */
  readonly maxCriteria?: number;
}

export interface AssessmentSummary {
  /** 조건에 맞는 **전체** 채점표 수 */
  readonly total: number;
  readonly truncated: boolean;
  readonly sheets: readonly {
    readonly className: string;
    readonly title: string;
    /** 채점 기록이 있는 학생 수 */
    readonly students: number;
    readonly graded: number;
    readonly partial: number;
    readonly absent: number;
    readonly maxScore: number;
    /** 총점 평균(소수 한 자리). 결시·미채점 제외. 없으면 null */
    readonly average: number | null;
  }[];
  /** 요소별 수준 분포 — "어느 요소에서 막혔나"를 보는 자리 */
  readonly criteria: readonly {
    readonly rubric: string;
    readonly criterion: string;
    /** 이 요소를 채점한 학생 수 */
    readonly marked: number;
    /** "탁월함 5 · 잘함 8 · 보통 3" — 수준 이름은 선생님이 지은 것이다 */
    readonly distribution: string;
  }[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeAssessment(
  rubrics: readonly Rubric[],
  gradings: readonly RubricGrading[],
  opts: SummarizeAssessmentOptions,
): AssessmentSummary {
  const maxSheets = opts.maxSheets ?? 10;
  const maxCriteria = opts.maxCriteria ?? 40;

  const gradingsByRubric = new Map<string, RubricGrading[]>();
  for (const grading of gradings) {
    const bucket = gradingsByRubric.get(grading.rubricId);
    if (bucket) bucket.push(grading);
    else gradingsByRubric.set(grading.rubricId, [grading]);
  }

  const matched = rubrics
    .map((rubric) => ({ rubric, className: opts.classNames[rubric.classId] ?? '(삭제된 수업반)' }))
    .filter((row) => opts.className === undefined || row.className === opts.className);

  const sheets = matched.slice(0, maxSheets).map(({ rubric, className }) => {
    const rows = gradingsByRubric.get(rubric.id) ?? [];
    const totals = rows
      .map((g) => calculateTotal(rubric, g))
      .filter((t): t is number => t !== null);

    return {
      className,
      title: rubric.title,
      students: rows.length,
      graded: rows.filter((g) => g.status === 'graded').length,
      partial: rows.filter((g) => g.status === 'partial').length,
      absent: rows.filter((g) => g.status === 'absent').length,
      maxScore: calculateMaxScore(rubric),
      average: totals.length > 0 ? round1(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
    };
  });

  const criteria: AssessmentSummary['criteria'][number][] = [];
  for (const { rubric } of matched.slice(0, maxSheets)) {
    const rows = (gradingsByRubric.get(rubric.id) ?? []).filter((g) => g.status !== 'absent');
    for (const criterion of rubric.criteria) {
      if (criteria.length >= maxCriteria) break;
      const counts = new Map<string, number>(criterion.levels.map((l) => [l.id, 0]));
      let marked = 0;
      for (const grading of rows) {
        const levelId = grading.marks[criterion.id];
        if (levelId === undefined || !counts.has(levelId)) continue;
        counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
        marked += 1;
      }
      criteria.push({
        rubric: rubric.title,
        criterion: criterion.name,
        marked,
        distribution: criterion.levels
          .map((level) => `${level.name} ${counts.get(level.id) ?? 0}`)
          .join(' · '),
      });
    }
  }

  return {
    total: matched.length,
    truncated: matched.length > maxSheets || criteria.length >= maxCriteria,
    sheets,
    criteria,
  };
}
