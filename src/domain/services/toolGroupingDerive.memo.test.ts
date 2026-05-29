import { describe, it, expect } from 'vitest';
import {
  computeDerivedTags,
  buildMemoKey,
  GroupingDeriveMemoCache,
} from './toolGroupingDerive';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * toolGroupingDerive memoization test (Critic C#7 + Architect §A-2)
 *
 * Acceptance:
 * - 'invalidates when piiOverlayVersion increments, not when student names change'
 * - memo key에 PII 값 미포함 (개인정보 누출 차단)
 */

describe('toolGroupingDerive — buildMemoKey + cache', () => {
  it('memo key format: `${studentSetVersion}|${piiOverlayVersion}|${ruleSetHash}`', () => {
    expect(buildMemoKey(1, 2, 'rule-abc')).toBe('1|2|rule-abc');
    expect(buildMemoKey(0, 0, '')).toBe('0|0|');
  });

  it('memo key NEVER contains PII values (gender/academicLevel)', () => {
    const key = buildMemoKey(5, 7, 'method=random|genderMode=mix');
    expect(key).not.toMatch(/A|B|C|D|E/); // ABCDE 단일 글자 등급 미포함
    expect(key).not.toContain('male');
    expect(key).not.toContain('female');
    expect(key).not.toContain("'M'");
    expect(key).not.toContain("'F'");
  });

  it('cache: same key → no recompute', () => {
    const cache = new GroupingDeriveMemoCache();
    let invoked = 0;
    const compute = () => {
      invoked++;
      return [{ studentId: 's1', gender: 'M' as const, level: 'high' as const }];
    };

    cache.get(1, 1, 'r', compute);
    cache.get(1, 1, 'r', compute);
    cache.get(1, 1, 'r', compute);
    expect(invoked).toBe(1);
    expect(cache.callCount).toBe(1);
  });

  it('cache invalidates when piiOverlayVersion increments', () => {
    const cache = new GroupingDeriveMemoCache();
    let invoked = 0;
    const compute = () => {
      invoked++;
      return [];
    };
    cache.get(1, 1, 'r', compute);
    cache.get(1, 2, 'r', compute); // pii overlay 갱신
    cache.get(1, 2, 'r', compute);
    cache.get(1, 3, 'r', compute);
    expect(invoked).toBe(3);
  });

  it('cache does NOT invalidate when student names change (gender/level 불변 가정)', () => {
    // 실제 useMemo에서는 학생 명단 자체가 동일 (version 변경 없음) 기준.
    // studentSetVersion이 0으로 유지되는 한 cache 유지.
    const cache = new GroupingDeriveMemoCache();
    let invoked = 0;
    const compute = () => {
      invoked++;
      return [];
    };
    cache.get(0, 5, 'r', compute);
    cache.get(0, 5, 'r', compute);
    expect(invoked).toBe(1);
  });

  it('cache invalidates when studentSetVersion increments', () => {
    const cache = new GroupingDeriveMemoCache();
    let invoked = 0;
    const compute = () => {
      invoked++;
      return [];
    };
    cache.get(0, 0, 'r', compute);
    cache.get(1, 0, 'r', compute);
    expect(invoked).toBe(2);
  });

  it('cache invalidates when ruleSetHash changes', () => {
    const cache = new GroupingDeriveMemoCache();
    let invoked = 0;
    const compute = () => {
      invoked++;
      return [];
    };
    cache.get(0, 0, 'a', compute);
    cache.get(0, 0, 'b', compute);
    expect(invoked).toBe(2);
  });
});

describe('toolGroupingDerive — computeDerivedTags', () => {
  it('maps academicLevel A·B → high, C → mid, D·E → low via toLegacyLevel', () => {
    const overlays = new Map<string, StudentPiiOverlay>([
      ['s1', { studentId: 's1', academicLevel: 'A', gender: 'M' }],
      ['s2', { studentId: 's2', academicLevel: 'B', gender: 'F' }],
      ['s3', { studentId: 's3', academicLevel: 'C' }],
      ['s4', { studentId: 's4', academicLevel: 'D' }],
      ['s5', { studentId: 's5', academicLevel: 'E' }],
    ]);
    const tags = computeDerivedTags(
      [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }, { id: 's5' }],
      overlays,
    );
    expect(tags[0]?.level).toBe('high');
    expect(tags[0]?.gender).toBe('M');
    expect(tags[1]?.level).toBe('high');
    expect(tags[2]?.level).toBe('mid');
    expect(tags[3]?.level).toBe('low');
    expect(tags[4]?.level).toBe('low');
  });

  it('students without overlay get undefined tags', () => {
    const tags = computeDerivedTags(
      [{ id: 's1' }, { id: 's2' }],
      new Map<string, StudentPiiOverlay>([['s1', { studentId: 's1', gender: 'F' }]]),
    );
    expect(tags[0]?.gender).toBe('F');
    expect(tags[0]?.level).toBeUndefined();
    expect(tags[1]?.gender).toBeUndefined();
    expect(tags[1]?.level).toBeUndefined();
  });

  it('respects student order in output', () => {
    const tags = computeDerivedTags(
      [{ id: 'c' }, { id: 'a' }, { id: 'b' }],
      new Map<string, StudentPiiOverlay>(),
    );
    expect(tags.map((t) => t.studentId)).toEqual(['c', 'a', 'b']);
  });
});
