import { describe, it, expect } from 'vitest';
import {
  shuffleArray,
  pickRandom,
  pickRandomExcluding,
  secureRandom,
  pickWithMemory,
  pickIndexWithMemory,
} from './randomRules';

/** 결정론적 PRNG (테스트용) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sorted = (arr: readonly string[]): string[] => [...arr].sort();

describe('shuffleArray', () => {
  it('원소 집합은 그대로 유지된다(순열)', () => {
    const input = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffleArray(input, mulberry32(123));
    expect(out).toHaveLength(input.length);
    expect(sorted(out)).toEqual(sorted(input));
  });

  it('원본 배열을 변형하지 않는다', () => {
    const input = ['a', 'b', 'c'];
    const copy = [...input];
    shuffleArray(input, mulberry32(1));
    expect(input).toEqual(copy);
  });

  it('같은 시드는 같은 결과를 낸다', () => {
    const input = ['1', '2', '3', '4', '5', '6'];
    expect(shuffleArray(input, mulberry32(42))).toEqual(shuffleArray(input, mulberry32(42)));
  });

  it('random()이 항상 0이면 좌측으로 1칸 회전한다', () => {
    expect(shuffleArray(['a', 'b', 'c', 'd'], () => 0)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('random()이 항상 거의 1이면 거의 그대로 둔다', () => {
    expect(shuffleArray(['a', 'b', 'c', 'd'], () => 0.999999)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('빈 배열·단일 원소는 그대로', () => {
    expect(shuffleArray([], mulberry32(1))).toEqual([]);
    expect(shuffleArray(['only'], mulberry32(1))).toEqual(['only']);
  });
});

describe('pickRandom', () => {
  it('count 개수만큼 중복 없이 선택한다', () => {
    const out = pickRandom(['a', 'b', 'c', 'd', 'e'], 3, mulberry32(7));
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3); // 중복 없음
    for (const x of out) expect(['a', 'b', 'c', 'd', 'e']).toContain(x);
  });

  it('count 가 배열 길이보다 크면 전부 반환', () => {
    expect(sorted(pickRandom(['a', 'b'], 99, mulberry32(1)))).toEqual(['a', 'b']);
  });

  it('count 가 0 이하면 빈 배열', () => {
    expect(pickRandom(['a', 'b', 'c'], 0)).toEqual([]);
    expect(pickRandom(['a', 'b', 'c'], -5)).toEqual([]);
  });

  it('random()=0 결정론적 케이스', () => {
    // shuffleArray(['a','b','c'], ()=>0) === ['b','c','a'] → slice(0,2) === ['b','c']
    expect(pickRandom(['a', 'b', 'c'], 2, () => 0)).toEqual(['b', 'c']);
  });
});

describe('pickRandomExcluding', () => {
  it('exclude 항목을 빼고 선택한다', () => {
    const out = pickRandomExcluding(['a', 'b', 'c', 'd'], ['b', 'd'], 5, mulberry32(3));
    expect(sorted(out)).toEqual(['a', 'c']);
  });

  it('exclude 가 원본에 없으면 영향 없음', () => {
    expect(sorted(pickRandomExcluding(['a', 'b'], ['z'], 5, mulberry32(1)))).toEqual(['a', 'b']);
  });

  it('exclude 후 개수가 모자라면 가능한 만큼만', () => {
    expect(pickRandomExcluding(['a', 'b', 'c'], ['a', 'b'], 10, () => 0)).toEqual(['c']);
  });
});

describe('secureRandom', () => {
  it('항상 [0, 1) 범위', () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('10개 bin 균등 분포 (1만 회 max deviation ≤ 10%, ~3σ 안전 마진)', () => {
    // bin 당 기대치 = 1000, σ ≈ √(1000·0.9) ≈ 30 (이항분포)
    // 5% 바운드(=50, ~1.7σ) 는 flaky → 10% 바운드(=100, ~3.3σ) 로 안정성 확보
    const bins = new Array(10).fill(0);
    const N = 10_000;
    for (let i = 0; i < N; i++) {
      bins[Math.floor(secureRandom() * 10)]++;
    }
    const expected = N / 10;
    const maxDev = Math.max(...bins.map((c) => Math.abs(c - expected))) / expected;
    expect(maxDev).toBeLessThanOrEqual(0.1);
  });
});

describe('pickWithMemory', () => {
  it('빈 pool 은 undefined', () => {
    expect(pickWithMemory([])).toBeUndefined();
  });

  it('history 가 비어있으면 거의 균등 분포', () => {
    const pool = ['a', 'b', 'c', 'd'] as const;
    type K = (typeof pool)[number];
    const counts: { a: number; b: number; c: number; d: number } = { a: 0, b: 0, c: 0, d: 0 };
    const random = mulberry32(42);
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const picked = pickWithMemory(pool, { random }) as K;
      counts[picked] += 1;
    }
    (Object.values(counts) as number[]).forEach((c) => {
      const dev = Math.abs(c - 1000) / 1000;
      expect(dev).toBeLessThanOrEqual(0.1);
    });
  });

  it('history 항목은 평소 빈도의 recentPenalty 만큼만 나온다', () => {
    // 가중치 합 = 0.25 + 1 + 1 + 1 = 3.25
    // a 기대치: 0.25/3.25 ≈ 7.7% → 4000 회 중 ~308
    const pool = ['a', 'b', 'c', 'd'] as const;
    type K = (typeof pool)[number];
    const counts: { a: number; b: number; c: number; d: number } = { a: 0, b: 0, c: 0, d: 0 };
    const random = mulberry32(7);
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const picked = pickWithMemory(pool, {
        history: ['a'],
        recentPenalty: 0.25,
        random,
      }) as K;
      counts[picked] += 1;
    }
    expect(counts.a).toBeLessThan(counts.b);
    expect(counts.a).toBeLessThan(counts.c);
    expect(counts.a).toBeLessThan(counts.d);
    expect(counts.a).toBeGreaterThan(150);
    expect(counts.a).toBeLessThan(500);
  });

  it('windowSize 밖의 history 는 무시된다', () => {
    const pool = ['a', 'b'] as const;
    type K = (typeof pool)[number];
    const counts: { a: number; b: number } = { a: 0, b: 0 };
    const random = mulberry32(11);
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const picked = pickWithMemory(pool, {
        // 'a' 가 4번째 위치 → windowSize 3 에서 제외
        history: ['b', 'b', 'b', 'a'],
        recentPenalty: 0.25,
        windowSize: 3,
        random,
      }) as K;
      counts[picked] += 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b);
  });

  it('모든 가중치가 0 이면 균등 픽으로 fallback', () => {
    const pool = ['a', 'b'];
    const random = mulberry32(99);
    let aCount = 0;
    let bCount = 0;
    for (let i = 0; i < 200; i++) {
      const picked = pickWithMemory(pool, {
        history: ['a', 'b'],
        recentPenalty: 0,
        windowSize: 2,
        random,
      });
      if (picked === 'a') aCount++;
      else if (picked === 'b') bCount++;
    }
    expect(aCount + bCount).toBe(200);
    expect(aCount).toBeGreaterThan(0);
    expect(bCount).toBeGreaterThan(0);
  });

  it('단일 원소 풀은 history 와 무관하게 그 원소 반환', () => {
    expect(pickWithMemory(['solo'])).toBe('solo');
    expect(pickWithMemory(['solo'], { history: ['solo'] })).toBe('solo');
  });
});

describe('pickIndexWithMemory', () => {
  it('빈 풀(0) 은 -1', () => {
    expect(pickIndexWithMemory(0)).toBe(-1);
  });

  it('항상 0 ≤ idx < poolSize', () => {
    const random = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const idx = pickIndexWithMemory(5, { random });
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(5);
    }
  });

  it('history 인덱스는 가중치 다운', () => {
    const counts = new Array(4).fill(0);
    const random = mulberry32(13);
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const idx = pickIndexWithMemory(4, {
        history: [0],
        recentPenalty: 0.25,
        random,
      });
      counts[idx]++;
    }
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[0]).toBeLessThan(counts[2]);
    expect(counts[0]).toBeLessThan(counts[3]);
  });

  it('단일 슬롯(poolSize=1) 은 항상 0', () => {
    expect(pickIndexWithMemory(1)).toBe(0);
    expect(pickIndexWithMemory(1, { history: [0] })).toBe(0);
  });
});
