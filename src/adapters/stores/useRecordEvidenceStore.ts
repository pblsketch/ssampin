import { create } from 'zustand';
import type { RecordArea } from '@domain/entities/RecordDraft';
import { NARRATIVE_NOTE_MAX, type InquiryThread } from '@domain/entities/InquiryThread';
import {
  normalizeEvidenceAreas,
  type EvidenceSourceType,
  type RecordEvidence,
  evidenceInArea,
} from '@domain/entities/RecordEvidence';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { linkRejection, normalizeLinkNote, type LinkRejection } from '@domain/rules/evidenceGraph';
import { inquiryThreadRepository, recordEvidenceRepository } from '@adapters/di/container';
import {
  useInquiryThreadStore,
  type ThreadCompensationResult,
} from '@adapters/stores/useInquiryThreadStore';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';
import { generateUUID } from '@infrastructure/utils/uuid';
import {
  recheckBeforeApply,
  type ComparableRecordFields,
  type ComparisonCapture,
  type ComparisonRecheck,
} from '@domain/rules/evidenceSourceComparison';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

/** 근거 자료 추가 입력(직접 입력 / 기존 데이터 끌어오기 공통). id·시각은 스토어가 채운다. */
export interface RecordEvidenceAddInput {
  studentRef: string;
  areas: readonly RecordArea[];
  content: string;
  date?: string;
  sourceType?: EvidenceSourceType;
  sourceId?: string;
  classId?: string;
  /** 원본 기록에서 이어받은 관찰 슬롯. 비면 필드를 만들지 않는다(부재 != 빈 배열). */
  slots?: readonly string[];
  /** 속한 탐구 흐름(InquiryThread.id). 원본 낱장에 있으면 이어받고, 없으면 미분류. */
  threadId?: string;
  /**
   * 선생님이 이 근거에서 읽은 것(ADR-103). 거울 카드에서 메모를 달며 처음 저장할 때 쓴다 —
   * 이 칸이 없으면 "저장하고 다시 열어 메모" 로 두 번 저장하게 된다.
   */
  note?: string;
  /**
   * 교사가 저장 순간부터 AI 제외로 두기(거울 카드의 [AI 제외] = 첫 손댄 저장, 설계서 §4-1). `true` 만 의미가 있다 —
   * 기재 금지 자동 판정을 끄는 값이 아니다(그건 저장 뒤 `setExcludedFromAi` 로).
   */
  excludedFromAi?: boolean;
}

/**
 * 원본에서 그대로 가져오는 세 필드만 바꾸는 입력(계획 §5.3).
 *
 * 일반 patch 와 달리 **명시적인 `null` 이 "키 제거"** 를 뜻한다.
 * 일반 patch 는 `undefined` 를 "변경 없음"으로 쓰는데, 그것만으로는
 * "날짜를 지워라"를 표현할 수 없어 별도 타입을 둔다.
 */
export interface EvidenceSourceFieldsPatch {
  readonly content: string;
  /** `null` 이면 date 키를 지운다. */
  readonly date: string | null;
  /** `null` 이면 slots 키를 지운다. 빈 배열도 키를 만들지 않는다(부재 != 빈 배열). */
  readonly slots: readonly string[] | null;
}

/** 되돌리기 결과 - 화면이 "되돌렸다"와 "이미 다른 근거가 있다"를 다르게 말할 수 있게. */
export interface EvidenceRestoreResult {
  /** 되돌린 근거, 또는 그 자리를 이미 차지하고 있던 근거의 id. */
  readonly id: string;
  /** 실제로 되돌렸는가. `false` 면 **쓰기 0회**이고 기존 근거를 그대로 뒀다는 뜻이다. */
  readonly restored: boolean;
}

/** 근거 자료 부분 수정 입력. id 로 대상 지정. */
export interface RecordEvidencePatch {
  areas?: readonly RecordArea[];
  content?: string;
  date?: string;
}

/**
 * 보드의 일괄 이동 입력 — **학생을 명시**한다. 이 학생의 근거가 아닌 id 는 조용히 건너뛰고 결과에 적는다.
 * AI 분류 제안(`ThreadSuggestion`)의 `evidenceIds` 를 그대로 넘기면 "제안 적용"이 된다 — 제안 자체는 저장하지 않는다.
 */
export interface EvidenceMoveInput {
  readonly studentRef: string;
  readonly evidenceIds: readonly string[];
}

export interface EvidenceMoveResult {
  /** 실제로 옮긴 근거 id(이 학생 것만, 중복 제거). */
  readonly movedIds: readonly string[];
  /** 건너뛴 근거 id — 없는 근거이거나 다른 학생 것. 화면이 "N건은 이 학생 근거가 아니라 묶지 않았습니다"라고 말한다. */
  readonly skippedIds: readonly string[];
}

export interface EvidenceMoveToNewThreadResult extends EvidenceMoveResult {
  /** 만든 주제 id. 옮길 근거가 하나도 없으면 주제도 만들지 않고 null. */
  readonly threadId: string | null;
}

/**
 * 원본(관찰·담임 기록)을 근거로 **한 번만** 올리는 관문 입력. sourceType·sourceId 가 필수인 것이
 * `add` 와의 차이다 — 이 관문의 중복 판정 단위가 `studentRef + sourceId` 이기 때문이다.
 */
export interface EnsureEvidenceFromSourceInput {
  readonly studentRef: string;
  readonly areas: readonly RecordArea[];
  readonly content: string;
  readonly sourceType: EvidenceSourceType;
  readonly sourceId: string;
  readonly date?: string;
  readonly classId?: string;
  readonly slots?: readonly string[];
  /** 연결할 주제. 없으면 미분류로 저장한다(주제 미선택 저장을 막지 않는다 — 계획 원칙 1). */
  readonly threadId?: string;
  readonly excludedFromAi?: boolean;
}

