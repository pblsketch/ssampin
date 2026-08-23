/**
 * 성적을 평가 항목별 **분포**로 집계한다(순수 함수).
 *
 * ★나가는 것은 평균·최고·최저와 성취도 구간별 **인원 수**뿐이다. 학생 식별자
 * (`studentKey`)는 인자로 받되 **어디에도 담지 않는다** — 이 함수가 세는 것은 "몇 명"이지
 * "누가"가 아니다(ADR-061 결정 7, 영구 경계).
 *
 * ★성취도 판정은 `achievementOf` 를 그대로 쓴다. 90/80/70/60 고정분할은 이 앱의 성적 화면이
 * 이미 쓰는 기준이라, 여기서 따로 구간을 만들면 화면과 AI 의 답이 갈린다.
 * 만점이 100이 아닌 평가는 100점 만점으로 환산해 판정한다(원점수 환산과 같은 셈).
 */
import { FIXED_CUT5, achievementOf, type Achievement5 } from '@domain/rules/gradeStandardRules';

/** summarizeGrades 가 필요로 하는 최소 필드 (AssessmentPlanItem 과 호환) */
export interface AssessmentPlanLike {
  readonly id: string;
  readonly teachingClassId: string;
  readonly semester: string;
  readonly subject: string;
  readonly title: string;
  /** 'written-exam' | 'performance' */
  readonly kind: string;
  readonly fullScore: number;
}

/** 점수 한 건. 지필·수행 결과가 같은 모양이라 하나로 받는다 */
export interface AssessmentScoreLike {
  readonly assessmentId: string;
  readonly score: number | null;
  /** 'none' | 'absent' | 'recognized' | 'exempt' — 결시는 평균에서 뺀다 */
  readonly absenceCode?: string;
}

export interface SummarizeGradesOptions {
  /** classId → 수업반 이름 */
  readonly classNames: Readonly<Record<string, string>>;
  /** 특정 수업반만. 생략하면 전부 */
  readonly className?: string;
  /** '1' | '2'. 생략하면 전부 */
  readonly semester?: string;
  /** 담을 평가 수 상한. 기본 30개 */
  readonly maxItems?: number;
}

export interface GradesSummary {
  /** 조건에 맞는 **전체** 평가 수 */
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly className: string;
    readonly subject: string;
    readonly title: string;
    /** '지필' | '수행' */
    readonly kind: string;
    readonly fullScore: number;
    /** 점수가 매겨진 학생 수(결시 제외) */
    readonly count: number;
    /** 결시 인원 */
    readonly absent: number;
    /** 원점수 평균(소수 한 자리). 점수가 하나도 없으면 null */
    readonly average: number | null;
    readonly highest: number | null;
    readonly lowest: number | null;
    /** 성취도 구간별 인원 — "A 5 · B 8 · C 3 · D 1 · E 0" (고정분할 90/80/70/60) */
    readonly distribution: string;
  }[];
}

const KIND_LABEL: Readonly<Record<string, string>> = {
  'written-exam': '지필',
  performance: '수행',
};

const LEVELS: readonly Achievement5[] = ['A', 'B', 'C', 'D', 'E'];

/** 소수 한 자리. `0.1 + 0.2` 류의 찌꺼기가 그대로 모델에 가지 않게 한다 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeGrades(
  plans: readonly AssessmentPlanLike[],
  scores: readonly AssessmentScoreLike[],
  opts: SummarizeGradesOptions,
): GradesSummary {
  const maxItems = opts.maxItems ?? 30;

  const scoresByAssessment = new Map<string, AssessmentScoreLike[]>();
  for (const score of scores) {
    const bucket = scoresByAssessment.get(score.assessmentId);
    if (bucket) bucket.push(score);
    else scoresByAssessment.set(score.assessmentId, [score]);
  }

  const matched = plans
    .map((plan) => ({
      plan,
      className: opts.classNames[plan.teachingClassId] ?? '(삭제된 수업반)',
    }))
    .filter((row) => opts.className === undefined || row.className === opts.className)
    .filter((row) => opts.semester === undefined || row.plan.semester === opts.semester);

  const items = matched.slice(0, maxItems).map(({ plan, className }) => {
    const rows = scoresByAssessment.get(plan.id) ?? [];
    // 결시(absent/recognized/exempt)는 평균·분포에서 뺀다 — 0점으로 세면 반 평균이 무너진다.
    const graded = rows.filter(
      (r) => typeof r.score === 'number' && (r.absenceCode ?? 'none') === 'none',
    );
    const values = graded.map((r) => r.score as number);
    const counts: Record<Achievement5, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const value of values) {
      // 만점이 100이 아닌 평가는 환산해서 판정한다. 만점이 0이면 판정 자체가 성립하지 않는다.
      if (plan.fullScore <= 0) continue;
      counts[achievementOf((value / plan.fullScore) * 100, FIXED_CUT5)] += 1;
    }

    return {
      className,
      subject: plan.subject,
      title: plan.title,
      kind: KIND_LABEL[plan.kind] ?? plan.kind,
      fullScore: plan.fullScore,
      count: values.length,
      absent: rows.length - graded.length,
      average: values.length > 0 ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
      highest: values.length > 0 ? Math.max(...values) : null,
      lowest: values.length > 0 ? Math.min(...values) : null,
      distribution: LEVELS.map((level) => `${level} ${counts[level]}`).join(' · '),
    };
  });

  return { total: matched.length, truncated: matched.length > maxItems, items };
}
