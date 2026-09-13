import { describe, it, expect } from 'vitest';
import { layoutEvidenceMap, MAP_NOTE_H, MAP_GROUP_GAP, MAP_LINK_GAP } from '../evidenceMapLayout';
const ev = (id: string, date = '2026-03-01', note = '') => ({ id, createdAt: 1, date, note });
describe('근거 지도 가지 배치', () => {
  it('장면이 없으면 날짜순 세로 배치이며 입력을 바꾸지 않는다', () => {
    const items = [ev('b', '2026-03-02'), ev('a')];
    const { nodes } = layoutEvidenceMap([{ key: 'g', items }], new Map(), 600).groups[0]!;
    expect(nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(nodes[0]!.x).toBe(nodes[1]!.x);
    expect(nodes[1]!.y).toBeGreaterThan(nodes[0]!.y + nodes[0]!.h);
    expect(items.map((n) => n.id)).toEqual(['b', 'a']);
  });
  it('장면과 근거의 저장 순서를 유지하고 메모 아래에 다음 가지를 둔다', () => {
    const a = ev('a', '2026-03-03', '수정 전후 비교');
    const b = ev('b');
    const layout = layoutEvidenceMap(
      [
        {
          key: 'g',
          items: [a, b],
          columns: [
            { key: 's1', items: [a, b], note: '교사 메모' },
            { key: 's2', items: [] },
          ],
        },
      ],
      new Map([['a', { dx: 500, dy: 500 }]]),
      600,
    );
    const g = layout.groups[0]!;
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(g.nodes[1]!.y).toBeGreaterThanOrEqual(g.nodes[0]!.y + g.nodes[0]!.h + MAP_NOTE_H);
    expect(g.columns!.map((c) => c.key)).toEqual(['s1', 's2']);
    expect(g.columns![0]!.x).toBe(g.columns![1]!.x);
    expect(g.y + g.columns![1]!.y).toBeGreaterThan(g.nodes[1]!.y + g.nodes[1]!.h);
    expect(g.nodes[0]!.x).toBeGreaterThan(g.columns![0]!.x + g.columns![0]!.w);
  });
  it('장면 20개가 있어도 가로 폭이 늘지 않는다', () => {
    const render = (count: number) =>
      layoutEvidenceMap(
        [
          {
            key: 'g',
            items: [],
            columns: Array.from({ length: count }, (_, i) => ({ key: `s${i}`, items: [] })),
          },
        ],
        new Map(),
        1100,
      );
    expect(render(20).width).toBe(render(1).width);
    expect(render(20).height).toBeGreaterThan(render(1).height);
  });
  it('접힌 카드가 숨겨지고 이어진 주제 앞에 이음말 공간을 둔다', () => {
    const layout = layoutEvidenceMap(
      [
        { key: 'p', items: [ev('a')], collapsed: true },
        { key: 'q', items: [ev('b')], linkedFrom: true },
        { key: 'r', items: [] },
      ],
      new Map(),
      600,
    );
    const [p, q, r] = layout.groups;
    expect(p!.nodes).toEqual([]);
    expect(layout.nodeById.has('a')).toBe(false);
    expect(q!.y - p!.y - p!.h).toBe(MAP_LINK_GAP);
    expect(r!.y - q!.y - q!.h).toBe(MAP_GROUP_GAP);
  });
  it('이동 공간을 확보하고 다음 카드와 겹치지 않는다', () => {
    const groups = [{ key: 'g', items: [ev('a'), ev('b')] }];
    const base = layoutEvidenceMap(groups, new Map(), 600);
    const moved = layoutEvidenceMap(groups, new Map([['a', { dx: 500, dy: 300 }]]), 600);
    expect(moved.nodeById.get('a')!.x).toBe(base.nodeById.get('a')!.x + 500);
    expect(moved.nodeById.get('a')!.y).toBe(base.nodeById.get('a')!.y + 300);
    expect(moved.nodeById.get('b')!.y).toBeGreaterThan(
      moved.nodeById.get('a')!.y + moved.nodeById.get('a')!.h,
    );
    expect(moved.width).toBeGreaterThan(base.width);
  });
});
