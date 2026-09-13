import { publishEvidenceWrite } from './evidenceEditJournal';
import { create } from 'zustand';
import {
  normalizeThreadKeywords,
  type InquiryThread,
  type InquiryThreadStatus,
} from '@domain/entities/InquiryThread';
import type { NarrativeLink, NarrativeScene } from '@domain/entities/InquiryThread';
import { NARRATIVE_NOTE_MAX, NARRATIVE_SCENE_MAX } from '@domain/entities/InquiryThread';
import type { NarrativeRole } from '@domain/rules/narrativeParagraphs';
import type { RecordModuleId } from '@domain/entities/RecordWritingStyle';
import {
  defaultModuleFor,
  normalizeScaffoldScenes,
  type NarrativeFrameId,
  type RecordScaffold,
} from '@domain/rules/narrativeFrames';
import { chainOf, pruneSceneFocus } from '@domain/rules/narrativeScenes';
import {
  placeSceneAfter as placeSceneAfterRule,
  stepScene,
  markLeadInRecheck,
} from '@domain/rules/narrativeSceneOrder';
import { academicTermForDate } from '@domain/rules/academicCalendar';
import { inquiryThreadRepository, recordEvidenceRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

/** 흐름 추가 입력 — id·시각·term 은 스토어가 채운다. */
export interface InquiryThreadAddInput {
  studentRef: string;
  title: string;
  classId?: string;
  keywords?: readonly string[];
  standardCodes?: readonly string[];
}

/** 흐름 부분 수정 입력. `undefined` 는 "건드리지 않음". */
export interface InquiryThreadPatch {
  title?: string;
  keywords?: readonly string[];
  standardCodes?: readonly string[];
  competencyKeywords?: readonly string[];
  nextNotes?: string;
  status?: InquiryThreadStatus;
}

/**
 * 보상 삭제 결과 — "지웠다"와 "안 지우는 게 맞다"와 "모르겠다"를 구별한다(계획 §5.1-7).
 * `kept` = 다른 기록이 이미 쓰고 있어 보존. `failed` = 확인·삭제가 실패해 상태 불명.
 */
export type ThreadCompensationResult = 'removed' | 'kept' | 'failed';

/** 장면 하나를 새로 만들 때의 입력 — id 는 스토어가 채운다. */
export interface NarrativeSceneDraft {
  role: NarrativeRole;
  moduleId?: RecordModuleId;
  label?: string;
}

export interface SceneGroup {
  sceneId: string;
  evidenceIds: readonly string[];
}

/**
 * AI 서사 초안 [적용] 한 장면 — 뼈대·배치·메모를 **한 덩어리로** 받는다.
 *
 * ★장면 id 를 화면이 짓지 않는다. 적용 시점에 스토어가 짓는다 — 점선 상태에는 id 가 없어야
 *   "적용 전 저장 0회"가 눈으로도 확인된다.
 */
export interface NarrativeDraftScene {
  readonly role: NarrativeRole;
  readonly moduleId?: RecordModuleId;
  readonly label?: string;
  /** 모델이 쓴 이유 문장. 저장되면 `noteSource: 'ai'` 가 붙는다. */
  readonly note?: string;
  readonly leadIn?: string;
  readonly evidenceIds: readonly string[];
}

interface InquiryThreadState {
  records: readonly InquiryThread[];
  loaded: boolean;
  /** 마지막 읽기 실패 메시지. 화면이 "불러오지 못했습니다"를 빈 목록과 구별하는 근거. */
  loadError: string | null;

  /** force=true 는 동기화 리로드용 — loaded 를 유지한 채 데이터만 갱신. */
  load: (force?: boolean) => Promise<void>;
  /**
   * 동기화가 파일을 갈아 끼운 뒤의 재적재 전용 진입점 — **쓰기와 같은 파일 락 안에서**
   * 최신을 읽어 게시한다. 락 밖에서 읽으면 이미 낡은 스냅샷을 뒤늦게 게시할 수 있다(계획 §5.2).
   */
  forceReload: () => Promise<void>;
  /** 흐름 추가. 반환 = 생성된 id. */
  add: (input: InquiryThreadAddInput) => Promise<string>;
  update: (id: string, patch: InquiryThreadPatch) => Promise<void>;
  /** 흐름 삭제. 낱장 쪽 threadId 는 여기서 지우지 않는다 — 호출자(화면)가 근거·관찰 스토어에서 푼다. */
  remove: (id: string) => Promise<void>;
  /**
   * 주제 연결 관문 — 저장소에서 **다시 읽어** 존재·소유를 확인하고 그 흐름을 돌려준다.
   * 화면 메모리가 아니라 파일을 본다. 선택한 뒤 다른 경로에서 지워졌으면 여기서 걸린다.
   *
   * `requireOpen` 은 **입력 중 주제 연결** 전용이다(계획 §4.2 — 마친 주제는 다시 연 뒤에만 연결).
   * 보드에서 열로 끌어다 놓는 기존 경로는 마친 주제도 그대로 다룰 수 있어야 해서 기본값은 false 다.
   */
  assertLinkable: (
    threadId: string,
    studentRef: string,
    opts?: { readonly requireOpen?: boolean },
  ) => Promise<InquiryThread>;
  /**
   * 보상 삭제 — 이번 작업이 만든 주제가 **아직 아무 근거도 쓰지 않을 때만** 지운다.
   * 주제→근거 순서로 잠근다(역순 경로 없음). 다른 작업이 쓰기 시작했으면 보존한다.
   */
  removeIfUnused: (id: string) => Promise<ThreadCompensationResult>;

  // ── 서사 장면(ADR-103) ──────────────────────────────────────────────
  /**
   * 장면에 근거를 **끼워 넣기만** 한다(주제 파일 한 번의 쓰기).
   *
   * ★소유(`RecordEvidence.threadId`)는 이미 맞춰져 있다고 본다 — 맞추는 일은 근거 파일 쪽이고,
   *   순서 규율(**근거 먼저, 장면 나중**)은 유스케이스 `placeEvidenceInScenes` 가 지킨다.
   *   여기서 근거 스토어를 부르면 두 스토어가 서로를 import 해 초기화 순서에 기대게 된다.
   * ★소유가 확인되지 않은 id 는 넣지 않는다 — 잘못 부르면 조용히 안 들어갈 뿐 유령을 만들지 않는다.
   */
  /**
   * @returns 실제로 장면에 들어간 근거 id. **부르는 쪽은 이 값으로 결과를 센다** —
   *   "보냈으니 들어갔겠지"로 세면 소유 읽기 실패·없는 장면에서 조용히 어긋난다.
   */
  insertIntoScenes: (
    threadId: string,
    groups: readonly SceneGroup[],
    index?: number,
  ) => Promise<readonly string[]>;
  /**
   * 근거를 이 장면에 **더 잇는다** — 기존 연결을 **끊지 않는다**(오너 결정 2026-09-13).
   *
   * 하나의 탐구 보고서에 과정과 결과가 함께 들어 있으면, 같은 자료를 두 장면이 각각 참조한다.
   * ★`insertIntoScenes` 는 **옮기기**(다른 장면에서 빼고 넣기)다. 이쪽은 **더하기**다. 둘을 한 함수로 묶지 않는다 —
   *   선을 새로 끄는 것과 선 끝을 옮기는 것은 선생님에게도 다른 동작이다.
   * @returns 실제로 이어진 근거 id. 이미 이어져 있었으면 들어 있지 않다.
   */
  changeEvidenceConnection: (
    threadId: string,
    fromSceneId: string,
    toSceneId: string,
    evidenceId: string,
  ) => Promise<void>;
  attachEvidenceToScene: (
    threadId: string,
    sceneId: string,
    evidenceIds: readonly string[],
  ) => Promise<readonly string[]>;
  /**
   * 이 장면과의 연결만 끊는다 — **근거를 지우지 않고**, 다른 장면의 연결도 건드리지 않는다.
   * 마지막 연결이 끊기면 그 근거는 '자리 미정'으로 돌아간다(주제 소속은 그대로).
   */
  detachEvidenceFromScene: (
    threadId: string,
    sceneId: string,
    evidenceIds: readonly string[],
  ) => Promise<void>;
  /** 이 장면에서 이 근거의 「쓸 부분」. 빈 글이면 지운다. 연결이 없으면 저장하지 않는다. */
  setSceneEvidenceFocus: (
    threadId: string,
    sceneId: string,
    evidenceId: string,
    note: string,
  ) => Promise<void>;
  /** 장면 안에서 순서 바꾸기. 소유는 이미 확인된 상태라 주제 파일만 쓴다. */
  reorderScene: (
    threadId: string,
    sceneId: string,
    evidenceIds: readonly string[],
  ) => Promise<void>;
  /**
   * 장면 추가. `at` 이 없으면 평가 장면 바로 뒤(없으면 맨 뒤).
   *
   * @returns 새 장면 id. **넣지 못했으면 `null`**(상한에 닿았거나 평가가 이미 있다).
   *   ★넣지 않았는데 id 를 돌려주면 부르는 쪽이 그 id 로 메모를 쓰고, 그 글은 갈 곳이 없어
   *   조용히 버려진다(가상 평가 자리를 세우는 경로가 이 값을 그대로 믿는다).
   */
  addScene: (threadId: string, scene: NarrativeSceneDraft, at?: number) => Promise<string | null>;
  /** 장면 삭제 — 놓여 있던 근거는 "아직 안 놓음" 으로 돌아간다(주제 소속은 그대로). */
  removeScene: (threadId: string, sceneId: string) => Promise<void>;
  /**
   * 장면 **차례** 바꾸기 — 한 칸 앞으로(-1) 또는 뒤로(+1).
   * ★끌기만 두지 않는다. 끌기만 있으면 키보드로는 차례를 못 바꾼다.
   * ★끝에서 더 밀면 아무 일도 안 한다(저장도 안 한다).
   *
   * @returns 앞 장면이 달라져 「이음말 확인」이 붙은 장면 수. **아무것도 안 했으면 `null`.**
   *   ★0 과 `null` 은 다르다 — 0 은 "옮겼고 확인할 이음말이 없다", `null` 은 "옮기지 않았다"다.
   */
  moveScene: (threadId: string, sceneId: string, dir: -1 | 1) => Promise<number | null>;
  /**
   * 장면 차례 바꾸기 — `movedSceneId` 를 `anchorSceneId` **바로 뒤**로(지도에서 연결점을 끌어 놓았을 때).
   *
   * `A → B → C → D` 에서 A 의 다음점을 D 에 놓으면 `A → D → B → C`. D 만 움직이고 근거·메모는 그대로다.
   * ★`moveScene` 과 **같은 검토 규칙**을 지난다(`narrativeSceneOrder`) — 화면의 선만 바꾸는 길을 따로 두지 않는다.
   * @returns 「이음말 확인」이 붙은 장면 수. 아무것도 안 했으면 `null`(같은 장면·없는 장면·이미 바로 다음).
   */
  placeSceneAfter: (
    threadId: string,
    anchorSceneId: string,
    movedSceneId: string,
  ) => Promise<number | null>;
  /** 장면 메모. `noteSource` 를 안 주면 선생님이 쓴 것으로 본다. */
  setSceneNote: (
    threadId: string,
    sceneId: string,
    note: string,
    noteSource?: 'ai' | 'teacher',
  ) => Promise<void>;
  /** 앞 장면에서 이 장면으로 넘어가는 이음말(ADR-108). 빈 글이면 지운다. */
  setSceneLeadIn: (threadId: string, sceneId: string, leadIn: string) => Promise<void>;
  /** 장면의 세부 카테고리·직접 적은 이름. `null` 은 지운다. */
  setSceneCategory: (
    threadId: string,
    sceneId: string,
    patch: { moduleId?: RecordModuleId | null; label?: string | null },
  ) => Promise<void>;
  /** 앞 주제 연결. `null` 은 끊는다. 고리가 되면 던진다. */
  setLink: (threadId: string, link: NarrativeLink | null) => Promise<void>;
  /**
   * 주제 화면 차례 — `ids` 의 순서대로 `order` 를 0,1,2… 로 적는다(한 번의 쓰기). 목록에 없는 주제는 건드리지 않는다.
   * ★한 학생의 주제만 받는다. 섞이면 던진다. 값이 같으면 저장하지 않는다.
   */
  reorderThreads: (ids: readonly string[]) => Promise<void>;
  /**
   * AI 서사 초안 [적용] — 뼈대·배치·이음말을 **주제 파일 한 번의 쓰기로** 넣는다.
   *
   * ★`applyScaffold` + `insertIntoScenes` + `setLink` 를 잇달아 부르면 주제 파일을 세 번 쓴다.
   *   중간에 하나가 실패하면 반쪽 서사가 남고, 화면은 그 사이를 보여 준다. 한 번에 쓴다.
   * ★소유(`RecordEvidence.threadId`)는 **이미 맞춰져 있다고 본다** — 맞추는 일은 근거 파일 쪽이고,
   *   순서 규율(근거 먼저, 장면 나중)은 `applyNarrativeSuggestion` 이 지킨다.
   * ★소유가 확인되지 않은 근거는 장면에 넣지 않는다(뼈대는 그대로 깔린다).
   */
  /**
   * @returns `wrote` = 주제 파일이 실제로 바뀌었나(주제가 그 사이 지워졌으면 거짓).
   *   `placedIds` = 장면에 **실제로 들어간** 근거. 부르는 쪽은 이 값으로 결과를 센다 —
   *   "보냈으니 됐겠지"로 세면 근거 읽기 실패·주제 삭제에서 화면이 거짓말을 한다(회귀 #102 와 같은 규율).
   */
  applyNarrativeDraft: (
    threadId: string,
    input: {
      /** 어느 틀로 세운 서사인가 — 평가 자리를 채울 때 기본 카테고리를 여기서 고른다. */
      readonly frame: NarrativeFrameId;
      readonly scenes: readonly NarrativeDraftScene[];
      readonly link?: NarrativeLink | null;
    },
  ) => Promise<{ readonly wrote: boolean; readonly placedIds: readonly string[] }>;
  /** 뼈대 깔기 — 장면을 통째로 바꾼다. 놓여 있던 근거는 "아직 안 놓음" 으로. */
  applyScaffold: (threadId: string, scaffold: RecordScaffold) => Promise<void>;
  /**
   * 장면 배열을 **찍어 둔 그대로** 되돌린다 — [되돌리기] 전용(뼈대 깔기 직전 스냅샷).
   * ★`applyNarrativeDraft` 로 되돌리면 선생님 메모에 `noteSource: 'ai'` 가 붙는다. 메모 출처·id 까지 그대로 살려야
   *   하므로 정규화 없이 통째로 쓴다. 읽기 가림(`scenesOf`)이 그 사이 사라진 근거를 걸러 준다.
   */
  restoreScenes: (
    threadId: string,
    scenes: readonly NarrativeScene[],
    link?: NarrativeLink | null,
  ) => Promise<void>;
  /**
   * 이 근거들을 그 주제의 장면에서 뗀다 — 소유를 바꾸는 **근거 경로 7개**가 저장 뒤에 부른다.
   * ★실패해도 던지지 않는다. 읽기 가림(`scenesOf`)이 받치고 있어 화면은 이미 맞다.
   */
  detachFromScenes: (threadId: string, evidenceIds: readonly string[]) => Promise<void>;

  exists: (id: string) => boolean;

  getByStudentRef: (studentRef: string) => readonly InquiryThread[];
  getOpenByStudentRef: (studentRef: string) => readonly InquiryThread[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const FILE_KEY = SYNC_FILE_KEYS.inquiryThreads;

/**
 * 저장소 최신 목록. **읽기 실패는 그대로 던진다** — 빈 목록으로 갈음하면 통째 저장 구조에서
 * 남의 주제를 전부 지운다(계획 §5.2 "읽기 실패를 빈 파일로 간주하지 않는다").
 */
async function readLatest(): Promise<readonly InquiryThread[]> {
  const data = await inquiryThreadRepository.getInquiryThreads();
  return data?.records ?? [];
}

/** 장면 목록을 바꾸는 순수 변환 — 주제 하나만 손대고 `updatedAt` 을 올린다. */
function withScenes(
  latest: readonly InquiryThread[],
  threadId: string,
  change: (scenes: readonly NarrativeScene[]) => readonly NarrativeScene[] | null,
): readonly InquiryThread[] {
  const at = latest.findIndex((t) => t.id === threadId);
  if (at < 0) return latest;
  const target = latest[at];
  if (target === undefined) return latest;
  const next = change(target.scenes ?? []);
  if (next === null) return latest;
  const copy = [...latest];
  copy[at] = { ...target, scenes: next, updatedAt: Date.now() };
  return copy;
}

/**
 * 이 주제가 실제로 소유한 근거 id — 주제 락 안에서 읽는다(잠금 순서는 언제나 주제→근거).
 * ★읽기 실패는 `null` 이다. "없음"으로 치면 멀쩡한 배치를 유령으로 보고 잘라 낸다.
 */
async function readOwnedEvidenceIds(threadId: string): Promise<ReadonlySet<string> | null> {
  try {
    const records = await withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
      const data = await recordEvidenceRepository.getRecordEvidence();
      return data?.records ?? [];
    });
    return new Set(records.filter((r) => r.threadId === threadId).map((r) => r.id));
  } catch (err) {
    console.error('[InquiryThreadStore] 소유 확인용 근거 읽기 실패:', err);
    return null;
  }
}

/**
 * 유령 id 잘라 내기(순수) — 장면을 건드리는 쓰기에서만 부른다.
 *
 * 술어는 "이 주제 소유가 아니다" 다(파일에 없는 id 도 여기 걸린다). 미분류 id 는 정상 경로에서
 * 장면에 들어올 수 없으므로(소유를 먼저 맞춘다) 만나면 유령으로 보고 함께 잘라 낸다.
 * ★소유를 못 읽었으면(=`readOwnedEvidenceIds` 가 null) **아예 부르지 않는다.**
 */
function pruneGhosts(
  scenes: readonly NarrativeScene[],
  owned: ReadonlySet<string>,
): readonly NarrativeScene[] {
  let changed = false;
  const next = scenes.map((sc) => {
    const kept = sc.evidenceIds.filter((id) => owned.has(id));
    if (kept.length === sc.evidenceIds.length) return sc;
    changed = true;
    return withEvidenceIds(sc, kept);
  });
  return changed ? next : scenes;
}

/**
 * 장면의 근거 목록을 갈아 끼운다(순수) — **「쓸 부분」을 함께 정리한다.**
 * ★연결이 끊긴 근거의 말을 남겨 두면, 나중에 다시 이었을 때 옛 말이 되살아난다.
 */
function withEvidenceIds(sc: NarrativeScene, evidenceIds: readonly string[]): NarrativeScene {
  const focus = pruneSceneFocus(sc.evidenceFocus, evidenceIds);
  const rest = { ...sc, evidenceIds };
  if (focus === undefined) {
    delete (rest as { evidenceFocus?: NarrativeScene['evidenceFocus'] }).evidenceFocus;
    return rest;
  }
  return { ...rest, evidenceFocus: focus };
}
/** 새 장면의 기본 자리 — 평가 장면 바로 뒤(없으면 맨 뒤). */
function defaultInsertAt(scenes: readonly NarrativeScene[]): number {
  const at = scenes.findIndex((sc) => sc.role === 'evaluation');
  return at < 0 ? scenes.length : at + 1;
}

/** 연결만 떼어 낸 사본(고리 검사용). */
function stripLink(t: InquiryThread): InquiryThread {
  const rest = { ...t };
  delete (rest as { link?: NarrativeLink }).link;
  return rest;
}

/** 이 근거들을 모든 장면에서 뺀다(순수). */
function stripFromScenes(
  scenes: readonly NarrativeScene[],
  ids: ReadonlySet<string>,
): readonly NarrativeScene[] {
  let changed = false;
  const next = scenes.map((sc) => {
    const kept = sc.evidenceIds.filter((id) => !ids.has(id));
    if (kept.length === sc.evidenceIds.length) return sc;
    changed = true;
    return withEvidenceIds(sc, kept);
  });
  return changed ? next : scenes;
}
/**
 * 탐구 흐름(InquiryThread) 스토어 — inquiry-threads.json 을 통째로 읽고 쓴다(근거 창고 스토어 미러).
 *
 * ★쓰기 규율(계획 §5.2): 공개 쓰기 진입점은 공용 파일 락을 **정확히 한 번** 잡고 그 안에서
 *   최신 읽기 → 순수 변환 → 저장 → 게시를 한다. 메모리를 먼저 바꾸지 않는다 — 저장이 실패하면
 *   화면에만 있는 유령 주제가 남고, 다음 통째 저장이 그 유령을 파일에 굳힌다.
 *
 * ★학생 전환·리셋: 이 스토어는 학생별 상태를 들고 있지 않다(전체 목록 + 조회 함수). Phase 2 에서
 *   "선택 슬롯이 다음 학생에게 옮겨 붙던" 오염은 화면 상태에서 났다 — 화면(T2)이 학생을 바꿀 때
 *   선택 흐름을 리셋하는 것은 화면의 책임이고, 여기서는 studentRef 로만 조회하게 해 섞일 길을 줄인다.
 */
export const useInquiryThreadStore = create<InquiryThreadState>((set, get) => {
  /**
   * 공개 쓰기 진입점의 공통 몸통 — 락 안에서 최신 읽기 → 변환 → 저장 → 게시.
   * ★여기서 부르는 transform 은 **락을 다시 잡지 않는** 순수 변환이어야 한다(자기 자신 대기 = 교착).
   * next 로 latest 를 그대로 돌려주면 "바뀐 것 없음"이라 저장하지 않는다.
   */
  const write = <T>(
    transform: (
      latest: readonly InquiryThread[],
    ) =>
      | { next: readonly InquiryThread[]; result: T }
      | Promise<{ next: readonly InquiryThread[]; result: T }>,
  ): Promise<T> =>
    withFileLock(FILE_KEY, async () => {
      const latest = await readLatest();
      const { next, result } = await transform(latest);
      if (next !== latest) {
        await inquiryThreadRepository.saveInquiryThreads({ records: next });
        publishEvidenceWrite({ kind: 'threads', before: latest, after: next });
      }
      set({ records: next, loaded: true, loadError: null });
      return result;
    });

  /**
   * 장면 **차례를 바꾸는 길 하나** — 앞/뒤 단추도 연결점 끌기도 여기를 지난다.
   *
   * ★규칙은 도메인(`narrativeSceneOrder`)이 정하고 여기서는 락·유령 잘라 내기·저장만 한다.
   *   길을 둘로 두면 한쪽만 이음말 검토를 잃는다.
   * ★`change` 가 `null` 이면 **아무것도 쓰지 않는다.** 배열을 복사만 해도 `write` 는 "바뀌었다"로
   *   보고 파일을 쓴다 — 화면은 그대로인데 `updatedAt` 이 오르고 드라이브 동기화가 매번 나간다.
   */
  const reorderWith = (
    threadId: string,
    change: (scenes: readonly NarrativeScene[]) => {
      readonly scenes: readonly NarrativeScene[];
      readonly recheckedIds: readonly string[];
    } | null,
  ): Promise<number | null> =>
    write(async (latest) => {
      if (latest.find((t) => t.id === threadId)?.status !== 'open')
        throw new Error('주제가 없거나 마친 주제입니다.');
      const owned = await readOwnedEvidenceIds(threadId);
      const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
      const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
      const out = change(pruned);
      if (out === null) {
        return {
          next: pruned === scenes0 ? latest : withScenes(latest, threadId, () => pruned),
          result: null,
        };
      }
      return {
        next: withScenes(latest, threadId, () => out.scenes),
        result: out.recheckedIds.length,
      };
    });

  return {
    records: [],
    loaded: false,
    loadError: null,

    load: async (force = false) => {
      if (get().loaded && !force) return;
      try {
        const records = await readLatest();
        set({ records, loaded: true, loadError: null });
      } catch (err) {
        // 화면은 계속 뜨되 **빈 목록과 구별**되게 남긴다. 이 상태에서의 쓰기는 락 안에서
        // 다시 읽으므로, 읽기가 여전히 실패하면 저장까지 가지 않고 그대로 던진다.
        console.error('[InquiryThreadStore] load failed:', err);
        set({ loaded: true, loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    forceReload: async () => {
      await withFileLock(FILE_KEY, async () => {
        try {
          const records = await readLatest();
          set({ records, loaded: true, loadError: null });
        } catch (err) {
          console.error('[InquiryThreadStore] forceReload failed:', err);
          set({ loadError: err instanceof Error ? err.message : String(err) });
        }
      });
    },

    add: async (input) => {
      // 락을 잡기 전에 거른다 — 거부할 입력으로 파일을 읽고 쓸 이유가 없다.
      const title = input.title.trim();
      if (title.length === 0) throw new Error('주제 이름이 비어 있습니다.');
      const now = Date.now();
      const term = academicTermForDate(todayStr());
      const rec: InquiryThread = {
        id: generateUUID(),
        studentRef: input.studentRef,
        title,
        keywords: normalizeThreadKeywords(input.keywords ?? []),
        status: 'open',
        createdAt: now,
        updatedAt: now,
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.standardCodes && input.standardCodes.length > 0
          ? { standardCodes: [...input.standardCodes] }
          : {}),
        ...(term !== null ? { term } : {}),
      };
      return write((latest) => ({ next: [...latest, rec], result: rec.id }));
    },

    update: async (id, patch) => {
      await write((latest) => {
        if (!latest.some((r) => r.id === id)) return { next: latest, result: undefined };
        const now = Date.now();
        const next = latest.map((r) => {
          if (r.id !== id) return r;
          const title = patch.title !== undefined ? patch.title.trim() : r.title;
          return {
            ...r,
            title: title.length > 0 ? title : r.title,
            ...(patch.keywords !== undefined
              ? { keywords: normalizeThreadKeywords(patch.keywords) }
              : {}),
            ...(patch.standardCodes !== undefined
              ? { standardCodes: [...patch.standardCodes] }
              : {}),
            ...(patch.competencyKeywords !== undefined
              ? { competencyKeywords: normalizeThreadKeywords(patch.competencyKeywords) }
              : {}),
            ...(patch.nextNotes !== undefined ? { nextNotes: patch.nextNotes } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            updatedAt: now,
          };
        });
        return { next, result: undefined };
      });
    },

    remove: async (id) => {
      await write((latest) => {
        const next = latest.filter((r) => r.id !== id);
        return { next: next.length === latest.length ? latest : next, result: undefined };
      });
    },

    assertLinkable: async (threadId, studentRef, opts) => {
      const latest = await withFileLock(FILE_KEY, readLatest);
      const thread = latest.find((t) => t.id === threadId);
      if (!thread) {
        throw new Error('없는 주제입니다. 화면을 새로 고침한 뒤 다시 시도해 주세요.');
      }
      if (thread.studentRef !== studentRef) {
        throw new Error('다른 학생의 주제에는 묶을 수 없습니다.');
      }
      if (opts?.requireOpen === true && thread.status !== 'open') {
        throw new Error('마친 주제입니다. 주제를 다시 연 뒤에 연결해 주세요.');
      }
      return thread;
    },

    removeIfUnused: async (id) =>
      // 주제 락 안에서 근거를 확인한다 — 잠금 순서는 언제나 주제→근거다(역순 없음).
      withFileLock(FILE_KEY, async (): Promise<ThreadCompensationResult> => {
        let inUse: boolean;
        try {
          const evidence = await withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
            const data = await recordEvidenceRepository.getRecordEvidence();
            return data?.records ?? [];
          });
          inUse = evidence.some((r) => r.threadId === id);
        } catch (err) {
          // 쓰고 있는지 확인하지 못했다. 지우지 않는다 — 남의 주제를 지우는 쪽이 더 큰 사고다.
          console.error('[InquiryThreadStore] removeIfUnused usage check failed:', err);
          return 'failed';
        }
        if (inUse) return 'kept';
        try {
          const latest = await readLatest();
          const next = latest.filter((r) => r.id !== id);
          if (next.length === latest.length) {
            set({ records: latest, loaded: true, loadError: null });
            return 'removed'; // 이미 없다 = 정리된 상태.
          }
          await inquiryThreadRepository.saveInquiryThreads({ records: next });
          publishEvidenceWrite({ kind: 'threads', before: latest, after: next });
          set({ records: next, loaded: true, loadError: null });
          return 'removed';
        } catch (err) {
          console.error('[InquiryThreadStore] removeIfUnused delete failed:', err);
          return 'failed';
        }
      }),

    // ── 서사 장면(ADR-103) ──────────────

    insertIntoScenes: async (threadId, groups, index) => {
      const wanted = new Set(groups.flatMap((g) => [...g.evidenceIds]));
      if (wanted.size === 0) return [];
      return await write(async (latest) => {
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes : pruneGhosts(scenes, owned);
        // 소유를 못 읽었으면 넣지 않는다 — 유스케이스가 방금 맞춘 소유를 확인할 길이 없기 때문이다.
        const allowed = new Set([...wanted].filter((id) => owned?.has(id) === true));
        if (allowed.size === 0) {
          return {
            next: pruned === scenes ? latest : withScenes(latest, threadId, () => pruned),
            result: [] as readonly string[],
          };
        }
        // ★넣을 자리가 **실제로 있는지 먼저** 본다. 없는 장면(가상 평가 자리·동기화로 지워진
        //   장면)을 향해 들어오면, 예전 코드는 원래 자리에서 카드를 먼저 뗀 뒤 넣을 곳을 못 찾아
        //   카드가 "아직 안 놓음"으로 사라졌다. 그런데 화면은 "놓았습니다"라고 말했다.
        const targets = groups.filter((g) => pruned.some((sc) => sc.id === g.sceneId));
        const placed = new Set(
          targets.flatMap((g) => g.evidenceIds.filter((id) => allowed.has(id))),
        );
        if (placed.size === 0) {
          return {
            next: pruned === scenes ? latest : withScenes(latest, threadId, () => pruned),
            result: [] as readonly string[],
          };
        }
        const next = withScenes(latest, threadId, () => {
          // 옮겨 오는 근거는 **다른 장면에서 먼저 뺀다** — 같은 근거가 두 자리에 남지 않게.
          const moved = new Set(
            [...placed].filter(
              (id) =>
                !targets.some((g) =>
                  pruned.find((sc) => sc.id === g.sceneId)?.evidenceIds.includes(id),
                ),
            ),
          );
          const stripped = stripFromScenes(pruned, moved);
          return stripped.map((sc) => {
            const add = targets.find((g) => g.sceneId === sc.id);
            if (add === undefined) return sc;
            const incoming = add.evidenceIds.filter((id) => placed.has(id));
            if (incoming.length === 0) return sc;
            const base = sc.evidenceIds.filter((id) => !placed.has(id));
            const at = index === undefined ? base.length : index;
            const cut = Math.max(0, Math.min(at, base.length));
            return withEvidenceIds(sc, [...base.slice(0, cut), ...incoming, ...base.slice(cut)]);
          });
        });
        return { next, result: [...placed] as readonly string[] };
      });
    },
    moveScene: async (threadId, sceneId, dir) =>
      await reorderWith(threadId, (scenes) => stepScene(scenes, sceneId, dir)),

    placeSceneAfter: async (threadId, anchorSceneId, movedSceneId) =>
      await reorderWith(threadId, (scenes) =>
        placeSceneAfterRule(scenes, anchorSceneId, movedSceneId),
      ),

    changeEvidenceConnection: async (threadId, fromSceneId, toSceneId, evidenceId) => {
      await write(async (latest) => {
        const thread = latest.find((t) => t.id === threadId);
        const owned = await readOwnedEvidenceIds(threadId);
        const from = thread?.scenes?.find((sc) => sc.id === fromSceneId);
        const to = thread?.scenes?.find((sc) => sc.id === toSceneId);
        if (
          thread?.status !== 'open' ||
          !from?.evidenceIds.includes(evidenceId) ||
          !to ||
          !owned?.has(evidenceId)
        )
          throw new Error('변경할 연결이 없거나 마친 주제입니다.');
        if (fromSceneId === toSceneId) return { next: latest, result: undefined };
        if (to.evidenceIds.includes(evidenceId))
          throw new Error('이미 연결된 장면입니다. 기존 연결을 유지했습니다.');
        const focus = from.evidenceFocus?.find((f) => f.evidenceId === evidenceId);
        return {
          next: withScenes(latest, threadId, (scenes) =>
            scenes.map((sc) => {
              if (sc.id === fromSceneId)
                return withEvidenceIds(
                  sc,
                  sc.evidenceIds.filter((id) => id !== evidenceId),
                );
              if (sc.id !== toSceneId) return sc;
              return {
                ...sc,
                evidenceIds: [...sc.evidenceIds, evidenceId],
                ...(focus ? { evidenceFocus: [...(sc.evidenceFocus ?? []), focus] } : {}),
              };
            }),
          ),
          result: undefined,
        };
      });
    },

    attachEvidenceToScene: async (threadId, sceneId, evidenceIds) => {
      const wanted = new Set(evidenceIds);
      if (wanted.size === 0) return [];
      return await write(async (latest) => {
        if (latest.find((t) => t.id === threadId)?.status !== 'open')
          throw new Error('주제가 없거나 마친 주제입니다.');
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
        const keep = (): { next: readonly InquiryThread[]; result: readonly string[] } => ({
          next: pruned === scenes0 ? latest : withScenes(latest, threadId, () => pruned),
          result: [],
        });
        // 소유를 못 읽었으면 잇지 않는다 — `insertIntoScenes` 와 같은 태도(유령을 만들지 않는다).
        if (owned === null) return keep();
        const target = pruned.find((sc) => sc.id === sceneId);
        if (target === undefined) return keep();
        const here = new Set(target.evidenceIds);
        const adding = [...wanted].filter((id) => owned.has(id) && !here.has(id));
        if (adding.length === 0) return keep();
        const next = withScenes(latest, threadId, () =>
          pruned.map((sc) =>
            sc.id === sceneId ? withEvidenceIds(sc, [...sc.evidenceIds, ...adding]) : sc,
          ),
        );
        return { next, result: adding as readonly string[] };
      });
    },

    detachEvidenceFromScene: async (threadId, sceneId, evidenceIds) => {
      const drop = new Set(evidenceIds);
      if (drop.size === 0) return;
      await write(async (latest) => {
        if (latest.find((t) => t.id === threadId)?.status !== 'open')
          throw new Error('주제가 없거나 마친 주제입니다.');
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
        const target = pruned.find((sc) => sc.id === sceneId);
        const kept = target?.evidenceIds.filter((id) => !drop.has(id));
        // 끊을 연결이 없으면 저장하지 않는다(`updatedAt` 만 올리고 동기화가 나가지 않게).
        if (
          target === undefined ||
          kept === undefined ||
          kept.length === target.evidenceIds.length
        ) {
          return {
            next: pruned === scenes0 ? latest : withScenes(latest, threadId, () => pruned),
            result: undefined,
          };
        }
        return {
          next: withScenes(latest, threadId, () =>
            pruned.map((sc) => (sc.id === sceneId ? withEvidenceIds(sc, kept) : sc)),
          ),
          result: undefined,
        };
      });
    },

    setSceneEvidenceFocus: async (threadId, sceneId, evidenceId, note) => {
      const trimmed = note.trim().slice(0, NARRATIVE_NOTE_MAX);
      await write((latest) => {
        const target = latest.find((t) => t.id === threadId);
        const scene = target?.scenes?.find((sc) => sc.id === sceneId);
        // ★연결이 없으면 던진다 — 조용히 버리면 선생님이 쓴 글이 사라진 채 "저장했습니다"가 뜬다
        //   (`setSceneNote` 와 같은 규율).
        if (target?.status !== 'open' || scene === undefined) {
          throw new Error('쓸 부분을 저장할 장면이 없거나 마친 주제입니다.');
        }
        if (!scene.evidenceIds.includes(evidenceId)) {
          throw new Error('이 장면에 이어져 있지 않은 근거입니다.');
        }
        return {
          next: withScenes(latest, threadId, (scenes) =>
            !scenes.some((sc) => sc.id === sceneId)
              ? null
              : scenes.map((sc) => {
                  if (sc.id !== sceneId) return sc;
                  const rest = (sc.evidenceFocus ?? []).filter((f) => f.evidenceId !== evidenceId);
                  const focus =
                    trimmed.length === 0 ? rest : [...rest, { evidenceId, note: trimmed }];
                  const out = { ...sc };
                  if (focus.length === 0) {
                    delete (out as { evidenceFocus?: NarrativeScene['evidenceFocus'] })
                      .evidenceFocus;
                    return out;
                  }
                  return { ...out, evidenceFocus: focus };
                }),
          ),
          result: undefined,
        };
      });
    },

    reorderScene: async (threadId, sceneId, evidenceIds) => {
      await write(async (latest) => {
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
        const next = withScenes(latest, threadId, () =>
          pruned.map((sc) => {
            if (sc.id !== sceneId) return sc;
            // 화면이 준 순서만 쓴다. 없던 id 는 받지 않는다(유령을 새로 만들지 않게).
            const allowed = new Set(sc.evidenceIds);
            return { ...sc, evidenceIds: evidenceIds.filter((id) => allowed.has(id)) };
          }),
        );
        return { next, result: undefined };
      });
    },

    addScene: async (threadId, draft, at) => {
      const id = generateUUID();
      let added = false;
      await write(async (latest) => {
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
        const next = withScenes(latest, threadId, () => {
          // 평가 자리를 함께 세우면 장면이 **둘** 는다. 상한을 그만큼 앞당겨 센다.
          const needsEvaluation =
            draft.role !== 'evaluation' && !pruned.some((sc) => sc.role === 'evaluation');
          if (pruned.length + (needsEvaluation ? 2 : 1) > NARRATIVE_SCENE_MAX) return null;
          // 평가 장면은 하나뿐이다 — 이미 있으면 더하지 않는다(ADR-094).
          if (draft.role === 'evaluation' && pruned.some((sc) => sc.role === 'evaluation')) {
            return null;
          }
          const scene: NarrativeScene = {
            id,
            role: draft.role,
            evidenceIds: [],
            ...(draft.moduleId === undefined ? {} : { moduleId: draft.moduleId }),
            ...(draft.label === undefined ? {} : { label: draft.label }),
          };
          const cut =
            at === undefined ? defaultInsertAt(pruned) : Math.max(0, Math.min(at, pruned.length));
          const placedNext = [...pruned.slice(0, cut), scene, ...pruned.slice(cut)];
          added = true;
          // ★평가 자리가 저장 배열에 없으면 **여기서 실제로 세운다.** 없으면 화면이 가상 평가
          //   칸을 끼워 보여 주는데, 그 칸은 저장된 자리가 아니라 메모·배치가 갈 곳이 없다.
          //   자리를 만들어 두면 선생님이 적은 판단이 갈 곳이 생긴다(ADR-094: 교사 판단은 한 번).
          if (!needsEvaluation) return markLeadInRecheck(pruned, placedNext).scenes;
          const evaluation: NarrativeScene = {
            id: generateUUID(),
            role: 'evaluation',
            evidenceIds: [],
            moduleId: 'teacherJudgement',
          };
          return markLeadInRecheck(pruned, [evaluation, ...placedNext]).scenes;
        });
        return { next, result: undefined };
      });
      return added ? id : null;
    },

    removeScene: async (threadId, sceneId) => {
      await write(async (latest) => {
        const owned = await readOwnedEvidenceIds(threadId);
        const scenes0 = latest.find((t) => t.id === threadId)?.scenes ?? [];
        const pruned = owned === null ? scenes0 : pruneGhosts(scenes0, owned);
        const next = withScenes(latest, threadId, () => {
          const target = pruned.find((sc) => sc.id === sceneId);
          // 평가 장면은 뺄 수 없다 — 교사 판단은 어느 구성에서도 반드시 한 번 있다.
          if (target === undefined || target.role === 'evaluation') return null;
          return markLeadInRecheck(
            pruned,
            pruned.filter((sc) => sc.id !== sceneId),
          ).scenes;
        });
        return { next, result: undefined };
      });
    },

    setSceneNote: async (threadId, sceneId, note, noteSource) => {
      const trimmed = note.trim().slice(0, NARRATIVE_NOTE_MAX);
      await write((latest) => {
        const target = latest.find((t) => t.id === threadId);
        if (target?.status !== 'open' || !target.scenes?.some((sc) => sc.id === sceneId)) {
          throw new Error('메모를 저장할 장면이 없거나 닫힌 주제입니다.');
        }
        return {
          next: withScenes(latest, threadId, (scenes) =>
            // ★대상 장면이 없으면 `null` — 저장을 아예 건너뛴다. 예전에는 `map` 이 새 배열을
            //   돌려줘 **선생님이 쓴 메모가 버려진 채 "저장했습니다"** 가 떴다.
            !scenes.some((sc) => sc.id === sceneId)
              ? null
              : scenes.map((sc) => {
                  if (sc.id !== sceneId) return sc;
                  if (trimmed.length === 0) {
                    const rest = { ...sc };
                    delete (rest as { note?: string }).note;
                    delete (rest as { noteSource?: 'ai' | 'teacher' }).noteSource;
                    return rest;
                  }
                  return { ...sc, note: trimmed, noteSource: noteSource ?? 'teacher' };
                }),
          ),
          result: undefined,
        };
      });
    },

    setSceneLeadIn: async (threadId, sceneId, leadIn) => {
      const trimmed = leadIn.trim().slice(0, NARRATIVE_NOTE_MAX);
      await write((latest) => {
        const target = latest.find((t) => t.id === threadId);
        if (target?.status !== 'open' || !target.scenes?.some((sc) => sc.id === sceneId)) {
          throw new Error('이음말을 저장할 장면이 없거나 닫힌 주제입니다.');
        }
        return {
          next: withScenes(latest, threadId, (scenes) =>
            // ★대상 장면이 없으면 `null` — 저장을 건너뛴다(`setSceneNote` 와 같은 이유).
            !scenes.some((sc) => sc.id === sceneId)
              ? null
              : scenes.map((sc) => {
                  if (sc.id !== sceneId) return sc;
                  // ★선생님이 확인해 저장했으므로 「이음말 확인」을 푼다 — 비우기도 확인이다.
                  const rest = { ...sc };
                  delete (rest as { leadInNeedsCheck?: boolean }).leadInNeedsCheck;
                  if (trimmed.length === 0) {
                    delete (rest as { leadIn?: string }).leadIn;
                    return rest;
                  }
                  return { ...rest, leadIn: trimmed };
                }),
          ),
          result: undefined,
        };
      });
    },

    setSceneCategory: async (threadId, sceneId, patch) => {
      await write((latest) => ({
        next: withScenes(latest, threadId, (scenes) =>
          // 대상 장면이 없으면 저장하지 않는다(위 `setSceneNote` 와 같은 이유).
          !scenes.some((sc) => sc.id === sceneId)
            ? null
            : scenes.map((sc) => {
                if (sc.id !== sceneId) return sc;
                const out: NarrativeScene = { ...sc };
                if (patch.moduleId !== undefined) {
                  if (patch.moduleId === null)
                    delete (out as { moduleId?: RecordModuleId }).moduleId;
                  else (out as { moduleId?: RecordModuleId }).moduleId = patch.moduleId;
                }
                if (patch.label !== undefined) {
                  const label = patch.label?.trim() ?? '';
                  if (label.length === 0) delete (out as { label?: string }).label;
                  else (out as { label?: string }).label = label;
                }
                return out;
              }),
        ),
        result: undefined,
      }));
    },

    setLink: async (threadId, link) => {
      await write((latest) => {
        const at = latest.findIndex((t) => t.id === threadId);
        const target = latest[at];
        if (at < 0 || target === undefined) return { next: latest, result: undefined };
        if (link === null) {
          if (target.link === undefined) return { next: latest, result: undefined };
          const rest = { ...target };
          delete (rest as { link?: NarrativeLink }).link;
          const copy = [...latest];
          copy[at] = { ...rest, updatedAt: Date.now() };
          return { next: copy, result: undefined };
        }
        const from = latest.find((t) => t.id === link.fromThreadId);
        if (from === undefined)
          throw new Error('없는 주제입니다. 화면을 새로 고침한 뒤 다시 시도해 주세요.');
        if (from.studentRef !== target.studentRef) {
          throw new Error('다른 학생의 주제와는 이을 수 없습니다.');
        }
        if (from.id === target.id) throw new Error('자기 자신과는 이을 수 없습니다.');
        // 고리 검사 — 앞 주제의 사슬에 내가 이미 있으면 잇는 순간 원이 된다.
        const upstream = chainOf(
          latest.map((t) => (t.id === threadId ? stripLink(t) : t)),
          from.id,
          Number.MAX_SAFE_INTEGER,
        );
        if (upstream.some((t) => t.id === threadId)) {
          throw new Error('이미 이어진 주제라 되돌아가는 연결은 만들 수 없습니다.');
        }
        const note = link.note?.trim().slice(0, NARRATIVE_NOTE_MAX) ?? '';
        const copy = [...latest];
        copy[at] = {
          ...target,
          link: { fromThreadId: from.id, ...(note.length > 0 ? { note } : {}) },
          updatedAt: Date.now(),
        };
        return { next: copy, result: undefined };
      });
    },

    reorderThreads: async (ids) => {
      await write((latest) => {
        const pos = new Map(ids.map((id, i) => [id, i] as const));
        const owners = new Set(latest.filter((t) => pos.has(t.id)).map((t) => t.studentRef));
        if (owners.size > 1) throw new Error('다른 학생의 주제와 섞어 순서를 바꿀 수 없습니다.');
        const now = Date.now();
        let changed = false;
        const next = latest.map((t) => {
          const p = pos.get(t.id);
          if (p === undefined || t.order === p) return t;
          changed = true;
          return { ...t, order: p, updatedAt: now };
        });
        return { next: changed ? next : latest, result: undefined };
      });
    },

    applyNarrativeDraft: async (threadId, input) => {
      type Written = { readonly wrote: boolean; readonly placedIds: readonly string[] };
      return await write<Written>(async (latest) => {
        const owned = await readOwnedEvidenceIds(threadId);
        if (owned === null) return { next: latest, result: { wrote: false, placedIds: [] } };
        // ★장면 하나를 통째로 옮긴다 — 자리표만 정규화하고 나중에 되찾는 방식은 쓰지 않는다.
        //   되찾기가 객체 신원에 기대게 되고, 정규화 안에 복사 한 줄이 들어가는 날
        //   **AI 이유 문장과 배치가 통째로 사라진 채 뼈대만 깔린다**(조용히 어긋나는 종류다).
        const toScene = (sc: NarrativeDraftScene): NarrativeScene => {
          // 소유를 못 읽었으면 근거를 넣지 않는다 — 유령을 새로 만들지 않는다.
          const ids = sc.evidenceIds.filter((id) => owned.has(id));
          const note = sc.note?.trim() ?? '';
          return {
            id: generateUUID(),
            role: sc.role,
            evidenceIds: ids,
            ...(sc.moduleId === undefined ? {} : { moduleId: sc.moduleId }),
            ...(sc.label === undefined ? {} : { label: sc.label }),
            ...(sc.leadIn?.trim() ? { leadIn: sc.leadIn.trim().slice(0, NARRATIVE_NOTE_MAX) } : {}),
            // ★AI 가 쓴 메모라고 적어 둔다. 교사가 손대기 전까지 카드에 배지로 보인다(오너 결정).
            ...(note.length > 0
              ? { note: note.slice(0, NARRATIVE_NOTE_MAX), noteSource: 'ai' as const }
              : {}),
          };
        };
        // 저장 시점에도 평가를 **정확히 하나로** 맞춘다 — 파서가 놓쳐도 여기서 걸린다(ADR-094).
        const body: NarrativeScene[] = [];
        let hasEvaluation = false;
        for (const sc of input.scenes) {
          if (sc.role === 'evaluation') {
            if (hasEvaluation) continue;
            hasEvaluation = true;
          } else if (body.length >= NARRATIVE_SCENE_MAX - (hasEvaluation ? 0 : 1)) {
            continue;
          }
          if (body.length >= NARRATIVE_SCENE_MAX) break;
          body.push(toScene(sc));
        }
        if (!hasEvaluation) {
          // 평가가 없던 제안은 **맨 앞**에 세운다(기본 시작 방식이 "교사 판단 먼저"다).
          body.unshift(
            toScene({
              role: 'evaluation',
              moduleId: defaultModuleFor(input.frame, 'evaluation'),
              evidenceIds: [],
            }),
          );
        }
        const scenes = body;
        const placedIds = scenes.flatMap((sc) => [...sc.evidenceIds]);
        const next = withScenes(latest, threadId, () => scenes);
        // ★주제를 못 찾으면 `withScenes` 가 원본을 그대로 돌려준다 — 저장도 예외도 없다.
        //   그 경우를 여기서 잡아 말해 주지 않으면 화면이 "적용했습니다"라고 거짓말한다.
        if (next === latest) {
          const miss: Written = { wrote: false, placedIds: [] };
          return { next: latest, result: miss };
        }
        // 이음말도 같은 쓰기에 넣는다. `undefined` 는 "손대지 않는다", `null` 은 "끊는다".
        const withLink =
          input.link === undefined
            ? next
            : next.map((t) => {
                if (t.id !== threadId) return t;
                if (input.link === null) {
                  const { link: _drop, ...rest } = t;
                  return rest;
                }
                return { ...t, link: input.link };
              });
        const done: Written = { wrote: true, placedIds };
        return { next: withLink, result: done };
      });
    },

    applyScaffold: async (threadId, scaffold) => {
      await write((latest) => ({
        next: withScenes(latest, threadId, () =>
          // 저장·적용 두 시점에서 모두 정규화한다 — 뼈대는 설정 파일에 있어 주제 관문이 못 막는 문이다.
          normalizeScaffoldScenes(scaffold.frame, scaffold.scenes).map((sc) => ({
            id: generateUUID(),
            role: sc.role,
            evidenceIds: [],
            ...(sc.moduleId === undefined ? {} : { moduleId: sc.moduleId }),
            ...(sc.label === undefined ? {} : { label: sc.label }),
          })),
        ),
        result: undefined,
      }));
    },

    restoreScenes: async (threadId, scenes, link) => {
      await write((latest) => {
        if (link) {
          const target = latest.find((t) => t.id === threadId);
          const from = latest.find((t) => t.id === link.fromThreadId);
          if (
            !target ||
            !from ||
            target.studentRef !== from.studentRef ||
            chainOf(
              latest.map((t) => (t.id === threadId ? stripLink(t) : t)),
              from.id,
              Number.MAX_SAFE_INTEGER,
            ).some((t) => t.id === threadId)
          ) {
            throw new Error('주제 연결이 바뀌어 이전 구성을 복원할 수 없습니다.');
          }
        }
        const next = withScenes(latest, threadId, () => scenes.map((sc) => ({ ...sc })));
        return {
          next:
            link === undefined
              ? next
              : next.map((t) =>
                  t.id !== threadId ? t : link === null ? stripLink(t) : { ...t, link },
                ),
          result: undefined,
        };
      });
    },

    detachFromScenes: async (threadId, evidenceIds) => {
      if (evidenceIds.length === 0) return;
      const ids = new Set(evidenceIds);
      try {
        await write((latest) => ({
          next: withScenes(latest, threadId, (scenes) => {
            const next = stripFromScenes(scenes, ids);
            return next === scenes ? null : next;
          }),
          result: undefined,
        }));
      } catch (err) {
        // 던지지 않는다 — 읽기 가림(`scenesOf`)이 받치고 있어 화면은 이미 맞다.
        console.error('[InquiryThreadStore] detachFromScenes failed:', err);
      }
    },
    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getOpenByStudentRef: (studentRef) =>
      get().records.filter((r) => r.studentRef === studentRef && r.status === 'open'),
  };
});
