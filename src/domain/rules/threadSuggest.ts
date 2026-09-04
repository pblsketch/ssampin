/**
 * 탐구 흐름(주제) 제안·줄기 구성 — 순수 함수.
 *
 * 왜 필요한가: 근거 창고의 분류 축은 생기부 영역 탭 하나뿐이라, 한 학생의 세특 탭에 근거 12건이
 * **한 줄로** 늘어서고 그 12건이 몇 개의 이야기인지는 교사 머릿속에만 있다. 그 상태로 AI 에 자루째
 * 넘기면 "활동 나열형" 세특이 나온다(`docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md`
 * §3·§5-3-b). 이 파일은 낱장을 주제로 묶는 것을 **거들기만** 한다.
 *
 * 불가침:
 *  - **AI 가 흐름을 만들지 않는다.** 여기 있는 것은 전부 문자열 포함 검사다(`matchedKeywords`).
 *    제안은 제안일 뿐이고 묶는 것은 교사가 한다.
 *  - **학생 경계를 넘지 않는다.** 모든 제안 함수는 `studentRef` 가 같은 것만 본다. Phase 2 에서
 *    "선택 슬롯이 다음 학생에게 옮겨 붙은" 사고가 실제로 있었고, 그 방어선을 화면에만 두지 않는다.
 *  - **점수·순위를 만들지 않는다.** 빈 고리 힌트는 "무엇이 비었나"를 적을 뿐 채움률을 세지 않는다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { InquiryThread } from '../entities/InquiryThread';
import type { EvidenceSourceType, RecordEvidence } from '../entities/RecordEvidence';
import { matchedKeywords } from './topicKeywordSources';

/* ──────────────────── 주제 소속 판정 ──────────────────── */

/**
 * 이 근거가 **실재하는** 주제에 묶여 있는가.
 *
 * ★고아 `threadId` 는 미분류로 본다. 동기화는 파일을 통째로 덮어쓰므로(snapshot) `record-evidence`
 * 와 `inquiry-threads` 가 서로 다른 시점에 내려올 수 있다. 그때 "없는 주제를 가리킨다"고 근거의
 * 소속을 지워 버리면 **아직 안 내려온 주제**와의 연결이 영구히 끊긴다. 지우지 말고 미분류로 **보여만** 준다.
 */
export function isClassified(
  evidence: Pick<RecordEvidence, 'threadId'>,
  existingThreadIds: ReadonlySet<string>,
): boolean {
  return evidence.threadId !== undefined && existingThreadIds.has(evidence.threadId);
}

/** 미분류(주제 없음 + 고아 포함) 근거만 골라낸다. 입력 순서 보존. */
export function unclassifiedEvidence(
  evidence: readonly RecordEvidence[],
  existingThreadIds: ReadonlySet<string>,
): RecordEvidence[] {
  return evidence.filter((e) => !isClassified(e, existingThreadIds));
}

/**
 * 한 학생의 미분류 근거 건수 — 창고 배지·관찰 알림 문구가 쓴다.
 * **건수만 센다.** 채움률·순위·점수판이 되지 않게 여기서 끝낸다.
 */
export function countUnclassified(
  evidence: readonly RecordEvidence[],
  studentRef: string,
  existingThreadIds: ReadonlySet<string>,
): number {
  return evidence.filter((e) => e.studentRef === studentRef && !isClassified(e, existingThreadIds))
    .length;
}

/* ──────────────────── "이것도 이 주제?" 제안 ──────────────────── */

/** 제안 1건 — 무엇이 겹쳤는지(matched)를 함께 준다. 교사가 근거를 보고 판단할 수 있어야 한다. */
export interface ThreadMatch {
  readonly threadId: string;
  readonly title: string;
  /** 본문에서 실제로 발견된 키워드. 비어 있으면 제안하지 않는다. */
  readonly matched: readonly string[];
}

/**
 * 이 근거 본문에 키워드가 든 **열린** 주제들 — 겹친 키워드가 많은 순.
 *
 * ★같은 학생의 주제만 본다. `studentRef` 가 다른 주제는 아예 후보에 오르지 않는다.
 * ★닫힌 주제는 제안하지 않는다 — 학기말에 닫아 둔 주제로 새 근거를 끌어들이면 되돌리기 번거롭다.
 */
