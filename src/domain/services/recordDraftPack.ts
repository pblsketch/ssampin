/**
 * 생기부 초안 근거 꾸러미 — AI 에 보낼 것을 **여기서 한 번에** 정한다(순수).
 *
 * ★왜 프롬프트가 아니라 여기인가: 실측에서 금지 항목을 시스템 프롬프트에 전부 열거하고
 * 사용자 턴 끝에서 다시 강조해도 모델이 세특 본문에 그대로 옮겨 적었다(2/2 실패,
 * 보강 후에도 2/2 실패 — `docs/03-analysis/record-draft-solar-quality.analysis.md` §3-2).
 * **안 보내면 못 쓴다.** 그래서 조립 단계에서 걸러 낸다(ADR-072 결정 5).
 *
 * ★공급자와 무관하다. 쌤핀 AI 든 선생님 구독 CLI 든 같은 꾸러미를 받는다 — 모델이 좋아졌다고
 * 이 차단을 느슨하게 하지 않는다.
 *
 * ★성취기준은 **키워드만** 넣는다(원문 금지).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import {
  detectProhibitedTerms,
  rewriteHintFor,
  substituteProhibited,
  summarizeProhibited,
  type ProhibitedHit,
} from '../rules/prohibitedRecordTerms';
import { createMaskSession } from '../privacy/maskEngine';
import type { KeywordGroup, MaskMapping } from '../privacy/types';
import { redactQuestion } from '../rules/redactOutbound';
import { sortByEvidenceOrder } from '../rules/evidenceOrder';
import {
  NARRATIVE_MARK_INSTRUCTION,
  hasAnyRole,
  narrativeMarkInstruction,
  parseNarrativeParagraphs,
  stripNarrativeMarks,
} from '../rules/narrativeParagraphs';
import type { RecordWritingStyle } from '../entities/RecordWritingStyle';
import {
  buildStyleInstruction,
  resolveComposition,
  type ResolvedComposition,
} from '../rules/recordStyleCompose';
import { neisByteLength } from '../entities/RecordDraft';
import {
  aliasByteDelta,
  charsForBytes,
  countSentences,
  goalFloor,
  isRichEvidence,
  isThinEvidence,
  modelFloorBytes,
  modelTargetBytes,
  INSUFFICIENT_MARK,
  type LengthAdjustKind,
} from '../rules/recordLengthGoal';
import type { EvidenceLink } from '../entities/RecordEvidence';
import { orderForDraft, resolveEvidenceEdges, type EvidenceEdge } from '../rules/evidenceGraph';

/** 꾸러미에 넣을 근거 한 건(엔티티 전체가 아니라 필요한 것만 받는다). */
export interface DraftPackEvidence {
  readonly id: string;
  /** 근거 원문. **여기서** 가린다 — 부르는 쪽이 가려 줄 것이라 믿지 않는다(UltraQA P0). */
  readonly content: string;
  readonly date?: string;
  /**
   * 적힌 시각 — **날짜가 같거나 없을 때의 순서**를 정한다(§P0). 없으면 맨 뒤로 민다.
   * ★`RecordEvidence` 는 이 칸을 필수로 갖고 있어 호출부가 근거를 그대로 넘기면 저절로 실린다.
   */
  readonly createdAt?: number;
  /**
   * 선생님이 이 근거에서 읽은 것(ADR-103). **해석이라 근거보다 약하게 다룬다** —
   * 금지어가 남으면 메모만 빼고 근거는 싣는다.
   */
  readonly note?: string;
  /** 선생님이 "AI 에 보내지 않기"로 표시한 근거. */
  readonly excludedFromAi?: boolean;
  /**
   * 근거 지도의 연결(ADR-106) — 이 근거에서 다른 근거로. `RecordEvidence` 를 그대로 넘기면 저절로 실린다.
   * ★꾸러미가 스스로 푼다(`resolveEvidenceEdges`): 양 끝이 이 꾸러미에 실린 연결만 「근거 사이 연결」 줄이 된다.
   * ★연결이 하나도 없으면 요청서는 예전과 글자 하나까지 같다.
   */
  readonly links?: readonly EvidenceLink[];
}

export interface DraftPackInput {
  /**
   * 학생 **실명**. 꾸러미 안에서 별칭으로 바뀐다 — 이 값 자체는 절대 밖으로 나가지 않는다.
   *
   * ★예전에는 부르는 쪽이 별칭을 만들어 넘겼고 근거 본문은 그대로 실렸다. 그래서 근거에
   *   적힌 "김지훈과 박서연이 모둠에서…" 같은 **다른 학생 실명**이 그대로 나갔다(UltraQA P0).
   *   이제 이름·근거·주제·지시를 **한 세션으로 함께** 가린다 — 같은 학생은 같은 별칭이다.
   */
  readonly studentName: string;
  /** 실명·학번을 찾아 가릴 명단(`rosterFromAll`). 이 학생도 여기 들어 있어야 한다. */
  readonly roster: readonly KeywordGroup[];
  /** 영역 이름(교과 세특·행동특성 등). */
  readonly areaLabel: string;
  /**
   * 과목 이름(교과 영역일 때). 낱말을 고르는 맥락으로만 쓰고, **본문에 옮겨 적지는 않는다** —
   * 생활기록부에는 어느 과목인지가 항목에 이미 적혀 있다(오너 검토 2026-09-09: 예시 7편 모두
   * 수업 언급이 없었다). 본문 금지는 1층 규정이 맡는다. 없으면 줄 자체가 안 붙는다.
   */
  readonly subject?: string;
  /** 고른 탐구 주제(없으면 전체 근거). */
  readonly threadTitle?: string;
  /**
   * 고른 주제에 선생님이 적어 둔 것 — 매칭 키워드·역량 낱말·다음 탐구 메모.
   *
   * ★이름만 보내던 것을 넓힌다. 역량 낱말은 **선생님이 적은 평가 어휘**라 모델이 지어낸 낱말보다
   *   낫고, 다음 탐구 메모는 "남은 질문"이라 결과 문단의 재료가 된다.
   * ★전부 자유 글이다 — 학생 이름이 섞일 수 있으니 본문과 **같은 세션으로** 가린다.
   * ★주제를 고르지 않았으면 아예 붙지 않는다.
   */
  readonly threadNote?: {
    readonly keywords?: readonly string[];
    readonly competencyKeywords?: readonly string[];
    readonly nextNotes?: string;
  };
  readonly evidences: readonly DraftPackEvidence[];
  /** 성취기준 **키워드**만. 원문을 넣지 않는다. */
  readonly standardKeywords?: readonly string[];
  /** 선생님이 따로 적어 둔 지시(2층 프롬프트). */
  readonly teacherPrompt?: string;
  /**
   * 선생님이 고른 **작성 방식**(ADR-099). 없거나 기본값이면 「작성 구성」 블록을 붙이지 않는다 —
   * 그때 요청서는 이 기능이 생기기 전과 **글자 하나까지 같다.**
   *
   * ★판본 문지기(`applyPromptVersionGate`)를 이미 통과한 값이어야 한다. 서버 규정이 아직 새 구성을
   *   못 받는 판본이면 부르는 쪽이 기존형으로 되돌려서 넘긴다 — 여기서 판본을 알 방법이 없다.
   */
  readonly style?: RecordWritingStyle;
  /**
   * 장면에서 만든 「작성 구성」(ADR-103). **판본 문지기를 이미 통과한 값**이어야 한다.
   *
   * ★있으면 `style` 보다 **우선한다** — 장면을 짠 선생님에게 작성 방식 블록을 함께 보내면
   *   서로 싸우는 두 지시가 나간다.
   * ★`null`·부재면 예전 경로 그대로다.
   */
  readonly composition?: ResolvedComposition;
  /**
   * 장면 목록 — 어떤 근거가 어느 문단으로 가는지. **배치된 근거가 0건이면 넘기지 않는다**
   * (그때는 근거 줄을 예전 방식으로 그린다 = 근거 관문).
   */
  readonly scenes?: readonly DraftPackScene[];
  /**
   * 이어진 주제 전체로 쓸 때의 앞뒤 주제들(`chainOf` 순서). 첫 항목이 가장 앞 주제다.
   * ★분량 예산을 주제 수로 나눈다 — 앞 주제가 다 먹으면 뒷이야기가 통째로 빠진다.
   */
  readonly chain?: readonly DraftPackChainItem[];
  /**
   * 선생님이 정한 분량 목표(바이트)와 그 영역의 **기재요령 기본 한도**.
   * 목표가 있으면 **언제나** 분량 줄을 붙이고(ADR-110), 목표가 기본 한도와 다르면 그 사정을 한 줄 덧붙인다.
   * ★예전에는 목표 = 기본 한도이면 줄을 안 붙이고 "한도 분량은 1층 규정이 이미 말한다"고 적었는데, 1층 규정에는
   *   바이트 한도가 없었다(2026-09-11 확인). 모델은 분량을 모른 채 근거를 다 담으려 했고, 근거가 많을수록 넘쳤다.
   * ★목표를 주지 않으면 요청서는 예전과 글자 하나까지 같다(기준선 픽스처).
   */
  readonly targetBytes?: number;
  readonly limitBytes?: number;
}

