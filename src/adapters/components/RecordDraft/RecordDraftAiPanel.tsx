/**
 * 오른쪽 패널 「AI 초안」 탭 — 생기부 초안을 **선생님 구독 AI**로 쓰고, 판(버전)마다 남겨 비교한다
 * (오너 결정 D4·D2·D8 + ADR-085).
 *
 * ★쌤핀 AI(Solar)로는 만들지 않는다. 구독이 연결돼 있지 않으면 요청을 보내지 않고 연결 경로만
 *   안내한다 — 초안은 폴백하지 않는다.
 * ★기재 금지 항목은 프롬프트가 아니라 **꾸러미를 만들 때** 뺀다(`recordDraftPack`, ADR-072).
 * ★결과는 미리보기다. 판은 만들자마자 `RecordAiDraft` 로 남지만, 초안 칸에는 [반영]을 눌러야 들어간다.
 * ★[버리기]는 그 판을 지운다. [바꾸기]로 덮은 뒤 30초 동안 [되돌리기]가 있다(메모리만, 디스크 없음).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import { Notice } from '@adapters/components/common/Notice';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  RECORD_STYLE_INSTRUCTION_MAX,
  RECORD_STYLE_CATALOG_VERSION,
  RECORD_STYLE_MIN_PROMPT_VERSION,
  type RecordDraftStyleStamp,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import { applyPromptVersionGate, resolveComposition } from '@domain/rules/recordStyleCompose';
import {
  applyCompositionVersionGate,
  scenesMissingFromDraft,
  narrativeStyleStamp,
  resolveCompositionFromScenes,
} from '@domain/rules/narrativeComposition';
import { chainOf, placedCount, scenesOf, sceneMarkOf } from '@domain/rules/narrativeScenes';
import { edgesWithin, orderForDraft, resolveEvidenceEdges } from '@domain/rules/evidenceGraph';
import { frameForArea, sceneDisplayLabel } from '@domain/rules/narrativeFrames';
import { fetchRecordPromptL1 } from '@adapters/di/container';
import {
  useConnectedOwnAiProviders,
  useOwnAiStatusStore,
} from '@adapters/stores/useOwnAiStatusStore';
import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import {
  draftRunScope,
  useRecordAiRunStore,
  type DraftRunPhase,
} from '@adapters/stores/useRecordAiRunStore';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import { OWN_AI_PROVIDER_LABELS } from '@domain/entities/OwnAiProvider';
import { useOwnAiModelCatalog } from '@adapters/hooks/useOwnAiModelCatalog';
import {
  buildNarrativeRemarkPack,
  buildRecordDraftPack,
  summarizeDraftPackNotes,
  type DraftPackEvidence,
} from '@domain/services/recordDraftPack';
import {
  aiDraftText,
  sameAiDraftKey,
  type RecordAiDraft,
  type RecordAiDraftKey,
} from '@domain/entities/RecordAiDraft';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import {
  dropUnmarkedParagraphs,
  hasAnyRole,
  parseNarrativeParagraphs,
  roleMarksOf,
  sameNarrativeBody,
  splitParagraphs,
  NARRATIVE_ROLE_LABELS,
  type RoleMark,
} from '@domain/rules/narrativeParagraphs';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import { judgeNonDraftReply } from '@domain/rules/nonDraftReply';
import { shortModelLabel } from '@adapters/components/Assist/answererLabels';
import { askOnce, runApi } from '@adapters/components/RecordDraft/ownAiRun';
import type { KeywordGroup, MaskMapping } from '@domain/privacy/types';
import { restoreModelText } from '@domain/rules/redactOutbound';
import { ROLE_BG } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import {
  RecordDraftLengthPanel,
  type LengthAdjustOutcome,
} from '@adapters/components/RecordDraft/RecordDraftLengthPanel';
import {
  shrinkDraftOnce,
  type DraftShrinkResult,
  type LengthAdjustCandidate,
} from '@adapters/components/RecordDraft/lengthAdjustRun';
import {
  appendedBytes,
  needsAutoShrink,
  resolveTargetBytes,
  targetPresetsFor,
  type LengthAdjustKind,
} from '@domain/rules/recordLengthGoal';
import {
  effectiveAreaLimit,
  isAreaLimitConfirmed,
  neisByteLength,
  resolveAreaLimit,
  type RecordArea,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import {
  detectProhibitedTerms,
  substituteProhibited,
  summarizeProhibited,
} from '@domain/rules/prohibitedRecordTerms';

import type {
  DraftTarget,
  DraftTargetNarrative,
} from '@adapters/components/RecordDraft/recordDraftTypes';

/** 한 학생분의 초안 재료 — 정의는 `recordDraftTypes.ts`(실행 스토어와 공유). 예전 import 경로를 위해 다시 내보낸다. */
export type { DraftTarget } from '@adapters/components/RecordDraft/recordDraftTypes';

/** 주제 칩용 — 이 학생의 근거 전부(영역 무관). 주제를 고르면 threadId 로 거른다. */
export type ThreadedEvidence = DraftPackEvidence & { readonly threadId?: string };

export interface RecordDraftAiPanelProps {
  readonly areaLabel: string;
  /** 과목 이름(교과 영역일 때만). 요청서의 `과목:` 줄이 된다. */
  readonly subject?: string;
  /** 실명·학번을 찾아 가릴 명단(`rosterFromAll`). 근거 본문 속 **다른 학생** 이름도 이걸로 가린다. */
  readonly roster: readonly KeywordGroup[];
  /** 지금 고른 학생. */
  readonly target: DraftTarget;
  /** 이 학생의 주제(칩). 없으면 칩 줄이 안 뜬다. */
  readonly threads?: readonly InquiryThread[];
  /** 이 학생의 근거 전부 — 주제를 골랐을 때 그 주제의 근거만 보내기 위한 것. */
  readonly studentEvidences?: readonly ThreadedEvidence[];
  /** "남은 학생 모두"에 쓸 나머지 — 아직 초안이 없는 학생만 부모가 골라 준다. */
  readonly remaining?: readonly DraftTarget[];
  /**
   * "고른 N명" — 학생 목록에서 체크한 학생들(오너 요청 2026-09-08). 자기 자신·초안이 있는 학생도 들어 있을 수 있다.
   * 초안이 있는 학생은 미리보기에서 [바꾸기]/[뒤에 붙이기]를 고른다 — 손으로 쓴 글을 소리 없이 덮지 않는다.
   */
  readonly picked?: readonly DraftTarget[];
  /** [고른 N명]으로 실행을 시작하면 부모가 체크를 비운다. */
  readonly onClearPicked?: () => void;
  /** 판을 저장할 칸(area + studentRef + subject). 다른 학생 차례에는 studentRef 만 바꿔 쓴다. */
  readonly draftKey: RecordAiDraftKey;
  /** 현재 초안의 형광펜 표식 — [되돌리기]와 [다시 표시]가 쓴다. */
  readonly existingRoleMarks?: readonly RoleMark[];
  /** 형광펜 스위치(상단 바). 꺼져 있으면 미리보기에 색을 칠하지 않는다. */
  readonly highlightOn?: boolean;
  /**
   * 상단 바의 작성 방식 배지를 누를 때마다 1 씩 오르는 신호. 값이 바뀌면 작성 방식 고르기를 편다.
   * ★값 자체에는 뜻이 없다(내용을 담지 않는다). 0 은 "아직 누른 적 없음" 이다.
   */
  /**
   * 근거 정리(근거 지도)로 보내 달라는 요청(ADR-103·107). 뼈대와 장면은 **거기서** 고른다.
   * ★없으면 [뼈대 고르기] 단추를 그리지 않는다 — 누를 곳이 없는 단추를 만들지 않는다.
   */
  onOpenEvidence?: () => void;
  /** 선생님이 따로 적어 둔 지시(2층 프롬프트). */
  readonly teacherPrompt?: string;
  /**
   * [반영] — 실제 저장은 부모가 한다(기존 upsert 경로). roleMarks 는 표식(없으면 null 로 뗀다).
   * threadId 는 이 판이 딛고 선 주제. **넘기지 않으면 "바꾸지 않는다"** — 되돌리기·표식 갱신이
   * 초안의 주제를 조용히 떨구지 않게.
   */
  readonly onApply: (
    studentRef: string,
    text: string,
    roleMarks: readonly RoleMark[] | null,
    threadId?: string,
  ) => Promise<void> | void;
  /** [다시 표시] — 본문은 그대로 두고 표식만 갱신한다. */
  readonly onRemark?: (studentRef: string, roleMarks: readonly RoleMark[]) => Promise<void> | void;
  /** 큐가 다음 학생으로 넘어갔다 — 부모가 그 학생을 고른 학생으로 바꾼다. */
  readonly onFocusStudent?: (studentRef: string) => void;

  // ── 분량 조절 (ADR-088). 넷이 모두 있어야 섹션이 그려진다. ──
  /** 영역·학교급 — 한도와 확인 여부는 도메인 함수가 이 둘로부터 구한다(숫자를 따로 받지 않는다). */
  readonly area?: RecordArea;
  readonly level?: SchoolLevel;
  /**
   * 조절 대상 글을 **누르는 시점에** 읽는다.
   * ★`target.existingText` 를 쓰면 안 된다 — 그건 **저장된** 값의 렌더 시점 스냅숏이라,
   *   한도를 넘겨 저장이 거부된 글(정작 조절해야 할 그 글)이 들어 있지 않다.
   */
  readonly getSourceText?: () => string;
  /** 편집칸 입력이 바뀔 때마다 알려 주는 구독 — 분량 조절이 편집칸 막대와 같은 숫자를 보이게. */
  readonly subscribeSourceText?: (notify: () => void) => () => void;
  /** 분량 목표(바이트) — 이 수업반·영역에 선생님이 정한 값. 없으면 한도. **실행을 누르는 순간 고정된다.** */
  readonly targetBytes?: number;
  readonly onChangeTargetBytes?: (bytes: number) => void;
  /** 선생님이 이 수업반·영역에 직접 정한 한도(있으면). 칩·판 머리 숫자·분량 조절이 모두 이 한도를 쓴다. */
  readonly limitOverride?: number;
  /** 근거 지도에서 넘어온 "이 주제로 써 줘" 쪽지. `nonce` 가 바뀔 때만 받는다. */
  readonly requestedThread?: {
    readonly threadId: string;
    readonly chain: boolean;
    readonly nonce: number;
  };
  /**
   * 근거 지도의 [고른 근거 N건으로 초안 쓰기](ADR-106) — **이 근거들만** 보내 달라는 쪽지. `nonce` 가 바뀔 때만 받는다.
   * ★화면의 "초안에 쓸 근거 N건"과 요청서에 실리는 근거가 같은 집합이어야 한다(AC-03). 차례는 요청서가
   *   연결을 따라 정한다(`orderForDraft`) — 여기서 따로 정렬하지 않는다.
   */
  readonly requestedSelection?: {
    readonly evidenceIds: readonly string[];
    readonly nonce: number;
  };
  /**
   * @param sourceText 조절할 **실제 원문**. 미리보기 중인 AI 판이 있으면 그 판의 글이고, 없으면
   *   편집 칸의 글이다. ★2026-09-08 R-2: 라벨은 "AI 초안 v1"인데 원문은 편집 칸(162B)을 보내
   *   [줄이기]가 늘리기가 됐다. 이제 원문은 이 패널이 정해서 넘긴다.
   * @param sourceVersionId 원문이 AI 판이면 그 판 id — 조절 결과 판에 "어느 판을 조절했는지" 남긴다.
   */
  readonly onLengthRun?: (
    kind: LengthAdjustKind,
    targetBytes: number,
    sourceText: string,
    sourceVersionId: string | undefined,
  ) => Promise<LengthAdjustOutcome>;
  readonly onLengthApply?: (
    picked: LengthAdjustCandidate,
    outcome: LengthAdjustOutcome,
    kind: LengthAdjustKind,
    targetBytes: number,
    sourceVersionId: string | undefined,
    threadId: string | undefined,
  ) => Promise<void>;
  /** [중단] — 진행 중인 분량 조절 왕복을 멈춘다(R-6). */
  readonly onLengthCancel?: () => void;
  /**
   * 화면에 저장되지 않은 입력이 있는가. [뒤에 붙이기]를 막는 데 쓴다.
   * ★붙이기의 앞글은 **저장된** 글이라, 미저장 입력이 있는 채 누르면 그 입력이 조용히 사라진다.
   */
  readonly hasUnsavedInput?: boolean;
}

