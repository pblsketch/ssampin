import type { Team } from '../entities/Team';

/**
 * 점수 내림차순 정렬 (동점이면 원래 순서 유지)
 */
export function sortByScore(teams: readonly Team[]): Team[] {
  return [...teams].sort((a, b) => b.score - a.score);
}

/**
 * 각 팀의 순위를 계산 (동점이면 같은 순위)
 */
export function getRanking(teams: readonly Team[]): Map<string, number> {
  const sorted = sortByScore(teams);
  const ranking = new Map<string, number>();
  let rank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const team = sorted[i]!;
    if (i > 0 && team.score < sorted[i - 1]!.score) {
      rank = i + 1;
    }
    ranking.set(team.id, rank);
  }

  return ranking;
}
