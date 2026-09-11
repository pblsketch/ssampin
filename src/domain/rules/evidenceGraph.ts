/**
 * 근거 지도의 **읽기 정본**(ADR-106) — 근거 사이 연결을 유효한 것만 골라 그래프로 만들고,
 * 초안에 보낼 차례와 화면 층(層)을 같은 규칙으로 계산한다.
 *
 * 왜 읽는 자리에 두는가: 연결은 앞 근거(`RecordEvidence.links`)에 산다. 뒤 근거가 지워지거나 아직
 * 동기화로 안 내려왔으면 연결은 **가리키는 곳이 없는 채** 남는다. 쓰기에서 전부 막을 수 없으므로
 * (`narrativeScenes.scenesOf` 와 같은 태도) 가리는 자리를 하나로 모은다 — 화면·요청서·초안 차례가
 * 전부 이 함수만 본다.
 *
 * 세 가지를 구분한다(계획서 §1):
 *  - **관계**: 어떤 근거가 어떤 근거로 이어지는가. 분기(하나→여럿)·합류(여럿→하나) 모두 허용.
 *  - **화면 배치**: 어디에 그리는가. 여기서는 층만 계산하고 좌표는 화면이 정한다. 관계를 바꾸지 않는다.
 *  - **작성 차례**: 초안에 어떤 순서로 싣는가. 연결을 따라가되 고리가 있으면 날짜순으로 돌아간다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { EvidenceLink } from '../entities/RecordEvidence';
import { compareEvidenceOrder, type EvidenceOrderLike } from './evidenceOrder';

/** 그래프를 풀 때 필요한 것만 — 엔티티 전체를 요구하지 않는다. */
export interface GraphEvidenceLike extends EvidenceOrderLike {
  /** 학생 신원 키. **없으면 같은 학생으로 본다**(요청서 꾸러미처럼 이미 한 학생 것만 모인 자리). */
  readonly studentRef?: string;
  readonly links?: readonly EvidenceLink[];
}

function sameStudent(a: GraphEvidenceLike, b: GraphEvidenceLike): boolean {
  return a.studentRef === undefined || b.studentRef === undefined || a.studentRef === b.studentRef;
}

/** 유효한 연결 하나(양 끝이 실재하고 같은 학생이며 자기 자신이 아닌 것). */
export interface EvidenceEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly note?: string;
  readonly source: 'teacher' | 'ai';
}

export interface ResolvedEvidenceGraph {
  readonly edges: readonly EvidenceEdge[];
  /** 가리키는 근거가 없거나 남의 학생 것이라 **가린** 연결 수. 화면이 "N건은 상대 근거가 없어 숨김"으로 알린다. */
  readonly danglingCount: number;
}

export const EDGE_KEY_SEP = '→';

export function edgeKey(fromId: string, toId: string): string {
  return `${fromId}${EDGE_KEY_SEP}${toId}`;
}

/**
 * 연결을 푼다.
 *  (a) 상대가 없거나(지워짐·아직 안 옴) 다른 학생 것이면 **없는 것처럼** 다룬다 — 지우지 않는다.
 *  (b) 자기 자신으로의 연결은 버린다.
 *  (c) 같은 (앞, 뒤) 쌍이 둘이면 첫 것만 남긴다.
 */
export function resolveEvidenceEdges<T extends GraphEvidenceLike>(
  evidences: readonly T[],
): ResolvedEvidenceGraph {
  const byId = new Map<string, T>();
  for (const e of evidences) byId.set(e.id, e);
  const seen = new Set<string>();
  const edges: EvidenceEdge[] = [];
  let danglingCount = 0;
  for (const from of evidences) {
    for (const link of from.links ?? []) {
      if (link.toId === from.id) continue; // (b)
      const to = byId.get(link.toId);
      if (to === undefined || !sameStudent(from, to)) {
        danglingCount += 1; // (a)
        continue;
      }
      const key = edgeKey(from.id, to.id);
      if (seen.has(key)) continue; // (c)
      seen.add(key);
      const note = link.note?.trim() ?? '';
      edges.push({
        fromId: from.id,
        toId: to.id,
        ...(note.length > 0 ? { note } : {}),
        source: link.source ?? 'teacher',
      });
    }
  }
  return { edges, danglingCount };
}

/** 왜 이을 수 없는가. `null` 이면 이어도 된다. */
export type LinkRejection = 'self' | 'missing' | 'other-student' | 'duplicate' | 'reverse-exists';

export const LINK_REJECTION_MESSAGES: Readonly<Record<LinkRejection, string>> = {
  self: '같은 근거끼리는 이을 수 없습니다',
  missing: '이으려는 근거를 찾을 수 없습니다',
  'other-student': '다른 학생의 근거와는 이을 수 없습니다',
  duplicate: '이미 이어져 있습니다',
  'reverse-exists': '반대 방향으로 이미 이어져 있습니다. 연결을 골라 [방향 바꾸기]를 쓰세요',
};

/**
 * 잇기 전 검사 — 쓰기 관문과 화면이 **같은 판정**을 본다.
 * ★반대 방향이 이미 있으면 거절한다. A→B 와 B→A 를 둘 다 두면 차례에 고리가 생기고, 선생님이 뜻한 것은
 *   대개 "방향을 바꾸고 싶다"이기 때문이다.
 */
