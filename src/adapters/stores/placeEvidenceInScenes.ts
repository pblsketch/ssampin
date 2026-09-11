/**
 * 근거를 서사 장면에 놓는 **단일 진입점**(ADR-103) — 순서 규율이 사는 자리.
 *
 * ## 왜 유스케이스인가
 *
 * 소유(`RecordEvidence.threadId`)는 근거 파일에, 배치(`InquiryThread.scenes`)는 주제 파일에 있다.
 * 두 파일을 한 트랜잭션으로 묶을 수 없고 잠금 순서는 **주제 → 근거**로 못 박혀 있다. 그래서 순서를
 * 정하는 코드가 어느 한쪽 스토어에 들어가면 두 스토어가 서로를 import 하게 되고(초기화 순서 의존),
 * 실제로도 "장면 먼저 → 소유 나중"이 되어 그 사이에 낀 다른 쓰기가 아직 소유가 아닌 id 를 유령으로
 * 보고 잘라 낸다.
 *
 * ## 규율: 근거 먼저, 장면 나중
 *
 * ① 소유 정합(근거 파일) → ② 장면 삽입(주제 파일).
 *
 * - ①이 실패하면 ②를 하지 않는다 — **카드는 있던 자리 그대로**.
 * - ②가 실패하면 카드는 **목표 주제의 "아직 안 놓음"** 에 있다. 파괴적이지 않고 화면에 보이며
 *   한 번 더 끌면 된다.
 * - 그래서 **보상(롤백) 경로가 아예 없다.** 창을 메우지 않고 순서로 없앤다.
 */
/**
 * ★자리: **어댑터 층**이다(유스케이스가 아니다). 유스케이스는 어댑터를 import 할 수 없다는
 *   레이어 규칙이 있고, 이 조율기는 두 스토어를 함께 부르는 일이라 스토어와 같은 층에 둔다.
 */
import {
  useInquiryThreadStore,
  type NarrativeDraftScene,
  type SceneGroup,
} from '@adapters/stores/useInquiryThreadStore';
import type { NarrativeLink } from '@domain/entities/InquiryThread';
import type { NarrativeFrameId } from '@domain/rules/narrativeFrames';
import { useRecordEvidenceStore } from '@adapters/stores/useRecordEvidenceStore';

export interface PlaceEvidenceInput {
  readonly threadId: string;
  readonly studentRef: string;
  readonly groups: readonly SceneGroup[];
  /** 장면 안에서 놓을 자리. 없으면 맨 뒤. */
  readonly index?: number;
}

/** AI 서사 [적용] 결과 — 실제로 썼는지까지 말한다. */
export interface NarrativeApplyResult extends PlaceEvidenceResult {
  /**
   * 주제 파일에 실제로 썼는가.
   *
   * ★`false` 면 화면은 **제안을 지우지 말고** 왜 안 됐는지 말해야 한다. 이 값이 없으면
   *   "근거 0건"과 "아무것도 저장 안 함"을 구별할 수 없어 "적용했습니다"가 거짓말이 된다.
   */
  readonly applied: boolean;
}

export interface PlaceEvidenceResult {
  /** 실제로 장면에 놓인 근거. */
  readonly placedIds: readonly string[];
  /** 소유를 얻지 못해 못 놓은 근거(남의 학생 것 등). 장면에 넣지 않는다. */
  readonly skippedIds: readonly string[];
}

/** 장면 하나에 놓기 — 끌어다 놓기의 기본 경로. */
export async function placeEvidenceInScene(input: {
  readonly threadId: string;
  readonly studentRef: string;
  readonly sceneId: string;
  readonly evidenceIds: readonly string[];
  readonly index?: number;
}): Promise<PlaceEvidenceResult> {
  const { threadId, studentRef, sceneId, evidenceIds, index } = input;
  return placeEvidenceInScenes({
    threadId,
    studentRef,
    groups: [{ sceneId, evidenceIds }],
    ...(index === undefined ? {} : { index }),
  });
}

