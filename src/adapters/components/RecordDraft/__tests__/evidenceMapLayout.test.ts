/**
 * 근거 지도 배치 계산(ADR-106 · 107 · 108) — 순수 함수.
 *
 * 여기서 지키는 것:
 *  - 장면이 없는 묶음은 카드가 **날짜순 흐름**(왼쪽→오른쪽, 줄이 차면 아래)이다. 근거 사이 화살표는 없다.
 *  - 장면 열이 있으면 x 는 열 차례, y 는 열 안 차례다. 손으로 민 값은 쓰지 않는다.
 *  - 묶음은 세로로 쌓이고 전부 같은 너비다. 지도 전체 좌표(`nodeById`)는 묶음 y 를 더한 값이다.
 *  - 손으로 민 값(`offsets`)은 자동 자리에 더해지되 제목 위·왼쪽 밖으로는 못 나간다.
 *  - 빈 묶음은 고정 높이다. 이어진 묶음 앞에는 이음말 자리가 있다.
 */
import { describe, it, expect } from 'vitest';

import {
  cardsPerRow,
  layoutEvidenceMap,
  MAP_COLUMN_HEAD,
  MAP_EMPTY_GROUP_H,
  MAP_GAP_X,
  MAP_GAP_Y,
  MAP_GROUP_GAP,
  MAP_GROUP_HEAD,
  MAP_GROUP_PAD,
  MAP_LINK_GAP,
  MAP_NODE_H,
  MAP_NODE_W,
} from '../evidenceMapLayout';

const ev = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  studentRef: 's1',
  createdAt: 1,
  ...over,
});

describe('layoutEvidenceMap — 날짜순 흐름', () => {
  it('카드가 날짜순으로 왼쪽→오른쪽, 한 줄이 차면 다음 줄로 간다', () => {
    const items = [
      ev('c', { date: '2026-03-03' }),
      ev('a', { date: '2026-03-01' }),
      ev('b', { date: '2026-03-02' }),
    ];
    // 600px 이면 두 장이 한 줄(cardsPerRow = 2).
    expect(cardsPerRow(600)).toBe(2);
    const layout = layoutEvidenceMap([{ key: 'g', items }], new Map(), 600);
    expect(layout.nodeById.get('a')).toMatchObject({
      x: MAP_GROUP_PAD,
      y: MAP_GROUP_HEAD,
      layer: 0,
    });
    expect(layout.nodeById.get('b')).toMatchObject({
      x: MAP_GROUP_PAD + MAP_NODE_W + MAP_GAP_X,
      y: MAP_GROUP_HEAD,
      layer: 1,
    });
    expect(layout.nodeById.get('c')).toMatchObject({
      x: MAP_GROUP_PAD,
      y: MAP_GROUP_HEAD + MAP_NODE_H + MAP_GAP_Y,
      layer: 0,
    });
    expect(layout.groups[0]!.h).toBe(MAP_GROUP_HEAD + 2 * MAP_NODE_H + MAP_GAP_Y + MAP_GROUP_PAD);
  });

  it('너무 좁아도 한 줄에 한 장은 놓는다', () => {
    expect(cardsPerRow(100)).toBe(1);
  });

  it('묶음은 세로로 쌓이고 전체 좌표는 묶음 y 를 더한 값이다. 빈 묶음은 고정 높이', () => {
    const layout = layoutEvidenceMap(
      [
        { key: 'g1', items: [ev('a')] },
        { key: 'g2', items: [] },
        { key: 'g3', items: [ev('b')] },
      ],
      new Map(),
      600,
    );
    const [g1, g2, g3] = layout.groups;
    expect(g1!.y).toBe(0);
    expect(g2!.y).toBe(g1!.h + MAP_GROUP_GAP);
    expect(g2!.h).toBe(MAP_EMPTY_GROUP_H);
    expect(g3!.y).toBe(g2!.y + g2!.h + MAP_GROUP_GAP);
    expect(layout.nodeById.get('b')!.y).toBe(g3!.y + MAP_GROUP_HEAD);
    expect(layout.groups.every((g) => g.w === layout.width)).toBe(true);
  });

  it('손으로 민 값은 더해지되 제목 위·왼쪽 밖으로는 못 나간다', () => {
    const items = [ev('a')];
    const pushed = layoutEvidenceMap(
      [{ key: 'g', items }],
      new Map([['a', { dx: 100, dy: 30 }]]),
      600,
    );
    expect(pushed.nodeById.get('a')).toMatchObject({
      x: MAP_GROUP_PAD + 100,
      y: MAP_GROUP_HEAD + 30,
    });
    const clamped = layoutEvidenceMap(
      [{ key: 'g', items }],
      new Map([['a', { dx: -500, dy: -500 }]]),
      600,
    );
    expect(clamped.nodeById.get('a')).toMatchObject({ x: MAP_GROUP_PAD, y: MAP_GROUP_HEAD });
  });
});

