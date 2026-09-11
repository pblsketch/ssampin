/**
 * 근거 지도의 **배치 계산**(ADR-106 · 107 · 108) — 순수 함수. 화면 좌표만 만들고 소유·차례는 건드리지 않는다.
 *
 * 구조: 주제 묶음이 세로로 쌓이고(디자이너 검토 2026-09-11 — 가로 나열은 이중 스크롤을 만든다), 묶음 안은 둘 중 하나다.
 *  - **장면 열**(`columns`): 열 = 장면 차례(가로축 = 글 순서), 카드는 열 안에 적힌 차례로 세로. 손으로 민 값은 쓰지 않는다.
 *  - **날짜순 흐름**(장면이 없을 때): 카드가 날짜순으로 왼쪽→오른쪽, 한 줄이 차면 다음 줄. 근거 사이 화살표는 그리지 않는다 —
 *    근거의 앞뒤는 장면 안 차례가 말한다(오너 결정 2026-09-11, ADR-108).
 *
 * ★선생님이 카드를 옮긴 만큼(`offsets`)은 자동 자리에 **더해진다**(장면이 없는 묶음에서만). 자료가 바뀌어 자동 자리가 달라져도
 *   손으로 민 만큼은 남는다. [카드 위치 정돈]은 이 더한 값을 비우는 것뿐이다.
 * ★좌표는 기기별 화면 설정이다. AI 요청서·근거 파일·동기화 어디에도 들어가지 않는다.
 */
import { compareEvidenceOrder, type EvidenceOrderLike } from '@domain/rules/evidenceOrder';

export const MAP_NODE_W = 224;
export const MAP_NODE_H = 96;
export const MAP_GAP_X = 64;
export const MAP_GAP_Y = 16;
export const MAP_GROUP_PAD = 16;
/** 묶음 머리(제목 줄) 높이 — 카드는 이 아래부터 놓인다. */
export const MAP_GROUP_HEAD = 44;
export const MAP_GROUP_GAP = 20;
/** 카드가 한 장도 없는 묶음의 높이(놓을 자리 안내가 들어간다). */
export const MAP_EMPTY_GROUP_H = 96;
/** 접어 둔 묶음의 높이 — 머리만 남는다. */
export const MAP_COLLAPSED_GROUP_H = 52;
/** 장면 열 머리 높이 — 첫 줄(색점 · 자리: 카테고리 · 건수) + 둘째 줄(앞 장면에서 오는 화살표와 이음말). 카드는 이 아래부터. */
export const MAP_COLUMN_HEAD = 64;
/** 열 머리 안에서 이음말 줄(둘째 줄)의 세로 가운데 — 장면 사이 화살표가 이 높이로 지나간다. */
export const MAP_COLUMN_LINK_Y = 50;
/** 앞 주제에서 이어진 묶음 앞의 간격 — 이음말 라벨이 들어간다. */
export const MAP_LINK_GAP = 52;

export interface MapOffset {
  readonly dx: number;
  readonly dy: number;
}

export interface MapNodeBox {
  readonly id: string;
  /** 지도 전체 기준 좌표(묶음 좌표가 아니다). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 장면 열이면 열 번호, 날짜순 흐름이면 줄 안의 칸 번호. */
  readonly layer: number;
}

export interface MapColumnBox {
  readonly key: string;
  /** 묶음 기준 x. 카드 폭과 같다. */
  readonly x: number;
  readonly w: number;
}

export interface MapGroupBox {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly nodes: readonly MapNodeBox[];
  /** 장면 열이 있는 묶음이면 열 상자들(장면 차례 + 마지막 「자리 미정」). */
  readonly columns?: readonly MapColumnBox[];
}

export interface MapLayout {
  readonly groups: readonly MapGroupBox[];
  readonly width: number;
  readonly height: number;
  /** id → 상자. */
  readonly nodeById: ReadonlyMap<string, MapNodeBox>;
}

export interface MapGroupInput<T extends EvidenceOrderLike> {
  readonly key: string;
  readonly items: readonly T[];
  /** 접어 둔 묶음 — 카드를 놓지 않고 머리 높이만 차지한다. */
  readonly collapsed?: boolean;
  /**
   * 장면 열(ADR-107) — 있으면 `items` 대신 이 열 차례로 놓는다: 열 = 가로축(글 순서), 카드는 열 안에서 적힌 차례로 세로.
   * 손으로 민 값(`offsets`)은 쓰지 않는다 — 열이 자리를 정한다. 마지막 열은 보통 「자리 미정」.
   */
  readonly columns?: readonly { readonly key: string; readonly items: readonly T[] }[];
  /** 앞 주제에서 이어진 묶음 — 앞에 이음말 라벨 자리(`MAP_LINK_GAP`)를 둔다. */
  readonly linkedFrom?: boolean;
}

/** 날짜순 흐름에서 한 줄에 들어가는 카드 수 — 보이는 너비에 맞춘다(최소 1). */
export function cardsPerRow(minWidth: number): number {
  return Math.max(
    1,
    Math.floor((minWidth - MAP_GROUP_PAD * 2 + MAP_GAP_X) / (MAP_NODE_W + MAP_GAP_X)),
  );
}