export interface EnsureEvidenceFromSourceResult {
  readonly evidenceId: string;
  /** 이미 있던 근거를 다시 쓴 것인지 — 재시도·재진입이 새 근거를 만들지 않았음을 화면이 말할 수 있게. */
  readonly reused: boolean;
  /** 이번 호출로 주제 연결이 실제로 바뀌었는지. */
  readonly threadLinked: boolean;
}

/** 실패한 단계를 구별한다 — "주제를 못 만들었다"와 "연결을 못 했다"와 "뒷정리를 못 했다"는 다른 말이다. */
export type EvidenceLinkStage = 'thread-create' | 'evidence-link' | 'compensation';

/**
 * 주제 생성·연결 실패. 원인 메시지를 그대로 앞에 두어 기존 호출부의 문구 판정이 깨지지 않게 한다.
 * `compensation` 이 'failed' 면 빈 주제가 남았는지 **단정하지 않는다** — 디스크를 확인하지 못한 상태다.
 */
export class EvidenceLinkError extends Error {
  readonly stage: EvidenceLinkStage;
  readonly threadId: string | null;
  readonly compensation: ThreadCompensationResult | null;

  constructor(
    message: string,
    stage: EvidenceLinkStage,
    threadId: string | null,
    compensation: ThreadCompensationResult | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'EvidenceLinkError';
    this.stage = stage;
    this.threadId = threadId;
    this.compensation = compensation;
  }
}

interface RecordEvidenceState {
  records: readonly RecordEvidence[];
  loaded: boolean;
  /** 마지막 읽기 실패 메시지. 화면이 "불러오지 못했습니다"를 빈 목록과 구별하는 근거. */
  loadError: string | null;

  load: () => Promise<void>;
  /**
   * 동기화가 파일을 갈아 끼운 뒤의 재적재 전용 진입점 — **쓰기와 같은 파일 락 안에서**
   * 최신을 읽어 게시한다. loaded 를 내렸다가 load() 를 다시 부르면 락 밖에서 읽은
   * 낡은 스냅샷을 뒤늦게 게시할 수 있다(계획 §5.2).
   */
  forceReload: () => Promise<void>;
  /** 근거 추가. 반환 = 생성된(또는 같은 원본으로 이미 있던) 근거 id. */
  add: (input: RecordEvidenceAddInput) => Promise<string>;
  /** 여러 근거를 한 번의 저장으로 일괄 추가(학급 전체 끌어오기용). 반환 = 실제로 추가된 건수. */
  addMany: (inputs: readonly RecordEvidenceAddInput[]) => Promise<number>;
  update: (id: string, patch: RecordEvidencePatch) => Promise<void>;
  /**
   * AI 전송 제외 여부를 교사가 직접 켜고 끈다(자동 판정의 오탐을 되돌리는 길).
   * 자동 표시와 달리 이쪽이 최종 판단이다.
   */
  setExcludedFromAi: (id: string, excluded: boolean) => Promise<void>;
  /**
   * 위와 같은 일을 여러 건에 **한 번의 저장**으로(보드 하단 바 [AI 제외]/[AI 제외 해제], 설계서 §4-5).
   * `ids` 가 비면 아무것도 하지 않는다.
   */
  setExcludedFromAiMany: (ids: readonly string[], excluded: boolean) => Promise<void>;
  /**
   * 근거를 주제(탐구 흐름)로 묶거나(threadId) 미분류로 되돌린다(null). 여러 건을 한 번의 저장으로.
   * 창고에서 묶는 것이 기본 경로라 이 함수가 주제 열의 저장 관문이다.
   */
  setThread: (ids: readonly string[], threadId: string | null) => Promise<void>;
  /**
   * 근거 카드의 교사 메모(ADR-103). 빈 글이면 칸을 지운다.
   * ★원본 기록에는 쓰지 않는다 — 원본은 사실이고 이 메모는 해석이다.
   */
  setNote: (id: string, note: string) => Promise<void>;
  /**
   * 근거 지도(ADR-106): 앞 근거에서 뒤 근거로 잇는다. 이을 수 없으면 **저장 0회**로 사유를 돌려준다(`null` = 이었다).
   * ★소유(`threadId`)·본문은 건드리지 않는다. 연결은 앞 근거의 `links` 에만 산다.
   */
  linkEvidence: (fromId: string, toId: string, note?: string) => Promise<LinkRejection | null>;
  /** 연결 끊기 — 근거는 둘 다 그대로 남는다. 없는 연결이면 저장 0회. */
  unlinkEvidence: (fromId: string, toId: string) => Promise<void>;
  /** 이음말 고치기. 빈 글이면 칸을 지운다. 손대면 출처는 선생님이 된다. */
  setEvidenceLinkNote: (fromId: string, toId: string, note: string) => Promise<void>;
  /** 방향 바꾸기 — A→B 를 B→A 로. 이음말은 따라간다. 반대쪽에 이미 있으면 사유를 돌려준다. */
  reverseEvidenceLink: (fromId: string, toId: string) => Promise<LinkRejection | null>;
  /**
   * 보드: 선택한 근거를 기존 주제 열로 보낸다. 한 번의 저장.
   * ★주제가 이 학생 것이 아니거나 없으면 **아무것도 저장하지 않고** 던진다 — A 학생 주제에 B 학생 근거가 묶이는 사고의 마지막 문.
   */
  moveToThread: (
    input: EvidenceMoveInput & { readonly threadId: string },
  ) => Promise<EvidenceMoveResult>;
  /**
   * 보드: 새 주제를 만들며 보낸다 — 주제 생성 + 이동이 한 동작이다.
   * 옮길 근거가 없으면 주제도 만들지 않고, 이동 저장이 실패하면 만든 주제를 되돌린다(빈 주제만 남는 절반 성공 금지).
   */
  moveToNewThread: (
    input: EvidenceMoveInput & {
      readonly title: string;
      readonly classId?: string;
      readonly keywords?: readonly string[];
    },
  ) => Promise<EvidenceMoveToNewThreadResult>;
  /** 보드: 선택한 근거를 미분류로 되돌린다(threadId 키 제거). */
  unclassify: (input: EvidenceMoveInput) => Promise<EvidenceMoveResult>;
  /**
   * 입력 화면의 저장 관문 — 원본 하나당 근거 하나를 보장한다(계획 §5.1-5).
   * 이미 같은 `studentRef + sourceId` 근거가 있으면 **그 id 를 재사용**하고 본문·영역·제외 플래그는 보존한다.
   * 같은 키인데 sourceType/classId 가 다르거나 이미 2개 이상이면 임의로 고르지 않고 던진다.
   */
  ensureEvidenceFromSource: (
    input: EnsureEvidenceFromSourceInput,
  ) => Promise<EnsureEvidenceFromSourceResult>;
  /**
   * 비교창의 [원본 내용으로 바꾸기] — content·date·slots **세 필드만** 원본 값으로 맞춘다.
   *
   * ★쓰기 직전에 원본과 근거를 **다시 읽어** 캡처와 대조한다. 대화상자를 열어 둔 사이에
   *   어느 한쪽이 바뀌었거나 사라졌으면 **쓰기 0회**로 돌아간다(계획 §5.3).
   * ★주제·영역·AI 제외는 그동안 바뀌었어도 **최신값을 보존**한다. 이 관문이 건드리는 것은
   *   세 필드뿐이다.
   */
  applySourceFields: (params: {
    readonly evidenceId: string;
    readonly studentRef: string;
    readonly capture: ComparisonCapture;
    readonly fields: EvidenceSourceFieldsPatch;
    /**
     * 락 안에서 원본을 다시 읽는 함수. 스토어가 관찰·담임 저장소를 직접 알지 않도록 주입받는다.
     * 읽기 실패는 던져서 알린다 - `null`(정말 없음)과 구별해야 한다.
     */
    readonly readLatestSource: () => Promise<
      (ComparableRecordFields & { readonly studentRef: string }) | null
    >;
  }) => Promise<ComparisonRecheck>;
  remove: (id: string) => Promise<void>;
  /**
   * 방금 지운 근거를 **있던 모습 그대로** 되돌린다(5초 되돌리기, 계획 §5.3 · AC-16 (c)).
   *
   * 일반 `add` 를 쓰지 않는 이유가 둘이다.
   *  1. `add` 는 새 근거를 조립하므로 **AI 제외를 다시 판정**한다. 교사가 일부러 꺼 둔 제외가
   *     금지 어휘 때문에 되살아나고, 주제·영역도 입력으로 다시 넘겨야 한다. 되돌리기는 판정이
   *     아니라 **복원**이라 원래 레코드를 통째로 다시 넣는다.
   *  2. `add` 는 같은 원본이 이미 있으면 그 id 만 돌려주고 끝난다 - 화면은 "되돌렸다"고 말하지만
   *     실제로는 아무것도 안 했다. 그사이 같은 원본을 다시 저장했다면 그 **새 편집을 덮지 않고**
   *     기존 근거가 있다고 알려야 한다.
   */
  restoreRemoved: (evidence: RecordEvidence) => Promise<EvidenceRestoreResult>;
  exists: (id: string) => boolean;

