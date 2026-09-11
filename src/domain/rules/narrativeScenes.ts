/**
 * 서사 장면의 **읽기 정본**(ADR-103) — 흐름 화면·보드·요청서·브릿지가 전부 이 함수만 본다.
 *
 * 왜 읽는 자리에 두는가: 근거의 소유(`RecordEvidence.threadId`)는 **근거 파일**에 있고 배치
 * (`InquiryThread.scenes`)는 **주제 파일**에 있다. 두 파일을 한 트랜잭션으로 묶을 수 없고
 * (락 순서는 주제 → 근거), 동기화가 둘을 서로 다른 시점에 내려보낸다. 그래서 "장면이 가리키는
 * 근거가 정말 이 주제 것인가"를 쓰기 관문에서 완전히 막을 수 없다. **가리는 자리를 하나로 모은다.**
 *
 * ★소속이 어긋난 id 는 **없는 것처럼** 다룬다(지우지 않는다). 아직 안 내려온 근거일 수 있어
 *   단정하면 멀쩡한 연결이 끊긴다 — ADR-086 결정 2 의 "주제 확인 중"과 같은 태도다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { InquiryThread, NarrativeScene } from '../entities/InquiryThread';
import { NARRATIVE_ROLE_MARKS, type NarrativeRole } from './narrativeParagraphs';
import { sortByEvidenceOrder, type EvidenceOrderLike } from './evidenceOrder';
import {
  defaultModuleFor,
  defaultScaffoldScenes,
  type NarrativeFrameId,
  type RecordScaffoldScene,
} from './narrativeFrames';

/** 장면을 풀 때 필요한 것만 — 엔티티 전체를 요구하지 않는다. */
export interface SceneEvidenceLike extends EvidenceOrderLike {
  readonly threadId?: string;
}

/** 가상 평가 장면의 id — **저장되지 않는다.** 화면이 "여기에 교사 판단이 온다"고 보여 줄 뿐이다. */
export const VIRTUAL_EVALUATION_SCENE_ID = 'virtual:evaluation';

export interface ResolvedScene<T extends SceneEvidenceLike> {
  readonly scene: NarrativeScene;
  /** 이 장면에 실제로 놓인 근거들(소유가 확인된 것만, 장면에 적힌 순서대로). */
  readonly evidences: readonly T[];
  /** 저장된 장면이 아니라 화면용으로 끼워 넣은 것인가(평가 자리 채움). */
  readonly virtual?: boolean;
}

export interface ResolvedScenes<T extends SceneEvidenceLike> {
  readonly scenes: readonly ResolvedScene<T>[];
  /** 이 주제 소속인데 어느 장면에도 놓이지 않은 근거 — 화면의 "아직 안 놓음". */
  readonly unplaced: readonly T[];
  /** 실제로 장면에 놓인 근거 수. 관문 판정(`§4` 근거 관문)이 이 수를 본다. */
  readonly placedCount: number;
}

/**
 * 주제 하나의 장면을 푼다.
 *
 * 하는 일 넷:
 *  (a) 이 주제 소유가 아닌 근거 id 는 없는 것처럼 다룬다(유령 가리기)
 *  (b) 같은 근거가 두 장면에 있으면 **첫 등장만** 남긴다
 *  (c) 평가 장면이 없으면 맨 앞에 가상 평가 장면을 **보여만** 준다(저장하지 않는다).
 *      둘 이상이면 첫 것만 남긴다 — 교사 판단은 어느 구성에서도 한 번뿐이다(ADR-094 §4)
 *  (d) 남은 근거를 `unplaced` 로 돌려준다(요청서의 "그 밖의 근거"와 같은 순서)
 */
export function scenesOf<T extends SceneEvidenceLike>(
  thread: Pick<InquiryThread, 'id' | 'scenes'>,
  evidences: readonly T[],
  frame: NarrativeFrameId,
): ResolvedScenes<T> {
  const owned = new Map<string, T>();
  for (const e of evidences) {
    if (e.threadId === thread.id) owned.set(e.id, e);
  }

  const used = new Set<string>();
  const out: ResolvedScene<T>[] = [];
  let sawEvaluation = false;

  for (const scene of thread.scenes ?? []) {
    if (scene.role === 'evaluation') {
      if (sawEvaluation) continue; // (c) 둘째부터는 버린다
      sawEvaluation = true;
    }
    const picked: T[] = [];
    for (const id of scene.evidenceIds) {
      if (used.has(id)) continue; // (b)
      const ev = owned.get(id);
      if (ev === undefined) continue; // (a)
      used.add(id);
      picked.push(ev);
    }
    out.push({ scene, evidences: picked });
  }

  if (!sawEvaluation && out.length > 0) {
    // (c) 평가 자리가 비었으면 맨 앞에 채워 보여 준다. 저장은 하지 않는다.
    out.unshift({
      scene: {
        id: VIRTUAL_EVALUATION_SCENE_ID,
        role: 'evaluation',
        moduleId: defaultModuleFor(frame, 'evaluation'),
        evidenceIds: [],
      },
      evidences: [],
      virtual: true,
    });
  }

  const unplaced = sortByEvidenceOrder([...owned.values()].filter((e) => !used.has(e.id)));
  return { scenes: out, unplaced, placedCount: used.size };
}