describe('장면 열(ADR-107)', () => {
  it('열이 있으면 x 는 열 차례, y 는 열 안 차례다 — 손으로 민 값은 자리를 바꾸지 않는다', () => {
    const a = ev('a', { date: '2026-05-03' });
    const b = ev('b', { date: '2026-05-01' });
    const c = ev('c', { date: '2026-05-02' });
    const layout = layoutEvidenceMap(
      [
        {
          key: 'g',
          items: [a, b, c],
          columns: [
            { key: 'g:s1', items: [a, b] }, // 첫 열에 두 장 — 적힌 차례(a, b)대로, 날짜순이 아니다
            { key: 'g:s2', items: [] },
            { key: 'g:unplaced', items: [c] },
          ],
        },
      ],
      new Map([['a', { dx: 500, dy: 500 }]]),
      600,
    );
    const top = MAP_GROUP_HEAD + MAP_COLUMN_HEAD;
    expect(layout.nodeById.get('a')).toMatchObject({ x: MAP_GROUP_PAD, y: top, layer: 0 });
    expect(layout.nodeById.get('b')).toMatchObject({
      x: MAP_GROUP_PAD,
      y: top + MAP_NODE_H + MAP_GAP_Y,
    });
    expect(layout.nodeById.get('c')).toMatchObject({
      x: MAP_GROUP_PAD + 2 * (MAP_NODE_W + MAP_GAP_X),
      y: top,
    });
    const g = layout.groups[0]!;
    expect(g.columns?.map((col) => col.key)).toEqual(['g:s1', 'g:s2', 'g:unplaced']);
    expect(g.columns?.[1]?.x).toBe(MAP_GROUP_PAD + (MAP_NODE_W + MAP_GAP_X));
    // 높이는 가장 긴 열(2장)이 정한다.
    expect(g.h).toBe(top + 2 * (MAP_NODE_H + MAP_GAP_Y) - MAP_GAP_Y + MAP_GROUP_PAD);
    // 열이 넷 이상이면 보이는 너비보다 넓어진다(가로 스크롤).
    const wide = layoutEvidenceMap(
      [{ key: 'g', items: [], columns: [1, 2, 3, 4, 5].map((i) => ({ key: `c${i}`, items: [] })) }],
      new Map(),
      600,
    );
    expect(wide.width).toBeGreaterThan(600);
  });

  it('앞 주제에서 이어진 묶음은 앞 묶음과 사이를 넓혀 이음말 자리를 둔다', () => {
    const layout = layoutEvidenceMap(
      [
        { key: 'p', items: [ev('a')] },
        { key: 'q', items: [ev('b')], linkedFrom: true },
        { key: 'r', items: [ev('c')] },
      ],
      new Map(),
      600,
    );
    const [p, q, r] = layout.groups;
    expect(q!.y - (p!.y + p!.h)).toBe(MAP_LINK_GAP);
    expect(r!.y - (q!.y + q!.h)).toBe(MAP_GROUP_GAP);
  });
});