/** 여러 장면에 한꺼번에 놓기 — AI 서사 초안 [적용]·뼈대 적용이 쓴다(주제 저장 1회). */
export async function placeEvidenceInScenes(
  input: PlaceEvidenceInput,
): Promise<PlaceEvidenceResult> {
  const { threadId, studentRef, groups, index } = input;
  const asked = [...new Set(groups.flatMap((g) => [...g.evidenceIds]))];
  if (asked.length === 0) return { placedIds: [], skippedIds: [] };
  const target = useInquiryThreadStore.getState().records.find((t) => t.id === threadId);
  if (target?.studentRef !== studentRef || target.status !== 'open') {
    return { placedIds: [], skippedIds: asked };
  }

  // ① 소유 정합 — 근거 파일 먼저. 이미 이 주제 것이면 아무 일도 하지 않는다.
  const evidenceStore = useRecordEvidenceStore.getState();
  // ★근거 파일에 없는 id 는 여기서 뺀다. 두면 `needMove` 에도 `failed` 에도 안 들어가
  //   "놓았다"고 세어진다(형제 함수 `applyNarrativeSuggestion` 은 이미 이렇게 거른다).
  const known = new Set(
    evidenceStore.records.filter((r) => r.studentRef === studentRef).map((r) => r.id),
  );
  const wanted = asked.filter((id) => known.has(id));
  const unknownIds = asked.filter((id) => !known.has(id));
  if (wanted.length === 0) return { placedIds: [], skippedIds: unknownIds };
  const needMove = evidenceStore.records
    .filter((r) => wanted.includes(r.id) && r.threadId !== threadId)
    .map((r) => r.id);

  let placedIds = wanted;
  let skippedIds: readonly string[] = unknownIds;
  if (needMove.length > 0) {
    // `moveToThread` 가 주제 존재·소유를 먼저 확인하고(주제 락) 한 번에 옮긴다(근거 락).
    const moved = await evidenceStore.moveToThread({
      studentRef,
      evidenceIds: needMove,
      threadId,
    });
    const failed = new Set(moved.skippedIds);
    placedIds = wanted.filter((id) => !failed.has(id));
    skippedIds = [...skippedIds, ...wanted.filter((id) => failed.has(id))];
  }
  if (placedIds.length === 0) return { placedIds: [], skippedIds };

  // ② 장면 삽입 — 주제 파일 한 번의 쓰기. 소유를 못 얻은 id 는 스토어가 다시 한번 거른다.
  // ★결과는 **스토어가 실제로 넣은 id** 로 센다. 보낸 것으로 세면 소유 읽기 실패·없는 장면에서
  //   화면이 "놓았습니다"라고 거짓말을 한다.
  const ok = new Set(placedIds);
  const inserted = await useInquiryThreadStore.getState().insertIntoScenes(
    threadId,
    groups.map((g) => ({
      sceneId: g.sceneId,
      evidenceIds: g.evidenceIds.filter((id) => ok.has(id)),
    })),
    index,
  );
  const done = new Set(inserted);
  return {
    placedIds: placedIds.filter((id) => done.has(id)),
    skippedIds: [...skippedIds, ...placedIds.filter((id) => !done.has(id))],
  };
}

/**
 * AI 서사 초안 [적용] — **근거 먼저, 장면 나중**을 그대로 지키며 한 덩어리로 넣는다(ADR-103 §5-5).
 *
 * ① 소유 정합(근거 파일 1회): 미분류·남의 줄기 근거를 이 주제로 옮긴다.
 * ② 뼈대·배치·메모·이음말(주제 파일 **1회**): `applyNarrativeDraft`.
 *
 * ★①이 실패한 근거는 ②에 넣지 않고 `skippedIds` 로 돌려준다. 보상 경로는 없다 — 카드는
 *   목표 주제의 "아직 안 놓음"에 있고 화면에 보인다.
 * ★[적용] 전에는 이 함수를 부르지 않는다. 점선은 화면 상태일 뿐이다(저장 0회).
 */
export async function applyNarrativeSuggestion(input: {
  readonly threadId: string;
  readonly studentRef: string;
  readonly frame: NarrativeFrameId;
  readonly scenes: readonly NarrativeDraftScene[];
  readonly link?: NarrativeLink | null;
}): Promise<NarrativeApplyResult> {
  const { threadId, studentRef, frame, scenes, link } = input;
  const asked = [...new Set(scenes.flatMap((sc) => [...sc.evidenceIds]))];
  const target = useInquiryThreadStore.getState().records.find((t) => t.id === threadId);
  if (target?.studentRef !== studentRef || target.status !== 'open') {
    return { placedIds: [], skippedIds: asked, applied: false };
  }
  const evidenceStore = useRecordEvidenceStore.getState();
  // ★모르는 근거 id 는 여기서 뺀다. 넣어 두면 "놓았다"고 셌다가 스토어가 조용히 버려 수가 어긋난다.
  const known = new Set(
    evidenceStore.records.filter((r) => r.studentRef === studentRef).map((r) => r.id),
  );
  const wanted = asked.filter((id) => known.has(id));

  let placedIds: readonly string[] = wanted;
  let skippedIds: readonly string[] = asked.filter((id) => !known.has(id));
  if (wanted.length > 0) {
    const needMove = evidenceStore.records
      .filter((r) => wanted.includes(r.id) && r.threadId !== threadId)
      .map((r) => r.id);
    if (needMove.length > 0) {
      const moved = await evidenceStore.moveToThread({
        studentRef,
        evidenceIds: needMove,
        threadId,
      });
      const failed = new Set(moved.skippedIds);
      placedIds = wanted.filter((id) => !failed.has(id));
      skippedIds = [...skippedIds, ...wanted.filter((id) => failed.has(id))];
    }
  }

  // ★소유를 하나도 못 얻었는데 근거를 놓으라고 했으면 ②를 하지 않는다 — 뼈대만 갈아엎고
  //   근거는 하나도 안 들어가면 교사가 짜 둔 배열을 잃기만 한다(파일 머리의 순서 규율).
  if (asked.length > 0 && placedIds.length === 0) {
    return { placedIds: [], skippedIds, applied: false };
  }

  const ok = new Set(placedIds);
  const written = await useInquiryThreadStore.getState().applyNarrativeDraft(threadId, {
    frame,
    scenes: scenes.map((sc) => ({
      ...sc,
      evidenceIds: sc.evidenceIds.filter((id: string) => ok.has(id)),
    })),
    ...(link === undefined ? {} : { link }),
  });
  // ★스토어가 **실제로 쓴 것**으로 센다. 주제가 그 사이 지워졌거나 근거 파일을 못 읽었으면
  //   장면은 비어 저장되는데 여기서 "근거 N건"이라고 세면 화면이 그대로 거짓말한다.
  const done = new Set(written.placedIds);
  return {
    placedIds: placedIds.filter((id) => done.has(id)),
    skippedIds: [...skippedIds, ...placedIds.filter((id) => !done.has(id))],
    applied: written.wrote,
  };
}
