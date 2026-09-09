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
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { RecordStylePicker } from '@adapters/components/RecordDraft/RecordStylePicker';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  RECORD_STYLE_CATALOG_VERSION,
  type RecordDraftStyleStamp,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import {
  applyPromptVersionGate,
  normalizeWritingStyle,
  resolveComposition,
} from '@domain/rules/recordStyleCompose';
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
import type { LengthAdjustCandidate } from '@adapters/components/RecordDraft/lengthAdjustRun';
import type { LengthAdjustKind } from '@domain/rules/recordLengthGoal';
import {
  isAreaLimitVerified,
  neisByteLength,
  resolveAreaLimit,
  type RecordArea,
  type SchoolLevel,
} from '@domain/entities/RecordDraft';
import { detectProhibitedTerms, summarizeProhibited } from '@domain/rules/prohibitedRecordTerms';

import type { DraftTarget } from '@adapters/components/RecordDraft/recordDraftTypes';

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
  readonly openStyleSignal?: number;
  /** 선생님이 따로 적어 둔 지시(2층 프롬프트). */
  readonly teacherPrompt?: string;
  /** [반영] — 실제 저장은 부모가 한다(기존 upsert 경로). roleMarks 는 표식(없으면 null 로 뗀다). */
  readonly onApply: (
    studentRef: string,
    text: string,
    roleMarks: readonly RoleMark[] | null,
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
  /** [편집칸에 넣기(저장 안 함)] — 부모가 행에 배달한다. */
  readonly onInsertToEditor?: (text: string) => void;
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
  openStyleSignal,
  teacherPrompt,
  onApply,
  onRemark,
  onFocusStudent,
  area,
  level,
  getSourceText,
  onLengthRun,
  onLengthApply,
  onLengthCancel,
  onInsertToEditor,
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
  const settingsStyles = useSettingsStore((st) => st.settings.recordWritingStyles);
  const settingsPresets = useSettingsStore((st) => st.settings.recordStylePresets);
  const updateSettings = useSettingsStore((st) => st.update);
  const styleAreaKey = area ?? draftKey.area;
  // ★저장된 값은 **읽는 자리에서 한 번** 지금 카탈로그에 맞춘다(없어진 초점·요소 정리, ADR-099 보강).
  const savedStyle = settingsStyles?.[styleAreaKey];
  const writingStyle: RecordWritingStyle =
    savedStyle === undefined ? DEFAULT_RECORD_WRITING_STYLE : normalizeWritingStyle(savedStyle);
  const stylePresets: readonly RecordStylePreset[] = settingsPresets ?? [];
  const setWritingStyle = (next: RecordWritingStyle): void => {
    void updateSettings({
      recordWritingStyles: { ...(settingsStyles ?? {}), [styleAreaKey]: next },
    });
  };
  const setStylePresets = (next: readonly RecordStylePreset[]): void => {
    void updateSettings({ recordStylePresets: next });
  };
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
  /**
   * 분량 조절의 대상이 되는 AI 판 — 미리보기 중이고(반영 전) 조절 결과가 아닌 판. 반영된 판은 이미
   * 편집 칸에 들어가 있으므로 편집 칸의 글을 조절한다(R-2).
   */
  const adjustTargetVersion: RecordAiDraft | null =
    selected !== null && selected.adjust === undefined && selected.appliedAt === undefined
      ? selected
      : null;
  /** 보낼 근거 — 주제를 골랐으면 그 주제의 근거만, 아니면 이 영역 전체. */
  const targetForRun = useMemo<DraftTarget>(() => {
    if (pickedThread === null || studentEvidences === undefined) return target;
    return {
      ...target,
      evidences: studentEvidences.filter((e) => e.threadId === pickedThread.id),
    };
  }, [pickedThread, studentEvidences, target]);

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
  /** 서로 다른 날짜의 수 — 「피드백·수정」이 전후를 가릴 수 있는지 판정하는 유일한 기계적 신호다. */
  const distinctEvidenceDates = useMemo(
    () => new Set(sendableEvidences.map((e) => e.date).filter((d) => d !== undefined)).size,
    [sendableEvidences],
  );

  const buildPrompt = useCallback(
    (t: DraftTarget, style: RecordWritingStyle) => {
      // 선생님 지시는 두 곳에서 온다: 부모가 준 것(옛 경로)과 작성 방식의 추가 지시. 둘 다 있으면 잇는다.
      const extra = (style.instruction ?? '').trim();
      const base = (teacherPrompt ?? '').trim();
      const merged = [base, extra].filter((x) => x.length > 0).join('\n');
      return buildRecordDraftPack({
        studentName: t.displayName,
        roster,
        areaLabel,
        ...(subject === undefined ? {} : { subject }),
        // 주제는 누른 학생에게만 — 남의 학생에게 같은 주제를 씌우면 엉뚱한 근거로 쓰게 된다.
        ...(pickedThread !== null && t.studentRef === target.studentRef
          ? { threadTitle: pickedThread.title }
          : {}),
        evidences: t.evidences,
        ...(t.standardKeywords === undefined ? {} : { standardKeywords: t.standardKeywords }),
        ...(merged.length > 0 ? { teacherPrompt: merged } : {}),
        style,
      });
    },
    [areaLabel, subject, roster, pickedThread, target.studentRef, teacherPrompt],
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
          const pack = buildPrompt(t, runStyle);
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
            const id = await addVersion({
              draftKey: { ...draftKey, studentRef: t.studentRef },
              provider: runProvider,
              promptVersion,
              ...(ownAiModels[runProvider] ? { model: ownAiModels[runProvider] } : {}),
              ...(pickedThread !== null && t.studentRef === target.studentRef
                ? { threadId: pickedThread.id }
                : {}),
              style: styleStampOf(runStyle),
              paragraphs,
              excluded: summarizeDraftPackNotes(pack),
            });
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

  const start = (targets: readonly DraftTarget[]): void => {
    setUsage(null, null);
    // ★여기서 작성 방식을 **잠근다.** 큐가 도는 동안 설정을 바꿔도 이 실행에는 반영되지 않는다.
    runStyleRef.current = writingStyle;
    void runQueue(targets, targets.length);
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
    // ★조용히 삼키면 안 된다. `onApply` 는 한도 초과에서 `RecordDraftLimitError` 를 던지는데,
    //   감싸지 않으면 아래 `markApplied` 도 `continueQueue` 도 실행되지 않아 **아무 일도 안 일어나고
    //   아무 안내도 없다.** 미리보기와 원문은 그대로 두고 이유만 보여 준다(큐도 여기서 멈춘다).
    try {
      await onApply(ref, mergedText, mergedMarks);
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
      {threads.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="초안에 쓸 주제 고르기"
        >
          <span className="text-xs text-sp-muted">주제</span>
          <button
            type="button"
            onClick={() => setPickedThreadId('')}
            aria-pressed={pickedThreadId === ''}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
              pickedThreadId === ''
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
              onClick={() => setPickedThreadId(t.id)}
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
      <RecordStylePicker
        style={writingStyle}
        onChange={setWritingStyle}
        presets={stylePresets}
        onPresetsChange={setStylePresets}
        area={styleAreaKey}
        evidenceCount={sendableEvidences.length}
        distinctDateCount={distinctEvidenceDates}
        {...(seenPromptVersion === undefined ? {} : { promptVersion: seenPromptVersion })}
        {...(openStyleSignal === undefined ? {} : { openSignal: openStyleSignal })}
        disabled={phase.kind === 'running'}
      />

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
            {phase.name} 초안을 쓰는 중이에요…
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
              const bytes = neisByteLength(aiDraftText(selected));
              const limit =
                area !== undefined && level !== undefined && isAreaLimitVerified(area, level)
                  ? resolveAreaLimit(area, level)
                  : null;
              const over = limit !== null && bytes > limit;
              return (
                <span
                  className={`ml-auto text-xs tabular-nums ${over ? 'text-red-500' : 'text-sp-muted'}`}
                  data-testid="ai-version-bytes"
                >
                  {bytes.toLocaleString()}
                  {limit !== null ? ` / ${limit.toLocaleString()}` : ''} B
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
              // ★조절안 판에는 [뒤에 붙이기]를 아예 그리지 않는다. 원문 + 조절안 합산은 거의 항상
              //   한도를 넘어 저장이 거부된다 - 눌러도 실패할 버튼을 보여 주지 않는다.
              selected.adjust === undefined && (
                <button
                  type="button"
                  onClick={() => void applyVersion('append')}
                  disabled={hasUnsavedInput === true}
                  title={
                    hasUnsavedInput === true
                      ? '저장되지 않은 글이 있어요. 먼저 저장하거나 분량을 줄여 주세요.'
                      : undefined
                  }
                  className={`bg-sp-card text-sp-text ${btn} disabled:opacity-40`}
                >
                  뒤에 붙이기
                </button>
              )}
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
            <button
              type="button"
              onClick={() => void discardVersion()}
              className={`bg-sp-card text-sp-muted ${btn}`}
              title="이 판을 지웁니다. 지운 판은 남지 않습니다."
            >
              버리기
            </button>
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
        onLengthApply &&
        onInsertToEditor && (
          <RecordDraftLengthPanel
            runKey={`${target.studentRef}:${area}:${draftKey.subject ?? ''}`}
            area={area}
            level={level}
            areaLimit={resolveAreaLimit(area, level)}
            areaLimitVerified={isAreaLimitVerified(area, level)}
            // ★라벨과 원문이 **같은 곳**을 가리키게 한다(R-2). 미리보기 중인 AI 판(아직 반영 전)이
            //   있으면 그 판의 글을 조절하고, 아니면 편집 칸의 글을 조절한다.
            getSourceText={
              adjustTargetVersion !== null ? () => aiDraftText(adjustTargetVersion) : getSourceText
            }
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
            onInsertOnly={onInsertToEditor}
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
