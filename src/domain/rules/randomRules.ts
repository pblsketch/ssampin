/**
 * 랜덤 뽑기 순수 함수 (domain 레이어 — 외부 의존 없음)
 */

/**
 * Fisher-Yates 셔플: 배열을 무작위로 섞은 새 배열 반환
 */
export function shuffleArray<T>(
  arr: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * 배열에서 N개를 무작위 선택 (중복 없음)
 */
export function pickRandom<T>(
  arr: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const clamped = Math.min(Math.max(0, count), arr.length);
  return shuffleArray(arr, random).slice(0, clamped);
}

/**
 * 배열에서 exclude 항목을 제외하고 N개를 무작위 선택
 */
export function pickRandomExcluding<T>(
  arr: readonly T[],
  exclude: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const excludeSet = new Set(exclude);
  const filtered = arr.filter((item) => !excludeSet.has(item));
  return pickRandom(filtered, count, random);
}
