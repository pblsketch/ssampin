/**
 * 성적 분석 — 2026 평가지침 등급/성취도 분기 규칙 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§4.4)
 * 제1원칙: 학생 개인정보 미포함 — 점수(숫자)와 분할 기준만 다룬다.
 * 외부 의존성 import 금지.
 *
 * 분기 근거(2026학년도):
 * - 고1·고2(2022 개정): 석차 5등급 + 성취도 A~E 병기. 체육·예술·교양·
 *   과학탐구실험·사회/과학 융합선택 등(noRank)은 성취도만(석차 없음).
 * - 고3(2015 개정): 공통·일반선택 9등급 / 진로선택 성취도 A·B·C(석차 없음).
 * - 중학교: 성취도 A~E(석차 없음). 자유학기는 정량 산출 없음.
 * - 초등학교: 정량 성적 없음(성취수준 서술).
 *
 * 성취도 분할점수(원점수 컷)는 방식(고정분할/추정분할)에 따라 달라지므로
 * 하드코딩하지 않고 호출자가 주입한다. 석차등급 누적컷은 법령상 고정이라 상수로 둔다.
 */

export type GradeSchoolLevel = 'elem' | 'mid' | 'high';
export type SubjectTrack = 'common' | 'general' | 'career' | 'fusion';
export type ScaleKind = 'rank5' | 'rank9' | 'achieve5' | 'achieve3' | 'none';
export type Achievement5 = 'A' | 'B' | 'C' | 'D' | 'E';
export type Achievement3 = 'A' | 'B' | 'C';

export interface SubjectFlags {
  readonly track?: SubjectTrack;
  /** 석차등급 미산출 과목(체육·예술·교양·과학탐구실험·사회/과학 융합선택 등) */
  readonly noRank?: boolean;
  /** 자유학기(중) — 정량 산출 없음 */
  readonly freeSemester?: boolean;
}

/** 5단계 성취도 분할점수(원점수 컷). */
export interface Cut5 {
  readonly A: number;
  readonly B: number;
  readonly C: number;
  readonly D: number;
}

/** 3단계 성취도 분할점수(진로선택). */
export interface Cut3 {
  readonly A: number;
  readonly B: number;
}

/** 고정분할 5단계 컷. */
export const FIXED_CUT5: Cut5 = { A: 90, B: 80, C: 70, D: 60 };
/** 고정분할 3단계 컷(진로선택). */
export const FIXED_CUT3: Cut3 = { A: 80, B: 60 };

/** 석차 5등급 누적 비율 컷(1~4등급 상한). */
export const RANK5_CUTS: readonly number[] = [0.1, 0.34, 0.66, 0.9];
/** 석차 9등급 누적 비율 컷(1~8등급 상한). */
export const RANK9_CUTS: readonly number[] = [0.04, 0.11, 0.23, 0.4, 0.6, 0.77, 0.89, 0.96];

/**
 * 학교급·학년·과목으로 성적 척도를 결정한다(2026학년도 기준).
 * gradeYear: 고1·고2=1,2 → 2022 개정 / 고3=3 → 2015 개정.
 */
export function scaleFor(
  level: GradeSchoolLevel,
  gradeYear: number,
  flags: SubjectFlags = {},
): ScaleKind {
  if (level === 'elem') return 'none';
  if (level === 'mid') return flags.freeSemester ? 'none' : 'achieve5';

  // high — 2026 기준 고1·고2(2022 개정) vs 고3(2015 개정)
  const is2022 = gradeYear <= 2;
  if (is2022) {
    return flags.noRank ? 'achieve5' : 'rank5';
  }
  return flags.track === 'career' ? 'achieve3' : 'rank9';
}

/** 5단계 성취도 — 분할점수(원점수 컷)를 주입받아 판정. */
export function achievementOf(rawScore: number, cut: Cut5): Achievement5 {
  if (rawScore >= cut.A) return 'A';
  if (rawScore >= cut.B) return 'B';
  if (rawScore >= cut.C) return 'C';
  if (rawScore >= cut.D) return 'D';
  return 'E';
}

/** 3단계 성취도(진로선택) — 분할점수를 주입받아 판정. */
export function achievement3Of(rawScore: number, cut: Cut3): Achievement3 {
  if (rawScore >= cut.A) return 'A';
  if (rawScore >= cut.B) return 'B';
  return 'C';
}

/**
 * 석차 누적 비율(0~1)로 석차등급을 산출한다. scale은 rank5|rank9만 유효.
 * 누적 비율이 어떤 등급 상한 이하이면 해당 등급, 모두 초과하면 최하 등급.
 */
export function rankGradeOf(cumulativeRatio: number, scale: 'rank5' | 'rank9'): number {
  const cuts = scale === 'rank9' ? RANK9_CUTS : RANK5_CUTS;
  const maxGrade = scale === 'rank9' ? 9 : 5;
  for (let g = 0; g < cuts.length; g += 1) {
    const cut = cuts[g];
    if (cut !== undefined && cumulativeRatio <= cut) return g + 1;
  }
  return maxGrade;
}

/**
 * 석차 누적 비율 = (석차 + 동석차수 − 1) / 전체 인원.
 * 전체 인원이 0 이하이면 0을 반환한다.
 */
export function cumulativeRatio(rank: number, tieCount: number, total: number): number {
  if (total <= 0) return 0;
  const lastRank = rank + Math.max(tieCount, 1) - 1;
  return lastRank / total;
}

/**
 * 한 등급 위로 올라가는 데 필요한 인원(석차 기준). 석차제(rank5|rank9)만 의미가 있다.
 * 현재 누적석차가 상위 등급 상한 인원보다 많은 만큼을 돌려준다.
 * 이미 1등급이거나 전체 인원이 0이면 0.
 *
 * currentGrade(기관 산출 석차등급)를 주면 그 등급을 "현재 등급"으로 삼는다.
 * 화면이 기관 산출 등급을 표시하므로, 표시값과 "한 등급 상승 N명"을 일치시키기 위함이다.
 * (미지정 시 rank/total 누적비율로 등급을 추정해 하위호환.)
 */
export function peopleToNextGrade(
  rank: number,
  tieCount: number,
  total: number,
  scale: 'rank5' | 'rank9',
  currentGrade?: number,
): number {
  if (total <= 0) return 0;
  const cuts = scale === 'rank9' ? RANK9_CUTS : RANK5_CUTS;
  const lastRank = rank + Math.max(tieCount, 1) - 1;
  const grade = currentGrade ?? rankGradeOf(lastRank / total, scale);
  if (grade <= 1) return 0;
  const cutForNext = cuts[grade - 2];
  if (cutForNext === undefined) return 0;
  const maxRankForNext = Math.floor(cutForNext * total);
  return Math.max(0, lastRank - maxRankForNext);
}