  // 파생 조회
  getByStudentRef: (studentRef: string) => readonly RecordEvidence[];
  /** 특정 학생의 특정 영역 근거(해당 area 를 포함하는 근거). */
  getByArea: (studentRef: string, area: RecordArea) => readonly RecordEvidence[];
  /** 특정 주제(탐구 흐름)에 묶인 근거. */
  getByThread: (threadId: string) => readonly RecordEvidence[];
}

const FILE_KEY = SYNC_FILE_KEYS.recordEvidence;

/**
 * 저장소 최신 목록. **읽기 실패는 그대로 던진다** — 빈 목록으로 갈음하면 통째 저장 구조에서
 * 교사가 모은 근거를 전부 지운다(계획 §5.2 "읽기 실패를 빈 파일로 간주하지 않는다").
 */
async function readLatest(): Promise<readonly RecordEvidence[]> {
  const data = await recordEvidenceRepository.getRecordEvidence();
  return data?.records ?? [];
}

/** 중복 판정 키 — 화면이 아니라 저장이 쥐는 단위다. 널 문자는 studentRef 에 나올 수 없어 구분자로 안전하다. */
function sourceKey(studentRef: string, sourceId: string): string {
  return `${studentRef}\u0000${sourceId}`;
}

/** 이 학생의 같은 원본에서 온 근거들. sourceId 없는 직접 입력 근거는 대상 밖이다(계획 §5.1-6). */
function matchesSource(
  list: readonly RecordEvidence[],
  studentRef: string,
  sourceId: string,
): readonly RecordEvidence[] {
  return list.filter((r) => r.studentRef === studentRef && r.sourceId === sourceId);
}

/** 저장할 근거 한 장을 만든다(순수) — 락 안 변환에서만 쓴다. */
function buildEvidence(input: RecordEvidenceAddInput, now: number): RecordEvidence {
  return {
    id: generateUUID(),
    studentRef: input.studentRef,
    areas: normalizeEvidenceAreas(input.areas),
    content: input.content,
    createdAt: now,
    updatedAt: now,
    ...(input.date !== undefined ? { date: input.date } : {}),
    ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
    ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
    ...(input.classId !== undefined ? { classId: input.classId } : {}),
    ...(input.slots && input.slots.length > 0 ? { slots: [...input.slots] } : {}),
    ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
    ...(input.note !== undefined && input.note.trim().length > 0
      ? { note: input.note.trim().slice(0, NARRATIVE_NOTE_MAX) }
      : {}),
    // 기재 금지 항목이 섞였으면 저장 시점에 표시한다 — 모델까지 가지 않게(ADR-072 결정 5). 교사가 켜달라고 한 것도 같은 칸.
    ...(input.excludedFromAi === true || hasProhibitedTerms(input.content)
      ? { excludedFromAi: true }
      : {}),
  };
}

