/**
 * 주제(코드에서는 lane/줄기) 한 줄의 **화면 모델**(ADR-103 → ADR-107).
 *
 * 흐름 보기가 쓰던 것을 근거 지도가 그대로 이어받았다 — 주제 차례·접기·↑↓·앞 주제 이음·장면 풀이가 여기 있고,
 * 지도의 묶음(`EvidenceMapGroupModel`)은 이 모델에서 만들어진다. 부모(`RecordEvidenceBoard`)가 만들고 화면은 읽기만 한다.
 */
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { ResolvedScenes } from '@domain/rules/narrativeScenes';
import type { EmptyLinkCode } from '@domain/rules/threadSuggest';

export interface NarrativeLaneModel {
  readonly thread: InquiryThread;
  readonly resolved: ResolvedScenes<RecordEvidence>;
  /** 앞 주제. 있을 때만 위에 화살표(이음말)를 그린다. */
  readonly linkFrom?: { readonly thread: InquiryThread; readonly note?: string };
  readonly hints: readonly EmptyLinkCode[];
  /** 이어진 흐름의 길이. 2 이상일 때만 [이어진 흐름 전체로] 를 그린다. */
  readonly chainLength: number;
  readonly collapsed: boolean;
  /**
   * 주제 차례 ↑↓ — **이어진 묶음의 맨 앞 주제에만** 있다(묶음이 한 덩어리로 움직인다). 옮길 곳이 없으면(주제 하나) 없다.
   * `groupSize` 는 함께 움직이는 주제 수(자기 포함).
   */
  readonly move?: { readonly up: boolean; readonly down: boolean; readonly groupSize: number };
}
