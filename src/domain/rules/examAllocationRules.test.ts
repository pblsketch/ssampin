import { describe, it, expect } from 'vitest';
import type { ExamItem } from '../entities/ExamPaper';
import {
  toCents,
  fromCents,
  sumPoints,
  remaining,
  isBalanced,
  subtotalByType,
  itemCountByType,
  writtenRatio,
  meetsWrittenTarget,
  distributeEvenly,
  validatePaper,
  countsFromRatio,
  allocateByDifficulty,
  suggestDifficultyRows,
  itemsFromAllocation,
} from './examAllocationRules';

function item(number: number, type: ExamItem['type'], points: number): ExamItem {
  return { id: `i${number}`, number, type, points };
}

describe('센티포인트 — 부동소수점 안전', () => {
  it('toCents/fromCents 왕복', () => {
    expect(toCents(3.5)).toBe(350);
    expect(toCents(0.1)).toBe(10);
    expect(fromCents(350)).toBe(3.5);
    expect(fromCents(10)).toBe(0.1);
  });

  it('3.5 × 20 = 70.0 (드리프트 0)', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i + 1, 'choice', 3.5));
    expect(sumPoints(items)).toBe(70);
  });

  it('0.1 × 10 = 1.0 (드리프트 0)', () => {
    const items = Array.from({ length: 10 }, (_, i) => item(i + 1, 'choice', 0.1));
    expect(sumPoints(items)).toBe(1);
  });

  it('혼합 소수 합도 정확', () => {
    const items = [item(1, 'choice', 3.3), item(2, 'choice', 3.3), item(3, 'short', 3.4)];
    expect(sumPoints(items)).toBe(10);
  });
});

describe('remaining / isBalanced', () => {
  it('잔여 = 만점 − 합계', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i + 1, 'choice', 3.5));
    expect(remaining(items, 100)).toBe(30);
  });

  it('초과 시 음수', () => {
    const items = Array.from({ length: 30 }, (_, i) => item(i + 1, 'choice', 3.5));
    expect(remaining(items, 100)).toBe(-5);
  });

  it('정확히 만점이면 balanced', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(i + 1, 'choice', 3.5)).concat(
      item(21, 'essay', 30),
    );
    expect(isBalanced(items, 100)).toBe(true);
    expect(remaining(items, 100)).toBe(0);
  });
});

describe('유형별 집계', () => {
  it('subtotalByType 분리', () => {
    const items = [
      item(1, 'choice', 3.5),
      item(2, 'choice', 3.5),
      item(3, 'short', 5),
      item(4, 'essay', 10),
    ];
    expect(subtotalByType(items)).toEqual({ choice: 7, short: 5, essay: 10 });
  });

  it('itemCountByType 개수', () => {
    const items = [item(1, 'choice', 3.5), item(2, 'short', 5), item(3, 'short', 5)];
    expect(itemCountByType(items)).toEqual({ choice: 1, short: 2, essay: 0 });
  });
});

describe('writtenRatio — 서답형 비율', () => {
  it('단답+서술 30, 만점 100 → 30.0', () => {
    const items = [item(1, 'choice', 70), item(2, 'short', 10), item(3, 'essay', 20)];
    expect(writtenRatio(items, 100)).toBe(30);
  });

  it('소수 1자리 반올림 (29.94 → 29.9)', () => {
    // 서답형 29.94점 / 만점 100 = 29.94% → 29.9
    const items = [item(1, 'choice', 70.06), item(2, 'essay', 29.94)];
    expect(writtenRatio(items, 100)).toBe(29.9);
  });

  it('경계 29.95 → 30.0 (반올림 올림)', () => {
    const items = [item(1, 'choice', 70.05), item(2, 'essay', 29.95)];
    expect(writtenRatio(items, 100)).toBe(30);
  });

  it('만점 0이면 0', () => {
    expect(writtenRatio([item(1, 'essay', 10)], 0)).toBe(0);
  });

  it('meetsWrittenTarget — 목표 미설정이면 항상 충족', () => {
    expect(meetsWrittenTarget([item(1, 'choice', 100)], 100, undefined)).toBe(true);
  });

  it('meetsWrittenTarget — 미달 감지', () => {
    const items = [item(1, 'choice', 75), item(2, 'essay', 25)];
    expect(meetsWrittenTarget(items, 100, 30)).toBe(false);
    expect(meetsWrittenTarget(items, 100, 25)).toBe(true);
  });
});

