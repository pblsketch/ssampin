/** 가지의 화면 좌표만 계산한다. 소유와 글 순서는 저장된 자료를 따른다. */
import { compareEvidenceOrder, type EvidenceOrderLike } from '@domain/rules/evidenceOrder';

export const MAP_NODE_W = 288;
export const MAP_NODE_H = 72;
export const MAP_GAP_X = 48;
export const MAP_GAP_Y = 12;
export const MAP_GROUP_PAD = 24;
export const MAP_GROUP_HEAD = 88;
export const MAP_GROUP_GAP = 40;
export const MAP_EMPTY_GROUP_H = 88;
export const MAP_COLLAPSED_GROUP_H = 104;
export const MAP_COLUMN_HEAD = 72;
export const MAP_COLUMN_LINK_Y = 44;
export const MAP_LINK_GAP = 72;
export const MAP_TOPIC_X = 216;
export const MAP_TOPIC_W = 192;
export const MAP_SCENE_X = 456;
export const MAP_SCENE_W = 232;
export const MAP_EVIDENCE_X = 736;
export const MAP_NOTE_H = 88;

export interface MapOffset {
  readonly dx: number;
  readonly dy: number;
}
export interface MapNodeBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly layer: number;
}
export interface MapColumnBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly branchHeight: number;
}
export interface MapGroupBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly topicY: number;
  readonly nodes: readonly MapNodeBox[];
  readonly columns?: readonly MapColumnBox[];
}
export interface MapLayout {
  readonly groups: readonly MapGroupBox[];
  readonly width: number;
  readonly height: number;
  readonly nodeById: ReadonlyMap<string, MapNodeBox>;
}
export interface MapGroupInput<T extends EvidenceOrderLike> {
  readonly key: string;
  readonly items: readonly T[];
  readonly collapsed?: boolean;
  readonly columns?: readonly {
    readonly key: string;
    readonly items: readonly T[];
    readonly note?: string;
  }[];
  readonly linkedFrom?: boolean;
}
/** 근거는 가지 안에서 위에서 아래로 읽는다. */
export function cardsPerRow(_minWidth: number): number {
  return 1;
}
function noteHeight(item: EvidenceOrderLike): number {
  return 'note' in item && typeof item.note === 'string' && item.note.trim() ? MAP_NOTE_H : 0;
}
export function layoutEvidenceMap<T extends EvidenceOrderLike>(
  groups: readonly MapGroupInput<T>[],
  offsets: ReadonlyMap<string, MapOffset>,
  minWidth: number,
): MapLayout {
  const width = Math.max(minWidth, MAP_EVIDENCE_X + MAP_NODE_W + MAP_GROUP_PAD);
  const out: MapGroupBox[] = [];
  const nodeById = new Map<string, MapNodeBox>();
  let y = 24;
  for (const g of groups) {
    if (out.length > 0) y += g.linkedFrom ? MAP_LINK_GAP : MAP_GROUP_GAP;
    const nodes: MapNodeBox[] = [];
    const columns: MapColumnBox[] = [];
    let cursor = 0;
    if (!g.collapsed) {
      if (g.columns !== undefined) {
        g.columns.forEach((col, layer) => {
          const start = cursor;
          let evidenceY = start;
          for (const item of col.items) {
            nodes.push({
              id: item.id,
              x: MAP_EVIDENCE_X,
              y: y + evidenceY,
              w: MAP_NODE_W,
              h: MAP_NODE_H,
              layer,
            });
            evidenceY += MAP_NODE_H + noteHeight(item) + MAP_GAP_Y;
          }
          const sceneHeight = MAP_COLUMN_HEAD + (col.note?.trim() ? MAP_NOTE_H : 0);
          const branchHeight = Math.max(sceneHeight, evidenceY - start - MAP_GAP_Y);
          columns.push({
            key: col.key,
            x: MAP_SCENE_X,
            y: start,
            w: MAP_SCENE_W,
            h: MAP_COLUMN_HEAD,
            branchHeight,
          });
          cursor += branchHeight + 40;
        });
        cursor = Math.max(0, cursor - 40);
      } else {
        for (const item of [...g.items].sort(compareEvidenceOrder)) {
          const offset = offsets.get(item.id);
          const nodeY = Math.max(cursor, cursor + (offset?.dy ?? 0));
          nodes.push({
            id: item.id,
            x: Math.max(MAP_SCENE_X, MAP_SCENE_X + (offset?.dx ?? 0)),
            y: y + nodeY,
            w: MAP_NODE_W,
            h: MAP_NODE_H,
            layer: 0,
          });
          cursor = nodeY + MAP_NODE_H + noteHeight(item) + MAP_GAP_Y;
        }
      }
    }
    const h = Math.max(g.collapsed ? MAP_COLLAPSED_GROUP_H : MAP_EMPTY_GROUP_H, cursor) + 40;
    const topicY = Math.max(0, Math.min(240, (h - MAP_GROUP_HEAD) / 2));
    for (const n of nodes) nodeById.set(n.id, n);
    out.push({
      key: g.key,
      x: MAP_TOPIC_X,
      y,
      w: width,
      h,
      topicY,
      nodes,
      ...(g.columns === undefined || g.collapsed ? {} : { columns }),
    });
    y += h;
  }
  return {
    groups: out,
    width: Math.max(width, ...out.flatMap((g) => g.nodes.map((n) => n.x + n.w + MAP_GROUP_PAD))),
    height: y,
    nodeById,
  };
}