/** 요청서에 그릴 장면 하나. 표식(`mark`)은 언제나 4종이다(틀 이름은 화면 전용). */
export interface DraftPackScene {
  readonly sceneId: string;
  readonly mark: string;
  readonly label: string;
  /** 선생님이 이 장면에서 읽은 것. 자유 글이라 가린다. */
  readonly note?: string;
  /** 앞 장면에서 이 장면으로 넘어가는 이음말(ADR-108). 첫 장면에는 없다. 자유 글이라 가린다. */
  readonly leadIn?: string;
  readonly evidenceIds: readonly string[];
}

/** 이어진 주제 하나 — 이 주제의 장면·근거와, 앞 주제에서 이어지는 이음말. */
export interface DraftPackChainItem {
  readonly threadTitle: string;
  /** 앞 주제에서 이어질 때 선생님이 적은 말. 첫 주제에는 없다. */
  readonly linkNote?: string;
  readonly scenes: readonly DraftPackScene[];
  readonly evidences: readonly DraftPackEvidence[];
}

/** 왜 빠졌는지 — 화면이 "제외됨 N건"과 사유를 보여 준다. */
export type DraftPackExclusionReason = 'teacher' | 'prohibited' | 'empty' | 'too-long';

/**
 * 근거를 실을 수 있는 글자 수 상한.
 *
 * ★윈도우는 프로그램에 넘기는 명령줄 전체가 32,767자를 넘으면 **실행 자체가 실패한다.**
 * 꾸러미는 그 명령줄에 실려 가므로, 넘치면 "실행이 도중에 멈췄어요"라는 엉뚱한 안내가
 * 뜨고 다시 눌러도 똑같이 실패한다. 그래서 넘칠 근거를 미리 빼고 **뺐다고 말한다.**
 *
 * 12,000자는 한 학생분 근거로는 넉넉하고(관찰 기록 수십 건), 나머지 20,000자를
 * 작성 규정과 실행 옵션 몫으로 남긴다.
 */
export const DRAFT_PACK_MAX_EVIDENCE_CHARS = 12_000;

/**
 * 이어진 흐름 하나에 담을 수 있는 주제 수.
 * ★넘치면 먼 쪽(앞)부터 떨어뜨린다 — 사슬이 길수록 앞 이야기는 배경이고 뒤가 본론이다.
 */
export const DRAFT_PACK_MAX_CHAIN_THREADS = 3;

export interface DraftPackExclusion {
  readonly evidenceId: string;
  readonly reason: DraftPackExclusionReason;
  /** 기재 금지로 빠진 경우, 어떤 갈래였는지(한국어 라벨). */
  readonly categories?: readonly string[];
  /** 선생님이 직접 고쳐 살릴 수 있으면 그 방법. 없으면 부재. */
  readonly hint?: string;
}

/** 낱말만 바꿔 살린 근거 한 건 — 화면이 "무엇을 무엇으로 바꿨는지" 보여 준다. */
export interface DraftPackSubstitution {
  readonly evidenceId: string;
  readonly from: string;
  readonly to: string;
}

export interface DraftPack {
  /** 모델에게 보낼 사용자 턴 본문. 실명이 없다. */
  readonly text: string;
  /** 이 학생을 가리키는 별칭(본문 첫 줄과 같다). */
  readonly studentAlias: string;
  /**
   * 별칭 ↔ 실명. 답이 오면 되돌리는 데 쓴다.
   * ★개인정보다 — 화면 상태나 파일에 저장하지 않고, 이 실행이 끝나면 버린다.
   */
  readonly mappings: readonly MaskMapping[];
  /** 실제로 실린 근거 수. */
  readonly includedCount: number;
  readonly exclusions: readonly DraftPackExclusion[];
  /**
   * 금지어를 대체어로 바꿔 **살린** 근거들. 비어 있지 않으면 화면이 반드시 보여 준다 —
   * 조용히 말을 바꾸면 선생님이 적은 것과 다른 글이 나간 줄 모른다(ADR-099 보강 4).
   */
  readonly substitutions: readonly DraftPackSubstitution[];
  /**
   * 금지어 때문에 **메모만** 빠진 근거 수(근거 본문은 실렸다). 0 보다 크면 화면이 알린다 —
   * 조용히 빼면 선생님이 적은 해석이 안 나간 줄 모른다.
   */
  readonly droppedNoteCount: number;
  /** 요청서에 실린 「근거 사이 연결」 수(양 끝이 다 실린 것만). 화면이 "연결 N건을 따라 차례를 정했습니다"로 알린다. */
  readonly linkCount: number;
  /** 연결이 서로 맞물려(고리) 일부를 날짜순으로 돌렸는가. 조용히 넘기지 않고 화면이 말한다. */
  readonly cyclicLinks: boolean;
}

export const DRAFT_PACK_EXCLUSION_LABELS: Readonly<Record<DraftPackExclusionReason, string>> = {
  teacher: '선생님이 보내지 않기로 표시함',
  prohibited: '기재 금지 항목이 들어 있음',
  empty: '내용이 비어 있음',
  'too-long': '한 번에 보낼 수 있는 분량을 넘음',
};

/** 근거 한 건을 모델에게 보낼 수 있게 손질한 결과. 줄 조립은 꾸러미마다 따로 한다. */
export interface PreparedEvidence {
  readonly id: string;
  /** 가리고 대체어까지 적용한 본문. `null` 이면 이 근거는 못 보낸다(`exclusion` 을 본다). */
  readonly content: string | null;
  /** 보낼 수 있는 교사 메모(가림·대체 통과). 메모만 걸렸으면 `null` 이고 근거는 살아 있다. */
  readonly note: string | null;
  /** 메모가 금지어 때문에 빠졌는가 — 화면이 "메모 N건이 빠졌습니다" 로 알린다. */
  readonly noteDropped: boolean;
  readonly exclusion?: DraftPackExclusion;
  readonly substitutions: readonly DraftPackSubstitution[];
}

/**
 * 근거 한 건의 **안전 판정**을 한 곳에서 한다 — 가리기·금지어 대체·재검사·메모 처리.
 *
 * ★왜 공용인가: 초안·분량 조절·AI 분류 제안 세 꾸러미가 같은 근거를 서로 다르게 다루면,
 *   한 화면에서 걸러진 것이 다른 화면에서 그대로 나간다. 실명이 CLI 로 나간 사고가 그런 모양이었다.
 * ★**줄 조립은 여기서 하지 않는다.** 꾸러미마다 번호·머리·형식이 다르고, 그것까지 합치면
 *   분류 제안의 필터가 조용히 느슨해진다.
 * ★메모는 근거보다 약하게 다룬다: 금지어가 남으면 **메모만 빼고 근거는 싣는다.**
 *   메모는 해석이라 없어도 근거는 쓸모가 있고, 통째로 빼면 선생님이 적은 사실까지 사라진다.
 */
