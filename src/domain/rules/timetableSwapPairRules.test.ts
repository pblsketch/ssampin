/**
 * 수업 교체 짝(pairId) 규칙.
 *
 * 수업 교체는 같은 pairId 의 변동 2건이다. 한쪽만 지워지면 "반쪽 교체"가 남는다
 * (칸 우클릭 삭제가 확인 없이 1건만 지우던 결함). 짝 찾기·반쪽 판정·짝 삭제를 고정한다.
 */
import { describe, it, expect } from 'vitest';
import type { TimetableOverride } from '@domain/entities/Timetable';
import { findSwapPartner, isOrphanedSwapHalf, removeOverrideWithPair } from './timetableRules';

const mk = (partial: Partial<TimetableOverride> & { id: string }): TimetableOverride => ({
  date: '2026-11-10',
  period: 1,
  subject: '국어',
  createdAt: '2026-11-09T09:00:00.000Z',
  ...partial,
});

const A = mk({ id: 'a', period: 2, kind: 'swap', pairId: 'pair-1' });
const B = mk({ id: 'b', date: '2026-11-17', period: 5, kind: 'swap', pairId: 'pair-1' });
const PLAIN = mk({ id: 'plain', period: 3, kind: 'custom' });
const COMCIGAN = mk({ id: 'cmc', period: 4, kind: 'swap', source: 'comcigan' });
const OTHER_PAIR = mk({ id: 'c', period: 6, kind: 'swap', pairId: 'pair-2' });

describe('findSwapPartner', () => {
  it('같은 pairId 의 다른 변동을 짝으로 찾는다', () => {
    const all = [A, PLAIN, B];
    expect(findSwapPartner(all, A)?.id).toBe('b');
    expect(findSwapPartner(all, B)?.id).toBe('a');
  });

  it('pairId 가 없으면 짝이 없다', () => {
    expect(findSwapPartner([A, B, PLAIN], PLAIN)).toBeNull();
  });

  it('자기 자신은 짝이 아니다 — 짝이 지워졌으면 null', () => {
    expect(findSwapPartner([A, PLAIN], A)).toBeNull();
  });

  it('pairId 가 다른 교체는 짝이 아니다', () => {
    expect(findSwapPartner([A, OTHER_PAIR], A)).toBeNull();
  });
});

describe('isOrphanedSwapHalf — 짝이 지워진 교체', () => {
  it('pairId 는 있는데 짝을 찾을 수 없으면 반쪽이다', () => {
    expect(isOrphanedSwapHalf([A, PLAIN], A)).toBe(true);
  });

  it('짝이 살아 있으면 반쪽이 아니다', () => {
    expect(isOrphanedSwapHalf([A, B], A)).toBe(false);
    expect(isOrphanedSwapHalf([A, B], B)).toBe(false);
  });

  it('pairId 가 없는 변동(일반·컴시간 자동)은 반쪽이 아니다', () => {
    expect(isOrphanedSwapHalf([PLAIN, COMCIGAN], PLAIN)).toBe(false);
    // 컴시간 자동 변동은 kind 가 swap 이어도 처음부터 짝을 만들지 않는다
    expect(isOrphanedSwapHalf([PLAIN, COMCIGAN], COMCIGAN)).toBe(false);
  });
});

describe('removeOverrideWithPair', () => {
  it('교체 한쪽을 지우면 짝도 함께 지워진다', () => {
    const result = removeOverrideWithPair([A, PLAIN, B, OTHER_PAIR], 'a');
    expect(result.overrides.map((o) => o.id)).toEqual(['plain', 'c']);
    expect([...result.removedIds].sort()).toEqual(['a', 'b']);
  });

  it('짝 쪽에서 지워도 둘 다 지워진다', () => {
    const result = removeOverrideWithPair([A, PLAIN, B], 'b');
    expect(result.overrides.map((o) => o.id)).toEqual(['plain']);
  });

  it('pairId 가 없는 변동은 그 1건만 지운다 — 다른 pairId 없는 변동은 건드리지 않는다', () => {
    const result = removeOverrideWithPair([A, PLAIN, COMCIGAN, B], 'plain');
    expect(result.overrides.map((o) => o.id)).toEqual(['a', 'cmc', 'b']);
    expect(result.removedIds).toEqual(['plain']);
  });

  it('반쪽(짝이 이미 없음)은 그 1건만 지운다', () => {
    const result = removeOverrideWithPair([A, PLAIN], 'a');
    expect(result.overrides.map((o) => o.id)).toEqual(['plain']);
    expect(result.removedIds).toEqual(['a']);
  });

  it('없는 id 면 아무것도 지우지 않고 같은 배열을 돌려준다', () => {
    const all = [A, B];
    const result = removeOverrideWithPair(all, 'nope');
    expect(result.overrides).toBe(all);
    expect(result.removedIds).toEqual([]);
  });
});