/** 지정한 근거들의 주제를 바꾼다(순수). `null` 은 키를 지워 "미분류(부재)"로 남긴다. */
function applyThread(
  list: readonly RecordEvidence[],
  ids: ReadonlySet<string>,
  threadId: string | null,
  now: number,
): readonly RecordEvidence[] {
  return list.map((r) => {
    if (!ids.has(r.id)) return r;
    if (threadId === null) {
      // 미분류로 되돌림 — 키를 지워 "부재" 로 남긴다(빈 문자열을 넣지 않는다).
      const { threadId: _dropped, ...rest } = r;
      void _dropped;
      return { ...rest, updatedAt: now };
    }
    return { ...r, threadId, updatedAt: now };
  });
}

/**
 * 이 학생의 근거만 추린다(중복 제거, 입력 순서 보존). 나머지는 건너뛴 목록으로.
 * ★화면이 학생을 바꾸면 선택을 비우지만, 만약 앞 학생의 선택이 따라와도 여기서 걸린다(ADR-072 회고 — 이중 방어).
 * ★판정 대상은 **락 안에서 방금 읽은 목록**이다. 화면 메모리로 판정하면 낡은 소유권으로 남의 근거를 옮긴다.
 */
function partitionMine(
  list: readonly RecordEvidence[],
  studentRef: string,
  evidenceIds: readonly string[],
): { mine: string[]; skipped: string[] } {
  const owner = new Map(list.map((r) => [r.id, r.studentRef] as const));
  const seen = new Set<string>();
  const mine: string[] = [];
  const skipped: string[] = [];
  for (const id of evidenceIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (owner.get(id) === studentRef) mine.push(id);
    else skipped.push(id);
  }
  return { mine, skipped };
}

/**
 * 저장 직전 주제 재검사용 읽기 — **락을 잡지 않는다.**
 *
 * 근거 락 안에서 주제 락을 잡으면 근거→주제가 되어 이 코드베이스가 정한 주제→근거 순서를
 * 뒤집는다(교착). 읽기는 통째 읽기라 반쪽 상태가 없어 락 없이도 안전하다. 쓰기 경로는
 * 여전히 주제 스토어의 공개 함수(=주제 락)로만 간다.
 */
async function readThreadUnlocked(threadId: string): Promise<InquiryThread | undefined> {
  const data = await inquiryThreadRepository.getInquiryThreads();
  return (data?.records ?? []).find((t) => t.id === threadId);
}

/**
 * 소유가 바뀔 근거들을 **지금 속한 주제별로** 묶는다(순수, 변환 안에서 부른다).
 * 미분류(주제 없음)는 뗄 자리가 없으므로 넣지 않는다.
 */
/** 옮김 결과 + 이전 주제 계획 — 변환이 둘 다 돌려줘야 락 밖에서 뗄 수 있다. */
interface MovePlan {
  outcome: EvidenceMoveResult;
  plan: ReadonlyMap<string, string[]> | null;
}

function groupByCurrentThread(
  list: readonly RecordEvidence[],
  ids: readonly string[],
): ReadonlyMap<string, string[]> {
  const want = new Set(ids);
  const out = new Map<string, string[]>();
  for (const r of list) {
    if (!want.has(r.id) || r.threadId === undefined) continue;
    const bucket = out.get(r.threadId);
    if (bucket === undefined) out.set(r.threadId, [r.id]);
    else bucket.push(r.id);
  }
  return out;
}

/**
 * 소유가 바뀐 근거를 **이전 주제의 장면에서 뗀다.**
 *
 * ★근거 락 **밖에서** 부른다 — 안에서 부르면 근거→주제 역순 잠금이 된다(교착).
 * ★던지지 않는다. 실패해도 읽기 가림(`scenesOf`)이 받치고 있어 화면은 이미 맞다.
 * ★이걸 빠뜨리면 옛 장면에 id 가 남아, 나중에 같은 근거를 그 주제로 되돌렸을 때
 *   "아직 안 놓음" 이 아니라 **옛 자리에 되살아난다.**
 */
async function detachFromPreviousScenes(plan: ReadonlyMap<string, string[]>): Promise<void> {
  for (const [threadId, ids] of plan) {
    await useInquiryThreadStore.getState().detachFromScenes(threadId, ids);
  }
}

/**
 * 생기부 작성 근거(RecordEvidence) 스토어 — record-evidence.json 을 통째로 읽고 쓴다.
 *
 * ★쓰기 규율(계획 §5.2): 공개 쓰기 진입점은 공용 파일 락을 **정확히 한 번** 잡고 그 안에서
 *   최신 읽기 → 순수 변환 → 저장 → 게시를 한다.
 *   - 메모리를 먼저 바꾸지 않는다 — 저장이 실패하면 화면에만 있는 유령 근거가 남는다.
 *   - `get().records` 로 next 를 미리 계산하지 않는다 — 동기화가 방금 내려받은 내용을 낡은
 *     스냅샷이 덮는다(2026-07 codex QA 실증 구조).
 *   - 같은 락을 잡는 공개 함수를 await 하지 않는다. 내부는 락을 잡지 않는 순수 helper 로 나눈다.
 *   - 두 파일이 필요하면 **주제 → 근거** 순서로만 잠근다. 역순 경로를 두지 않는다.
 */