export function prepareEvidenceForModel(
  e: DraftPackEvidence,
  mask: (text: string) => string,
  opts: { readonly allowSubstitution?: boolean } = {},
): PreparedEvidence {
  const base = { id: e.id, substitutions: [] as DraftPackSubstitution[] };
  if (e.excludedFromAi === true) {
    return {
      ...base,
      content: null,
      note: null,
      noteDropped: false,
      exclusion: { evidenceId: e.id, reason: 'teacher' },
    };
  }
  const raw = e.content.trim();
  if (raw.length === 0) {
    return {
      ...base,
      content: null,
      note: null,
      noteDropped: false,
      exclusion: { evidenceId: e.id, reason: 'empty' },
    };
  }

  // 기재 금지 검사는 **원문**으로 한다 — 가린 뒤에는 단어가 바뀌어 못 잡을 수 있다.
  const allowSub = opts.allowSubstitution !== false;
  const rescued = allowSub ? substituteProhibited(raw) : { text: raw, applied: [] };
  const usable = rescued.applied.length > 0 && detectProhibitedTerms(rescued.text).length === 0;
  if (!usable) {
    const hits = detectProhibitedTerms(raw);
    if (hits.length > 0) {
      const hint = rewriteHintFor(hits);
      return {
        ...base,
        content: null,
        note: null,
        noteDropped: false,
        exclusion: {
          evidenceId: e.id,
          reason: 'prohibited',
          categories: hitsToCategories(hits),
          ...(hint.length > 0 ? { hint } : {}),
        },
      };
    }
  }
  const substitutions = usable
    ? rescued.applied.map((sub) => ({ evidenceId: e.id, from: sub.from, to: sub.to }))
    : [];

  // 메모 — 같은 검사를 거치되, 남으면 **메모만** 뺀다.
  const rawNote = e.note?.trim() ?? '';
  let note: string | null = null;
  let noteDropped = false;
  if (rawNote.length > 0) {
    const n = allowSub ? substituteProhibited(rawNote) : { text: rawNote, applied: [] };
    const noteOk = detectProhibitedTerms(n.text).length === 0;
    if (noteOk) {
      note = mask(n.text);
      for (const sub of n.applied)
        substitutions.push({ evidenceId: e.id, from: sub.from, to: sub.to });
    } else {
      noteDropped = true;
    }
  }

  return {
    id: e.id,
    content: mask(usable ? rescued.text : raw),
    note,
    noteDropped,
    substitutions,
  };
}

function hitsToCategories(hits: readonly ProhibitedHit[]): readonly string[] {
  return summarizeProhibited(hits);
}

/**
 * 요청서에 실을 근거의 **정본 순서** — 규칙 층의 `compareEvidenceOrder` 를 그대로 쓴다.
 *
 * ★왜 정렬하는가: 실측에서 초안 품질을 가른 것은 근거의 양이 아니라 **줄기 순서로 정렬돼 있는가**
 *   였다(ADR-083). 그런데 지금까지 요청서는 파일에 저장된 순서를 그대로 실었다 — 화면의 줄기는
 *   날짜순인데 모델이 받는 순서는 달랐다.
 * ★부르는 쪽에서 정렬하지 않는다. 새 화면이 하나 생길 때마다 정렬을 잊는 자리가 하나씩 늘어난다.
 * ★**부수 효과가 하나 있다**: 분량 상한(`DRAFT_PACK_MAX_EVIDENCE_CHARS`)은 앞에서부터 채우므로
 *   순서가 바뀌면 **잘리는 근거도 바뀐다.** 근거가 아주 많은 학생에서만 드러나고, 화면은 지금도
 *   "제외됨 N건"과 사유를 보여 준다.
 */
export function sortEvidencesForPack<T extends DraftPackEvidence>(
  evidences: readonly T[],
): readonly T[] {
  return sortByEvidenceOrder(evidences);
}

/**
 * 근거 꾸러미를 조립한다.
 *
 * 빠지는 순서(먼저 걸리는 것이 사유가 된다):
 * 1. 선생님이 직접 뺀 것
 * 2. 내용이 빈 것
 * 3. 기재 금지 항목이 들어 있는 것
 * 4. 앞의 근거들로 이미 분량이 차 버린 것
 *
 * 문장 마지막에 **근거로 되짚기** 지시를 붙인다 — 실측에서 이 지시를 뒤쪽에 두었을 때만
 * 모델이 얇은 근거로 지어내기를 멈췄다(같은 분석 문서 §3-1, 최신성 효과).
 */
/** 근거 목록을 한 덩어리로 싣는 결과 — 줄·번호·제외를 함께 돌려준다. */
interface RenderedEvidence {
  readonly lines: readonly string[];
  /** 근거 id → 요청서에 실제로 붙은 번호. **실린 줄에만** 번호를 준다. */
  readonly numberOf: ReadonlyMap<string, number>;
  readonly usedChars: number;
  readonly droppedNotes: number;
  /**
   * 실린 근거 글(가린 뒤 본문 + 교사 메모)의 바이트 합 — 번호·날짜·머리말은 빼고 센다.
   * 요청서가 "근거가 목표에 비해 빈약하다"를 숫자로 알리는 재료다(ADR-110 보강 2).
   */
  readonly textBytes: number;
}

/**
 * 근거를 줄로 그린다.
 *
 * ★번호는 **실제로 실린 줄에만** 매긴다. 빠진 근거에도 번호를 세면 「작성 구성」이 없는 번호를
 *   가리키게 되고, 모델은 그 자리를 채우려 근거 밖 내용을 지어낸다.
 * ★`numbered` 가 거짓이면 예전과 같은 `- (날짜) 본문` 형식이다(근거 관문이 꺼진 경로).
 */
function renderEvidences(
  evidences: readonly DraftPackEvidence[],
  ctx: {
    readonly mask: (t: string) => string;
    readonly numbered: boolean;
    readonly budget: number;
    readonly startChars?: number;
    readonly startNumber?: number;
    readonly exclusions: DraftPackExclusion[];
    readonly substitutions: DraftPackSubstitution[];
    /** 참이면 넘어온 차례 그대로(연결을 따라 이미 정렬된 목록). 거짓이면 날짜순. */
    readonly keepOrder?: boolean;
  },
): RenderedEvidence {
  const lines: string[] = [];
  const numberOf = new Map<string, number>();
  let usedChars = ctx.startChars ?? 0;
  let n = ctx.startNumber ?? 1;
  let droppedNotes = 0;
  let textBytes = 0;
  for (const e of ctx.keepOrder === true ? evidences : sortEvidencesForPack(evidences)) {
    const prepared = prepareEvidenceForModel(e, ctx.mask);
    if (prepared.exclusion !== undefined) {
      ctx.exclusions.push(prepared.exclusion);
      continue;
    }
    ctx.substitutions.push(...prepared.substitutions);
    if (prepared.noteDropped) droppedNotes += 1;
    const head = ctx.numbered ? `${n}. ` : '- ';
    const date = e.date ? `(${e.date}) ` : '';
    const note = prepared.note === null ? '' : ` (교사 메모: ${prepared.note})`;
    const line = `${head}${date}${prepared.content ?? ''}${note}`;
    if (usedChars + line.length > ctx.budget) {
      // 여기서 멈추지 않고 계속 도는 이유: 뒤에 짧은 근거가 있으면 그건 실을 수 있다.
      ctx.exclusions.push({ evidenceId: e.id, reason: 'too-long' });
      continue;
    }
    usedChars += line.length + 1; // 줄바꿈 몫
    lines.push(line);
    // 근거의 양은 **실린 글만**, 번호·날짜·머리말 없이 센다 — 모델이 쓸 수 있는 사실의 양이다.
    textBytes +=
      neisByteLength(prepared.content ?? '') +
      (prepared.note === null ? 0 : neisByteLength(prepared.note));
    if (ctx.numbered) numberOf.set(e.id, n);
    n += 1;
  }
  return { lines, numberOf, usedChars, droppedNotes, textBytes };
}

/**
 * 비어 있는 평가 자리에 붙이는 줄(ADR-109). 선생님이 평가 근거를 따로 적어 두는 일은 드물다 —
 * 그래서 빈 평가는 "건너뛰기"가 아니라 **실린 근거 전체를 종합해 교사 판단을 쓰라**는 뜻이다.
 * ★머리글("근거가 없는 항목은 통째로 건너뛰고")과 부딪히므로 예외라고 **글로** 말한다.
 * ★"보태지 않는다"를 짝으로 둔다 — 종합하라는 말만 하면 근거 밖 칭찬이 는다.
 * ★화면 안내(`evaluationGuide.ts`)가 이 동작을 약속한다. 한쪽을 바꾸면 다른 쪽도 볼 것.
 */
export const EVALUATION_SYNTHESIZE_REF =
  '근거: 따로 두지 않음 - 이 항목은 건너뛰지 않습니다. 위에 실린 근거 전체를 종합해 교사 판단을 쓰고, 근거에 없는 사실은 보태지 않습니다.';

/**
 * 「작성 구성」 줄에 붙일 근거 번호 — **실린 것만.** 하나도 안 실렸으면 `(제외됨)` 이라고 적고
 * 모델에게 그 문단은 건너뛰어도 된다고 말한다. 평가 자리만 예외다(`EVALUATION_SYNTHESIZE_REF`) —
 * 비어 있든, 놓은 근거가 금지어로 빠졌든 평가 문단은 빠지지 않는다.
 */
