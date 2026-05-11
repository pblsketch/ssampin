import { describe, it, expect } from 'vitest';
import { shuffleArray, pickRandom, pickRandomExcluding } from './randomRules';

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