export const useRecordEvidenceStore = create<RecordEvidenceState>((set, get) => {
  /**
   * 공개 쓰기 진입점의 공통 몸통 — 락 안에서 최신 읽기 → 변환 → 저장 → 게시.
   * next 로 latest 를 그대로 돌려주면 "바뀐 것 없음"이라 저장하지 않는다(저장 0회 계약).
   */
  const write = <T>(
    transform: (latest: readonly RecordEvidence[]) =>
      | Promise<{ next: readonly RecordEvidence[]; result: T }>
      | {
          next: readonly RecordEvidence[];
          result: T;
        },
  ): Promise<T> =>
    withFileLock(FILE_KEY, async () => {
      const latest = await readLatest();
      const { next, result } = await transform(latest);
      if (next !== latest) {
        await recordEvidenceRepository.saveRecordEvidence({ records: next });
      }
      set({ records: next, loaded: true, loadError: null });
      return result;
    });

  /** 락 안에서 읽기만 한다(쓰기 없음) — 소유권 판정처럼 "지금 파일이 뭔데"만 필요할 때. */
  const readInLock = <T>(project: (latest: readonly RecordEvidence[]) => T): Promise<T> =>
    withFileLock(FILE_KEY, async () => project(await readLatest()));

  return {
    records: [],
    loaded: false,
    loadError: null,

    load: async () => {
      if (get().loaded) return;
      try {
        const records = await readLatest();
        set({ records, loaded: true, loadError: null });
      } catch (err) {
        // 화면은 계속 뜨되 **빈 목록과 구별**되게 남긴다. 이 상태에서의 쓰기는 락 안에서
        // 다시 읽으므로, 읽기가 여전히 실패하면 저장까지 가지 않고 그대로 던진다
        // (읽기 실패가 "0건 저장"으로 둔갑하지 않는다 — AC-08).
        console.error('[RecordEvidenceStore] load failed:', err);
        set({ loaded: true, loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    forceReload: async () => {
      await withFileLock(FILE_KEY, async () => {
        try {
          const records = await readLatest();
          set({ records, loaded: true, loadError: null });
        } catch (err) {
          console.error('[RecordEvidenceStore] forceReload failed:', err);
          set({ loadError: err instanceof Error ? err.message : String(err) });
        }
      });
    },

    add: async (input) => {
      const outcome = await write((latest) => {
        if (input.sourceId !== undefined) {
          // 같은 원본이 이미 근거가 됐다 — 입력과 보드 재진입이 겹쳐도 1개만 남긴다(계획 §5.1-6).
          const dup = matchesSource(latest, input.studentRef, input.sourceId)[0];
          if (dup) return { next: latest, result: { id: dup.id, created: false } };
        }
        const rec = buildEvidence(input, Date.now());
        return { next: [...latest, rec], result: { id: rec.id, created: true } };
      });
      if (outcome.created) {
        trackEventSafely('record_evidence_import', {
          sourceType: input.sourceType ?? 'manual',
          count: 1,
        });
      }
      return outcome.id;
    },

    addMany: async (inputs) => {
      if (inputs.length === 0) return 0;
      const added = await write((latest) => {
        const now = Date.now();
        // 디스크에 이미 있는 원본 + 이번 묶음 안의 중복을 같은 자리에서 막는다.
        const taken = new Set(
          latest
            .filter((r) => r.sourceId !== undefined)
            .map((r) => sourceKey(r.studentRef, r.sourceId as string)),
        );
        const recs: RecordEvidence[] = [];
        for (const input of inputs) {
          if (input.sourceId !== undefined) {
            const key = sourceKey(input.studentRef, input.sourceId);
            if (taken.has(key)) continue;
            taken.add(key);
          }
          recs.push(buildEvidence(input, now));
        }
        if (recs.length === 0) return { next: latest, result: recs as readonly RecordEvidence[] };
        return { next: [...latest, ...recs], result: recs as readonly RecordEvidence[] };
      });
      if (added.length > 0) {
        // 일괄 끌어오기는 출처가 섞일 수 있어 첫 건의 출처로 대표한다(이름만 담는 계측).
        trackEventSafely('record_evidence_import', {
          sourceType: added[0]?.sourceType ?? 'manual',
          count: added.length,
        });
      }
      return added.length;
    },

    update: async (id, patch) => {
      await write((latest) => {
        if (!latest.some((r) => r.id === id)) return { next: latest, result: undefined };
        const now = Date.now();
        const next = latest.map((r) =>
          r.id === id
            ? {
                ...r,
                ...(patch.areas !== undefined
                  ? { areas: normalizeEvidenceAreas(patch.areas) }
                  : {}),
                ...(patch.content !== undefined ? { content: patch.content } : {}),
                // 내용이 바뀌면 다시 본다. 단 **붙이기만** 한다 — 교사가 푼 것을 자동으로
                // 되돌리면 판단을 빼앗는 셈이고, 안전한 방향은 '더 거르는' 쪽이다.
                ...(patch.content !== undefined && hasProhibitedTerms(patch.content)
                  ? { excludedFromAi: true }
                  : {}),
                ...(patch.date !== undefined ? { date: patch.date } : {}),
                updatedAt: now,
              }
            : r,
        );
        return { next, result: undefined };
      });
    },

    setExcludedFromAi: async (id, excluded) => {
      await write((latest) => {
        if (!latest.some((r) => r.id === id)) return { next: latest, result: undefined };
        const now = Date.now();
        return {
          next: latest.map((r) =>
            r.id === id ? { ...r, excludedFromAi: excluded, updatedAt: now } : r,
          ),
          result: undefined,
        };
      });
    },

    setExcludedFromAiMany: async (ids, excluded) => {
      if (ids.length === 0) return;
      await write((latest) => {
        const target = new Set(ids);
        if (!latest.some((r) => target.has(r.id))) return { next: latest, result: undefined };
        const now = Date.now();
        return {
          next: latest.map((r) =>
            target.has(r.id) ? { ...r, excludedFromAi: excluded, updatedAt: now } : r,
          ),
          result: undefined,
        };
      });
    },

    setNote: async (id, note) => {
      const trimmed = note.trim().slice(0, NARRATIVE_NOTE_MAX);
      await write((latest) => {
        const target = latest.find((r) => r.id === id);
        if (target === undefined) return { next: latest, result: undefined };
        if ((target.note ?? '') === trimmed) return { next: latest, result: undefined };
        const now = Date.now();
        return {
          next: latest.map((r) => {
            if (r.id !== id) return r;
            if (trimmed.length === 0) {
              const rest = { ...r };
              delete (rest as { note?: string }).note;
              return { ...rest, updatedAt: now };
            }
            return { ...r, note: trimmed, updatedAt: now };
          }),
          result: undefined,
        };
      });
    },

    linkEvidence: async (fromId, toId, note) =>
      write((latest) => {
        const why = linkRejection(fromId, toId, latest);
        if (why !== null) return { next: latest, result: why };
        const now = Date.now();
        const clean = normalizeLinkNote(note, NARRATIVE_NOTE_MAX);
        return {
          next: latest.map((r) =>
            r.id === fromId
              ? {
                  ...r,
                  links: [
                    ...(r.links ?? []),
                    { toId, ...(clean === undefined ? {} : { note: clean }) },
                  ],
                  updatedAt: now,
                }
              : r,
          ),
          result: null,
        };
      }),

    unlinkEvidence: async (fromId, toId) => {
      await write((latest) => {
        const from = latest.find((r) => r.id === fromId);
        if (from === undefined || !(from.links ?? []).some((l) => l.toId === toId)) {
          return { next: latest, result: undefined };
        }
        const now = Date.now();
        return {
          next: latest.map((r) => {
            if (r.id !== fromId) return r;
            const links = (r.links ?? []).filter((l) => l.toId !== toId);
            if (links.length === 0) {
              const rest = { ...r };
              delete (rest as { links?: unknown }).links;
              return { ...rest, updatedAt: now };
            }
            return { ...r, links, updatedAt: now };
          }),
          result: undefined,
        };
      });
    },

    setEvidenceLinkNote: async (fromId, toId, note) => {
      const clean = normalizeLinkNote(note, NARRATIVE_NOTE_MAX);
      await write((latest) => {
        const from = latest.find((r) => r.id === fromId);
        const link = (from?.links ?? []).find((l) => l.toId === toId);
        if (from === undefined || link === undefined) return { next: latest, result: undefined };
        if ((link.note ?? undefined) === clean && (link.source ?? 'teacher') === 'teacher') {
          return { next: latest, result: undefined };
        }
        const now = Date.now();
        return {
          next: latest.map((r) =>
            r.id === fromId
              ? {
                  ...r,
                  links: (r.links ?? []).map((l) =>
                    l.toId === toId ? { toId, ...(clean === undefined ? {} : { note: clean }) } : l,
                  ),
                  updatedAt: now,
                }
              : r,
          ),
          result: undefined,
        };
      });
    },

    reverseEvidenceLink: async (fromId, toId) =>
      write((latest) => {
        const from = latest.find((r) => r.id === fromId);
        const link = (from?.links ?? []).find((l) => l.toId === toId);
        if (from === undefined || link === undefined) return { next: latest, result: 'missing' };
        // 뒤집은 뒤의 모습으로 검사한다 — 지금 연결을 뺀 자료에서 B→A 를 이을 수 있는가.
        const without = latest.map((r) =>
          r.id === fromId ? { ...r, links: (r.links ?? []).filter((l) => l.toId !== toId) } : r,
        );
        const why = linkRejection(toId, fromId, without);
        if (why !== null) return { next: latest, result: why };
        const now = Date.now();
        return {
          next: without.map((r) => {
            if (r.id === fromId) {
              const links = r.links ?? [];
              if (links.length === 0) {
                const rest = { ...r };
                delete (rest as { links?: unknown }).links;
                return { ...rest, updatedAt: now };
              }
              return { ...r, updatedAt: now };
            }
            if (r.id === toId) {
              return {
                ...r,
                links: [...(r.links ?? []), { ...link, toId: fromId }],
                updatedAt: now,
              };
            }
            return r;
          }),
          result: null,
        };
      }),

    setThread: async (ids, threadId) => {
      if (ids.length === 0) return;
      const plan = await write<ReadonlyMap<string, string[]> | null>((latest) => {
        const target = new Set(ids);
        if (!latest.some((r) => target.has(r.id))) return { next: latest, result: null };
        // 옮기기 **전에** 지금 주제를 적어 둔다 — 옮긴 뒤에는 어디서 왔는지 알 수 없다.
        const before = groupByCurrentThread(latest, ids);
        return { next: applyThread(latest, target, threadId, Date.now()), result: before };
      });
      // ★목표 주제 자신의 장면에서는 떼지 않는다 — 같은 주제 안에서 부르면 이미 놓여 있던 카드가
      //   조용히 "아직 안 놓음"으로 떨어진다. 형제 경로 `moveToThread` 가 이미 이렇게 거른다.
      if (plan !== null) {
        const others =
          threadId === null ? plan : new Map([...plan].filter(([id]) => id !== threadId));
        await detachFromPreviousScenes(others);
      }
    },

    moveToThread: async ({ studentRef, evidenceIds, threadId }) => {
      // 1) 주제 락에서 존재·소유를 확인한다. 주제 → 근거 순서(역순 경로 없음).
      //    보드의 열 끌어놓기는 마친 주제도 대상이라 requireOpen 을 켜지 않는다.
      await useInquiryThreadStore.getState().assertLinkable(threadId, studentRef);
      // 2) 근거 락에서 최신을 다시 읽어 소유권을 판정하고 한 번에 옮긴다.
      const { outcome, plan } = await write<MovePlan>((latest) => {
        const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
        if (mine.length === 0) {
          return {
            next: latest,
            result: { outcome: { movedIds: [], skippedIds: skipped }, plan: null },
          };
        }
        const before = groupByCurrentThread(latest, mine);
        return {
          next: applyThread(latest, new Set(mine), threadId, Date.now()),
          result: { outcome: { movedIds: mine, skippedIds: skipped }, plan: before },
        };
      });
      // 다른 주제에서 온 근거는 그쪽 장면에서 뗀다(같은 주제 안 이동이면 아무 일도 없다).
      if (plan !== null) {
        const others = new Map([...plan].filter(([id]) => id !== threadId));
        await detachFromPreviousScenes(others);
      }
      return outcome;
    },

    unclassify: async ({ studentRef, evidenceIds }) => {
      const { outcome, plan } = await write<MovePlan>((latest) => {
        const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
        if (mine.length === 0) {
          return {
            next: latest,
            result: { outcome: { movedIds: [], skippedIds: skipped }, plan: null },
          };
        }
        const before = groupByCurrentThread(latest, mine);
        return {
          next: applyThread(latest, new Set(mine), null, Date.now()),
          result: { outcome: { movedIds: mine, skippedIds: skipped }, plan: before },
        };
      });
      if (plan !== null) await detachFromPreviousScenes(plan);
      return outcome;
    },

    moveToNewThread: async ({ studentRef, evidenceIds, title, classId, keywords }) => {
      // 1) 옮길 것이 있는지부터 본다(읽기만) — 빈 주제를 만들지 않기 위해서다.
      const preview = await readInLock((latest) => partitionMine(latest, studentRef, evidenceIds));
      if (preview.mine.length === 0) {
        return { movedIds: [], skippedIds: preview.skipped, threadId: null };
      }

      // 2) 주제를 만든다(주제 락). 생성 실패는 "주제 생성 실패"이지 "연결 실패"가 아니다.
      let threadId: string;
      try {
        threadId = await useInquiryThreadStore.getState().add({
          studentRef,
          title,
          ...(classId !== undefined ? { classId } : {}),
          ...(keywords !== undefined ? { keywords } : {}),
        });
      } catch (err) {
        throw new EvidenceLinkError(
          err instanceof Error ? err.message : String(err),
          'thread-create',
          null,
          null,
          { cause: err },
        );
      }

      // 3) 근거를 옮긴다(근거 락). 주제 락은 이미 풀렸다 — 근거 락 안에서 주제 저장을 기다리지 않는다.
      try {
        const { outcome: moved, plan } = await write<MovePlan>((latest) => {
          const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
          if (mine.length === 0) {
            return {
              next: latest,
              result: { outcome: { movedIds: [], skippedIds: skipped }, plan: null },
            };
          }
          const before = groupByCurrentThread(latest, mine);
          return {
            next: applyThread(latest, new Set(mine), threadId, Date.now()),
            result: { outcome: { movedIds: mine, skippedIds: skipped }, plan: before },
          };
        });
        // 옛 주제의 장면에서 뗀다 — 방금 만든 주제로 왔으니 남은 자리는 전부 이전 것이다.
        if (plan !== null) await detachFromPreviousScenes(plan);
        if (moved.movedIds.length === 0) {
          // 2)~3) 사이에 다른 경로가 근거를 지웠거나 옮겼다. 빈 주제를 남기지 않는다.
          const compensation = await useInquiryThreadStore.getState().removeIfUnused(threadId);
          return {
            movedIds: [],
            skippedIds: moved.skippedIds,
            threadId: compensation === 'removed' ? null : threadId,
          };
        }
        return { ...moved, threadId };
      } catch (err) {
        // 이동 저장이 실패했다 — 방금 만든 주제를 되돌려 빈 열만 남는 절반 성공을 막는다.
        // 되돌리기는 "아직 아무도 안 쓸 때만" 한다. 그 사이 다른 기록이 쓰기 시작했으면 보존한다.
        const compensation = await useInquiryThreadStore.getState().removeIfUnused(threadId);
        const base = err instanceof Error ? err.message : String(err);
        if (compensation === 'failed') {
          // 디스크를 확인하지 못했다. "빈 주제가 남았다"고 단정하지 않는다(계획 §5.1-7).
          throw new EvidenceLinkError(
            `${base} · 연결하지 못했습니다. 주제 상태를 확인해 주세요.`,
            'compensation',
            threadId,
            compensation,
            { cause: err },
          );
        }
        throw new EvidenceLinkError(base, 'evidence-link', threadId, compensation, { cause: err });
      }
    },

    ensureEvidenceFromSource: async (input) => {
      const { threadId } = input;
      // 1) 주제를 골랐으면 주제 락에서 먼저 검증한다(주제 → 근거 순서).
      //    입력 중 연결은 **열린 주제만** — 마친 주제는 다시 연 뒤에야 연결한다(계획 §4.2).
      if (threadId !== undefined) {
        await useInquiryThreadStore
          .getState()
          .assertLinkable(threadId, input.studentRef, { requireOpen: true });
      }

      const outcome = await write<EnsureEvidenceFromSourceResult & { detachFrom?: string }>(
        async (latest) => {
          // 2) 저장 직전 재검사 — 1) 이후 다른 경로에서 닫히거나 지워졌을 수 있다.
          //    ★여기서 주제 **락**을 잡지 않는다. 근거 락 안에서 주제 락을 잡으면 근거→주제가 되어
          //      규정한 주제→근거 순서를 뒤집는다. 읽기는 락 없이도 안전하다(통째 읽기).
          if (threadId !== undefined) {
            const fresh = await readThreadUnlocked(threadId);
            if (!fresh) {
              throw new EvidenceLinkError(
                '연결하려던 주제가 없습니다. 주제를 다시 골라 주세요.',
                'evidence-link',
                threadId,
                null,
              );
            }
            if (fresh.studentRef !== input.studentRef) {
              throw new EvidenceLinkError(
                '다른 학생의 주제에는 묶을 수 없습니다.',
                'evidence-link',
                threadId,
                null,
              );
            }
            if (fresh.status !== 'open') {
              throw new EvidenceLinkError(
                '마친 주제입니다. 주제를 다시 연 뒤에 연결해 주세요.',
                'evidence-link',
                threadId,
                null,
              );
            }
          }

          const dups = matchesSource(latest, input.studentRef, input.sourceId);
          if (dups.length > 1) {
            // 임의로 하나를 고르지 않는다 — 어느 쪽을 고쳐야 할지 모르는 채로 쓰면 사고다(계획 §5.1-5).
            throw new EvidenceLinkError(
              '이 기록에서 온 근거가 이미 여러 개입니다. 근거 보드에서 정리한 뒤 다시 시도해 주세요.',
              'evidence-link',
              threadId ?? null,
              null,
            );
          }

          const existing = dups[0];
          const now = Date.now();

          if (!existing) {
            const rec = buildEvidence(
              {
                studentRef: input.studentRef,
                areas: input.areas,
                content: input.content,
                sourceType: input.sourceType,
                sourceId: input.sourceId,
                ...(input.date !== undefined ? { date: input.date } : {}),
                ...(input.classId !== undefined ? { classId: input.classId } : {}),
                ...(input.slots !== undefined ? { slots: input.slots } : {}),
                ...(threadId !== undefined ? { threadId } : {}),
                ...(input.excludedFromAi !== undefined
                  ? { excludedFromAi: input.excludedFromAi }
                  : {}),
              },
              now,
            );
            return {
              next: [...latest, rec],
              result: { evidenceId: rec.id, reused: false, threadLinked: threadId !== undefined },
            };
          }

          // 같은 키인데 출처 종류·수업반이 다르면 같은 원본이라고 볼 수 없다. 임의로 잇지 않는다.
          if (existing.sourceType !== input.sourceType || existing.classId !== input.classId) {
            throw new EvidenceLinkError(
              '이미 있는 근거와 출처 정보가 맞지 않습니다. 근거 보드에서 확인해 주세요.',
              'evidence-link',
              threadId ?? null,
              null,
            );
          }

          // 재사용 — 본문·영역·제외 플래그는 **보존**한다(교사가 다듬어 둔 근거를 원본으로 덮지 않는다).
          // 이 관문이 바꾸는 것은 주제 연결뿐이다. 본문 반영은 S4 의 명시 비교·반영이 담당한다.
          if (threadId === undefined || existing.threadId === threadId) {
            return {
              next: latest,
              result: { evidenceId: existing.id, reused: true, threadLinked: false },
            };
          }
          return {
            next: applyThread(latest, new Set([existing.id]), threadId, now),
            result: {
              evidenceId: existing.id,
              reused: true,
              threadLinked: true,
              // ★가장 놓치기 쉬운 일곱째 경로 — 원본을 다시 열어 다른 주제로 저장하면
              //   옛 주제의 장면에 id 만 남아 나중에 그 자리로 되살아난다.
              ...(existing.threadId !== undefined ? { detachFrom: existing.threadId } : {}),
            },
          };
        },
      );
      if (outcome.detachFrom !== undefined) {
        await detachFromPreviousScenes(new Map([[outcome.detachFrom, [outcome.evidenceId]]]));
      }
      return outcome;
    },

    applySourceFields: async ({ evidenceId, studentRef, capture, fields, readLatestSource }) =>
      write<ComparisonRecheck>(async (latest) => {
        const current = latest.find((r) => r.id === evidenceId);
        // 원본은 락 없이 읽는다. 근거 락 안에서 다른 락을 잡지 않는다(잠금 순서 계약).
        const source = await readLatestSource();
        const check = recheckBeforeApply(capture, {
          source,
          evidence:
            current && current.studentRef === studentRef
              ? {
                  content: current.content,
                  ...(current.date !== undefined ? { date: current.date } : {}),
                  ...(current.slots !== undefined ? { slots: current.slots } : {}),
                  studentRef: current.studentRef,
                }
              : null,
        });
        // 바뀌었거나 사라졌으면 **쓰지 않는다.** 화면이 비교를 갱신하고 다시 확인받는다.
        if (!check.ok) return { next: latest, result: check };

        const now = Date.now();
        const next = latest.map((r) => {
          if (r.id !== evidenceId) return r;
          // 세 필드 외의 모든 것(주제·영역·제외·출처·createdAt)은 **최신값 그대로** 둔다.
          const { date: _d, slots: _s, ...rest } = r;
          void _d;
          void _s;
          return {
            ...rest,
            content: fields.content,
            ...(fields.date !== null ? { date: fields.date } : {}),
            ...(fields.slots !== null && fields.slots.length > 0
              ? { slots: [...fields.slots] }
              : {}),
            // 새 본문에 대해 금지 표현을 다시 본다. 붙이기만 하고 풀지는 않는다(기존 update 규칙).
            ...(hasProhibitedTerms(fields.content) ? { excludedFromAi: true } : {}),
            updatedAt: now,
          };
        });
        return { next, result: check };
      }),

    remove: async (id) => {
      const plan = await write<ReadonlyMap<string, string[]> | null>((latest) => {
        const next = latest.filter((r) => r.id !== id);
        if (next.length === latest.length) return { next: latest, result: null };
        // 지우기 전에 어느 주제 것이었는지 적어 둔다 — 장면에 id 만 남으면 유령이 된다.
        return { next, result: groupByCurrentThread(latest, [id]) };
      });
      if (plan !== null) await detachFromPreviousScenes(plan);
    },

    restoreRemoved: async (evidence) =>
      write<EvidenceRestoreResult>((latest) => {
        // 이미 같은 id 가 있다(되돌리기를 두 번 눌렀다). 두 벌로 만들지 않는다.
        const sameId = latest.find((r) => r.id === evidence.id);
        if (sameId) return { next: latest, result: { id: sameId.id, restored: false } };
        if (evidence.sourceId !== undefined) {
          // 그사이 같은 원본을 다시 저장했다 - 그 새 편집을 덮지 않고 **아무것도 쓰지 않는다.**
          const taken = matchesSource(latest, evidence.studentRef, evidence.sourceId)[0];
          if (taken) return { next: latest, result: { id: taken.id, restored: false } };
        }
        // 주제·영역·AI 제외·출처·createdAt 까지 **원래 레코드 그대로**. 새로 판정하지 않는다.
        // ★장면 자리는 되살리지 않는다 — 지울 때 뗐으므로 "아직 안 놓음" 으로 돌아온다.
        //   옛 자리에 되살아나면 선생님이 지웠다 되돌린 카드가 엉뚱한 문단 지시가 된다.
        const restored: RecordEvidence = { ...evidence, updatedAt: Date.now() };
        return { next: [...latest, restored], result: { id: restored.id, restored: true } };
      }),

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getByArea: (studentRef, area) =>
      get().records.filter((r) => r.studentRef === studentRef && evidenceInArea(r, area)),

    getByThread: (threadId) => get().records.filter((r) => r.threadId === threadId),
  };
});