function sceneEvidenceRef(
  scene: DraftPackScene,
  numberOf: ReadonlyMap<string, number>,
  role: ResolvedComposition['modules'][number]['role'] | undefined,
): string {
  const nums = scene.evidenceIds
    .map((id) => numberOf.get(id))
    .filter((x): x is number => x !== undefined);
  if (nums.length > 0) return `근거: ${nums.join(', ')}`;
  return role === 'evaluation'
    ? EVALUATION_SYNTHESIZE_REF
    : '근거: (제외됨 - 이 문단은 건너뜁니다)';
}

/**
 * 장면으로 만든 「작성 구성」 — `buildStyleInstruction` 위에 **어느 근거를 쓸지**와
 * **선생님이 읽은 것**을 얹는다.
 *
 * ★번호는 `numberOf` 가 쥐고 있다(실린 줄에만 있는 번호). 빠진 근거를 가리키지 않는다.
 * ★장면 메모는 자유 글이라 여기서 가린다.
 */
function buildSceneInstruction(
  composition: ResolvedComposition,
  scenes: readonly DraftPackScene[],
  numberOf: ReadonlyMap<string, number>,
  mask: (t: string) => string,
): string {
  const base = buildStyleInstruction(composition);
  const lines = base.split('\n');
  const out: string[] = [];
  let at = 0;
  for (const line of lines) {
    out.push(line);
    // 번호 줄(`1. [평가] …`) 바로 아래에 그 장면의 근거·메모를 붙인다.
    const m = /^(\d+)\. \[/.exec(line);
    if (m === null) continue;
    const scene = scenes[at];
    // 구성의 요소는 장면 차례 그대로 만들어진다(`resolveCompositionFromScenes`) — 역할은 요소에서 읽는다.
    const role = composition.modules[at]?.role;
    at += 1;
    if (scene === undefined) continue;
    out.push(`   · ${sceneEvidenceRef(scene, numberOf, role)}`);
    const note = scene.note?.trim() ?? '';
    if (note.length > 0) out.push(`   · 선생님이 읽은 것: ${mask(note)}`);
    // 첫 장면(at === 1)에는 앞 장면이 없으므로 이음말을 싣지 않는다 — 있어도 뜻이 없다.
    const leadIn = scene.leadIn?.trim() ?? '';
    if (at > 1 && leadIn.length > 0) out.push(`   · 앞 장면에서 이어짐: ${mask(leadIn)}`);
  }
  return out.join('\n');
}

/**
 * 이어진 주제 전체를 그린다 — [이어진 흐름 전체로 초안 쓰기].
 *
 * ★분량 예산을 **주제 수로 나눈다.** 한 덩어리로 앞에서부터 채우면 앞 주제가 12,000자를
 *   다 먹고 정작 이으려던 뒷이야기가 통째로 빠진다(그러면 이어 쓸 이유가 없어진다).
 * ★앞 주제가 자기 몫을 다 안 쓰면 남은 몫을 **뒤 주제부터** 다시 나눠 준다.
 */
function renderChain(
  chain: readonly DraftPackChainItem[],
  ctx: {
    readonly mask: (t: string) => string;
    readonly exclusions: DraftPackExclusion[];
    readonly substitutions: DraftPackSubstitution[];
  },
): {
  readonly blocks: readonly string[];
  readonly numberOf: ReadonlyMap<string, number>;
  readonly includedCount: number;
  readonly droppedNotes: number;
  /** 실린 근거 글의 바이트 합(주제 전부). `RenderedEvidence.textBytes` 와 같은 셈. */
  readonly textBytes: number;
} {
  const share = Math.floor(DRAFT_PACK_MAX_EVIDENCE_CHARS / Math.max(1, chain.length));
  const blocks: string[] = [];
  const numberOf = new Map<string, number>();
  let n = 1;
  let spent = 0;
  let includedCount = 0;
  let droppedNotes = 0;
  let textBytes = 0;

  chain.forEach((item, i) => {
    // 남은 몫 재배분 — 앞에서 아낀 만큼 뒤가 더 쓸 수 있다.
    const remainingThreads = chain.length - i;
    const left = DRAFT_PACK_MAX_EVIDENCE_CHARS - spent;
    const budget = spent + Math.max(share, Math.floor(left / Math.max(1, remainingThreads)));

    const rendered = renderEvidences(item.evidences, {
      mask: ctx.mask,
      numbered: true,
      budget,
      startChars: spent,
      startNumber: n,
      exclusions: ctx.exclusions,
      substitutions: ctx.substitutions,
    });
    for (const [id, num] of rendered.numberOf) numberOf.set(id, num);
    spent = rendered.usedChars;
    n += rendered.lines.length;
    includedCount += rendered.lines.length;
    droppedNotes += rendered.droppedNotes;
    textBytes += rendered.textBytes;

    const head: string[] = [];
    if (i > 0) {
      const note = item.linkNote?.trim() ?? '';
      head.push(note.length > 0 ? `이음: ${ctx.mask(note)}` : '이음: 앞 주제에서 이어집니다');
    }
    head.push(`주제 ${i + 1}: ${ctx.mask(item.threadTitle)}`);
    head.push(
      rendered.lines.length > 0
        ? rendered.lines.join('\n')
        : '(이 주제에서 보낼 수 있는 근거가 없습니다)',
    );
    blocks.push(head.join('\n'));
  });

  return { blocks, numberOf, includedCount, droppedNotes, textBytes };
}

export function buildRecordDraftPack(input: DraftPackInput): DraftPack {
  const exclusions: DraftPackExclusion[] = [];
  const mappings: MaskMapping[] = [];
  const substitutions: DraftPackSubstitution[] = [];

  // ★명단에 이 학생이 없으면(호출부 실수) 실명이 그대로 나간다 — 여기서 반드시 넣는다.
  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };

  // 이 학생 이름을 **맨 먼저** 가린다 — 그래야 ［이름1］ 이 되고, 근거 안의 같은 이름도
  // 같은 번호를 받는다(세션이 기억한다).
  const studentAlias = mask(name);

  // 이어진 흐름 — 주제 여럿을 한 요청서에. 예산을 나눠 뒤 이야기가 통째로 빠지지 않게 한다.
  const chain = (input.chain ?? []).slice(-DRAFT_PACK_MAX_CHAIN_THREADS);
  const chainRendered =
    chain.length > 0 ? renderChain(chain, { mask, exclusions, substitutions }) : null;

  // 근거 관문 — 장면에 배치된 근거가 있을 때만 번호를 매기고 장면 순서로 싣는다.
  // 배치가 0건이면 예전과 **같은 코드 경로**로 그린다(줄 형식·순서·머리가 전부 같다).
  const scenes = chainRendered !== null ? chain.flatMap((c) => c.scenes) : (input.scenes ?? []);
  const placed = new Set(scenes.flatMap((sc) => [...sc.evidenceIds]));
  const useScenes =
    chainRendered !== null || (scenes.length > 0 && input.evidences.some((e) => placed.has(e.id)));

  let lines: readonly string[] = [];
  let numberOf: ReadonlyMap<string, number> = new Map();
  let droppedNoteCount = 0;
  let unplacedLines: readonly string[] = [];
  /** 실린 근거 글의 바이트 합 — 분량 줄이 "근거가 빈약하다"를 숫자로 알릴 때 쓴다(ADR-110 보강 2). */
  let evidenceBytes = 0;

  // 근거 지도의 연결(ADR-106) — 이 꾸러미 안에서 양 끝이 실재하는 것만. 없으면 아래 어느 경로도 예전과 같다.
  const graph = resolveEvidenceEdges(input.evidences);
  let cyclicLinks = false;

  if (chainRendered !== null) {
    lines = chainRendered.blocks;
    numberOf = chainRendered.numberOf;
    droppedNoteCount += chainRendered.droppedNotes;
    evidenceBytes += chainRendered.textBytes;
  } else if (useScenes) {
    // 장면 순서대로 — 같은 근거가 두 장면에 있어도 한 번만 싣는다(읽기 정본이 이미 걸렀지만 방어).
    const seen = new Set<string>();
    const ordered: DraftPackEvidence[] = [];
    for (const sc of scenes) {
      for (const id of sc.evidenceIds) {
        if (seen.has(id)) continue;
        const found = input.evidences.find((e) => e.id === id);
        if (found === undefined) continue;
        seen.add(id);
        ordered.push(found);
      }
    }
    const main = renderEvidences(ordered, {
      mask,
      numbered: true,
      budget: DRAFT_PACK_MAX_EVIDENCE_CHARS,
      exclusions,
      substitutions,
    });
    lines = main.lines;
    numberOf = main.numberOf;
    droppedNoteCount += main.droppedNotes;
    evidenceBytes += main.textBytes;

    // 어느 장면에도 없는 근거 — 맨 뒤 "그 밖의 근거" 로. 남은 예산 안에서만.
    const rest = input.evidences.filter((e) => !seen.has(e.id));
    if (rest.length > 0) {
      const extra = renderEvidences(rest, {
        mask,
        numbered: true,
        budget: DRAFT_PACK_MAX_EVIDENCE_CHARS,
        startChars: main.usedChars,
        startNumber: main.lines.length + 1,
        exclusions,
        substitutions,
      });
      unplacedLines = extra.lines;
      droppedNoteCount += extra.droppedNotes;
      evidenceBytes += extra.textBytes;
    }
  } else if (graph.edges.length > 0) {
    // 연결은 있고 장면은 없다 — 연결을 따라 차례를 정하고 번호를 매긴다(연결 줄이 번호를 가리켜야 하므로).
    const order = orderForDraft(input.evidences, graph.edges);
    cyclicLinks = order.cyclic;
    const main = renderEvidences(order.ordered, {
      mask,
      numbered: true,
      keepOrder: true,
      budget: DRAFT_PACK_MAX_EVIDENCE_CHARS,
      exclusions,
      substitutions,
    });
    lines = main.lines;
    numberOf = main.numberOf;
    droppedNoteCount += main.droppedNotes;
    evidenceBytes += main.textBytes;
  } else {
    const main = renderEvidences(input.evidences, {
      mask,
      numbered: false,
      budget: DRAFT_PACK_MAX_EVIDENCE_CHARS,
      exclusions,
      substitutions,
    });
    lines = main.lines;
    droppedNoteCount += main.droppedNotes;
    evidenceBytes += main.textBytes;
  }
  // 실린 근거의 건수 — 이어진 흐름은 주제 묶음 줄이 아니라 근거 건수로 센다.
  const evidenceCount =
    chainRendered !== null ? chainRendered.includedCount : lines.length + unplacedLines.length;
  const linkLines = renderLinks(graph.edges, numberOf, mask);
  const parts: string[] = [];
  parts.push(`학생: ${studentAlias}`);
  parts.push(`영역: ${input.areaLabel}`);
  if (input.subject && input.subject.trim().length > 0)
    parts.push(`과목: ${mask(input.subject.trim())}`);
  if (input.threadTitle) parts.push(`주제: ${mask(input.threadTitle)}`);
  if (input.threadTitle && input.threadNote) {
    // 주제를 골랐을 때만. 빈 칸은 줄 자체를 만들지 않는다 — 빈 라벨은 모델에게 잡음이다.
    const kw = (input.threadNote.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 0);
    if (kw.length > 0) parts.push(`주제 키워드: ${mask(kw.join(', '))}`);
    const comp = (input.threadNote.competencyKeywords ?? [])
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (comp.length > 0) parts.push(`선생님이 본 역량: ${mask(comp.join(', '))}`);
    const next = input.threadNote.nextNotes?.trim() ?? '';
    if (next.length > 0) parts.push(`다음 탐구 메모: ${mask(next)}`);
  }
  if (input.standardKeywords && input.standardKeywords.length > 0) {
    // 원문이 아니라 키워드만 — 성취기준 본문은 앱 밖으로 내보내지 않는다.
    parts.push(`성취기준 키워드: ${input.standardKeywords.join(', ')}`);
  }
  parts.push('');
  parts.push(chainRendered !== null ? '이어진 흐름의 근거 자료:' : '근거 자료:');
  parts.push(
    lines.length > 0
      ? lines.join(chainRendered !== null ? '\n\n' : '\n')
      : '(보낼 수 있는 근거가 없습니다)',
  );
  if (unplacedLines.length > 0) {
    parts.push('');
    parts.push('그 밖의 근거:');
    parts.push(unplacedLines.join('\n'));
    parts.push(
      '그 밖의 근거는 위 차례에 자리를 잡지 못한 것입니다. 이것 때문에 문단을 새로 만들지 말고, ' +
        '필요한 자리에만 한 문장으로 녹여 쓰세요.',
    );
  }
  if (linkLines.length > 0) {
    parts.push('');
    parts.push('근거 사이 연결(선생님이 표시한 관련성):');
    parts.push(linkLines.join('\n'));
    parts.push(
      '연결은 앞 번호의 근거에서 뒤 번호의 근거로 이어졌다는 뜻입니다. 설명이 적힌 연결은 그 말을 따르고, ' +
        '설명이 없는 연결을 성장이나 인과관계로 단정하지 마세요. 연결의 차례가 곧 문단의 차례일 필요는 없습니다.',
    );
  }

  // 작성 구성(ADR-099) — 선생님이 고른 초점·시작 방식·묶기·요소. **기본값이면 아무것도 붙지 않는다.**
  // ★선생님 지시보다 **앞**에 둔다 — 뒤쪽(최신성)일수록 세게 먹히므로, 선생님이 손으로 적은 말이
  //   구성보다 뒤에 와야 강조점을 조절할 수 있다.
  // ★장면에서 만든 구성이 있으면 **그것이 우선**이다 — 둘을 함께 보내면 서로 싸우는 두 지시가 된다.
  const composition = input.composition ?? (input.style ? resolveComposition(input.style) : null);
  const emitComposition = composition !== null && composition.shouldEmitComposition;
  if (composition !== null && emitComposition) {
    parts.push('');
    parts.push(
      useScenes
        ? buildSceneInstruction(composition, scenes, numberOf, mask)
        : buildStyleInstruction(composition),
    );
  }

  // 분량 — 목표가 있으면 **언제나** 싣는다(ADR-110). 1층 규정에는 바이트 한도가 없어서, 예전처럼 "목표 = 한도"일 때
  //   줄을 빼면 모델은 분량을 모른 채 근거를 다 담으려 했다. 선생님 지시보다 **앞**에 둔다
  //   (뒤쪽일수록 세게 먹히므로 선생님이 손으로 적은 말이 이보다 뒤에 와야 한다).
  if (input.targetBytes !== undefined) {
    parts.push('');
    parts.push(
      draftLengthInstruction(input.targetBytes, input.limitBytes, {
        count: evidenceCount,
        bytes: evidenceBytes,
        // 장면(이어진 흐름 포함)으로 짠 요청서면 고르기를 장면 안에서 하라고 말한다(보강 3).
        structured: useScenes,
      }),
    );
  }

  if (input.teacherPrompt && input.teacherPrompt.trim().length > 0) {
    parts.push('');
    parts.push('선생님 지시:');
    parts.push(mask(input.teacherPrompt.trim()));
  }

  // 형광펜 표식(ADR-085) — 문단마다 [평가]/[동기]/[과정]/[결과]. 앱이 색으로 바꾸고 저장 본문에서는 뗀다.
  // ★색은 고정, **순서는 위 「작성 구성」이 정한다**(ADR-099). 구성을 안 붙였으면 예전과 같은 문장이다.
  // ★근거로 되짚기 지시보다 **앞**에 둔다 — 맨 끝(최신성)은 지어내기를 막는 지시의 자리다.
  parts.push('');
  parts.push(
    emitComposition && composition !== null
      ? narrativeMarkInstruction({
          followComposition: true,
          firstIsEvaluation: composition.firstIsEvaluation,
        })
      : NARRATIVE_MARK_INSTRUCTION,
  );
  parts.push('');
  // 마무리(오너 검토 2026-09-12) — **근거가 얇으면 붙이지 않는다.**
  //   1층 규정에 넣었더니 근거 1건(138B) 학생의 글이 459B → 227B 로 줄고, 오너가 좋다고 한
  //   교사 판단 문장("…태도가 확인됨")이 사라졌다. 문구를 세 번 고쳐도 같았다(실측 3회):
  //   이르렀다고 할 지점이 없는데 "이른 곳으로 맺으라"고 하면 모델은 마지막 문장을 통째로 버린다.
  //   근거가 많은지 적은지는 **앱만 정확히 안다** — 그래서 규정이 아니라 앱이 말한다.
  //   오너 결정: 근거가 부족한 학생은 마지막 문장이 해석으로 끝나지 않아도 된다.
  // ★**자리가 분량 블록이 아니라 여기다**(2026-09-12 2차). 분량 줄 안에 뒀을 때는 근거가 넉넉한
  //   학생에서 마지막 문장이 결과로 닫힌 것이 3회 중 1회뿐이었다(1층 규정에 있을 때는 2/2).
  //   되짚기 backstop **바로 앞**이 갈 수 있는 가장 뒤다 — 맨 끝은 지어내기를 막는 지시의 자리라
  //   내주지 않는다(위 798 주석과 같은 규칙).
  if (input.targetBytes !== undefined && !isThinEvidence(evidenceBytes, input.targetBytes)) {
    parts.push(
      '마무리: 마지막 문장은 그 활동이 무엇에 이르렀는지(판정·결론·적용·남은 물음)를 말하게 두세요. ' +
        '발표 소감이나 부수 활동 같은 곁가지 장면에서 글이 끊기면 마무리가 되지 않습니다. ' +
        '앞 내용을 다시 모으는 요약 문장을 붙이라는 뜻이 아니라, 마지막 한 문장의 자리를 결과에 두라는 뜻입니다.',
    );
    parts.push('');
  }
  parts.push(
    // ★"하나의 탐구 흐름" 은 기존형의 묶는 방식이다. 구성을 붙였으면 묶는 방식이 이미 거기 적혀 있고,
    //   여기서 또 말하면 「성취별로 나눠 쓰기」를 고른 선생님에게 정반대 지시를 함께 보내게 된다.
    emitComposition
      ? '위 근거만 보고 쓰세요. ' +
          '본문의 모든 서술이 근거 자료의 어느 줄에서 나왔는지 짚을 수 있어야 합니다. ' +
          '근거에 없는 내용은 쓰지 마세요.'
      : '위 근거만 보고 쓰세요. 활동을 나열하지 말고 하나의 탐구 흐름으로 이어 주세요. ' +
          '본문의 모든 서술이 근거 자료의 어느 줄에서 나왔는지 짚을 수 있어야 합니다. ' +
          '근거에 없는 내용은 쓰지 마세요.',
  );

  return {
    text: parts.join('\n'),
    studentAlias,
    mappings,
    includedCount: lines.length + unplacedLines.length,
    exclusions,
    substitutions,
    droppedNoteCount,
    linkCount: linkLines.length,
    cyclicLinks,
  };
}