/**
 * 실행 단계 — **스토어가 든다**(`useRecordAiRunStore`, ADR-093 결정 3). 이 패널은 학생·영역이 바뀌면 새로
 * 만들어지는데, 큐가 패널 상태에 있으면 "남은 학생 모두"가 다음 학생으로 넘어가며 선택을 바꾸는 순간 큐가 사라졌다.
 */
type Phase = DraftRunPhase;
const IDLE_PHASE: Phase = { kind: 'idle' };

/**
 * 모델이 쓴 별칭을 실제 이름으로 되돌린다 — 이 학생뿐 아니라 근거에 등장한 **다른 학생**도.
 * 지우지 않고 **되돌린다.** 통째로 지우면 문장이 부서지고, 부서진 문장은 무엇이 없어졌는지도 모른다.
 */
export function restoreAliases(text: string, mappings: readonly MaskMapping[]): string {
  return restoreModelText(text, mappings);
}

const UNDO_MS = 30_000;

/**
 * 배급 한도로 멈춘 뒤 [이어 하기] 를 잠가 두는 시간 (ADR-089).
 *
 * ★문구만으로는 재시도 폭주를 못 막는다 — 그 버튼은 `runQueue` 를 즉시 다시 부르므로
 *   "1분 뒤에 다시" 라고 써 놓아도 곧바로 눌리면 또 429 가 되고 요청이 더 몰린다.
 * ★[이 학생 초안 쓰기] 새 시작까지 막지는 않는다(알려진 한계).
 */
const RETRY_COOLDOWN_MS = 60_000;