describe('distributeEvenly — 균등 배분 (결정론)', () => {
  it('70점 20문항 step 0.5 → 모두 3.5', () => {
    const result = distributeEvenly(70, 20, 0.5);
    expect(result).toHaveLength(20);
    expect(result.every((p) => p === 3.5)).toBe(true);
    expect(sumPoints(result.map((p, i) => item(i + 1, 'choice', p)))).toBe(70);
  });

  it('나머지는 앞 문항부터 흡수 — [3.5, 3.5, 3.0]', () => {
    expect(distributeEvenly(10, 3, 0.5)).toEqual([3.5, 3.5, 3.0]);
  });

  it('합은 항상 정확히 목표와 일치', () => {
    const result = distributeEvenly(100, 7, 0.5);
    const total = sumPoints(result.map((p, i) => item(i + 1, 'choice', p)));
    expect(total).toBe(100);
  });

  it('count 0이면 빈 배열', () => {
    expect(distributeEvenly(100, 0, 0.5)).toEqual([]);
  });
});

describe('validatePaper — 검증', () => {
  it('정상이면 이슈 없음', () => {
    const items = [item(1, 'choice', 70), item(2, 'essay', 30)];
    expect(validatePaper({ fullScore: 100, items })).toEqual([]);
  });

  it('만점 0 검출', () => {
    const issues = validatePaper({ fullScore: 0, items: [] });
    expect(issues.some((i) => i.message.includes('만점'))).toBe(true);
  });

  it('배점 0 이하 검출', () => {
    const items = [item(1, 'choice', 0), item(2, 'essay', 100)];
    const issues = validatePaper({ fullScore: 100, items });
    expect(issues.some((i) => i.message.includes('1번'))).toBe(true);
  });

  it('번호 중복 검출', () => {
    const items = [item(1, 'choice', 50), item(1, 'essay', 50)];
    const issues = validatePaper({ fullScore: 100, items });
    expect(issues.some((i) => i.message.includes('중복'))).toBe(true);
  });

  it('합계 ≠ 만점 검출 (부족)', () => {
    const items = [item(1, 'choice', 90)];
    const issues = validatePaper({ fullScore: 100, items });
    expect(issues.some((i) => i.message.includes('부족'))).toBe(true);
  });

  it('합계 ≠ 만점 검출 (초과)', () => {
    const items = [item(1, 'choice', 110)];
    const issues = validatePaper({ fullScore: 100, items });
    expect(issues.some((i) => i.message.includes('초과'))).toBe(true);
  });
});