/**
 * 「근거 사이 연결」 줄 — **양 끝이 다 실린** 연결만 번호로 적는다. 빠진 근거를 가리키는 연결은 조용히 뺀다
 * (없는 번호를 가리키면 모델이 그 자리를 지어낸다). AI 가 적은 설명은 그렇다고 밝힌다.
 */
function renderLinks(
  edges: readonly EvidenceEdge[],
  numberOf: ReadonlyMap<string, number>,
  mask: (t: string) => string,
): readonly string[] {
  const out: string[] = [];
  for (const edge of edges) {
    const a = numberOf.get(edge.fromId);
    const b = numberOf.get(edge.toId);
    if (a === undefined || b === undefined) continue;
    const note = edge.note?.trim() ?? '';
    const tail =
      note.length > 0 ? `: ${mask(note)}${edge.source === 'ai' ? ' (AI 가 제안한 설명)' : ''}` : '';
    out.push(`- ${a} → ${b}${tail}`);
  }
  return out;
}

/**
 * 분량 조절 꾸러미 — 조절 대상 **본문 자체**를 모델에게 보낸다.
 *
 * ★이 함수가 생기기 전까지 밖으로 나간 것은 근거뿐이었다. 근거는 기재 금지 필터를 거치지만
 *   초안 본문은 그 필터를 거친 적이 없다. 그래서 이 꾸러미는 본문의 기재 금지 항목을
 *   **자동으로 지우지 않고 세어서 돌려준다** — 문장을 조용히 지우면 선생님은 무엇이
 *   없어졌는지도 모른다(오너 결정 4). 지울지 보낼지는 화면이 선생님에게 묻는다.
 * ★가리는 일은 여기 한 곳에서 한다. 부르는 쪽이 다시 가리면 `createMaskSession()` 이 새로
 *   생겨 별칭 번호가 갈리고, 서로 다른 학생이 똑같이 ［이름1］ 이 되는 실측 사고를 재현한다.
 */
