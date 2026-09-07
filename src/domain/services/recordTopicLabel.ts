import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';

/**
 * 원본 기록이 지금 어느 주제에 속해 있는지(계획 §4.3).
 *
 * ★판정 근거는 **원본의 threadId 가 아니라 저장된 근거**다. 주제 소속의 정본은
 *   `RecordEvidence.threadId` 하나이고(계획 원칙 2), 원본에 남아 있는 옛 threadId 는
 *   지금 상태가 아닐 수 있다. 원본 값을 임의로 지우지도 않는다.
 */
export type RecordTopicStatus =
  /** 근거로 올린 적이 없거나, 올렸지만 아직 미분류. */
  | { readonly kind: 'none' }
  | { readonly kind: 'thread'; readonly threadId: string; readonly title: string }
  /**
   * 근거는 주제를 가리키는데 그 주제를 찾을 수 없다(다른 기기에서 지웠거나 아직 안 왔다).
   * ★"주제가 없다"고 단정하지 않는다. 화면은 '주제 확인 중'으로 말하고 값을 지우지 않는다.
   */
  | { readonly kind: 'unknown-thread'; readonly threadId: string };

/**
 * 이 학생의 이 원본에서 온 근거를 찾아 주제 소속을 판정한다.
 *
 * `studentRef` 로 한 번 더 거른다 - sourceId 만으로 찾으면 다른 학생의 근거를 집을 수 있다.
 */
export function resolveRecordTopic(
  sourceId: string,
  studentRef: string,
  evidence: readonly RecordEvidence[],
  threads: readonly InquiryThread[],
): RecordTopicStatus {
  const mine = evidence.find((e) => e.sourceId === sourceId && e.studentRef === studentRef);
  if (!mine || mine.threadId === undefined) return { kind: 'none' };
  const thread = threads.find((t) => t.id === mine.threadId);
  if (!thread) return { kind: 'unknown-thread', threadId: mine.threadId };
  return { kind: 'thread', threadId: thread.id, title: thread.title };
}