/**
 * 저장된 장면에 실제로 배치된 근거 수 — **근거 관문**의 판정값.
 * 0 이면 요청서는 근거를 예전과 같은 방식으로(정렬만 한 목록으로) 싣는다.
 */
export function placedCount<T extends SceneEvidenceLike>(
  thread: Pick<InquiryThread, 'id' | 'scenes'>,
  evidences: readonly T[],
): number {
  const owned = new Set(evidences.filter((e) => e.threadId === thread.id).map((e) => e.id));
  const used = new Set<string>();
  for (const scene of thread.scenes ?? []) {
    for (const id of scene.evidenceIds) if (owned.has(id)) used.add(id);
  }
  return used.size;
}

/**
 * 이 장면 배열이 **기본 뼈대 그대로인가** — 구성 관문의 판정값.
 *
 * 참이면 「작성 구성」 블록을 붙이지 않고, 요청서는 기준선(`base/` 픽스처)과 글자 하나까지 같다.
 * ★부재·빈 배열도 참이다. **기존 사용자 주제는 전부 이 경우**이므로 여기가 틀리면 모두의 요청서가
 *   조용히 달라진다.
 * ★메모·직접 적은 이름이 하나라도 있으면 거짓이다 — 선생님이 손댄 것은 보내야 한다.
 * ★주제가 이어져 있으면(`chained`) 거짓이다 — 이음말과 순서를 보내야 하기 때문이다.
 */
export function isDefaultScenes(
  saved: readonly NarrativeScene[] | undefined,
  opts: { readonly chained: boolean },
): boolean {
  if (opts.chained) return false;
  if (saved === undefined || saved.length === 0) return true;
  if (saved.some((s) => (s.note?.trim().length ?? 0) > 0)) return false;
  if (saved.some((s) => (s.label?.trim().length ?? 0) > 0)) return false;
  return sameShape(saved, defaultScaffoldScenes());
}

function sameShape(
  saved: readonly NarrativeScene[],
  base: readonly RecordScaffoldScene[],
): boolean {
  if (saved.length !== base.length) return false;
  return saved.every((s, i) => {
    const b = base[i];
    return b !== undefined && s.role === b.role && s.moduleId === b.moduleId;
  });
}

/**
 * 이어진 주제 사슬 — 앞(조상) 쪽으로 거슬러 오른 뒤, 시작점의 뒤(후손) 쪽으로 내려간다.
 *
 * ★**어떤 길이의 고리에서도 멈춘다**(방문 집합). 길이를 세는 구현은 A→B→C→A 에서 무한히 돈다.
 * ★후손이 여럿으로 갈리면 시작점에서 멈춘다 — 어느 쪽이 "그다음"인지 정할 근거가 없다.
 * ★상한(`max`)은 **루트부터** 세고, 넘치면 먼 쪽(앞)부터 떨어뜨린다.
 */
export function chainOf(
  threads: readonly InquiryThread[],
  startId: string,
  max = 3,
): readonly InquiryThread[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const start = byId.get(startId);
  if (start === undefined) return [];

  const seen = new Set<string>([startId]);
  const ancestors: InquiryThread[] = [];
  let cursor: InquiryThread | undefined = start;
  while (cursor?.link !== undefined) {
    const prev: InquiryThread | undefined = byId.get(cursor.link.fromThreadId);
    if (prev === undefined || seen.has(prev.id)) break;
    seen.add(prev.id);
    ancestors.unshift(prev);
    cursor = prev;
  }

  const descendants: InquiryThread[] = [];
  let node: InquiryThread = start;
  for (;;) {
    const children = threads.filter((t) => t.link?.fromThreadId === node.id && !seen.has(t.id));
    const only = children.length === 1 ? children[0] : undefined;
    if (only === undefined) break; // 0개면 끝, 2개 이상이면 고르지 않는다
    seen.add(only.id);
    descendants.push(only);
    node = only;
  }

  const all = [...ancestors, start, ...descendants];
  return all.length <= max ? all : all.slice(all.length - max);
}

/** 요청서로 나가는 표식 — **언제나 4종.** 틀 이름(특성·장면·성장)은 화면 전용이다. */
export function sceneMarkOf(scene: Pick<NarrativeScene, 'role'>): string {
  return NARRATIVE_ROLE_MARKS[scene.role];
}

/** 장면 하나 만들기 — id 는 부르는 쪽이 준다(도메인은 시계를 읽지 않는다). */
export function makeScene(
  id: string,
  role: NarrativeRole,
  patch: Partial<Omit<NarrativeScene, 'id' | 'role' | 'evidenceIds'>> = {},
): NarrativeScene {
  return {
    id,
    role,
    evidenceIds: [],
    ...(patch.moduleId === undefined ? {} : { moduleId: patch.moduleId }),
    ...(patch.label === undefined ? {} : { label: patch.label }),
    ...(patch.note === undefined ? {} : { note: patch.note }),
    ...(patch.noteSource === undefined ? {} : { noteSource: patch.noteSource }),
  };
}