export function RecordDraftAiPanel({
  areaLabel,
  subject,
  roster,
  target,
  threads = [],
  studentEvidences,
  remaining = [],
  picked = [],
  onClearPicked,
  draftKey,
  existingRoleMarks,
  highlightOn = false,
  onOpenEvidence,
  teacherPrompt,
  onApply,
  onRemark,
  onFocusStudent,
  area,
  level,
  getSourceText,
  subscribeSourceText,
  targetBytes,
  onChangeTargetBytes,
  limitOverride,
  requestedThread,
  requestedSelection,
  onLengthRun,
  onLengthApply,
  onLengthCancel,
  hasUnsavedInput,
}: RecordDraftAiPanelProps) {
  /**
   * 실행 단계는 스토어에서 읽고 쓴다. scope(영역·과목·수업반)가 다르면 남의 큐다(idle 로 본다).
   * 학생은 scope 에 넣지 않는다 — 큐가 학생을 옮겨 다니기 때문이다. 결과는 큐 항목의 `studentRef` 칸으로만 간다.
   */
  const runScope = draftRunScope({
    area: draftKey.area,
    ...(draftKey.subject !== undefined ? { subject: draftKey.subject } : {}),
    ...(draftKey.classId !== undefined ? { classId: draftKey.classId } : {}),
  });
  const draftRun = useRecordAiRunStore((s) => s.drafts[runScope]);
  const phase: Phase = draftRun ?? IDLE_PHASE;
  const setDraftPhase = useRecordAiRunStore((s) => s.setDraftPhase);
  const setDraftAbort = useRecordAiRunStore((s) => s.setDraftAbort);
  const setPhase = useCallback(
    (next: Phase): void => setDraftPhase(runScope, next),
    [setDraftPhase, runScope],
  );
  /** 고른 주제(''=전체 근거). 학생이 바뀌면 부모가 이 패널을 새로 만든다(key). */
  const [pickedThreadId, setPickedThreadId] = useState('');
  /**
   * [이어진 흐름 전체로]로 왔는가 — 고른 주제의 앞뒤 주제까지 한 요청서에 싣는다. 칩을 손으로 고르면 풀린다.
   * ★예전에는 이 단추가 [이 흐름으로 초안 쓰기]와 똑같이 동작했다(요청서에 사슬을 싣는 곳이 없었다).
   */
  const [chainMode, setChainMode] = useState(false);
  const lastThreadNonceRef = useRef<number | null>(null);
  /**
   * 근거 지도에서 고른 근거 id — `null` 이면 고른 것이 없다(주제/전체 근거 경로). 주제 칩을 손으로 고르면 풀린다.
   * ★학생이 바뀌면 부모가 이 패널을 새로 만들므로(key) 남의 학생 선택이 따라오지 않는다.
   */
  const [pickedIds, setPickedIds] = useState<readonly string[] | null>(null);
  const lastSelectionNonceRef = useRef<number | null>(null);
  const [customTargetOpen, setCustomTargetOpen] = useState(false);
  /** 실행을 누른 순간의 분량 목표 — 큐가 도는 동안 칩을 바꿔도 이 실행에는 반영되지 않는다(작성 방식과 같은 규칙). */
  const runTargetRef = useRef<number | undefined>(targetBytes);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  /**
   * 설정(공급자·모델) 펼침 — 판이 하나라도 있으면 "Claude Code · Sonnet 5 [바꾸기]" 한 줄로 접는다(ADR-093 결정 6).
   * 처음(판 없음)에는 펼쳐진 채다: 그때가 설정하는 단계다.
   */
  const [setupOpen, setSetupOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remarking, setRemarking] = useState(false);
  /** 배급 한도로 멈춘 뒤 [이어 하기] 를 다시 누를 수 있는 시각(ms). 0 이면 잠금 없음. */
  const [retryBlockedUntil, setRetryBlockedUntil] = useState(0);
  /** 잠금이 남은 초를 화면에 보여 주기 위한 1초 시계. 잠겨 있을 때만 돈다. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (retryBlockedUntil <= Date.now()) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryBlockedUntil]);
  const retryLeftSec =
    retryBlockedUntil > nowTick ? Math.ceil((retryBlockedUntil - nowTick) / 1000) : 0;
  /**
   * 중복 실행 잠금 — **판정은 반드시 이 참조로 한다.**
   * 상태(`useState`)는 갱신이 비동기라 빠르게 두 번 누르면 두 호출이 **같은 옛 값**을 보고
   * 둘 다 통과한다(이 저장소에서 실제로 뚫린 전례가 있다). 위 상태는 화면 표시 전용이다.
   * ★이 잠금은 뒤에 부모(`RecordDraftView`)로 올라가 초안 생성·분량 조절과 함께 묶인다.
   */
  const remarkingRef = useRef(false);
  const [undo, setUndo] = useState<{
    readonly studentRef: string;
    readonly previous: string;
    readonly previousMarks: readonly RoleMark[] | null;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // ── 작성 방식(ADR-099) ──────────────────────────────────────
  /**
   * 영역별로 마지막에 고른 값을 설정에 기억한다. 학생을 바꿔도 그대로고, 행특과 세특은 서로 다른 값을 든다.
   * ★모르는 영역·옛 설정이면 기존형이다 — 고르지 않은 선생님에게는 오늘과 같은 요청서가 나간다.
   */
  /**
   * 폴백 작성 방식은 **기본값으로 고정**한다(ADR-103 §4-5).
   *
   * ★저장된 `recordWritingStyles`·`recordStylePresets` 를 여기서 읽지 않는다. 화면에서 사라진 값이
   *   요청서에 계속 실리면 **보이지 않는 설정이 결과를 가르고** 선생님은 진단할 수 없다. 옛 값은
   *   `useScaffoldMigration` 이 뼈대로 한 번 옮겼고, 그 뒤로는 요청서 입력이 아니다(값은 지우지 않는다).
   */
  /**
   * 「+ 한마디」 — 이 학생 이 초안에만 붙이는 자유 지시(ADR-099 2층에서 이어진다).
   * ★뼈대에는 담기지 않는다. 뼈대는 자리와 이름뿐이고, 한마디는 그때그때 다른 말이다.
   * ★공통 규정·기재 금지·실명 가림은 이 칸으로 끌 수 없다(조립기가 뒤에서 다시 건다).
   */
  const [extraRemark, setExtraRemark] = useState('');
  const [extraRemarkOpen, setExtraRemarkOpen] = useState(false);
  const writingStyle: RecordWritingStyle = useMemo(
    () =>
      extraRemark.trim().length === 0
        ? DEFAULT_RECORD_WRITING_STYLE
        : { ...DEFAULT_RECORD_WRITING_STYLE, instruction: extraRemark.trim() },
    [extraRemark],
  );
  /**
   * 실행 중에는 시작 시점 값으로 **고정**한다. 큐가 도는 동안 설정을 바꿔도 진행 중 요청은 안 바뀐다.
   * (화면은 잠기고, 이 참조가 실제로 나간 값을 든다.)
   */
  const runStyleRef = useRef<RecordWritingStyle>(writingStyle);
  /** 마지막으로 받아 둔 작성 규정 판본. 판본이 모자라면 새 구성을 아예 안 쓴다. */
  const [seenPromptVersion, setSeenPromptVersion] = useState<number | undefined>(undefined);

  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);
  const provider = useAssistStore((s) => s.provider);
  const connected = useConnectedOwnAiProviders();
  const setUsage = useOwnAiStatusStore((s) => s.setUsage);
  const installId = useAssistStore((s) => s.installId);

  /**
   * 어느 AI 로, 어떤 모델로 쓸지 **이 화면에서** 고른다(ADR-084 D-A). 값은 AI 패널과 같은 것을 쓴다.
   */
  const setProvider = useAssistStore((s) => s.setProvider);
  const ownAiModels = useAssistStore((s) => s.ownAiModels);
  const setOwnAiModel = useAssistStore((s) => s.setOwnAiModel);
  const modelCatalog = useOwnAiModelCatalog(connected.length > 0);
  const changeModel = (p: 'claude' | 'codex', model: string): void => {
    setOwnAiModel(p, model);
    void window.electronAPI?.ownAi?.setModel?.(p, model);
  };

  /** 실제로 쓸 공급자 — 고른 것이 연결돼 있어야 한다. 아니면 연결된 첫 번째. */
  const runProvider = useMemo(() => {
    if (!ownAiEnabled || connected.length === 0) return null;
    if (provider !== 'ssampin' && connected.includes(provider)) return provider;
    return connected[0] ?? null;
  }, [ownAiEnabled, connected, provider]);

  // ── 판(버전) ────────────────────────────────────────────────
  const allVersions = useRecordAiDraftStore((s) => s.records);
  const loadVersions = useRecordAiDraftStore((s) => s.load);
  const addVersion = useRecordAiDraftStore((s) => s.add);
  const markApplied = useRecordAiDraftStore((s) => s.markApplied);
  const removeVersion = useRecordAiDraftStore((s) => s.remove);
  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  /** 보고 있는 학생 — 큐가 다른 학생 차례면 그 학생. */
  const viewRef = phase.kind === 'preview' ? phase.studentRef : target.studentRef;
  const viewName = phase.kind === 'preview' ? phase.name : target.displayName;
  const viewKey = useMemo<RecordAiDraftKey>(
    () => ({ ...draftKey, studentRef: viewRef }),
    [draftKey, viewRef],
  );
  const versions = useMemo(
    () =>
      allVersions
        .filter((r) => sameAiDraftKey(r.draftKey, viewKey))
        .sort((a, b) => a.createdAt - b.createdAt),
    [allVersions, viewKey],
  );
  const selected: RecordAiDraft | null = useMemo(() => {
    if (versions.length === 0) return null;
    return (
      versions.find((v) => v.id === selectedVersionId) ?? versions[versions.length - 1] ?? null
    );
  }, [versions, selectedVersionId]);

  const pickedThread = threads.find((t) => t.id === pickedThreadId) ?? null;
  // 근거 지도에서 넘어온 쪽지 — **이 학생의 주제일 때만** 받는다. 학생을 바꿔 패널이 새로 만들어져도
  //   남의 주제 id 를 골라 두거나 사슬 모드를 남기지 않는다.
  useEffect(() => {
    if (requestedThread === undefined) return;
    if (lastThreadNonceRef.current === requestedThread.nonce) return;
    if (!threads.some((t) => t.id === requestedThread.threadId)) return;
    lastThreadNonceRef.current = requestedThread.nonce;
    setPickedThreadId(requestedThread.threadId);
    setChainMode(requestedThread.chain);
    setPickedIds(null);
  }, [requestedThread, threads]);
  // 근거 지도에서 넘어온 쪽지 — **이 학생 근거에 실재하는 id 만** 받는다. 하나도 없으면 받지 않는다(빈 선택으로 만들지 않는다).
  useEffect(() => {
    if (requestedSelection === undefined) return;
    if (lastSelectionNonceRef.current === requestedSelection.nonce) return;
    const known = new Set((studentEvidences ?? []).map((e) => e.id));
    const ids = requestedSelection.evidenceIds.filter((id) => known.has(id));
    if (ids.length === 0) return;
    lastSelectionNonceRef.current = requestedSelection.nonce;
    setPickedIds(ids);
    setPickedThreadId('');
    setChainMode(false);
  }, [requestedSelection, studentEvidences]);

  /**
   * 분량 조절의 대상이 되는 AI 판 — 미리보기 중이고(반영 전) 조절 결과가 아닌 판. 반영된 판은 이미
   * 편집 칸에 들어가 있으므로 편집 칸의 글을 조절한다(R-2).
   */
  const adjustTargetVersion: RecordAiDraft | null =
    selected !== null && selected.adjust === undefined && selected.appliedAt === undefined
      ? selected
      : null;
  /** [뒤에 붙이기] 하면 확정된 한도를 넘는가 — 막지 않고 단추에 경고 표시만 한다(오너 결정 2026-09-11). */
  const appendOverLimit =
    selected !== null &&
    area !== undefined &&
    level !== undefined &&
    isAreaLimitConfirmed(area, level, limitOverride) &&
    appendedBytes(target.existingText ?? '', aiDraftText(selected)) >
      effectiveAreaLimit(area, level, limitOverride);
  /** 보낼 근거 — 주제를 골랐으면 그 주제의 근거만, 아니면 이 영역 전체. */
  const targetForRun = useMemo<DraftTarget>(() => {
    if (pickedIds !== null && studentEvidences !== undefined) {
      // 고른 근거만 — 영역 필터와 무관하게 지도에서 고른 그대로. 차례는 요청서가 연결을 따라 정한다.
      const wanted = new Set(pickedIds);
      return { ...target, evidences: studentEvidences.filter((e) => wanted.has(e.id)) };
    }
    if (pickedThread === null || studentEvidences === undefined) return target;
    // 사슬이면 앞뒤 주제의 근거까지. 사슬을 못 찾으면(닫힌 주제 등) 고른 주제 하나로 돌아간다.
    const chainIds = chainMode
      ? chainOf(
          threads.filter((th) => th.studentRef === target.studentRef && th.status === 'open'),
          pickedThread.id,
        ).map((th) => th.id)
      : [];
    const ids = new Set(chainIds.length > 0 ? chainIds : [pickedThread.id]);
    return {
      ...target,
      evidences: studentEvidences.filter((e) => e.threadId !== undefined && ids.has(e.threadId)),
    };
  }, [pickedIds, pickedThread, studentEvidences, target, chainMode, threads]);

  /**
   * 요청서에 실릴 「근거 사이 연결」 — 화면 요약이 **요청서와 같은 함수**로 센다(`resolveEvidenceEdges`·`orderForDraft`).
   * 보낼 수 있는 근거 사이의 연결만 센다(빠진 근거를 가리키는 연결은 요청서에도 안 실린다).
   */
  const linkSummary = useMemo((): { readonly count: number; readonly cyclic: boolean } => {
    const sendable = targetForRun.evidences.filter(
      (e) => e.excludedFromAi !== true && e.content.trim().length > 0,
    );
    const { edges } = resolveEvidenceEdges(sendable);
    const inner = edgesWithin(edges, new Set(sendable.map((e) => e.id)));
    return { count: inner.length, cyclic: orderForDraft(sendable, inner).cyclic };
  }, [targetForRun.evidences]);

  /** 화면의 「빠진 근거」 — 선생님이 뺀 것과 빈 것. 금지어로 빠지는 것은 요청서를 만들 때 사유와 함께 따로 알린다. */
  const droppedEvidences = useMemo(
    () =>
      targetForRun.evidences
        .filter((e) => e.excludedFromAi === true || e.content.trim().length === 0)
        .map((e) => ({
          id: e.id,
          head: e.content.trim().slice(0, 24) || '(내용 없음)',
          why: e.content.trim().length === 0 ? '내용이 비어 있음' : '선생님이 보내지 않기로 표시함',
        })),
    [targetForRun.evidences],
  );

  /**
   * 요청서 조립. ★작성 방식은 **인자로 받는다** — 화면 상태를 여기서 읽으면 큐가 도는 중 선생님이
   * 설정을 바꿨을 때 학생마다 다른 구성으로 나간다(요청 시작 시 고정 계약, ADR-099 §11).
   */
  /** 실제로 보낼 근거(선생님이 뺀 것·빈 것 제외) — 작성 방식 검사가 이 수를 본다. */
  const sendableEvidences = useMemo(
    () =>
      targetForRun.evidences.filter(
        (e) => e.excludedFromAi !== true && e.content.trim().length > 0,
      ),
    [targetForRun.evidences],
  );

  const buildPrompt = useCallback(
    (t: DraftTarget, style: RecordWritingStyle, promptVersion?: number) => {
      // 선생님 지시는 두 곳에서 온다: 부모가 준 것(옛 경로)과 작성 방식의 추가 지시. 둘 다 있으면 잇는다.
      const extra = (style.instruction ?? '').trim();
      const base = (teacherPrompt ?? '').trim();
      const merged = [base, extra].filter((x) => x.length > 0).join('\n');
      // 구성용 판본 문지기 — 작성 방식용(`applyPromptVersionGate`)의 형제다.
      const gatedComposition =
        t.narrative === undefined
          ? null
          : applyCompositionVersionGate(t.narrative.composition, promptVersion).composition;
      return buildRecordDraftPack({
        studentName: t.displayName,
        roster,
        areaLabel,
        ...(subject === undefined ? {} : { subject }),
        // 주제는 누른 학생에게만 — 남의 학생에게 같은 주제를 씌우면 엉뚱한 근거로 쓰게 된다.
        // ★이름만이 아니라 선생님이 그 주제에 적어 둔 것(키워드·역량 낱말·다음 메모)까지 함께 보낸다.
        //   비어 있는 칸은 꾸러미가 줄 자체를 만들지 않는다.
        ...(pickedThread !== null && t.studentRef === target.studentRef
          ? {
              threadTitle: pickedThread.title,
              threadNote: {
                keywords: pickedThread.keywords,
                ...(pickedThread.competencyKeywords === undefined
                  ? {}
                  : { competencyKeywords: pickedThread.competencyKeywords }),
                ...(pickedThread.nextNotes === undefined
                  ? {}
                  : { nextNotes: pickedThread.nextNotes }),
              },
            }
          : {}),
        evidences: t.evidences,
        ...(t.standardKeywords === undefined ? {} : { standardKeywords: t.standardKeywords }),
        ...(merged.length > 0 ? { teacherPrompt: merged } : {}),
        style,
        // ★장면이 있으면 구성이 style 보다 우선한다. 판본이 모자라면 **아예 안 보낸다** —
        //   장면에는 되돌릴 기존형이 없기 때문이다. 그 사실은 화면 경고로 따로 올린다.
        ...(gatedComposition === null ? {} : { composition: gatedComposition }),
        ...(gatedComposition === null || t.narrative === undefined
          ? {}
          : { scenes: t.narrative.scenes }),
        ...(gatedComposition !== null && t.narrative?.chain !== undefined
          ? { chain: t.narrative.chain }
          : {}),
        // 분량 목표 — 실행을 누른 순간의 값. 한도보다 작을 때만 꾸러미가 분량 줄을 붙인다.
        ...(runTargetRef.current !== undefined && area !== undefined && level !== undefined
          ? { targetBytes: runTargetRef.current, limitBytes: resolveAreaLimit(area, level) }
          : {}),
      });
    },
    [areaLabel, subject, roster, pickedThread, target.studentRef, teacherPrompt, area, level],
  );

  /** 판에 남길 발자국. ★추가 지시 **본문은 담지 않는다**(판 파일은 Drive 로 동기화된다). */
  const styleStampOf = (style: RecordWritingStyle): RecordDraftStyleStamp => ({
    focus: style.focus,
    opening: style.opening,
    grouping: style.grouping,
    moduleIds: resolveComposition(style).modules.map((m) => m.id),
    catalogVersion: RECORD_STYLE_CATALOG_VERSION,
    hadInstruction: (style.instruction ?? '').trim().length > 0,
  });

  /** [중단] — 손잡이는 스토어에 있다(새 패널 인스턴스에서도 멈출 수 있게, R-6·ADR-093). */
  const abortRun = (): void => useRecordAiRunStore.getState().draftAbort[runScope]?.abort();

  /** 큐를 하나씩 처리한다. 결과가 나오면 판으로 남기고 미리보기에서 멈춰 선생님 판단을 기다린다. */
  const runQueue = useCallback(
    async (queue: readonly DraftTarget[], startedWith: number) => {
      const api = runApi();
      if (!api || !runProvider) return;
      const total = startedWith;
      const abort = new AbortController();
      setDraftAbort(runScope, abort);
      try {
        // ★규정(1층 프롬프트)을 먼저 받는다 — 없으면 초안을 만들지 않는다(D7).
        //   본문은 여기 지역 변수에만 있고, 디스크에 쓰지 않는다.
        //   ★전에 받아 둔 값이 있으면 서버가 잠깐 죽어도 계속 만든다(ADR-089) — 그 판단은
        //     `fetchRecordPromptL1` 안에 있고, 여기서는 `ok` 만 본다.
        const promptResult = await fetchRecordPromptL1(installId);
        if (!promptResult.ok) {
          const kind: OwnAiErrorKind =
            promptResult.reason === 'rate-limited-minute'
              ? 'prompt-rate-limited-minute'
              : promptResult.reason === 'rate-limited-day'
                ? 'prompt-rate-limited-day'
                : 'prompt-unavailable';
          // ★한도로 멈춘 경우에만 [이어 하기] 를 잠깐 잠근다. 그 버튼은 `runQueue` 를 즉시
          //   다시 부르므로, 안 잠그면 429 → 누름 → 429 로 요청이 더 몰린다.
          if (kind !== 'prompt-unavailable') {
            setRetryBlockedUntil(Date.now() + RETRY_COOLDOWN_MS);
          }
          setPhase({ kind: 'stopped', message: OWN_AI_ERROR_MESSAGES[kind].draft, queue });
          return;
        }
        const systemPrompt = promptResult.prompt;
        const promptVersion = promptResult.version;
        setSeenPromptVersion(promptVersion);
        // ★규정 판본이 새 구성을 못 받는 판본이면 **기존형으로 되돌려** 쓴다(ADR-099 §8).
        //   조용히 바꾸지 않는다: 되돌렸으면 화면에 그 사실이 뜨고, 판에도 되돌린 뒤의 구성이 남는다.
        const gated = applyPromptVersionGate(runStyleRef.current, promptVersion);
        const runStyle = gated.style;

        for (let i = 0; i < queue.length; i += 1) {
          const t = queue[i];
          if (!t) continue;
          setPhase({
            kind: 'running',
            done: total - queue.length + i,
            total,
            name: t.displayName,
            studentRef: t.studentRef,
            queue: queue.slice(i),
          });
          const pack = buildPrompt(t, runStyle, promptVersion);
          try {
            const raw = await askOnce(api, runProvider, pack.text, systemPrompt, abort.signal);
            // 별칭을 실제 이름으로 되돌리고 표식을 뗀 뒤에 남긴다 — 판에는 ［이름1］도 [동기]도 없다.
            const restored = restoreAliases(raw, pack.mappings);
            // ★표식 없는 줄은 버린다 — 모델이 "다시 씁니다" 같은 설명을 본문 사이에 끼워 넣은
            //   실측 사례가 있다(ADR-099 보강 5). 표식이 하나도 없으면 아무것도 버리지 않는다.
            const paragraphs = dropUnmarkedParagraphs(parseNarrativeParagraphs(restored));
            // ★초안이 아니라 설명(거절·되묻기)이 왔으면 판으로 남기지 않는다(R-3). 설명문이 판이 되면
            //   [반영]으로 생기부 칸에 들어간다. 사유와 그 글을 보여 주고 멈춘다.
            const nonDraft = judgeNonDraftReply(aiDraftText({ paragraphs }));
            if (nonDraft.nonDraft) {
              const head = restored.trim().slice(0, 200);
              setPhase({
                kind: 'stopped',
                message: `${nonDraft.reason} 근거를 더 넣거나 다시 시도해 주세요. AI 답: "${head}${restored.trim().length > 200 ? '…' : ''}"`,
                queue: queue.slice(i),
              });
              return;
            }
            // ★분량은 앱이 센다(ADR-110). 목표를 10% 넘게 넘겼으면 **한 번** 줄여 본다. 처음 초안도 판으로 남긴다
            //   (ADR-085: AI 가 만든 것은 다 남긴다) — 줄인 글이 중요한 사실을 뺐으면 처음 판으로 돌아갈 수 있다.
            const runTarget = runTargetRef.current;
            const firstBytes = neisByteLength(aiDraftText({ paragraphs }));
            let shrunk: DraftShrinkResult | null = null;
            let shrinkOutcome: 'none' | 'done' | 'failed' | 'cancelled' = 'none';
            if (runTarget !== undefined && needsAutoShrink(firstBytes, runTarget)) {
              setPhase({
                kind: 'running',
                done: total - queue.length + i,
                total,
                name: t.displayName,
                studentRef: t.studentRef,
                queue: queue.slice(i),
                shrinking: { fromBytes: firstBytes, targetBytes: runTarget },
              });
              try {
                shrunk = await shrinkDraftOnce({
                  api,
                  provider: runProvider,
                  systemPrompt,
                  signal: abort.signal,
                  studentName: t.displayName,
                  roster,
                  areaLabel,
                  ...(pickedThread !== null && t.studentRef === target.studentRef
                    ? { threadTitle: pickedThread.title }
                    : {}),
                  paragraphs,
                  targetBytes: runTarget,
                });
                shrinkOutcome = shrunk === null ? 'failed' : 'done';
              } catch (kind) {
                // ★줄이기가 실패해도([중단] 포함) 처음 초안은 이미 있다 — 버리지 않고 그대로 보여 준다.
                shrinkOutcome = kind === 'cancelled' ? 'cancelled' : 'failed';
              }
            }
            const versionKey = { ...draftKey, studentRef: t.studentRef };
            const versionBase = {
              draftKey: versionKey,
              provider: runProvider,
              promptVersion,
              ...(ownAiModels[runProvider] ? { model: ownAiModels[runProvider] } : {}),
              ...(pickedThread !== null && t.studentRef === target.studentRef
                ? { threadId: pickedThread.id }
                : {}),
              // ★장면으로 쓴 초안이면 **장면 발자국**을 남긴다. 자유 글(메모·직접 지은 이름)은
              //   담지 않는다 — 판 파일은 Drive 로 동기화된다.
              style:
                t.narrative !== undefined && promptVersion >= RECORD_STYLE_MIN_PROMPT_VERSION
                  ? narrativeStyleStamp(
                      t.narrative.stampScenes,
                      t.narrative.frame,
                      (runStyle.instruction ?? '').trim().length > 0,
                    )
                  : styleStampOf(runStyle),
              excluded: summarizeDraftPackNotes(pack),
            };
            const firstId = await addVersion({ ...versionBase, paragraphs });
            // 줄인 글은 새로 쓴 판과 똑같이 둔다(조절안 `adjust` 로 두지 않는다) — [뒤에 붙이기]·「분량 조절」을 그대로 쓰게.
            const id =
              shrunk === null
                ? firstId
                : await addVersion({ ...versionBase, paragraphs: shrunk.paragraphs });
            if (shrinkOutcome !== 'none') {
              const from = firstBytes.toLocaleString();
              if (shrunk !== null) {
                // 판 탭 이름(v1·v2…)은 이 칸의 판을 오래된 순으로 센 차례다 — 화면의 `versions` 와 같은 셈.
                const at = useRecordAiDraftStore
                  .getState()
                  .records.filter((r) => sameAiDraftKey(r.draftKey, versionKey))
                  .sort((a, b) => a.createdAt - b.createdAt)
                  .findIndex((r) => r.id === firstId);
                setNotice(
                  `처음 초안이 ${from}B로 목표보다 길어 자동으로 한 번 줄였어요. 지금은 ${shrunk.bytes.toLocaleString()}B예요. ` +
                    `처음 판은 아래 ${at >= 0 ? `v${at + 1} ` : ''}탭에서 볼 수 있어요.`,
                );
              } else {
                setNotice(
                  shrinkOutcome === 'cancelled'
                    ? `자동 줄이기를 멈췄어요. 처음 초안(${from}B)을 그대로 보여 드려요. 아래 「분량 조절」에서 다시 줄일 수 있어요.`
                    : `처음 초안이 ${from}B로 목표보다 길어요. 자동으로 줄이지 못해 처음 판을 그대로 보여 드려요. 아래 「분량 조절」에서 다시 줄일 수 있어요.`,
                );
              }
            }
            setSelectedVersionId(id);
            setCompareOn(false);
            setPhase({
              kind: 'preview',
              studentRef: t.studentRef,
              name: t.displayName,
              queue: queue.slice(i + 1),
            });
            if (t.studentRef !== target.studentRef) onFocusStudent?.(t.studentRef);
            return; // 미리보기에서 멈춘다 — [반영] 을 눌러야 다음으로 간다.
          } catch (kind) {
            const k = (typeof kind === 'string' ? kind : 'crashed') as OwnAiErrorKind;
            setPhase({
              kind: 'stopped',
              message: OWN_AI_ERROR_MESSAGES[k].draft,
              queue: queue.slice(i),
            });
            return;
          }
        }
        setPhase({ kind: 'idle' });
      } finally {
        // 다 쓴 손잡이는 치운다 — 멈출 실행이 없는데 [중단]이 옛 컨트롤러를 잡는 일이 없게.
        setDraftAbort(runScope, null);
      }
    },
    [
      runScope,
      buildPrompt,
      roster,
      areaLabel,
      runProvider,
      installId,
      addVersion,
      draftKey,
      ownAiModels,
      pickedThread,
      target.studentRef,
      onFocusStudent,
      setPhase,
      setDraftAbort,
    ],
  );

  /**
   * 학생 한 명의 서사 스냅샷 — **실행을 시작할 때 한 번만** 만든다.
   *
   * 판정: 이 학생의 **장면이 있는 열린 주제**가
   *  - 정확히 하나면 그 서사로 쓴다
   *  - 0개면 서사 없이(예전 경로) 쓴다
   *  - 2개 이상이면 **고르지 않는다** — 어느 서사인지 우리가 정할 근거가 없다. 실행 전에 묻는다.
   */
  const narrativeFor = useCallback(
    (t: DraftTarget): DraftTargetNarrative | null => {
      if (t.studentRef !== target.studentRef) return null; // 지금은 누른 학생만 서사로 쓴다
      if (pickedIds !== null) return null; // 고른 근거로 쓸 때는 장면 배열을 얹지 않는다 — 연결과 날짜가 차례를 정한다
      const evidences = studentEvidences ?? [];
      const mine = threads.filter((th) => th.studentRef === t.studentRef && th.status === 'open');
      const withScenes = mine.filter(
        (th) => placedCount(th, evidences) > 0 || (th.scenes?.length ?? 0) > 0,
      );
      const chosen =
        pickedThread !== null
          ? (withScenes.find((th) => th.id === pickedThread.id) ?? null)
          : withScenes.length === 1
            ? (withScenes[0] ?? null)
            : null;
      if (chosen === null) return null;

      const frame = frameForArea(area ?? 'subject');
      const r = scenesOf(chosen, evidences, frame);
      const savedScenes = chosen.scenes;
      // [이어진 흐름 전체로] — 앞뒤 주제를 한 요청서에. 사슬이 하나뿐이면 예전과 같다.
      const chainThreads = chainMode ? chainOf(mine, chosen.id) : [];
      const composition = resolveCompositionFromScenes({
        saved: savedScenes,
        resolved: r.scenes.map((x) => x.scene),
        frame,
        chained: chosen.link !== undefined || chainThreads.length > 1,
        placedCount: r.placedCount,
      });
      if (composition === null) return null;
      return {
        threadId: chosen.id,
        frame,
        composition,
        scenes: r.scenes.map((x) => ({
          sceneId: x.scene.id,
          mark: sceneMarkOf(x.scene),
          label: sceneDisplayLabel(frame, x.scene),
          ...(x.scene.note === undefined ? {} : { note: x.scene.note }),
          ...(x.scene.leadIn === undefined ? {} : { leadIn: x.scene.leadIn }),
          evidenceIds: x.evidences.map((e) => e.id),
        })),
        stampScenes: r.scenes.map((x) => x.scene),
        ...(chainThreads.length > 1
          ? {
              chain: chainThreads.map((th, i) => {
                const rr = scenesOf(th, evidences, frame);
                const note = th.link?.note?.trim() ?? '';
                return {
                  threadTitle: th.title,
                  ...(i > 0 && note.length > 0 ? { linkNote: note } : {}),
                  scenes: rr.scenes.map((x) => ({
                    sceneId: x.scene.id,
                    mark: sceneMarkOf(x.scene),
                    label: sceneDisplayLabel(frame, x.scene),
                    ...(x.scene.note === undefined ? {} : { note: x.scene.note }),
                    ...(x.scene.leadIn === undefined ? {} : { leadIn: x.scene.leadIn }),
                    evidenceIds: x.evidences.map((e) => e.id),
                  })),
                  evidences: evidences.filter((e) => e.threadId === th.id),
                };
              }),
            }
          : {}),
      };
    },
    [target.studentRef, studentEvidences, threads, pickedThread, area, chainMode, pickedIds],
  );

  /**
   * 서사를 짰는데 서버 규정이 아직 못 받는 판본인가 — **조용히 빼면 안 된다.**
   * ★작성 방식 쪽 경고(`checkStyleReadiness`)는 `style` 만 보므로 이 경우를 못 잡는다.
   * ★`target.narrative` 를 보면 안 된다 — 서사는 **실행을 시작할 때** 큐 항목에 붙으므로
   *   화면의 `target` 에는 없다. "지금 이 학생에게 쓸 서사가 있는가" 를 다시 계산한다.
   */
  const narrativeDowngraded =
    seenPromptVersion !== undefined &&
    seenPromptVersion < RECORD_STYLE_MIN_PROMPT_VERSION &&
    narrativeFor(targetForRun) !== null;

  /**
   * 지금 이 학생의 초안이 **어떤 차례로** 나올지 한 문장.
   *
   * ★서사가 없을 때도 말한다. 폴백 요청서가 「교사 평가 → 동기·질문 → 과정 → 결과」 순서를
   *   못 박으므로(`narrativeParagraphs`), 화면이 아무 말도 안 하면 **보이지 않는 설정**이 된다.
   */
  const compositionSummary = useMemo((): string => {
    const linkTail =
      linkSummary.count > 0
        ? ` 근거 사이 연결 ${linkSummary.count}건을 따라 차례를 정합니다.${
            linkSummary.cyclic ? ' 연결이 서로 맞물린 곳은 날짜순입니다.' : ''
          }`
        : '';
    if (pickedIds !== null) {
      return `지도에서 고른 근거 ${targetForRun.evidences.length}건으로 씁니다.${
        linkTail.length > 0 ? linkTail : ' 근거는 날짜순으로 씁니다.'
      }`;
    }
    const n = narrativeFor(target);
    if (n === null) {
      return `교사 평가 → 동기·질문 → 과정 → 결과 차례로, 근거는 ${
        linkSummary.count > 0 ? '연결을 따라' : '날짜순으로'
      } 씁니다.${linkTail}`;
    }
    if (n.chain !== undefined && n.chain.length > 1) {
      return `이어진 주제 ${n.chain.length}개를 한 흐름으로 씁니다: ${n.chain.map((c) => c.threadTitle).join(' → ')}`;
    }
    const order = n.scenes.map((sc) => sc.label).join(' → ');
    return `짜 두신 흐름대로 씁니다: ${order}${linkTail}`;
  }, [narrativeFor, target, pickedIds, targetForRun.evidences.length, linkSummary]);

  /**
   * 요청서에 **함께** 실리는 것 — 장면 이름 순서만 말하면 메모가 나가는지 선생님이 알 길이 없다.
   * ★금지어(다른 학생 실명 등)가 든 메모는 요청서 조립이 **메모만 조용히 뺀다**(`droppedNoteCount`).
   *   그 수를 여기서 미리 세어 보여 준다 — 조립과 같은 순서(치환 뒤 검사)로 센다.
   */
  const packContents = useMemo((): string | null => {
    const clean = (t: string | undefined): string => t?.trim() ?? '';
    const evidenceNotes = sendableEvidences.map((e) => clean(e.note)).filter((x) => x.length > 0);
    const n = narrativeFor(target);
    const sceneNotes =
      n === null ? [] : n.scenes.map((sc) => clean(sc.note)).filter((x) => x.length > 0);
    if (evidenceNotes.length === 0 && sceneNotes.length === 0) return null;
    const blocked = [...evidenceNotes, ...sceneNotes].filter(
      (x) => detectProhibitedTerms(substituteProhibited(x).text).length > 0,
    ).length;
    const base = `함께 보내는 것: 근거 ${sendableEvidences.length}건 · 근거 메모 ${evidenceNotes.length} · 장면 메모 ${sceneNotes.length}`;
    return blocked > 0 ? `${base} · 금지어가 들어 빠지는 메모 ${blocked}` : base;
  }, [sendableEvidences, narrativeFor, target]);

  /**
   * 문단 ↔ 장면 왕복(ADR-103 §5-4) — 이 판의 문단이 **짜 두신 어느 자리에서 나왔는지** 맞춰 보고,
   * 나오지 못한 자리를 이름으로 말한다.
   *
   * ★"문단 수 = 장면 수"를 보장하지 않는다(계획서 §11). 근거가 없으면 모델이 건너뛴다.
   *   그래서 이 줄은 경고가 아니라 **되짚기**다 — 빠진 자리를 알면 근거를 더 놓을지 정할 수 있다.
   */
  const sceneRoundTrip = useMemo((): string | null => {
    if (selected === null) return null;
    const n = narrativeFor(target);
    if (n === null) return null;
    // 표식 낱말을 되짚지 않는다 — 장면 원본이 역할을 그대로 들고 있다(낱말 대조는 한 곳에만 둔다).
    const sceneRoles = n.stampScenes.map((sc) => sc.role);
    const missing = scenesMissingFromDraft(roleMarksOf(selected.paragraphs), sceneRoles);
    const total = n.scenes.length;
    if (missing.length === 0) return `짜 두신 장면 ${total}개가 모두 문단으로 나왔습니다.`;
    const names = missing.map((i) => n.scenes[i]?.label ?? '이름 없는 자리').join(', ');
    return `짜 두신 장면 ${total}개 가운데 ${total - missing.length}개가 문단으로 나왔습니다. 빠진 자리: ${names}`;
  }, [selected, narrativeFor, target]);

  /** 서사를 못 고른 학생들(주제가 둘 이상) — 실행 전에 이름을 보여 주고 묻는다. */
  const ambiguousNarrativeNames = (targets: readonly DraftTarget[]): readonly string[] => {
    // ★판정을 `narrativeFor` 와 **같은 술어**로 맞춘다. 예전에는 둘이 갈려, 주제를 이미 골라 둔
    //   학생에게 "전체 근거로 씁니다"라고 하고선 고른 서사로 썼고, 큐의 다른 학생들에게는
    //   "주제를 골라 실행하면 그 서사로 씁니다"라고 했지만 그들은 어떤 경우에도 서사를 못 받는다.
    return targets
      .filter((t) => narrativeFor(t) === null && hasSeveralScenedThreads(t))
      .map((t) => t.displayName);
  };

  /** 장면이 있는 열린 주제가 둘 이상인가 — "우리가 고르지 않는다"의 실제 조건. */
  function hasSeveralScenedThreads(t: DraftTarget): boolean {
    if (t.studentRef !== target.studentRef) return false; // 지금은 누른 학생만 서사로 쓴다
    const evidences = studentEvidences ?? [];
    const withScenes = threads.filter(
      (th) =>
        th.studentRef === t.studentRef &&
        th.status === 'open' &&
        (placedCount(th, evidences) > 0 || (th.scenes?.length ?? 0) > 0),
    );
    return withScenes.length > 1;
  }

  const start = (targets: readonly DraftTarget[]): void => {
    setUsage(null, null);
    // 지난 실행의 알림(자동 줄이기 결과 등)은 새 실행에 맞지 않는다.
    setNotice(null);
    // ★여기서 작성 방식을 **잠근다.** 큐가 도는 동안 설정을 바꿔도 이 실행에는 반영되지 않는다.
    runStyleRef.current = writingStyle;
    runTargetRef.current = targetBytes;
    // ★서사도 **여기서** 고정한다. `ref` 에 두면 [이어 하기]·자동 이어가기로 다시 들어올 때
    //   지금 값을 읽어 버린다 — 장면은 [반영] 사이에 선생님이 바로 고치는 자료다.
    //   큐 항목에 실어 두면 재진입해도 시작 시점의 값이 따라온다.
    const snapped = targets.map((t) => {
      const n = narrativeFor(t);
      return n === null ? t : { ...t, narrative: n };
    });
    const ambiguous = ambiguousNarrativeNames(targets);
    if (ambiguous.length > 0) {
      setNotice(
        `주제가 여러 개인 학생 ${ambiguous.length}명(${ambiguous.slice(0, 3).join(', ')}${ambiguous.length > 3 ? ' 외' : ''})은 ` +
          '어느 흐름으로 쓸지 정할 수 없어 전체 근거로 씁니다. 주제를 골라 실행하면 그 흐름으로 씁니다.',
      );
    }
    void runQueue(snapped, snapped.length);
  };
  /** 고른 학생 중 이미 초안이 있는 수 — 덮어쓰기 정책을 실행 전에 말해 둔다. */
  const pickedWithText = picked.filter((p) => (p.existingText ?? '').trim().length > 0).length;
  const startPicked = (): void => {
    if (picked.length === 0) return;
    start(picked);
    onClearPicked?.();
  };

  /** 미리보기 뒤 다음 학생으로 — 큐가 남았으면 이어 가고, 없으면 쉰다. */
  const continueQueue = (): void => {
    if (phase.kind === 'preview' && phase.queue.length > 0) {
      void runQueue(phase.queue, phase.queue.length);
    } else {
      setPhase({ kind: 'idle' });
    }
  };

  const armUndo = (studentRef: string, previous: string): void => {
    if (previous.trim().length === 0) return;
    setUndo({ studentRef, previous, previousMarks: existingRoleMarks ?? null });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const applyVersion = async (mode: 'replace' | 'append'): Promise<void> => {
    if (!selected) return;
    const ref = selected.draftKey.studentRef;
    const base = ref === target.studentRef ? (target.existingText ?? '') : '';
    const text = aiDraftText(selected);
    const marks = roleMarksOf(selected.paragraphs);
    // ★생기부는 한 덩어리 글이다 — 뒤에 붙일 때도 빈 줄이 아니라 공백 하나로 잇는다.
    const mergedText =
      mode === 'append' && base.trim().length > 0 ? `${base.trim()} ${text}` : text;
    // 앞글의 표식은 있으면 **그대로** 쓴다(문단으로 다시 쪼개면 구간 대응이 깨진다). 없으면 앞글 전체를 역할 없는 한 구간으로.
    const mergedMarks: RoleMark[] =
      mode === 'append' && base.trim().length > 0
        ? [
            ...(existingRoleMarks && existingRoleMarks.length > 0
              ? existingRoleMarks
              : [{ role: null, text: base.trim() }]),
            ...marks,
          ]
        : marks;
    // ★조용히 삼키면 안 된다. `onApply` 가 저장에 실패해 던지면(한도로는 더 이상 거부하지 않는다, ADR-105)
    //   감싸지 않으면 아래 `markApplied` 도 `continueQueue` 도 실행되지 않아 **아무 일도 안 일어나고
    //   아무 안내도 없다.** 미리보기와 원문은 그대로 두고 이유만 보여 준다(큐도 여기서 멈춘다).
    try {
      // ★판이 어느 주제로 쓰였는지를 초안 칸에도 남긴다 — 그래야 "이 주제로 쓴 초안" 조회가 성립한다.
      //   주제 없이 쓴 판이면 넘기지 않는다(기존 값을 지키기 위해 undefined 여야 한다).
      await onApply(ref, mergedText, mergedMarks, selected.threadId);
    } catch (err: unknown) {
      setNotice(
        err instanceof Error && err.message.trim().length > 0
          ? `반영하지 못했습니다: ${err.message}`
          : '반영하지 못했습니다. 글은 그대로입니다.',
      );
      return;
    }
    await markApplied(selected.id);
    if (mode === 'replace') armUndo(ref, base);
    setCompareOn(false);
    continueQueue();
  };

  const discardVersion = async (): Promise<void> => {
    if (!selected) return;
    await removeVersion(selected.id);
    setSelectedVersionId(null);
    setCompareOn(false);
    continueQueue();
  };

  const undoReplace = async (): Promise<void> => {
    if (!undo) return;
    await onApply(undo.studentRef, undo.previous, undo.previousMarks);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  /** [다시 표시] — 현재 글에 표식만 붙여 달라고 짧게 묻는다. 본문이 달라지면 버린다. */
  const remark = async (): Promise<void> => {
    const api = runApi();
    const content = target.existingText ?? '';
    if (!api || !runProvider || content.trim().length === 0 || !onRemark) return;
    if (remarkingRef.current) return;
    remarkingRef.current = true;
    setRemarking(true);
    setNotice(null);
    try {
      const pack = buildNarrativeRemarkPack({ content, roster });
      const raw = await askOnce(api, runProvider, pack.text);
      const paragraphs = parseNarrativeParagraphs(restoreAliases(raw, pack.mappings));
      if (!sameNarrativeBody(content, paragraphs)) {
        setNotice('AI 가 문장을 바꿔 보내 표식을 받지 않았습니다. 글은 그대로입니다.');
      } else if (!hasAnyRole(paragraphs)) {
        setNotice('AI 가 표식을 붙이지 않았습니다. 글은 그대로입니다.');
      } else {
        await onRemark(target.studentRef, roleMarksOf(paragraphs));
        setNotice('형광펜을 다시 표시했습니다.');
      }
    } catch (kind) {
      const k = (typeof kind === 'string' ? kind : 'crashed') as OwnAiErrorKind;
      setNotice(OWN_AI_ERROR_MESSAGES[k].draft);
    } finally {
      // ★반드시 finally 에서 푼다. 여기서 안 풀면 다시 표시가 영영 잠긴다.
      remarkingRef.current = false;
      setRemarking(false);
    }
  };

  const btn =
    'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface';

  // ── 구독이 연결돼 있지 않을 때: 요청을 보내지 않고 안내만 한다. 단추는 잠긴 채 보여 "무엇을 눌러야 하는지"는 남긴다 ──
  if (!runProvider) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <button
          type="button"
          disabled
          className="flex w-fit items-center gap-1 rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg opacity-50"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            auto_awesome
          </span>
          이 학생 초안 쓰기
        </button>
        <p className="rounded-lg bg-sp-card px-3 py-2 text-xs leading-relaxed text-sp-muted">
          생기부 초안은 선생님 구독 AI(Claude Code·Codex)로만 만들 수 있어요. 설정 &gt; 실험실
          기능에서 &ldquo;내 AI로 실행&rdquo;을 켜고, 설정 &gt; AI 연결에서 연결하면 이 단추가
          켜집니다.
        </p>
        {versions.length > 0 && (
          <p className="text-xs text-sp-muted">
            이 칸에 남긴 AI 초안 {versions.length}판은 연결 뒤 다시 볼 수 있습니다.
          </p>
        )}
      </div>
    );
  }

  /**
   * [내 글과 비교]의 왼쪽 — 내 글도 한 덩어리라 문단으로 쪼개면 1 대 N 이 된다.
   * 표식이 있으면 **그 구간들**로 견주고, 없을 때만 문단으로 나눈다.
   */
  const myParagraphs =
    existingRoleMarks && existingRoleMarks.length > 0
      ? existingRoleMarks.map((m) => m.text)
      : splitParagraphs(target.existingText ?? '');

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* 1. 주제 고르기 — 주제가 하나라도 있을 때만(흐름을 안 쓰면 화면이 그대로다). */}
      {(threads.length > 0 || pickedIds !== null) && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="초안에 쓸 주제 고르기"
        >
          <span className="text-xs text-sp-muted">주제</span>
          {pickedIds !== null && (
            <button
              type="button"
              aria-pressed
              title="근거 지도에서 고른 근거만 보냅니다. 다른 칩을 누르면 풀립니다."
              className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-sp-accent ring-1 ring-blue-500/30"
            >
              고른 근거 {targetForRun.evidences.length}건
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPickedThreadId('');
              setChainMode(false);
              setPickedIds(null);
            }}
            aria-pressed={pickedIds === null && pickedThreadId === ''}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
              pickedIds === null && pickedThreadId === ''
                ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
                : 'text-sp-muted ring-sp-border hover:text-sp-text'
            }`}
          >
            전체 근거
          </button>
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPickedThreadId(t.id);
                setChainMode(false);
                setPickedIds(null);
              }}
              aria-pressed={pickedThreadId === t.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                pickedThreadId === t.id
                  ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
                  : 'text-sp-muted ring-sp-border hover:text-sp-text'
              }`}
            >
              {t.status === 'closed' ? `${t.title} (닫힘)` : t.title}
            </button>
          ))}
        </div>
      )}

      {/* 1-2. 작성 방식 (ADR-099) — 고르지 않으면 기존형이고 요청서는 오늘과 같다. */}
      {sendableEvidences.length === 0 && (
        <Notice variant="warning">
          보낼 수 있는 근거가 한 건도 없습니다. 근거 정리에서 근거를 넣거나 [AI 제외]를 풀어 주세요.
        </Notice>
      )}
      {narrativeDowngraded && (
        <Notice variant="warning">
          지금은 짜 두신 흐름 대신 기존 방식으로 만들어집니다. 서버의 작성 규정이 아직 흐름 구성을
          받지 않습니다. 잠시 뒤 다시 시도해 주세요.
        </Notice>
      )}
      <div
        data-testid="composition-summary"
        className="flex flex-col gap-1.5 rounded-xl bg-sp-card px-3 py-2 ring-1 ring-sp-border"
      >
        <p className="text-xs leading-relaxed text-sp-text">{compositionSummary}</p>
        {/* 보낼 근거와 빠진 근거 — 접힌 상세에 사유가 있다. 신원·범위 오류는 여기 숨기지 않고 위 경고로 올린다. */}
        {droppedEvidences.length > 0 ? (
          <details className="text-xs text-sp-muted">
            <summary className="cursor-pointer select-none" data-testid="evidence-count-summary">
              초안에 쓸 근거 {sendableEvidences.length}건 · 빠진 근거 {droppedEvidences.length}건
            </summary>
            <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
              {droppedEvidences.map((d) => (
                <li key={d.id}>
                  <span className="text-sp-text">{d.head}</span>: {d.why}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="text-xs text-sp-muted" data-testid="evidence-count-summary">
            초안에 쓸 근거 {sendableEvidences.length}건
          </p>
        )}
        {packContents !== null && (
          <p data-testid="pack-contents" className="text-xs leading-relaxed text-sp-muted">
            {packContents}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {onOpenEvidence !== undefined && (
            <button
              type="button"
              onClick={onOpenEvidence}
              disabled={phase.kind === 'running'}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-sp-accent transition-colors hover:bg-sp-surface disabled:opacity-40"
            >
              근거 정리에서 뼈대 고르기
            </button>
          )}
          <button
            type="button"
            onClick={() => setExtraRemarkOpen((v) => !v)}
            aria-expanded={extraRemarkOpen}
            disabled={phase.kind === 'running'}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text disabled:opacity-40"
          >
            {extraRemark.trim().length > 0
              ? `한마디: ${extraRemark.trim().slice(0, 20)}`
              : '+ 한마디 덧붙이기'}
          </button>
        </div>
        {extraRemarkOpen && (
          <div className="flex flex-col gap-1">
            <textarea
              value={extraRemark}
              rows={2}
              maxLength={RECORD_STYLE_INSTRUCTION_MAX}
              disabled={phase.kind === 'running'}
              aria-label="이 초안에 덧붙일 한마디"
              placeholder="예: 모둠에서 자료를 맡은 대목을 살려 주세요"
              onChange={(e) => setExtraRemark(e.target.value)}
              className="w-full resize-none rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5 text-xs leading-relaxed text-sp-text focus:border-sp-accent focus:outline-none"
            />
            <p className="text-xs leading-snug text-sp-muted">
              공통 규정과 기재 금지 항목은 이 칸으로 끌 수 없습니다. 학생 이름을 적어도 보낼 때
              가려집니다.
            </p>
          </div>
        )}
      </div>

      {/* 2. 시작 — 공급자·모델·단위 */}
      {/* 실행 중이거나 큐가 남아 있을 때만 숨긴다 — 미리보기 중에도 다른 판을 더 만들 수 있다. */}
      {phase.kind !== 'running' && !(phase.kind === 'preview' && phase.queue.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {versions.length > 0 && !setupOpen ? (
            /* 결과 단계: 설정은 한 줄 요약 + [바꾸기]. 깊이 숨기지 않는다. */
            <span
              className="inline-flex items-center gap-1 rounded-lg bg-sp-card px-2 py-1 text-xs text-sp-muted ring-1 ring-sp-border"
              data-testid="ai-setup-summary"
            >
              {OWN_AI_PROVIDER_LABELS[runProvider]} ·{' '}
              {shortModelLabel(runProvider, ownAiModels[runProvider])}
              <button
                type="button"
                onClick={() => setSetupOpen(true)}
                className="ml-1 rounded-md px-1 font-medium text-sp-accent hover:bg-sp-surface"
                aria-label="AI·모델 바꾸기"
              >
                바꾸기
              </button>
            </span>
          ) : connected.length > 1 ? (
            <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-sp-border">
              {connected.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  aria-pressed={runProvider === p}
                  className={`px-2 py-1 text-xs font-medium ${
                    runProvider === p
                      ? 'bg-sp-accent text-sp-accent-fg'
                      : 'bg-sp-card text-sp-muted hover:text-sp-text'
                  }`}
                >
                  {OWN_AI_PROVIDER_LABELS[p]}
                </button>
              ))}
            </span>
          ) : (
            <span className="rounded-lg bg-sp-card px-2 py-1 text-xs text-sp-muted ring-1 ring-sp-border">
              {OWN_AI_PROVIDER_LABELS[runProvider]}
            </span>
          )}
          {(versions.length === 0 || setupOpen) && (
            <label className="flex items-center gap-1">
              <span className="sr-only">초안에 쓸 모델 고르기</span>
              <select
                value={ownAiModels[runProvider]}
                onChange={(e) => changeModel(runProvider, e.target.value)}
                className="rounded-lg border border-sp-border bg-sp-bg px-1 py-1 text-xs text-sp-text"
              >
                {modelCatalog[runProvider].map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {/* 분량 목표 — 초안을 쓰기 **전에** 정한다(오너 요청 2026-09-11). 기본은 나이스 한도, 학교가 학기로
              나눈 과목(예: 1학기 750 + 2학기 750)은 750 을 고른다. 이 수업반·영역에 저장된다. */}
          {onChangeTargetBytes !== undefined &&
            targetBytes !== undefined &&
            area !== undefined &&
            level !== undefined &&
            (versions.length > 0 && !setupOpen && !customTargetOpen ? (
              /* 결과 단계: 설정 요약처럼 한 줄로 접는다(디자인 검토 2026-09-11). 같은 [바꾸기]로 편다. */
              <span
                className="inline-flex items-center gap-1 rounded-lg bg-sp-card px-2 py-1 text-xs text-sp-muted ring-1 ring-sp-border"
                data-testid="ai-target-summary"
              >
                분량 목표{' '}
                <b className="font-semibold text-sp-text">{targetBytes.toLocaleString()}B</b>
                <button
                  type="button"
                  onClick={() => setSetupOpen(true)}
                  className="ml-1 rounded-md px-1 font-medium text-sp-accent hover:bg-sp-surface"
                  aria-label="분량 목표 바꾸기"
                >
                  바꾸기
                </button>
              </span>
            ) : (
              <div
                role="group"
                aria-label="분량 목표"
                className="flex w-full flex-wrap items-center gap-1.5"
              >
                <span className="text-xs text-sp-muted">분량 목표</span>
                {targetPresetsFor(area, level, limitOverride).map((n, i, all) => {
                  // 맨 끝 칩은 **나이스 한도**다 — 고르는 목표와 모양을 달리해 "상한"임을 누르기 전에 보인다.
                  const isLimit = i === all.length - 1;
                  const on = targetBytes === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      title={
                        !isLimit
                          ? undefined
                          : limitOverride !== undefined
                            ? '선생님이 직접 정한 한도: 이 영역에 저장할 수 있는 최대 분량'
                            : '나이스 한도: 이 영역에 저장할 수 있는 최대 분량'
                      }
                      onClick={() => {
                        setCustomTargetOpen(false);
                        onChangeTargetBytes(n);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
                        on
                          ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
                          : isLimit
                            ? 'text-amber-500 ring-amber-500/30 hover:text-sp-text'
                            : 'text-sp-muted ring-sp-border hover:text-sp-text'
                      }`}
                    >
                      {isLimit ? `한도 ${n.toLocaleString()}B` : `${n.toLocaleString()}B`}
                    </button>
                  );
                })}
                {customTargetOpen ||
                !targetPresetsFor(area, level, limitOverride).includes(targetBytes) ? (
                  <input
                    type="number"
                    min={100}
                    step={10}
                    defaultValue={targetBytes}
                    aria-label="분량 목표 직접 입력(바이트)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const v = Number(e.currentTarget.value);
                      if (Number.isFinite(v) && v >= 100) {
                        onChangeTargetBytes(resolveTargetBytes(area, level, v, limitOverride));
                      }
                    }}
                    className="w-20 rounded-lg border border-sp-border bg-sp-surface px-2 py-1 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setCustomTargetOpen(true)}
                    className="rounded-full px-2.5 py-1 text-xs font-medium text-sp-muted ring-1 ring-sp-border hover:text-sp-text"
                  >
                    직접
                  </button>
                )}
                {/* 한도는 위 영역 정보 줄과 맨 끝 칩이 이미 말한다 — 여기서는 글자 수 어림만. */}
                <span className="text-xs text-sp-muted">
                  약 {Math.round(targetBytes / 3).toLocaleString()}자
                </span>
              </div>
            ))}
          {/* 무엇을 누르면 초안이 쓰이는지 단추 이름이 말한다(오너 피드백 2026-09-08). 맨 앞이 기본 동작. */}
          <button
            type="button"
            onClick={() => start([targetForRun])}
            className="flex items-center gap-1 rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-sm">
              auto_awesome
            </span>
            이 학생 초안 쓰기
          </button>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={startPicked}
              className={`bg-sp-card text-sp-text ${btn}`}
              title="학생 목록에서 체크한 학생들만 차례로 씁니다."
            >
              고른 {picked.length}명 초안 쓰기
            </button>
          )}
          {remaining.length > 0 && (
            <button
              type="button"
              onClick={() => start([targetForRun, ...remaining])}
              className={`bg-sp-card text-sp-text ${btn}`}
            >
              남은 학생 모두 초안 쓰기 ({remaining.length + 1}명)
            </button>
          )}
          {/* 고른 학생 중 이미 글이 있는 학생이 있으면 먼저 말한다 — 각 학생 미리보기에서 바꾸기/붙이기를 고른다. */}
          {picked.length > 0 && pickedWithText > 0 && (
            <p className="w-full text-xs text-sp-muted" data-testid="picked-overwrite-notice">
              고른 학생 중 {pickedWithText}명은 이미 초안이 있어요. 각 학생 미리보기에서 [바꾸기]
              또는 [뒤에 붙이기]를 고릅니다. 손으로 쓴 글을 저절로 덮지 않아요.
            </p>
          )}
        </div>
      )}

      {phase.kind === 'running' && (
        <p className="flex items-center gap-1 text-sm text-sp-muted">
          <span>
            {phase.total > 1 ? `${phase.done + 1}/${phase.total} · ` : ''}
            {/* 자동 줄이기(ADR-110)는 쓰기와 다른 단계다 — 무엇을 기다리는지 숫자와 함께 말한다. */}
            {phase.shrinking !== undefined
              ? `${phase.name} 초안이 ${phase.shrinking.fromBytes.toLocaleString()}B로 목표(${phase.shrinking.targetBytes.toLocaleString()}B)보다 길어서 자동으로 한 번 줄이고 있어요…`
              : `${phase.name} 초안을 쓰는 중이에요…`}
            <span className="ml-1">({OWN_AI_PROVIDER_LABELS[runProvider]})</span>
          </span>
          {/* [중단] — main 이 CLI 를 죽이고, 이 실행은 `cancelled` 로 끝나 "중단했어요"가 뜬다(R-6). */}
          <button
            type="button"
            onClick={abortRun}
            className="ml-auto rounded-lg bg-sp-card px-2 py-1 text-xs font-medium text-sp-text hover:bg-sp-bg"
          >
            중단
          </button>
        </p>
      )}

      {phase.kind === 'stopped' && phase.message && (
        <div className="rounded-lg bg-sp-card px-3 py-2">
          <p className="text-xs leading-relaxed text-sp-muted">{phase.message}</p>
          {phase.queue.length > 0 && (
            <button
              type="button"
              disabled={retryLeftSec > 0}
              onClick={() => void runQueue(phase.queue, phase.queue.length)}
              className={`mt-1.5 bg-sp-bg text-sp-accent disabled:opacity-50 ${btn}`}
            >
              {retryLeftSec > 0
                ? `${retryLeftSec}초 뒤에 이어 할 수 있어요`
                : `이어 하기 (${phase.queue.length}명 남음)`}
            </button>
          )}
        </div>
      )}

      {/* 3. 되돌리기 — [바꾸기] 뒤 30초 */}
      {undo && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/20">
          <span className="text-xs text-amber-600">초안을 AI 글로 바꿨습니다.</span>
          <button
            type="button"
            onClick={() => void undoReplace()}
            className={`ml-auto bg-sp-card text-sp-text ${btn}`}
          >
            되돌리기
          </button>
        </div>
      )}

      {notice && (
        <p role="status" className="text-xs text-sp-muted">
          {notice}
        </p>
      )}

      {/* 4. 판(버전) 미리보기 */}
      {selected && versions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-sp-border bg-sp-bg p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-sp-text">{viewName}: 미리보기</span>
            {/* 어느 AI·모델이 썼는지 남긴다. 결과가 마음에 안 들 때 무엇을 바꿔 볼지 알 수 있다. */}
            <span className="text-xs text-sp-muted">
              · {OWN_AI_PROVIDER_LABELS[selected.provider]}
              {/* 내부 이름(claude-sonnet-5)이 아니라 선택 상자와 같은 이름(Sonnet 5)으로(R-8). */}
              {selected.model ? ` ${shortModelLabel(selected.provider, selected.model)}` : ''}
              {selected.excluded ? ` · ${selected.excluded}` : ''}
              {selected.appliedAt !== undefined ? ' · 반영됨' : ''}
            </span>
            {/* 이 판의 분량 — 한도를 넘으면 붉게. [반영]을 누르기 전에 알 수 있어야 한다(2026-09-08 오너 지적). */}
            {(() => {
              // ★편집칸 막대와 같은 기준으로 센다(오너 요청 2026-09-11) — [바꾸기]하면 편집칸에 이 숫자가 뜬다.
              //   글이 있는 학생이면 [뒤에 붙이기] 뒤의 편집칸 숫자도 함께, 둘 다 이름을 붙여 보인다.
              const text = aiDraftText(selected);
              const bytes = neisByteLength(text);
              const limit =
                area !== undefined &&
                level !== undefined &&
                isAreaLimitConfirmed(area, level, limitOverride)
                  ? effectiveAreaLimit(area, level, limitOverride)
                  : null;
              const goal =
                targetBytes !== undefined && limit !== null && targetBytes < limit
                  ? targetBytes
                  : limit;
              const base =
                selected.draftKey.studentRef === target.studentRef
                  ? (target.existingText ?? '')
                  : '';
              const canAppend =
                base.trim().length > 0 &&
                selected.adjust === undefined &&
                selected.appliedAt === undefined;
              const merged = canAppend ? appendedBytes(base, text) : null;
              const tone = (n: number): string =>
                limit !== null && n > limit
                  ? 'text-red-500'
                  : goal !== null && n > goal
                    ? 'text-amber-500'
                    : 'text-sp-muted';
              const label =
                selected.appliedAt !== undefined
                  ? '이 판'
                  : base.trim().length > 0
                    ? '바꾸면'
                    : '반영하면';
              return (
                <span
                  className="ml-auto flex items-center gap-1.5 text-xs tabular-nums"
                  data-testid="ai-version-bytes"
                >
                  <span className={tone(bytes)} title="편집칸 막대와 같은 방식으로 셉니다.">
                    {label} {bytes.toLocaleString()}
                    {goal !== null ? ` / ${goal.toLocaleString()}` : ''} B
                  </span>
                  {merged !== null && (
                    <span
                      className={tone(merged)}
                      title="[뒤에 붙이기]하면 편집칸이 이 분량이 됩니다."
                    >
                      · 붙이면 {merged.toLocaleString()} B
                    </span>
                  )}
                </span>
              );
            })()}
          </div>
          {/* 판 탭 — 최신이 기본. */}
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="AI 초안 판">
            {versions.map((v, i) => {
              const on = v.id === selected.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSelectedVersionId(v.id)}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 transition-colors ${
                    on
                      ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
                      : 'text-sp-muted ring-sp-border hover:text-sp-text'
                  }`}
                >
                  v{i + 1}
                  {v.appliedAt !== undefined ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          {/* ★"남은 학생 모두"로 이어 만드는 동안에는 누른 학생이 아닌 학생의 초안이 여기 뜬다.
              어디에 저장되는지 한 줄로 못 박는다. */}
          {selected.draftKey.studentRef !== target.studentRef && (
            <p className="text-xs text-sp-muted">{viewName} 학생 칸에 저장됩니다.</p>
          )}
          {highlightOn && !hasAnyRole(selected.paragraphs) && (
            <p className="text-xs text-sp-muted">표식 없음: AI가 문단 역할을 붙이지 않았습니다.</p>
          )}

          {compareOn ? (
            /* 비교는 위아래로 — 좁은 패널에서 두 열로 쪼개지 않는다(ADR-093 결정 6). 내 글은 구간(표식)별로 이어 그린다. */
            <div className="flex flex-col gap-2" aria-label="내 글과 비교">
              <p className="text-xs font-semibold text-sp-muted">
                내 글 ({neisByteLength(target.existingText ?? '').toLocaleString()}B)
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
                {myParagraphs.map((t, i, list) => (
                  <span key={i}>
                    {t}
                    {i < list.length - 1 ? ' ' : ''}
                  </span>
                ))}
              </p>
              <p className="text-xs font-semibold text-sp-muted">
                고른 판 ({neisByteLength(aiDraftText(selected)).toLocaleString()}B)
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
                {selected.paragraphs
                  .filter((p) => p.text.trim().length > 0)
                  .map((p, i, list) => (
                    <span key={i}>
                      <span
                        className={
                          highlightOn && p.role
                            ? `rounded-sm box-decoration-clone ${ROLE_BG[p.role]}`
                            : ''
                        }
                      >
                        {p.text.trim()}
                      </span>
                      {i < list.length - 1 ? ' ' : ''}
                    </span>
                  ))}
              </p>
            </div>
          ) : (
            // 저장될 것과 **같은 글**을 보여 준다 — 미리보기와 저장이 다르면 미리보기가 아니다.
            // ★생기부는 한 덩어리다: 문단을 블록으로 떼어 놓지 않고 이어 그리고, 역할은 인라인 색으로만 구분한다.
            <p
              className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text"
              data-testid="ai-preview-body"
            >
              {selected.paragraphs
                .filter((p) => p.text.trim().length > 0)
                .map((p, i, list) => (
                  <span key={i}>
                    <span
                      className={
                        highlightOn && p.role
                          ? `rounded-sm box-decoration-clone ${ROLE_BG[p.role]}`
                          : ''
                      }
                      {...(highlightOn && p.role ? { title: NARRATIVE_ROLE_LABELS[p.role] } : {})}
                    >
                      {p.text.trim()}
                    </span>
                    {i < list.length - 1 ? ' ' : ''}
                  </span>
                ))}
            </p>
          )}

          {sceneRoundTrip !== null && (
            <p data-testid="scene-round-trip" className="text-xs leading-relaxed text-sp-muted">
              {sceneRoundTrip}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void applyVersion('replace')}
              className="rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg"
            >
              {selected.draftKey.studentRef === target.studentRef && target.existingText?.trim()
                ? '바꾸기'
                : '반영'}
            </button>
            {selected.draftKey.studentRef === target.studentRef &&
              target.existingText?.trim() &&
              // ★조절안 판에는 [뒤에 붙이기]를 아예 그리지 않는다. 조절안은 원문을 고쳐 쓴 글이라
              //   원문 뒤에 붙이면 같은 내용이 두 번 들어간다.
              selected.adjust === undefined && (
                <button
                  type="button"
                  onClick={() => void applyVersion('append')}
                  disabled={hasUnsavedInput === true}
                  title={
                    hasUnsavedInput === true
                      ? '저장되지 않은 글이 있어요. 저장된 뒤에 붙일 수 있어요.'
                      : appendOverLimit
                        ? '붙이면 한도를 넘어요. 저장은 되고 빨간색으로 표시돼요.'
                        : undefined
                  }
                  className={`inline-flex items-center gap-1 bg-sp-card text-sp-text ${btn} disabled:opacity-40`}
                >
                  {appendOverLimit && (
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-sm text-red-500"
                    >
                      warning
                    </span>
                  )}
                  뒤에 붙이기
                </button>
              )}
            {/* 반영 계열([바꾸기]·[뒤에 붙이기]) | 읽기·취소 계열([내 글과 비교]·[버리기]).
                되돌릴 수 없는 [버리기]는 맨 끝 — 나란히 같은 굵기로 두면 주 동작이 안 보이고 실수로 누른다. */}
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-sp-border" />
            {selected.draftKey.studentRef === target.studentRef && myParagraphs.length > 0 && (
              <button
                type="button"
                onClick={() => setCompareOn((v) => !v)}
                aria-pressed={compareOn}
                className={`bg-sp-card text-sp-text ${btn}`}
              >
                {compareOn ? '비교 닫기' : '내 글과 비교'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void discardVersion()}
              className={`bg-sp-card text-sp-muted ${btn}`}
              title="이 판을 지웁니다. 지운 판은 남지 않습니다."
            >
              버리기
            </button>
            {/* ★[뒤에 붙이기]의 앞글은 **저장된** 글인데 화면에는 저장 안 된 글이 있다. 그대로
                누르면 그 입력이 조용히 사라진다 - 막고 이유를 말한다(ADR-088 후속 2). */}
            {hasUnsavedInput === true &&
              selected.draftKey.studentRef === target.studentRef &&
              target.existingText?.trim() &&
              selected.adjust === undefined && (
                <p className="w-full text-xs text-sp-muted">
                  저장되지 않은 글이 있어요. 먼저 저장하거나 분량을 줄여 주세요.
                </p>
              )}
            {phase.kind === 'preview' && phase.queue.length > 0 && (
              <button
                type="button"
                onClick={() => setPhase({ kind: 'idle' })}
                className="ml-auto px-1 text-xs text-sp-muted"
              >
                여기서 멈추기 ({phase.queue.length}명 남음)
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4-2. 분량 조절 (ADR-088) — 조절 대상 글은 누르는 시점에 등록부에서 새로 읽는다. */}
      {area !== undefined &&
        level !== undefined &&
        getSourceText &&
        onLengthRun &&
        onLengthApply && (
          <RecordDraftLengthPanel
            runKey={`${target.studentRef}:${area}:${draftKey.subject ?? ''}`}
            area={area}
            level={level}
            areaLimit={effectiveAreaLimit(area, level, limitOverride)}
            areaLimitVerified={isAreaLimitConfirmed(area, level, limitOverride)}
            {...(limitOverride !== undefined ? { limitOverride } : {})}
            // ★라벨과 원문이 **같은 곳**을 가리키게 한다(R-2). 미리보기 중인 AI 판(아직 반영 전)이
            //   있으면 그 판의 글을 조절하고, 아니면 편집 칸의 글을 조절한다.
            getSourceText={
              adjustTargetVersion !== null ? () => aiDraftText(adjustTargetVersion) : getSourceText
            }
            {...(adjustTargetVersion === null && subscribeSourceText !== undefined
              ? { subscribeSourceText }
              : {})}
            {...(targetBytes !== undefined ? { defaultTarget: targetBytes } : {})}
            detectProhibited={(text) => summarizeProhibited(detectProhibitedTerms(text))}
            evidenceCount={targetForRun.evidences.length}
            {...(pickedThread !== null ? { threadTitle: pickedThread.title } : {})}
            {...(adjustTargetVersion !== null
              ? {
                  sourceVersionLabel: `AI 초안 v${versions.findIndex((v) => v.id === adjustTargetVersion.id) + 1}`,
                }
              : {})}
            lockedByOther={phase.kind === 'running' || remarking}
            onRun={(kind, targetBytes) =>
              onLengthRun(
                kind,
                targetBytes,
                adjustTargetVersion !== null ? aiDraftText(adjustTargetVersion) : getSourceText(),
                adjustTargetVersion?.id,
              )
            }
            onApply={(picked, outcome, kind, targetBytes) =>
              onLengthApply(
                picked,
                outcome,
                kind,
                targetBytes,
                adjustTargetVersion?.id,
                adjustTargetVersion?.threadId,
              )
            }
            {...(onLengthCancel ? { onCancel: onLengthCancel } : {})}
          />
        )}

      {/* 5. 형광펜 다시 표시 — 스위치가 켜져 있고 글이 있을 때 */}
      {highlightOn && onRemark && (target.existingText ?? '').trim().length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void remark()}
            disabled={remarking}
            aria-label="다시 표시"
            className={`bg-sp-card text-sp-text ${btn} disabled:opacity-40`}
            title="지금 글은 그대로 두고 문단 역할 표식만 AI 에게 다시 받습니다."
          >
            <span className="material-symbols-outlined mr-1 align-middle text-sm">
              ink_highlighter
            </span>
            {remarking ? '표시하는 중…' : '다시 표시'}
          </button>
        </div>
      )}
    </div>
  );
}
