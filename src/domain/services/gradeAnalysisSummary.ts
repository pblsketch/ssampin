/**
 * 성적 분석 요약 — 도메인 서비스 (순수 함수).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§Phase 5)
 * 교과(수업반) 단위의 성취도 분포·기초 통계를 산출한다.
 * 제1원칙: 학생 개인정보 미포함 — 점수(숫자) 배열과 분할 기준만 다룬다.
 * 도메인 내부(gradeStandardRules)만 import.
 *
 * 주의: 석차등급은 단일 수업반이 아니라 전체 수강자 기준이므로 여기서 다루지 않는다.
 *       (석차등급은 NEIS 산출 자료 import 경로에서만 의미가 있다.)
 */
import type { Achievement5, Cut5 } from '@domain/rules/gradeStandardRules';
import { achievementOf } from '@domain/rules/gradeStandardRules';

/** 소수 1자리 반올림. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 평균(소수 1자리). 빈 배열이면 0. */
export function mean(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, v) => acc + v, 0);
  return round1(sum / scores.length);
}

/** 모표준편차(소수 1자리). 빈 배열이면 0. */
export function stdev(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((acc, v) => acc + v, 0) / scores.length;
  const variance = scores.reduce((acc, v) => acc + (v - avg) ** 2, 0) / scores.length;
  return round1(Math.sqrt(variance));
}

export interface ClassScoreSummary {
  readonly count: number;
  readonly mean: number;
  readonly stdev: number;
  readonly min: number;
  readonly max: number;
}

/** 점수 배열의 기초 통계. 빈 배열이면 모두 0. */
export function summarizeScores(scores: readonly number[]): ClassScoreSummary {
  if (scores.length === 0) {
    return { count: 0, mean: 0, stdev: 0, min: 0, max: 0 };
  }
  return {
    count: scores.length,
    mean: mean(scores),
    stdev: stdev(scores),
    min: round1(Math.min(...scores)),
    max: round1(Math.max(...scores)),
  };
}

export type AchievementDistribution = Record<Achievement5, number>;

/** 성취도(A~E) 분포 — 분할점수(원점수 컷)를 주입받아 집계. */
export function achievementDistribution(
  scores: readonly number[],
  cut: Cut5,
): AchievementDistribution {
  const dist: AchievementDistribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const score of scores) {
    dist[achievementOf(score, cut)] += 1;
  }
  return dist;
}
