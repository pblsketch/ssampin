/**
 * 장면 열의 **놓는 곳 이름표**(ADR-103, 지도의 장면 열이 그대로 쓴다 — ADR-107).
 *
 * ★보드가 이미 쓰는 세 개(`drop:unclassified` · `drop:thread:{id}` · `drop:new`)는 **그대로 재사용**한다.
 *   같은 뜻에 이름표를 두 벌 만들면 호스트의 `onDragEnd` 가 보기마다 갈라지고, 언젠가 한쪽만 고치게 된다.
 * ★새로 만드는 것은 둘뿐이다: 장면 칸과, 줄기 안 "아직 안 놓음" 칸.
 */

/** 장면 칸 — 놓으면 그 장면에 들어간다(다른 주제 카드면 소유부터 옮긴다). */
export const sceneDropId = (threadId: string, sceneId: string): string =>
  `drop:scene:${threadId}:${sceneId}`;

/** 줄기 안 "아직 안 놓음" — 놓으면 장면에서만 빠지고 주제는 그대로다. */
export const unplacedDropId = (threadId: string): string => `drop:unplaced:${threadId}`;

export interface SceneDropTarget {
  readonly kind: 'scene';
  readonly threadId: string;
  readonly sceneId: string;
}

export interface UnplacedDropTarget {
  readonly kind: 'unplaced';
  readonly threadId: string;
}

export type NarrativeDropTarget = SceneDropTarget | UnplacedDropTarget;

/**
 * 이름표를 읽어 어디에 놓았는지 되돌린다. 장면 열의 것이 아니면 `null`
 * (보드와 공유하는 세 이름표는 호스트가 지금처럼 다룬다).
 *
 * ★장면 id 에는 쌍점이 들어갈 수 있으므로(가상 평가 장면 `virtual:evaluation`) 앞에서 세 조각만
 *   떼고 **나머지를 통째로** 장면 id 로 본다. `split(':')` 결과를 인덱스로 집으면 잘린다.
 */
export function parseNarrativeDropId(id: string): NarrativeDropTarget | null {
  if (id.startsWith('drop:scene:')) {
    const rest = id.slice('drop:scene:'.length);
    const at = rest.indexOf(':');
    if (at <= 0 || at === rest.length - 1) return null;
    return { kind: 'scene', threadId: rest.slice(0, at), sceneId: rest.slice(at + 1) };
  }
  if (id.startsWith('drop:unplaced:')) {
    const threadId = id.slice('drop:unplaced:'.length);
    if (threadId.length === 0) return null;
    return { kind: 'unplaced', threadId };
  }
  return null;
}