export function suggestThreadsForEvidence(
  evidence: Pick<RecordEvidence, 'studentRef' | 'content'>,
  threads: readonly InquiryThread[],
): ThreadMatch[] {
  const out: ThreadMatch[] = [];
  for (const t of threads) {
    if (t.studentRef !== evidence.studentRef || t.status !== 'open') continue;
    const matched = matchedKeywords(evidence.content, t.keywords);
    if (matched.length === 0) continue;
    out.push({ threadId: t.id, title: t.title, matched });
  }
  // 많이 겹친 주제가 먼저. 동률이면 제목 오름차순(결정론 — 같은 입력에 같은 순서).
  return out.sort((a, b) =>
    b.matched.length !== a.matched.length
      ? b.matched.length - a.matched.length
      : a.title.localeCompare(b.title),
  );
}

/** "이것도 이 주제?" 후보 1건. */
export interface EvidenceMatch {
  readonly evidenceId: string;
  readonly matched: readonly string[];
}

/**
 * 이 주제의 키워드가 든 **미분류** 근거들 — 창고의 "이것도 이 주제?" 줄.
 *
 * ★키워드가 겹칠 때만 뜬다. 주제에 키워드가 하나도 없으면 결과는 빈 배열이다(아무거나 권하지 않는다).
 * ★같은 학생 것만 본다.
 */
export function suggestEvidenceForThread(
  thread: Pick<InquiryThread, 'id' | 'studentRef' | 'keywords'>,
  evidence: readonly RecordEvidence[],
  existingThreadIds: ReadonlySet<string>,
): EvidenceMatch[] {
  if (thread.keywords.length === 0) return [];
  const out: EvidenceMatch[] = [];
  for (const e of evidence) {
    if (e.studentRef !== thread.studentRef) continue;
    if (isClassified(e, existingThreadIds)) continue;
    const matched = matchedKeywords(e.content, thread.keywords);
    if (matched.length === 0) continue;
    out.push({ evidenceId: e.id, matched });
  }
  return out;
}

/* ──────────────────── 시간순 줄기 ──────────────────── */

/** 줄기의 마디 하나 — 화면이 한 줄로 그린다. */
export interface ThreadTimelineNode {
  readonly evidenceId: string;
  /** 근거 일자(YYYY-MM-DD). 없을 수 있다 — 날짜 없는 근거도 줄기에서 빠지면 안 된다. */
  readonly date?: string;
  /** 이 마디의 갈래 라벨(관찰 슬롯 첫 번째). 없으면 표시하지 않는다. */
  readonly slot?: string;
  readonly slots: readonly string[];
  readonly content: string;
  /** 출처 종류. 미지정 근거는 `manual` 로 본다(엔티티 규약과 같다). */
  readonly sourceType: EvidenceSourceType;
}

/**
 * 근거를 **시간순**으로 세운다 — 흐름 화면의 줄기.
 *
 * ★날짜 없는 근거는 버리지 않고 **뒤로** 보낸다. 끌어온 성취도·직접 입력에는 날짜가 없는 것이
 * 흔한데, 그걸 빠뜨리면 교사가 "왜 하나가 사라졌지"를 겪는다.
 * ★같은 날짜는 `createdAt` 오름차순 — 같은 날 여러 건을 적은 순서가 곧 이야기 순서다.
 */
export function buildThreadTimeline(evidence: readonly RecordEvidence[]): ThreadTimelineNode[] {
  return [...evidence]
    .sort((a, b) => {
      const ad = a.date ?? '';
      const bd = b.date ?? '';
      if (ad !== bd) {
        if (ad === '') return 1; // 날짜 없는 것은 뒤로
        if (bd === '') return -1;
        return ad < bd ? -1 : 1;
      }
      return a.createdAt - b.createdAt;
    })
    .map((e) => {
      const slots = e.slots ?? [];
      const node: ThreadTimelineNode = {
        evidenceId: e.id,
        slots,
        content: e.content,
        sourceType: e.sourceType ?? 'manual',
        ...(e.date !== undefined ? { date: e.date } : {}),
        ...(slots[0] !== undefined ? { slot: slots[0] } : {}),
      };
      return node;
    });
}

/* ──────────────────── 빈 고리 힌트 ──────────────────── */

/** 빈 고리 힌트 코드 — 라벨은 `EMPTY_LINK_LABELS`. */
export type EmptyLinkCode = 'single_question' | 'no_trial_error' | 'no_evaluation_after_output';

/**
 * 힌트 문구 — **경고가 아니라 다음 수업에 무엇을 물어볼지의 실마리**다.
 * 좋은 세특은 질문으로 이어진 하나의 서사이고(K3·K4), 빈 고리는 그 서사에서 빠진 고리를 가리킨다.
 */
