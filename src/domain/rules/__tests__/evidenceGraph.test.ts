/**
 * 근거 지도의 읽기 정본(ADR-106).
 *
 * 여기서 지키는 것:
 *  - 상대가 없거나 남의 학생 것인 연결은 **가리기만** 한다(지우지 않고 세어 알린다).
 *  - 분기(A→B, A→C)와 합류(B→D, C→D)가 둘 다 살아남고, 차례는 A, B, C, D 다(B→C 로 오해하지 않는다).
 *  - 연결이 없으면 차례는 날짜순 그대로다(기준선 불변).
 *  - 고리는 조용히 빠지지 않고 `cyclic` 으로 알린다.
 *  - 반대 방향이 이미 있으면 잇기를 거절한다(고리를 만들지 않는다).
 */
import { describe, it, expect } from 'vitest';

import {
  edgesAround,
  edgesWithin,
  layerEvidences,
  linkRejection,
  normalizeLinkNote,
  orderForDraft,
  resolveEvidenceEdges,
  type GraphEvidenceLike,
} from '../evidenceGraph';
import { sortByEvidenceOrder } from '../evidenceOrder';

const ev = (
  id: string,
  over: Partial<GraphEvidenceLike> = {},
): GraphEvidenceLike & { readonly id: string } => ({
  id,
  studentRef: 's1',
  createdAt: 1,
  ...over,
});

describe('resolveEvidenceEdges', () => {
  it('실재하고 같은 학생인 연결만 남기고, 없는 상대·남의 학생·자기 자신은 가린다', () => {
    const items = [
      ev('a', { links: [{ toId: 'b' }, { toId: 'ghost' }, { toId: 'a' }, { toId: 'x' }] }),
      ev('b'),
      ev('x', { studentRef: 's2' }),
    ];
    const r = resolveEvidenceEdges(items);
    expect(r.edges.map((e) => `${e.fromId}>${e.toId}`)).toEqual(['a>b']);
    expect(r.danglingCount).toBe(2); // ghost · 남의 학생
  });

  it('같은 쌍이 둘이면 첫 것만 남기고, 이음말은 다듬어 싣는다', () => {
    const items = [
      ev('a', {
        links: [
          { toId: 'b', note: '  변화 ' },
          { toId: 'b', note: '둘째' },
        ],
      }),
      ev('b'),
    ];
    const r = resolveEvidenceEdges(items);
    expect(r.edges).toEqual([{ fromId: 'a', toId: 'b', note: '변화', source: 'teacher' }]);
  });

  it('AI 가 만든 연결은 출처가 남는다', () => {
    const r = resolveEvidenceEdges([ev('a', { links: [{ toId: 'b', source: 'ai' }] }), ev('b')]);
    expect(r.edges[0]?.source).toBe('ai');
  });
});

describe('linkRejection', () => {
  const items = [
    ev('a', { links: [{ toId: 'b' }] }),
    ev('b'),
    ev('c'),
    ev('z', { studentRef: 's9' }),
  ];
  it.each([
    ['a', 'a', 'self'],
    ['a', 'nope', 'missing'],
    ['a', 'z', 'other-student'],
    ['a', 'b', 'duplicate'],
    ['b', 'a', 'reverse-exists'],
  ] as const)('%s → %s 는 %s', (from, to, why) => {
    expect(linkRejection(from, to, items)).toBe(why);
  });
  it('이을 수 있으면 null', () => {
    expect(linkRejection('a', 'c', items)).toBeNull();
  });
});

