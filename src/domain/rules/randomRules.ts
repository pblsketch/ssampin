/**
 * 랜덤 뽑기 순수 함수 (domain 레이어 — 외부 의존 없음)
 *
 * - `secureRandom` 은 가능하면 `globalThis.crypto.getRandomValues` 를 쓰고,
 *   불가용 환경에서는 `Math.random()` 으로 폴백한다. 양쪽 모두 전역 표준 API 라
 *   외부 라이브러리 import 없이 domain 순수성을 유지한다.
 * - 모든 함수는 `random?: () => number` 인자를 받아 테스트 시 seeded PRNG 주입이 가능하다.
 */

/**
 * 균등 분포 [0, 1) 의 의사난수.
 * 가능하면 `crypto.getRandomValues` 기반의 강한 엔트로피 소스를 쓰고,
 * 불가용 환경에서는 `Math.random()` 으로 폴백한다.
 */
export function secureRandom(): number {
  const g = globalThis as { crypto?: { getRandomValues?: (arr: Uint32Array) => Uint32Array } };
  const c = g.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    c.getRandomValues(arr);
    return arr[0]! / 0x100000000; // 2^32
  }
  return Math.random();
}

/**
 * Fisher-Yates 셔플: 배열을 무작위로 섞은 새 배열 반환
 */
export function shuffleArray<T>(
  arr: readonly T[],
  random: () => number = secureRandom,
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
  random: () => number = secureRandom,
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
  random: () => number = secureRandom,
): T[] {
  const excludeSet = new Set(exclude);
  const filtered = arr.filter((item) => !excludeSet.has(item));
  return pickRandom(filtered, count, random);
}

/**
 * anti-repeat (회피 메모리) 옵션
 */
export interface PickMemoryOptions<H = string> {
  /** 회피할 직전 결과 (최신순). 기본 빈 배열 */
  readonly history?: readonly H[];
  /** 회피 가중치 (0~1, 기본 0.25 = 평소 빈도의 25%) */
  readonly recentPenalty?: number;
  /** 회피 윈도우 크기 (history 중 최근 N개만 회피, 기본 3) */
  readonly windowSize?: number;
  /** 난수 소스 (기본 secureRandom) */
  readonly random?: () => number;
}

/**
 * 가중치 룰렛 휠로 pool 에서 1개 선택.
 * - history[0..windowSize-1] 항목은 가중치 recentPenalty (기본 0.25)
 * - 나머지는 가중치 1
 * - 누적 가중치 0 (전부 회피 + pool 작음) → 균등 픽 fallback
 *
 * pool 이 비어 있으면 `undefined`.
 */
export function pickWithMemory<T>(
  pool: readonly T[],
  options: PickMemoryOptions<T> = {},
): T | undefined {
  if (pool.length === 0) return undefined;
  const {
    history = [],
    recentPenalty = 0.25,
    windowSize = 3,
    random = secureRandom,
  } = options;

  const recent = new Set(history.slice(0, windowSize));
  const weights = pool.map((item) => (recent.has(item) ? recentPenalty : 1));
  const total = weights.reduce((a, b) => a + b, 0);

  if (total <= 0) {
    return pool[Math.floor(random() * pool.length)];
  }

  let target = random() * total;
  for (let i = 0; i < pool.length; i++) {
    target -= weights[i]!;
    if (target <= 0) return pool[i];
  }
  return pool[pool.length - 1]; // numerical safety
}

/**
 * 인덱스 기반 anti-repeat 픽 (룰렛처럼 인덱스 자체가 의미를 가질 때).
 * - history 는 직전에 뽑힌 "인덱스" 목록 (최신순)
 * - poolSize 가 0 이하이면 -1 반환
 */
export function pickIndexWithMemory(
  poolSize: number,
  options: PickMemoryOptions<number> = {},
): number {
  if (poolSize <= 0) return -1;
  const {
    history = [],
    recentPenalty = 0.25,
    windowSize = 3,
    random = secureRandom,
  } = options;

  const recent = new Set(history.slice(0, windowSize));
  const weights: number[] = [];
  for (let i = 0; i < poolSize; i++) {
    weights.push(recent.has(i) ? recentPenalty : 1);
  }
  const total = weights.reduce((a, b) => a + b, 0);

  if (total <= 0) return Math.floor(random() * poolSize);

  let target = random() * total;
  for (let i = 0; i < poolSize; i++) {
    target -= weights[i]!;
    if (target <= 0) return i;
  }
  return poolSize - 1;
}