export function linkRejection<T extends GraphEvidenceLike>(
  fromId: string,
  toId: string,
  evidences: readonly T[],
): LinkRejection | null {
  if (fromId === toId) return 'self';
  const from = evidences.find((e) => e.id === fromId);
  const to = evidences.find((e) => e.id === toId);
  if (from === undefined || to === undefined) return 'missing';
  if (!sameStudent(from, to)) return 'other-student';
  if ((from.links ?? []).some((l) => l.toId === toId)) return 'duplicate';
  if ((to.links ?? []).some((l) => l.toId === fromId)) return 'reverse-exists';
  return null;
}

/** 한 근거의 앞뒤 — 들어오는 연결(합류의 재료)과 나가는 연결(분기의 갈래). */
export function edgesAround(
  edges: readonly EvidenceEdge[],
  id: string,
): { readonly incoming: readonly EvidenceEdge[]; readonly outgoing: readonly EvidenceEdge[] } {
  return {
    incoming: edges.filter((e) => e.toId === id),
    outgoing: edges.filter((e) => e.fromId === id),
  };
}

/** 양 끝이 모두 `ids` 안에 있는 연결만. 선택한 근거로 초안을 쓸 때 요청서에 실을 연결이다. */
export function edgesWithin(
  edges: readonly EvidenceEdge[],
  ids: ReadonlySet<string>,
): readonly EvidenceEdge[] {
  return edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId));
}

export interface DraftOrderResult<T> {
  readonly ordered: readonly T[];
  /** 연결에 고리가 있어 일부를 날짜순으로 돌린 경우 참. 화면이 "연결이 서로 맞물려 있어 날짜순으로 이었습니다"로 알린다. */
  readonly cyclic: boolean;
}

/**
 * 초안에 실을 차례 — **연결을 따라가되, 갈 수 있는 것이 여럿이면 날짜순**(같은 날은 적힌 시각, 그다음 id).
 *
 * ★연결이 하나도 없으면 `sortByEvidenceOrder` 와 **같은 결과**다(기준선 불변).
 * ★차례는 인과가 아니다 — 요청서는 "앞의 것에서 뒤의 것으로 이어졌다"까지만 말한다.
 * ★고리(A→B→A)는 끝까지 못 풀므로 남은 것을 날짜순으로 뒤에 붙이고 `cyclic` 으로 알린다. 조용히 빼지 않는다.
 */
export function orderForDraft<T extends GraphEvidenceLike>(
  items: readonly T[],
  edges: readonly EvidenceEdge[],
): DraftOrderResult<T> {
  const ids = new Set(items.map((e) => e.id));
  const inner = edgesWithin(edges, ids);
  const indegree = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const e of items) indegree.set(e.id, 0);
  for (const edge of inner) {
    indegree.set(edge.toId, (indegree.get(edge.toId) ?? 0) + 1);
    const list = next.get(edge.fromId);
    if (list) list.push(edge.toId);
    else next.set(edge.fromId, [edge.toId]);
  }
  const byId = new Map(items.map((e) => [e.id, e] as const));
  const ready: T[] = items.filter((e) => (indegree.get(e.id) ?? 0) === 0);
  const ordered: T[] = [];
  const done = new Set<string>();
  while (ready.length > 0) {
    ready.sort(compareEvidenceOrder);
    const head = ready.shift() as T;
    ordered.push(head);
    done.add(head.id);
    for (const toId of next.get(head.id) ?? []) {
      const left = (indegree.get(toId) ?? 0) - 1;
      indegree.set(toId, left);
      if (left === 0) {
        const t = byId.get(toId);
        if (t !== undefined) ready.push(t);
      }
    }
  }
  if (ordered.length === items.length) return { ordered, cyclic: false };
  const rest = items.filter((e) => !done.has(e.id)).sort(compareEvidenceOrder);
  return { ordered: [...ordered, ...rest], cyclic: true };
}

/**
 * 화면 층 — 들어오는 연결이 없으면 0층, 있으면 앞 근거들의 층 + 1(가장 긴 길). 화면은 층을 왼쪽→오른쪽 열로 그린다.
 *
 * ★`orderForDraft` 의 차례를 따라 계산하므로 고리는 **뒤에서 앞으로 가는 연결을 무시**하는 것으로 끊긴다.
 *   같은 자료면 언제나 같은 층이다(그려질 때마다 카드가 널뛰지 않는다).
 * ★층은 배치일 뿐이다 — 연결·소유·차례를 바꾸지 않는다.
 */
export function layerEvidences<T extends GraphEvidenceLike>(
  items: readonly T[],
  edges: readonly EvidenceEdge[],
): ReadonlyMap<string, number> {
  const { ordered } = orderForDraft(items, edges);
  const position = new Map(ordered.map((e, i) => [e.id, i] as const));
  const layer = new Map<string, number>();
  const ids = new Set(ordered.map((e) => e.id));
  const inner = edgesWithin(edges, ids);
  for (const e of ordered) {
    let depth = 0;
    for (const edge of inner) {
      if (edge.toId !== e.id) continue;
      const fromPos = position.get(edge.fromId) ?? Number.MAX_SAFE_INTEGER;
      const myPos = position.get(e.id) ?? 0;
      if (fromPos > myPos) continue; // 고리를 끊는 뒤→앞 연결
      depth = Math.max(depth, (layer.get(edge.fromId) ?? 0) + 1);
    }
    layer.set(e.id, depth);
  }
  return layer;
}

/**
 * 이음말 정규화 — 앞뒤 공백을 걷고 상한으로 자른다. 빈 글은 `undefined`(칸을 만들지 않는다).
 */
export function normalizeLinkNote(note: string | undefined, max: number): string | undefined {
  const trimmed = (note ?? '').trim().slice(0, max);
  return trimmed.length === 0 ? undefined : trimmed;
}