export interface LengthAdjustPackInput {
  readonly kind: LengthAdjustKind;
  /** 학생 **실명**. 여기서 별칭으로 바뀐다. */
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  readonly areaLabel: string;
  /** 조절 대상 판의 주제. 화면의 현재 칩이 아니라 **대상 판**의 것이어야 한다. */
  readonly threadTitle?: string;
  /** 조절할 본문(실명 그대로). */
  readonly sourceText: string;
  /** 선생님이 고른 목표 바이트(최종 저장 본문 기준). */
  readonly targetBytes: number;
  /** `expand` 일 때만 쓴다. `shrink` 는 근거를 싣지 않는다. */
  readonly evidences?: readonly DraftPackEvidence[];
  /**
   * 직전 시도의 결과 바이트(최종 본문 기준) — **같은 원문을 다시 조절할 때만** 준다(줄이다 너무 많이 뺀 경우).
   * 모델에게 "지난번엔 이만큼이었다"를 알려 같은 쪽으로 또 빗나가지 않게 한다(ADR-110).
   */
  readonly previousBytes?: number;
}

export interface LengthAdjustPack extends DraftPack {
  /** 모델에게 실제로 적어 보낸 목표 상한(별칭 보정 반영). */
  readonly modelTargetBytes: number;
  /** 모델에게 실제로 적어 보낸 목표 하한(같은 보정). */
  readonly modelFloorBytes: number;
  /** 선생님이 고른 목표. **판정은 이 값으로 한다.** */
  readonly finalTargetBytes: number;
  /**
   * 조절 대상 본문에서 찾은 기재 금지 갈래(한국어 라벨). 비어 있지 않으면 화면이 보내기 전에 묻는다.
   * ★근거와 달리 **빼지 않는다.** 자동 삭제는 조용한 문장 소실이라 더 나쁘다.
   */
  readonly sourceProhibited: readonly string[];
}

/** NEIS 바이트를 한글 글자 수로 어림한다(한글 1자 = 3바이트). 모델에게 감을 주는 숫자일 뿐 판정에는 안 쓴다. */
function approxKoreanChars(bytes: number): number {
  return Math.max(1, Math.round(bytes / 3));
}

/**
 * 초안 요청서의 분량 줄(ADR-110 · 보강 2).
 *
 * ★순서가 뜻이다: **상한**을 먼저 못 박고, 하한~목표는 "근거가 넉넉하면"의 **조건부 목표**로만 둔다.
 *   예전 첫 문장 "1,425~1,500바이트로 씁니다"는 채울 숫자로 읽혀, 근거가 얇아도 모델이 늘려 썼다.
 * ★근거가 빈약할 때 분량을 늘리는 네 방법(근거 밖 사실·되풀이·일반 칭찬·요약 마무리)을 **이름으로** 막는다.
 *   "억지로 채우지 말라"만 적으면 무엇이 억지인지를 모델이 정한다.
 * ★실린 근거 글이 목표의 절반에 못 미치면(`isThinEvidence`) 그 사실을 **숫자로** 알린다 — 앱은 근거 양을 정확히 안다.
 * ★"문단을 빼기보다 문단마다 짧게" — 선생님이 짠 장면을 통째로 건너뛰어 분량을 맞추지 않게.
 * ★사실이 분량보다 먼저다. 예전의 "이 분량 지시가 다른 분량 안내보다 우선합니다"는 1층 규정의
 *   "자료가 얇으면 억지로 채우지 말라"까지 누를 수 있어 뺐다.
 * ★**근거 고르기**(보강 3, 오너 2026-09-11): 근거를 하나씩 다 담지 않는다. 학생의 강점·특성을 가장 잘 드러내는 핵심 근거를
 *   중심에 두고 다른 근거는 뒷받침할 때만 엮으며, 관련이 약한 근거는 쓰지 않는다. 장면을 짰으면 장면 차례는 지키고
 *   **장면 안에서** 고른다(선생님이 짠 문단을 통째로 빼지 않게). 근거 글이 목표보다 많으면(`isRichEvidence`) 숫자로 알린다.
 * ★기준선 픽스처를 지키려고 목표가 있을 때만 붙는다 — 앱은 늘 목표를 넘기므로 실제 요청에는 늘 실린다.
 */