/**
 * 묶음 목록을 배치한다.
 * @param minWidth 지도가 최소한 채울 너비(보통 보이는 영역 너비). 묶음은 모두 같은 너비로 그린다.
 */
export function layoutEvidenceMap<T extends EvidenceOrderLike>(
  groups: readonly MapGroupInput<T>[],
  offsets: ReadonlyMap<string, MapOffset>,
  minWidth: number,
): MapLayout {
  const placedGroups: {
    key: string;
    nodes: MapNodeBox[];
    w: number;
    h: number;
    columns?: MapColumnBox[];
    linkedFrom: boolean;
  }[] = [];

  for (const g of groups) {
    const linkedFrom = g.linkedFrom === true;
    if (g.collapsed === true) {
      placedGroups.push({
        key: g.key,
        nodes: [],
        w: minWidth,
        h: MAP_COLLAPSED_GROUP_H,
        linkedFrom,
      });
      continue;
    }
    if (g.columns !== undefined) {
      const nodes: MapNodeBox[] = [];
      const columns: MapColumnBox[] = [];
      let maxRows = 1;
      g.columns.forEach((col, c) => {
        const x = MAP_GROUP_PAD + c * (MAP_NODE_W + MAP_GAP_X);
        columns.push({ key: col.key, x, w: MAP_NODE_W });
        col.items.forEach((item, row) => {
          const y = MAP_GROUP_HEAD + MAP_COLUMN_HEAD + row * (MAP_NODE_H + MAP_GAP_Y);
          nodes.push({ id: item.id, x, y, w: MAP_NODE_W, h: MAP_NODE_H, layer: c });
        });
        maxRows = Math.max(maxRows, col.items.length);
      });
      const cols = Math.max(1, g.columns.length);
      placedGroups.push({
        key: g.key,
        nodes,
        columns,
        linkedFrom,
        w: Math.max(minWidth, MAP_GROUP_PAD * 2 + cols * (MAP_NODE_W + MAP_GAP_X) - MAP_GAP_X),
        h:
          MAP_GROUP_HEAD +
          MAP_COLUMN_HEAD +
          maxRows * (MAP_NODE_H + MAP_GAP_Y) -
          MAP_GAP_Y +
          MAP_GROUP_PAD,
      });
      continue;
    }
    if (g.items.length === 0) {
      placedGroups.push({ key: g.key, nodes: [], w: minWidth, h: MAP_EMPTY_GROUP_H, linkedFrom });
      continue;
    }
    // 날짜순 흐름 — 왼쪽→오른쪽, 줄이 차면 아래로. 읽는 순서가 곧 시간 순서다.
    const perRow = cardsPerRow(minWidth);
    const sorted = [...g.items].sort(compareEvidenceOrder);
    const nodes: MapNodeBox[] = [];
    let maxRight = 0;
    let maxBottom = 0;
    sorted.forEach((item, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const off = offsets.get(item.id) ?? { dx: 0, dy: 0 };
      // 손으로 민 값은 머리 아래·왼쪽 여백 안쪽으로만 — 카드가 제목 위나 묶음 밖으로 나가지 않게.
      const x = Math.max(MAP_GROUP_PAD, MAP_GROUP_PAD + col * (MAP_NODE_W + MAP_GAP_X) + off.dx);
      const y = Math.max(MAP_GROUP_HEAD, MAP_GROUP_HEAD + row * (MAP_NODE_H + MAP_GAP_Y) + off.dy);
      nodes.push({ id: item.id, x, y, w: MAP_NODE_W, h: MAP_NODE_H, layer: col });
      maxRight = Math.max(maxRight, x + MAP_NODE_W);
      maxBottom = Math.max(maxBottom, y + MAP_NODE_H);
    });
    placedGroups.push({
      key: g.key,
      nodes,
      linkedFrom,
      w: Math.max(minWidth, maxRight + MAP_GROUP_PAD),
      h: maxBottom + MAP_GROUP_PAD,
    });
  }

  const width = placedGroups.reduce((w, g) => Math.max(w, g.w), minWidth);
  let y = 0;
  const out: MapGroupBox[] = [];
  const nodeById = new Map<string, MapNodeBox>();
  placedGroups.forEach((g, i) => {
    // 이어진 묶음은 앞 묶음과의 사이를 넓혀 이음말 라벨 자리를 둔다.
    if (i > 0 && g.linkedFrom) y += MAP_LINK_GAP - MAP_GROUP_GAP;
    const nodes = g.nodes.map((n) => ({ ...n, y: n.y + y }));
    for (const n of nodes) nodeById.set(n.id, n);
    out.push({
      key: g.key,
      x: 0,
      y,
      w: width,
      h: g.h,
      nodes,
      ...(g.columns === undefined ? {} : { columns: g.columns }),
    });
    y += g.h + MAP_GROUP_GAP;
  });
  return { groups: out, width, height: Math.max(0, y - MAP_GROUP_GAP), nodeById };
}