describe('countsFromRatio — 비율대로 문항수 나누기', () => {
  it('합이 정확히 count', () => {
    expect(countsFromRatio(20, [25, 50, 25]).reduce((a, b) => a + b, 0)).toBe(20);
    expect(countsFromRatio(23, [1, 1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(23);
  });

  it('종 모양 비율 [25,50,25] → 중이 가장 많다', () => {
    const [low, mid, high] = countsFromRatio(20, [25, 50, 25]);
    expect([low, mid, high]).toEqual([5, 10, 5]);
    expect(mid ?? 0).toBeGreaterThan(low ?? 0);
    expect(mid ?? 0).toBeGreaterThan(high ?? 0);
  });

  it('비율 합 0이면 균등 폴백 (합 보존)', () => {
    const c = countsFromRatio(9, [0, 0, 0]);
    expect(c.reduce((a, b) => a + b, 0)).toBe(9);
    expect(c).toEqual([3, 3, 3]);
  });

  it('최대 나머지: 나머지는 소수부 큰 칸부터', () => {
    // raw = [10/3,10/3,10/3] = [3.33,3.33,3.33], base [3,3,3], rem 1 → 앞 칸
    expect(countsFromRatio(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });
});

describe('allocateByDifficulty — 난이도별 배점 (상·중·하 비율 + 급간)', () => {
  it('기준 예시: total=100, count=20, step=1, [25,50,25] → 하4×5·중5×10·상6×5', () => {
    const a = allocateByDifficulty({ total: 100, count: 20, step: 1, ratio: [25, 50, 25] });
    expect(a.tiers.map((t) => t.label)).toEqual(['하', '중', '상']);
    expect(a.tiers.map((t) => t.count)).toEqual([5, 10, 5]);
    expect(a.tiers.map((t) => t.minPoints)).toEqual([4, 5, 6]);
    expect(a.tiers.map((t) => t.maxPoints)).toEqual([4, 5, 6]);
    expect(a.total).toBe(100);
    expect(a.count).toBe(20);
  });

  it('합이 항상 total 과 정확히 일치 (드리프트 0)', () => {
    const cases = [
      { total: 100, count: 20, step: 1, ratio: [25, 50, 25] },
      { total: 100, count: 25, step: 1, ratio: [3, 4, 3] },
      { total: 50, count: 14, step: 0.5, ratio: [1, 2, 1] },
      { total: 80, count: 17, step: 1, ratio: [2, 5, 3] },
    ];
    for (const c of cases) {
      const a = allocateByDifficulty(c);
      expect(a.total).toBe(c.total);
      expect(a.count).toBe(c.count);
      // 직접 합산으로도 재확인
      const sum = a.tiers.reduce((acc, t) => acc + t.subtotal, 0);
      expect(Math.round(sum * 100)).toBe(Math.round(c.total * 100));
    }
  });

  it('난이도가 오를수록 배점이 같거나 높다 (점수 급간 단조 증가)', () => {
    const a = allocateByDifficulty({ total: 103, count: 20, step: 1, ratio: [25, 50, 25] });
    // total 이 정확히 안 떨어져도 합은 103, 남는 급간은 상위 문항부터
    expect(a.total).toBe(103);
    let prevMax = -Infinity;
    for (const t of a.tiers) {
      expect(t.minPoints).toBeGreaterThanOrEqual(prevMax);
      prevMax = t.maxPoints;
    }
  });

  it('급간(step) 0.5 단위도 정확', () => {
    const a = allocateByDifficulty({ total: 30, count: 9, step: 0.5, ratio: [1, 1, 1] });
    expect(a.total).toBe(30);
    expect(a.count).toBe(9);
    a.tiers.forEach((t) => t.points.forEach((p) => expect(Math.round(p * 10) % 5).toBe(0)));
  });

  it('문항수가 단계보다 적으면 빈 단계는 빠진다', () => {
    const a = allocateByDifficulty({ total: 10, count: 2, step: 1, ratio: [25, 50, 25] });
    expect(a.count).toBe(2);
    expect(a.total).toBe(10);
    expect(a.tiers.every((t) => t.count > 0)).toBe(true);
  });

  it('count 0 이면 빈 결과', () => {
    const a = allocateByDifficulty({ total: 100, count: 0, step: 1, ratio: [25, 50, 25] });
    expect(a.tiers).toEqual([]);
    expect(a.total).toBe(0);
  });
});

describe('itemsFromAllocation — 시험지 문항으로 펼치기', () => {
  it('문항수·번호·유형·난이도 매핑', () => {
    const a = allocateByDifficulty({ total: 100, count: 20, step: 1, ratio: [25, 50, 25] });
    let seq = 0;
    const items = itemsFromAllocation(a, 'choice', 1, () => `g${(seq += 1)}`);
    expect(items).toHaveLength(20);
    expect(items.at(0)?.number).toBe(1);
    expect(items.at(-1)?.number).toBe(20);
    expect(items.every((i) => i.type === 'choice')).toBe(true);
    expect(items.filter((i) => i.difficulty === '중')).toHaveLength(10);
    // 배점 합 = 100 (도메인 합산 규칙으로 재검증)
    expect(sumPoints(items)).toBe(100);
  });

  it('startNumber 이어붙이기 (서답형 블록 연속 번호)', () => {
    const a = allocateByDifficulty({ total: 30, count: 6, step: 1, ratio: [1, 2, 1] });
    let seq = 0;
    const items = itemsFromAllocation(a, 'short', 21, () => `g${(seq += 1)}`);
    expect(items.at(0)?.number).toBe(21);
    expect(items.every((i) => i.type === 'short')).toBe(true);
  });
});

describe('suggestDifficultyRows — 직접 입력 칸 자동 채우기 (단일 배점)', () => {
  it('기준 예시: 하 4점×5 · 중 5점×10 · 상 6점×5 (오름차순)', () => {
    const rows = suggestDifficultyRows({ total: 100, count: 20, step: 1, ratio: [25, 50, 25] });
    expect(rows).toEqual([
      { points: 4, count: 5 },
      { points: 5, count: 10 },
      { points: 6, count: 5 },
    ]);
  });

  it('배점이 난이도(하→상)로 갈수록 오른다', () => {
    const rows = suggestDifficultyRows({ total: 80, count: 17, step: 1, ratio: [2, 5, 3] });
    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (prev && cur) expect(cur.points).toBeGreaterThanOrEqual(prev.points);
    }
  });

  it('step 0.5 단위 단일 배점', () => {
    const rows = suggestDifficultyRows({ total: 30, count: 9, step: 0.5, ratio: [1, 1, 1] });
    rows.forEach((r) => expect(Math.round(r.points * 10) % 5).toBe(0));
    expect(rows.reduce((a, r) => a + r.count, 0)).toBe(9);
  });

  it('배점은 최소 1급간 이상(0점 방지)', () => {
    const rows = suggestDifficultyRows({ total: 3, count: 9, step: 1, ratio: [1, 1, 1] });
    rows.forEach((r) => expect(r.points).toBeGreaterThanOrEqual(1));
  });

  it('count 0 이면 빈 배열', () => {
    expect(suggestDifficultyRows({ total: 100, count: 0, step: 1, ratio: [1, 1, 1] })).toEqual([]);
  });
});