export function draftLengthInstruction(
  targetBytes: number,
  limitBytes: number | undefined,
  evidence: {
    readonly count: number;
    readonly bytes: number;
    /** 장면(또는 이어진 흐름)으로 짠 요청서인가 — 고르기를 장면 안에서 하라고 말한다. */
    readonly structured?: boolean;
  },
): string {
  const floor = goalFloor(targetBytes);
  const target = targetBytes.toLocaleString();
  const why =
    limitBytes === undefined || limitBytes === targetBytes
      ? ''
      : targetBytes < limitBytes
        ? ` 이 과목은 학교가 정한 분량이 나이스 한도(${limitBytes.toLocaleString()}바이트)보다 짧습니다.`
        : ` 이 영역은 학교가 정한 한도가 기재요령 기본 한도(${limitBytes.toLocaleString()}바이트)보다 깁니다.`;
  const lines = [
    `분량: 공백을 포함해 ${target}바이트(한글 약 ${approxKoreanChars(targetBytes)}자)를 넘기지 마세요.${why}`,
    `근거가 넉넉하면 ${floor.toLocaleString()}~${target}바이트(한글 약 ${approxKoreanChars(floor)}~${approxKoreanChars(targetBytes)}자)에 가깝게 씁니다` +
      '(문단을 빼기보다 문단마다 짧게 씁니다).',
    '근거가 빈약하면 목표 분량을 채우지 않아도 됩니다. 근거에 적힌 사실을 풀어 쓰는 데서 멈추세요. ' +
      '분량을 늘리려고 근거에 없는 활동·성과·태도를 보태거나, 같은 내용을 말만 바꿔 되풀이하거나, ' +
      '일반적인 칭찬이나 짐작으로 늘이거나, 앞 내용을 요약하는 마무리 문장을 붙이지 마세요. 짧게 끝나는 편이 맞습니다.',
  ];
  if (evidence.count > 0 && isThinEvidence(evidence.bytes, targetBytes)) {
    lines.push(
      `이번에 보내는 근거는 ${evidence.count}건, 모두 합쳐 약 ${evidence.bytes.toLocaleString()}바이트` +
        `(한글 약 ${approxKoreanChars(evidence.bytes)}자)로 목표 분량의 절반에 못 미칩니다. ` +
        '목표를 채우려 하지 말고 근거가 뒷받침하는 만큼만 쓰세요.',
    );
  }
  // 근거 고르기(보강 4) — **개수로 자르지 않는다.** 핵심/주변으로 나누게 하고, **넘칠 때만** 주변 근거를
  //   핵심과 이어 엮거나(이을 수 있으면) 뺀다(이을 수 없으면). 핵심의 기준은 이 학생의 강점·특성이다.
  const sorting =
    '먼저 근거를 핵심 근거(이 학생의 강점이나 특성을 드러내는 근거)와 주변 근거(그 밖의 근거)로 나누고, 핵심 근거를 중심에 두세요.';
  const overflow =
    '모두 담으면 분량을 넘길 것 같으면, 주변 근거는 핵심 근거와 이어지는 부분만 한 구절이나 한 문장으로 엮고, ' +
    '핵심 근거와 연결하기 어려운 주변 근거는 쓰지 마세요.';
  lines.push(
    evidence.structured === true
      ? // ★장면은 선생님이 짠 문단이다 — 주변 근거만 놓인 장면이라고 통째로 빼지 않는다.
        `근거 고르기: 짜 둔 장면 차례는 지키세요. ${sorting} ${overflow} ` +
          '주변 근거만 놓인 장면도 빼지 말고, 핵심 근거와 이어지게 짧게 쓰세요.'
      : `근거 고르기: ${sorting} ${overflow} 활동을 차례로 늘어놓지 마세요.`,
  );
  if (isRichEvidence(evidence.bytes, targetBytes)) {
    lines.push(
      `이번에 보내는 근거는 ${evidence.count}건, 모두 합쳐 약 ${evidence.bytes.toLocaleString()}바이트` +
        `(한글 약 ${approxKoreanChars(evidence.bytes)}자)로 목표 분량(${target}바이트)보다 많아 모두 담으면 넘칩니다. ` +
        '주변 근거는 핵심 근거와 연결되는 것만 엮고, 연결하기 어려운 것은 쓰지 않아도 됩니다.',
    );
  }
  lines.push(
    '분량 숫자는 이 안내를 따르되, 근거에 없는 내용을 쓰지 않는 것이 분량보다 먼저입니다.',
  );
  return lines.join('\n');
}