describe('orderForDraft', () => {
  it('연결이 없으면 날짜순과 같다(기준선 불변)', () => {
    const items = [
      ev('late', { date: '2026-05-03' }),
      ev('early', { date: '2026-05-01' }),
      ev('nodate'),
      ev('mid', { date: '2026-05-02' }),
    ];
    const r = orderForDraft(items, []);
    expect(r.cyclic).toBe(false);
    expect(r.ordered.map((e) => e.id)).toEqual(sortByEvidenceOrder(items).map((e) => e.id));
  });

  it('분기·합류 A→B, A→C, B→D, C→D 는 A, B, C, D 차례이고 B→C 로 굳히지 않는다', () => {
    // 날짜는 일부러 거꾸로 — 연결이 날짜를 이긴다.
    const items = [
      ev('d', { date: '2026-03-01', links: [] }),
      ev('c', { date: '2026-03-02', links: [{ toId: 'd' }] }),
      ev('b', { date: '2026-03-03', links: [{ toId: 'd' }] }),
      ev('a', { date: '2026-03-04', links: [{ toId: 'b' }, { toId: 'c' }] }),
    ];
    const { edges } = resolveEvidenceEdges(items);
    expect(edgesAround(edges, 'd').incoming).toHaveLength(2); // 합류
    expect(edgesAround(edges, 'a').outgoing).toHaveLength(2); // 분기
    const r = orderForDraft(items, edges);
    expect(r.cyclic).toBe(false);
    // B 와 C 는 둘 다 A 다음에 올 수 있으므로 날짜순(C 가 더 이르다).
    expect(r.ordered.map((e) => e.id)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('고리는 조용히 빠지지 않는다 — 남은 것을 날짜순으로 뒤에 붙이고 cyclic 을 켠다', () => {
    const items = [
      ev('a', { date: '2026-01-01', links: [{ toId: 'b' }] }),
      ev('b', { date: '2026-01-02', links: [{ toId: 'a' }] }),
      ev('c', { date: '2026-01-03' }),
    ];
    const { edges } = resolveEvidenceEdges(items);
    const r = orderForDraft(items, edges);
    expect(r.cyclic).toBe(true);
    expect(r.ordered.map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('선택 밖 근거로 가는 연결은 차례에 영향을 주지 않는다', () => {
    const all = [
      ev('a', { date: '2026-01-02', links: [{ toId: 'b' }] }),
      ev('b', { date: '2026-01-01' }),
      ev('outside', { date: '2025-12-01', links: [{ toId: 'a' }] }),
    ];
    const { edges } = resolveEvidenceEdges(all);
    const picked = all.filter((e) => e.id !== 'outside');
    expect(edgesWithin(edges, new Set(picked.map((e) => e.id)))).toHaveLength(1);
    expect(orderForDraft(picked, edges).ordered.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('layerEvidences', () => {
  it('들어오는 연결이 없으면 0층, 있으면 가장 긴 길 + 1', () => {
    const items = [
      ev('a', { links: [{ toId: 'b' }, { toId: 'c' }] }),
      ev('b', { links: [{ toId: 'd' }] }),
      ev('c'),
      ev('d'),
    ];
    const { edges } = resolveEvidenceEdges(items);
    const layer = layerEvidences(items, edges);
    expect([...layer.entries()]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 1],
      ['d', 2],
    ]);
  });

  it('고리가 있어도 층이 정해지고 같은 자료면 같은 층이다', () => {
    const items = [
      ev('a', { date: '2026-01-01', links: [{ toId: 'b' }] }),
      ev('b', { date: '2026-01-02', links: [{ toId: 'a' }] }),
    ];
    const { edges } = resolveEvidenceEdges(items);
    const first = layerEvidences(items, edges);
    const second = layerEvidences(items, edges);
    expect([...first.entries()]).toEqual([...second.entries()]);
    expect(first.get('a')).toBe(0);
    expect(first.get('b')).toBe(1);
  });
});

describe('normalizeLinkNote', () => {
  it('공백을 걷고 상한으로 자르며, 빈 글은 undefined', () => {
    expect(normalizeLinkNote('  변화  ', 200)).toBe('변화');
    expect(normalizeLinkNote('   ', 200)).toBeUndefined();
    expect(normalizeLinkNote('가나다라', 2)).toBe('가나');
  });
});
