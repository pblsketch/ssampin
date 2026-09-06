import { create } from 'zustand';
import type { RecordArea } from '@domain/entities/RecordDraft';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import {
  normalizeEvidenceAreas,
  type EvidenceSourceType,
  type RecordEvidence,
} from '@domain/entities/RecordEvidence';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { inquiryThreadRepository, recordEvidenceRepository } from '@adapters/di/container';
import {
  useInquiryThreadStore,
  type ThreadCompensationResult,
} from '@adapters/stores/useInquiryThreadStore';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';
import { generateUUID } from '@infrastructure/utils/uuid';
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
   * 교사가 저장 순간부터 AI 제외로 두기(거울 카드의 [AI 제외] = 첫 손댄 저장, 설계서 §4-1). `true` 만 의미가 있다 —
   * 기재 금지 자동 판정을 끄는 값이 아니다(그건 저장 뒤 `setExcludedFromAi` 로).
   */
  excludedFromAi?: boolean;
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
  remove: (id: string) => Promise<void>;
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

    setThread: async (ids, threadId) => {
      if (ids.length === 0) return;
      await write((latest) => {
        const target = new Set(ids);
        if (!latest.some((r) => target.has(r.id))) return { next: latest, result: undefined };
        return { next: applyThread(latest, target, threadId, Date.now()), result: undefined };
      });
    },

    moveToThread: async ({ studentRef, evidenceIds, threadId }) => {
      // 1) 주제 락에서 존재·소유를 확인한다. 주제 → 근거 순서(역순 경로 없음).
      //    보드의 열 끌어놓기는 마친 주제도 대상이라 requireOpen 을 켜지 않는다.
      await useInquiryThreadStore.getState().assertLinkable(threadId, studentRef);
      // 2) 근거 락에서 최신을 다시 읽어 소유권을 판정하고 한 번에 옮긴다.
      return write((latest) => {
        const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
        if (mine.length === 0) {
          return { next: latest, result: { movedIds: [], skippedIds: skipped } };
        }
        return {
          next: applyThread(latest, new Set(mine), threadId, Date.now()),
          result: { movedIds: mine, skippedIds: skipped },
        };
      });
    },

    unclassify: async ({ studentRef, evidenceIds }) =>
      write((latest) => {
        const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
        if (mine.length === 0) {
          return { next: latest, result: { movedIds: [], skippedIds: skipped } };
        }
        return {
          next: applyThread(latest, new Set(mine), null, Date.now()),
          result: { movedIds: mine, skippedIds: skipped },
        };
      }),

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
        const moved = await write((latest) => {
          const { mine, skipped } = partitionMine(latest, studentRef, evidenceIds);
          if (mine.length === 0) {
            return { next: latest, result: { movedIds: [], skippedIds: skipped } };
          }
          return {
            next: applyThread(latest, new Set(mine), threadId, Date.now()),
            result: { movedIds: mine, skippedIds: skipped },
          };
        });
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

      return write<EnsureEvidenceFromSourceResult>(async (latest) => {
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
          result: { evidenceId: existing.id, reused: true, threadLinked: true },
        };
      });
    },

    remove: async (id) => {
      await write((latest) => {
        const next = latest.filter((r) => r.id !== id);
        return { next: next.length === latest.length ? latest : next, result: undefined };
      });
    },

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getByArea: (studentRef, area) =>
      get().records.filter((r) => r.studentRef === studentRef && r.areas.includes(area)),

    getByThread: (threadId) => get().records.filter((r) => r.threadId === threadId),
  };
});