export function buildLengthAdjustPack(input: LengthAdjustPackInput): LengthAdjustPack {
  const exclusions: DraftPackExclusion[] = [];
  const lines: string[] = [];
  const mappings: MaskMapping[] = [];
  const substitutions: DraftPackSubstitution[] = [];

  const name = input.studentName.trim();
  const roster = input.roster.some((g) => g.values.includes(name))
    ? input.roster
    : [{ label: '이름', values: [name] }, ...input.roster];
  const session = createMaskSession();
  const mask = (text: string): string => {
    const r = redactQuestion(text, roster, session);
    mappings.push(...r.mappings);
    return r.masked;
  };

  // 학생 이름을 맨 먼저 가린다 — 본문·근거 속 같은 이름이 같은 번호를 받는다.
  const studentAlias = mask(name);
  const rawSource = input.sourceText.trim();
  // 기재 금지 검사는 **원문**으로 한다(가린 뒤에는 단어가 바뀌어 못 잡을 수 있다).
  const sourceProhibited = hitsToCategories(detectProhibitedTerms(rawSource));
  const maskedSource = mask(rawSource);

  // 별칭 보정 — 실명본과 별칭본의 길이 차이를 목표에 미리 반영한다(어림 보정).
  const delta = aliasByteDelta(rawSource, maskedSource);
  const target = modelTargetBytes(input.targetBytes, delta);
  const floor = modelFloorBytes(input.targetBytes, delta);

  let droppedNoteCount = 0;
  if (input.kind === 'expand') {
    // 새로 쓰는 자리와 **같은 순서·같은 안전 판정**을 쓴다. 한쪽만 다르면 같은 근거가 화면마다
    // 달리 취급된다(초안에서 걸러진 것이 채우기에서 그대로 나가는 식).
    const rendered = renderEvidences(input.evidences ?? [], {
      mask,
      numbered: false,
      budget: DRAFT_PACK_MAX_EVIDENCE_CHARS,
      exclusions,
      substitutions,
    });
    lines.push(...rendered.lines);
    droppedNoteCount = rendered.droppedNotes;
  }
  const parts: string[] = [];
  parts.push(`학생: ${studentAlias}`);
  parts.push(`영역: ${input.areaLabel}`);
  if (input.threadTitle) parts.push(`주제: ${mask(input.threadTitle)}`);
  parts.push('');
  parts.push(input.kind === 'shrink' ? '줄일 글:' : '채울 글:');
  parts.push(maskedSource);

  // ★`shrink` 에는 근거 블록을 아예 붙이지 않는다. 붙이면 "(보낼 수 있는 근거가 없습니다)" 와
  //   "근거만 보고 쓰세요" 가 함께 나가 자기모순 프롬프트가 된다.
  if (input.kind === 'expand') {
    parts.push('');
    parts.push('근거 자료:');
    parts.push(lines.length > 0 ? lines.join('\n') : '(보낼 수 있는 근거가 없습니다)');
  }

  parts.push('');
  // ★분량은 표식을 뗀 **저장될 본문**으로 센다. 초안 직후 자동 줄이기·이어 조절은 문단 역할을 지키려고 표식을 붙여
  //   보내는데(`markedNarrativeText`), 표식 몇십 바이트가 "빼야 할 양"에 섞이면 그만큼 덜 줄인다.
  const sourceBody = hasAnyRole(parseNarrativeParagraphs(maskedSource))
    ? stripNarrativeMarks(maskedSource)
    : maskedSource;
  const sourceBytes = neisByteLength(sourceBody);
  const sentences = countSentences(sourceBody);
  // ★모델은 바이트를 못 센다 — 공백 포함 글자 수와 **문장 수**를 함께 준다(ADR-110). 실측(2026-09-08):
  //   바이트만 주면 1,719 → 1,689 로 겨우 줄이고 목표(1,500)를 두 번 다 넘겼다.
  //   글자 수는 "한글 1자 = 3바이트"가 아니라 **이 글의** 비율로 옮긴다 — 공백·문장부호는 1바이트라 3으로 나누면
  //   공백 포함 글자 수보다 적게 나오고, 모델은 그 차이만큼 덜 줄인다.
  const chars = (bytes: number): string => charsForBytes(bytes, sourceBody).toLocaleString();
  const bytesPerSentence = sourceBytes / Math.max(1, sentences);
  const aboutSentences = (bytes: number): number =>
    Math.max(1, Math.round(bytes / Math.max(1, bytesPerSentence)));
  parts.push(
    `현재 분량: 약 ${sourceBytes.toLocaleString()}바이트 (공백 포함 약 ${chars(sourceBytes)}자, ${sentences}문장)`,
  );
  parts.push(
    `목표 분량: ${floor.toLocaleString()} ~ ${target.toLocaleString()}바이트 (공백 포함 약 ${chars(floor)}~${chars(target)}자, 가능한 한 위쪽에 가깝게)`,
  );
  if (input.kind === 'shrink' && sourceBytes > target) {
    // 뺄 양은 **범위로** 준다 — 최소만 주면 모델이 넉넉히 빼 목표 아래쪽보다 짧아진다.
    const minCut = sourceBytes - target;
    const maxCut = Math.max(minCut, sourceBytes - floor);
    parts.push(
      `반드시 ${target.toLocaleString()}바이트 이하여야 합니다. 지금 글에서 ${minCut.toLocaleString()}~${maxCut.toLocaleString()}바이트` +
        `(공백 포함 약 ${chars(minCut)}~${chars(maxCut)}자)를 빼야 합니다. 문장으로 치면 약 ${aboutSentences((minCut + maxCut) / 2)}문장입니다.`,
    );
  } else if (input.kind === 'expand' && sourceBytes < floor) {
    const minAdd = floor - sourceBytes;
    const maxAdd = Math.max(minAdd, target - sourceBytes);
    // ★"채워야 합니다"로 떠밀지 않는다(ADR-110 보강 2) — 근거가 빈약하면 목표에 못 미쳐도 멈추는 것이 맞다.
    parts.push(
      `근거 자료로 채울 수 있다면 지금 글에 ${minAdd.toLocaleString()}~${maxAdd.toLocaleString()}바이트(공백 포함 약 ${chars(minAdd)}~${chars(maxAdd)}자)를 더하면 목표에 닿습니다. ` +
        `문장으로 치면 약 ${aboutSentences((minAdd + maxAdd) / 2)}문장입니다. ${target.toLocaleString()}바이트는 넘기지 마세요. ` +
        '근거에 더 쓸 내용이 없으면 그 자리에서 멈추세요. 목표에 못 미쳐도 괜찮습니다.',
    );
  }
  if (input.previousBytes !== undefined) {
    // 같은 원문을 다시 조절하는 두 번째 시도 — 직전 결과를 알려 같은 쪽으로 또 빗나가지 않게 한다.
    parts.push(
      `직전 시도는 약 ${input.previousBytes.toLocaleString()}바이트였습니다. ` +
        (input.previousBytes < goalFloor(input.targetBytes)
          ? '너무 많이 줄였으니 이번에는 문장을 덜 지우세요.'
          : '아직 기니 이번에는 문장을 더 지우세요.'),
    );
  }
  parts.push('');
  parts.push('지켜야 할 것:');
  if (input.kind === 'shrink') {
    parts.push('1. 위 글에 있는 사실, 활동, 결과, 교사의 평가를 그대로 남기세요.');
    parts.push(
      '2. 먼저 덜 중요한 문장을 통째로 지우고, 그다음 중복된 표현과 늘어지는 설명을 줄이세요. 표현만 다듬어서는 목표에 못 미칩니다.',
    );
    parts.push('3. 문장을 중간에서 끊지 말고, 완결된 하나의 글로 돌려주세요.');
    parts.push(
      '4. 다 쓴 뒤 문장 수와 길이를 다시 보고, 목표 위쪽 숫자를 넘으면 문장을 더 지우고 아래쪽보다 짧으면 덜 지우세요.',
    );
    parts.push('5. 설명이나 인사말 없이 줄인 글만 돌려주세요.');
  } else {
    parts.push(
      '1. 위 글의 문장과 순서를 최대한 지키고, 빠진 과정과 결과를 근거 자료에서 가져와 채우세요.',
    );
    parts.push('2. 목표를 채우려고 일반적인 칭찬이나 추측을 넣지 마세요.');
    parts.push('3. 설명이나 인사말 없이 완성된 글만 돌려주세요.');
  }

  // 형광펜 표식 지시는 **앞**에, 지어내기를 막는 지시는 **맨 끝**에 둔다.
  // 실측에서 지어내기 금지를 뒤쪽에 두었을 때만 모델이 얇은 근거로 지어내기를 멈췄다(최신성 효과).
  // ★분량 조절은 **순서를 요구하지 않는다**(ADR-099). 이미 쓰인 글의 분량만 손대는 일인데 순서를
  //   다시 못 박으면, 다른 구성으로 쓴 초안을 줄이라고 했을 때 모델이 글을 통째로 다시 짠다.
  //   「작성 구성」 블록도 싣지 않는다 — 여기는 새로 쓰는 자리가 아니다.
  parts.push('');
  parts.push(narrativeMarkInstruction({ keepExistingOrder: true }));
  parts.push('');
  if (input.kind === 'shrink') {
    parts.push('위 글에 있는 내용만 쓰세요. 새로운 활동이나 성과를 덧붙이지 마세요.');
  } else {
    parts.push(
      '근거 자료에 있는 내용만 쓰세요. 근거 자료에 없는 내용은 한 문장도 쓰지 마세요. ' +
        `채울 근거가 모자라면 목표보다 짧아도 됩니다. 그럴 때는 맨 마지막 줄에 ${INSUFFICIENT_MARK} 이라고만 적으세요.`,
    );
  }

  return {
    text: parts.join('\n'),
    studentAlias,
    mappings,
    includedCount: lines.length,
    exclusions,
    substitutions,
    droppedNoteCount,
    linkCount: 0,
    cyclicLinks: false,
    modelTargetBytes: target,
    modelFloorBytes: floor,
    finalTargetBytes: input.targetBytes,
    sourceProhibited,
  };
}

/**
 * 미리보기에 붙일 한 줄 — 빠진 것과 **말을 바꿔 살린 것**을 함께 알린다.
 *
 * ★대체는 조용히 하지 않는다. 그리고 **면죄부가 아니다** — 시상이 계획됐던 프로그램이면 이름을
 *   바꿔도 기재할 수 없는데, 그건 앱이 알 수 없으므로 선생님께 한 줄로 짚어 준다.
 */
export function summarizeDraftPackNotes(pack: DraftPack): string {
  const parts: string[] = [];
  const excluded = summarizeExclusions(pack.exclusions);
  if (excluded.length > 0) parts.push(excluded);
  const hint = pack.exclusions.find((x) => x.hint !== undefined)?.hint;
  if (hint !== undefined) parts.push(hint);
  if (pack.substitutions.length > 0) {
    const seen = new Set<string>();
    const pairs: string[] = [];
    for (const s of pack.substitutions) {
      const key = `${s.from}>${s.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(`${s.from} → ${s.to}`);
    }
    parts.push(
      `말을 바꿔 보낸 근거 있음 (${pairs.join(' · ')}). 시상이 계획됐던 행사라면 이름을 바꿔도 기재할 수 없어요.`,
    );
  }
  return parts.join(' · ');
}

/** "제외됨 N건" 옆에 붙일 짧은 사유 요약. 빠진 게 없으면 빈 문자열. */
export function summarizeExclusions(exclusions: readonly DraftPackExclusion[]): string {
  if (exclusions.length === 0) return '';
  const reasons = new Set<string>();
  for (const x of exclusions) reasons.add(DRAFT_PACK_EXCLUSION_LABELS[x.reason]);
  return `제외됨 ${exclusions.length}건 (${[...reasons].join(' · ')})`;
}

/**
 * [다시 표시] 꾸러미 — 선생님이 고친 초안에 **표식만** 다시 붙여 달라는 짧은 요청(ADR-085 §7-3).
 *
 * 근거는 싣지 않는다(본문을 바꾸는 요청이 아니다). 실명·학번은 초안 꾸러미와 같은 명단으로 가리고,
 * 답이 오면 `mappings` 로 되돌린다. 답의 본문이 원문과 다르면 화면이 버린다(`sameNarrativeBody`).
 */
export interface NarrativeRemarkPack {
  readonly text: string;
  readonly mappings: readonly MaskMapping[];
}

export function buildNarrativeRemarkPack(input: {
  readonly content: string;
  readonly roster: readonly KeywordGroup[];
}): NarrativeRemarkPack {
  const session = createMaskSession();
  const r = redactQuestion(input.content.trim(), input.roster, session);
  const text = [
    '아래 글의 **문장은 한 글자도 바꾸지 말고**, 문단마다 첫머리에 역할 표식만 붙여서 그대로 돌려주세요.',
    // ★순서를 요구하지 않는 변형을 쓴다(ADR-099). "한 글자도 바꾸지 말라" 면서 순서를 못 박으면
    //   자기모순이고, 다른 구성으로 쓴 초안에서는 모델이 순서를 고치려 들어 답이 버려진다.
    narrativeMarkInstruction({ keepExistingOrder: true }),
    '설명이나 다른 말은 덧붙이지 마세요.',
    '',
    '글:',
    r.masked,
  ].join('\n');
  return { text, mappings: r.mappings };
}