export const EMPTY_LINK_LABELS: Readonly<Record<EmptyLinkCode, string>> = {
  single_question: '질문이 하나뿐이에요',
  no_trial_error: '시행착오가 없어요',
  no_evaluation_after_output: '산출물 뒤 평가가 없어요',
};

/** 힌트에 곁들이는 한 줄 — 무엇을 하면 되는지. */
export const EMPTY_LINK_HELPS: Readonly<Record<EmptyLinkCode, string>> = {
  single_question: '첫 질문에서 이어진 두 번째 궁금증이 있었는지 떠올려 보세요.',
  no_trial_error: '무엇에 막혔고 어떻게 넘었는지가 들어가면 이야기가 깊어집니다.',
  no_evaluation_after_output: '산출물을 보고 선생님이 무엇을 눈여겨봤는지 남겨 보세요.',
};

const SLOT_QUESTION = '질문';
const SLOT_TRIAL_ERROR = '시행착오';
const SLOT_OUTPUT = '산출물';

function hasSlot(node: ThreadTimelineNode, slot: string): boolean {
  return node.slots.includes(slot);
}

/**
 * 줄기에서 빠진 고리를 찾는다. **비어 있으면 아무것도 돌려주지 않는다**(칭찬도 하지 않는다).
 *
 * 규칙:
 *  - `single_question` — `질문` 갈래 마디가 1개 이하. 마디가 아예 없는(=빈) 흐름은 제외한다.
 *    아직 아무것도 안 담은 새 주제에 대고 "질문이 하나뿐"이라고 하면 재촉이 된다.
 *  - `no_trial_error` — `시행착오` 갈래가 0개. 마디가 3개 이상 쌓인 뒤에만 본다(초반엔 당연히 없다).
 *  - `no_evaluation_after_output` — `산출물` 마디가 있는데 그 **뒤(같은 날 포함)** 로 평가 근거가 없다.
 *    평가 = 루브릭 채점·성적에서 끌어온 근거(`sourceType === 'evaluation'`).
 */
export function emptyLinkHints(nodes: readonly ThreadTimelineNode[]): EmptyLinkCode[] {
  if (nodes.length === 0) return [];
  const out: EmptyLinkCode[] = [];

  const questionCount = nodes.filter((n) => hasSlot(n, SLOT_QUESTION)).length;
  if (questionCount <= 1) out.push('single_question');

  if (nodes.length >= 3 && !nodes.some((n) => hasSlot(n, SLOT_TRIAL_ERROR))) {
    out.push('no_trial_error');
  }

  const outputs = nodes.filter((n) => hasSlot(n, SLOT_OUTPUT));
  if (outputs.length > 0) {
    // 산출물 중 가장 이른 것 뒤에 평가가 하나라도 있으면 통과. 날짜가 없으면 줄기 순서로 본다.
    const firstOutputIdx = nodes.indexOf(outputs[0]!);
    const hasLaterEvaluation = nodes
      .slice(firstOutputIdx)
      .some((n) => n.sourceType === 'evaluation');
    if (!hasLaterEvaluation) out.push('no_evaluation_after_output');
  }

  return out;
}

/* ──────────────────── 교사 역량 키워드 ──────────────────── */

/**
 * 역량 키워드에 **분야가 붙어 있는가**. 붙어 있지 않으면 화면이 부드럽게 권한다.
 *
 * 좋은 세특의 끝은 교사의 평가적 기술인데(K4), "자료 해석력"만 적으면 어느 학생 학생부에 옮겨도
 * 말이 된다(K14). "경제 현상에 대한 자료 해석력"처럼 **분야를 붙인 형태**여야 그 학생의 것이 된다.
 * ★판정일 뿐 **막지 않는다.** 교사가 그냥 적으면 그대로 저장된다.
 */
export function competencyKeywordHasField(keyword: string): boolean {
  const k = keyword.trim();
  if (k.length === 0) return false;
  return /(에 대한|에 관한|에서의|을 통한|를 통한)\s*\S/.test(k);
}

/** 역량 키워드 칸의 예시 문구 — 과목이 있으면 그 과목으로 예를 든다. */
export function competencyKeywordExample(subject?: string): string {
  const field = subject && subject.trim().length > 0 ? subject.trim() : '경제 현상';
  return `예: ${field}에 대한 자료 해석력`;
}
