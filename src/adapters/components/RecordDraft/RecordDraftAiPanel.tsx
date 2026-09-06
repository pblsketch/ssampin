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
import { fetchRecordPromptL1 } from '@adapters/di/container';
import {
  useConnectedOwnAiProviders,
  useOwnAiStatusStore,
} from '@adapters/stores/useOwnAiStatusStore';
import { useRecordAiDraftStore } from '@adapters/stores/useRecordAiDraftStore';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import { OWN_AI_PROVIDER_LABELS } from '@domain/entities/OwnAiProvider';
import { useOwnAiModelCatalog } from '@adapters/hooks/useOwnAiModelCatalog';
import {
  buildNarrativeRemarkPack,
  buildRecordDraftPack,
  summarizeExclusions,
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
  hasAnyRole,
  parseNarrativeParagraphs,
  roleMarksOf,
  sameNarrativeBody,
  splitParagraphs,
  NARRATIVE_ROLE_LABELS,
  type NarrativeParagraph,
  type RoleMark,
} from '@domain/rules/narrativeParagraphs';
import type { OwnAiErrorKind } from '@domain/entities/OwnAiProvider';
import { askOnce, runApi } from '@adapters/components/RecordDraft/ownAiRun';
import type { KeywordGroup, MaskMapping } from '@domain/privacy/types';
import { restoreModelText } from '@domain/rules/redactOutbound';
import { ROLE_BG } from '@adapters/components/RecordDraft/narrativeRoleStyles';

/** 한 학생분의 초안 재료. 화면(부모)이 실명 그대로 준다 — 가리는 일은 꾸러미가 한다. */
export interface DraftTarget {
  /** 저장할 때 쓰는 학생 키. */
  readonly studentRef: string;
  /** 학생 이름(화면용). 모델에게는 **꾸러미가 별칭으로 바꿔서** 보낸다. */
  readonly displayName: string;
  /** 이 영역의 근거(주제 무관). 주제를 고르면 `studentEvidences` 에서 그 주제 것만 골라 보낸다. */
  readonly evidences: readonly DraftPackEvidence[];
  readonly standardKeywords?: readonly string[];
  /** 이미 초안이 있으면 "바꾸기 / 뒤에 붙이기"를 물어본다. */
  readonly existingText?: string;
}

/** 주제 칩용 — 이 학생의 근거 전부(영역 무관). 주제를 고르면 threadId 로 거른다. */
export type ThreadedEvidence = DraftPackEvidence & { readonly threadId?: string };

export interface RecordDraftAiPanelProps {
  readonly areaLabel: string;
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
  /** 판을 저장할 칸(area + studentRef + subject). 다른 학생 차례에는 studentRef 만 바꿔 쓴다. */
  readonly draftKey: RecordAiDraftKey;
  /** 현재 초안의 형광펜 표식 — [되돌리기]와 [다시 표시]가 쓴다. */
  readonly existingRoleMarks?: readonly RoleMark[];
  /** 형광펜 스위치(상단 바). 꺼져 있으면 미리보기에 색을 칠하지 않는다. */
  readonly highlightOn?: boolean;
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
  /**
   * 실행 중인 학생들(누른 뒤 ~ 마지막 학생 반영/버리기 전)을 부모에게 알린다. 빈 배열 = 끝.
   *
   * ★없으면 큐가 조용히 죽는다: "미작성" 필터를 켠 채 "남은 학생 모두"를 누르면 첫 [반영] 순간
   *   그 학생이 필터에서 빠져 행이 사라진다(UltraQA P1). 부모가 이 신호로 행을 붙들어 둔다.
   */
  readonly onActiveChange?: (studentRefs: readonly string[]) => void;
  /** 큐가 다음 학생으로 넘어갔다 — 부모가 그 학생을 고른 학생으로 바꾼다. */
  readonly onFocusStudent?: (studentRef: string) => void;
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'picking' }
  | {
      readonly kind: 'running';
      readonly done: number;
      readonly total: number;
      readonly name: string;
    }
  | {
      readonly kind: 'preview';
      readonly studentRef: string;
      readonly name: string;
      /** 이어서 처리할 학생들(남은 학생 모두). */
      readonly queue: readonly DraftTarget[];
    }
  | {
      readonly kind: 'stopped';
      readonly message: string;
      /** 한도·오류로 멈춘 자리. [이어 하기] 가 여기서 다시 시작한다. */
      readonly queue: readonly DraftTarget[];
    };

/**
 * 모델이 쓴 별칭을 실제 이름으로 되돌린다 — 이 학생뿐 아니라 근거에 등장한 **다른 학생**도.
 * 지우지 않고 **되돌린다.** 통째로 지우면 문장이 부서지고, 부서진 문장은 무엇이 없어졌는지도 모른다.
 */
export function restoreAliases(text: string, mappings: readonly MaskMapping[]): string {
  return restoreModelText(text, mappings);
}

const UNDO_MS = 30_000;

/** [내 글과 비교] 문단 짝 — 왼쪽 내 글 / 오른쪽 고른 판. */
function pairParagraphs(
  mine: readonly string[],
  theirs: readonly NarrativeParagraph[],
): readonly { left: string; right: NarrativeParagraph | null }[] {
  const n = Math.max(mine.length, theirs.length);
  const rows: { left: string; right: NarrativeParagraph | null }[] = [];
  for (let i = 0; i < n; i += 1) rows.push({ left: mine[i] ?? '', right: theirs[i] ?? null });
  return rows;
}

export function RecordDraftAiPanel({
  areaLabel,
  roster,
  target,
  threads = [],
  studentEvidences,
  remaining = [],
  draftKey,
  existingRoleMarks,
  highlightOn = false,
  teacherPrompt,
  onApply,
  onRemark,
  onActiveChange,
  onFocusStudent,
}: RecordDraftAiPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** 고른 주제(''=전체 근거). 학생이 바뀌면 부모가 이 패널을 새로 만든다(key). */
  const [pickedThreadId, setPickedThreadId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [remarking, setRemarking] = useState(false);
  const [undo, setUndo] = useState<{
    readonly studentRef: string;
    readonly previous: string;
    readonly previousMarks: readonly RoleMark[] | null;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 실행 중인 학생들을 부모에게 알린다. 언마운트되면 "끝"으로 알려 붙들림을 푼다.
  const activeRefs = useMemo<readonly string[]>(() => {
    if (phase.kind === 'running') return [target.studentRef, ...remaining.map((r) => r.studentRef)];
    if (phase.kind === 'preview')
      return [phase.studentRef, ...phase.queue.map((q) => q.studentRef)];
    if (phase.kind === 'stopped') return phase.queue.map((q) => q.studentRef);
    return [];
  }, [phase, target.studentRef, remaining]);
  const activeKey = activeRefs.join('\u0000');
  useEffect(() => {
    onActiveChange?.(activeKey.length === 0 ? [] : activeKey.split('\u0000'));
  }, [activeKey, onActiveChange]);
  useEffect(() => () => onActiveChange?.([]), [onActiveChange]);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

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
  /** 보낼 근거 — 주제를 골랐으면 그 주제의 근거만, 아니면 이 영역 전체. */
  const targetForRun = useMemo<DraftTarget>(() => {
    if (pickedThread === null || studentEvidences === undefined) return target;
    return {
      ...target,
      evidences: studentEvidences.filter((e) => e.threadId === pickedThread.id),
    };
  }, [pickedThread, studentEvidences, target]);

  const buildPrompt = useCallback(
    (t: DraftTarget) =>
      buildRecordDraftPack({
        studentName: t.displayName,
        roster,
        areaLabel,
        // 주제는 누른 학생에게만 — 남의 학생에게 같은 주제를 씌우면 엉뚱한 근거로 쓰게 된다.
        ...(pickedThread !== null && t.studentRef === target.studentRef
          ? { threadTitle: pickedThread.title }
          : {}),
        evidences: t.evidences,
        ...(t.standardKeywords === undefined ? {} : { standardKeywords: t.standardKeywords }),
        ...(teacherPrompt === undefined ? {} : { teacherPrompt }),
      }),
    [areaLabel, roster, pickedThread, target.studentRef, teacherPrompt],
  );

  /** 큐를 하나씩 처리한다. 결과가 나오면 판으로 남기고 미리보기에서 멈춰 선생님 판단을 기다린다. */
  const runQueue = useCallback(
    async (queue: readonly DraftTarget[], startedWith: number) => {
      const api = runApi();
      if (!api || !runProvider) return;
      const total = startedWith;

      // ★규정(1층 프롬프트)을 먼저 받는다 — 없으면 초안을 만들지 않는다(D7).
      //   본문은 여기 지역 변수에만 있고, 디스크에 쓰지 않는다.
      const systemPrompt = await fetchRecordPromptL1(installId);
      if (systemPrompt === null) {
        setPhase({
          kind: 'stopped',
          message: OWN_AI_ERROR_MESSAGES['prompt-unavailable'].draft,
          queue,
        });
        return;
      }

      for (let i = 0; i < queue.length; i += 1) {
        const t = queue[i];
        if (!t) continue;
        setPhase({ kind: 'running', done: total - queue.length + i, total, name: t.displayName });
        const pack = buildPrompt(t);
        try {
          const raw = await askOnce(api, runProvider, pack.text, systemPrompt);
          // 별칭을 실제 이름으로 되돌리고 표식을 뗀 뒤에 남긴다 — 판에는 ［이름1］도 [동기]도 없다.
          const paragraphs = parseNarrativeParagraphs(restoreAliases(raw, pack.mappings));
          const id = await addVersion({
            draftKey: { ...draftKey, studentRef: t.studentRef },
            provider: runProvider,
            ...(ownAiModels[runProvider] ? { model: ownAiModels[runProvider] } : {}),
            ...(pickedThread !== null && t.studentRef === target.studentRef
              ? { threadId: pickedThread.id }
              : {}),
            paragraphs,
            excluded: summarizeExclusions(pack.exclusions),
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
    },
    [
      buildPrompt,
      runProvider,
      installId,
      addVersion,
      draftKey,
      ownAiModels,
      pickedThread,
      target.studentRef,
      onFocusStudent,
    ],
  );

  const start = (targets: readonly DraftTarget[]): void => {
    setUsage(null, null);
    void runQueue(targets, targets.length);
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
    await onApply(ref, mergedText, mergedMarks);
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
      setRemarking(false);
    }
  };

  const btn =
    'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface';

  // ── 구독이 연결돼 있지 않을 때: 요청을 보내지 않고 안내만 한다 ──
  if (!runProvider) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <button
          type="button"
          onClick={() => setPhase({ kind: 'stopped', message: '', queue: [] })}
          className={`flex w-fit items-center gap-1 bg-sp-card text-sp-muted ${btn}`}
        >
          <span className="material-symbols-outlined text-base">auto_awesome</span>
          AI로 초안 쓰기
        </button>
        {phase.kind === 'stopped' && (
          <p className="rounded-lg bg-sp-card px-3 py-2 text-xs leading-relaxed text-sp-muted">
            생기부 초안은 선생님 구독 AI(Claude Code·Codex)로만 만들 수 있어요. 설정 &gt; 실험실
            기능에서 &ldquo;내 AI로 실행&rdquo;을 켜고, 설정 &gt; AI 연결에서 연결해 주세요.
          </p>
        )}
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

      {/* 2. 시작 — 공급자·모델·단위 */}
      {/* 실행 중이거나 큐가 남아 있을 때만 숨긴다 — 미리보기 중에도 다른 판을 더 만들 수 있다. */}
      {phase.kind !== 'running' && !(phase.kind === 'preview' && phase.queue.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {connected.length > 1 ? (
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
          <button
            type="button"
            onClick={() => start([targetForRun])}
            className="rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg"
          >
            이 학생만
          </button>
          {remaining.length > 0 && (
            <button
              type="button"
              onClick={() => start([targetForRun, ...remaining])}
              className={`bg-sp-card text-sp-text ${btn}`}
            >
              남은 학생 모두 ({remaining.length + 1}명)
            </button>
          )}
        </div>
      )}

      {phase.kind === 'running' && (
        <p className="text-sm text-sp-muted">
          {phase.total > 1 ? `${phase.done + 1}/${phase.total} · ` : ''}
          {phase.name} 초안을 쓰는 중이에요…
          <span className="ml-1">({OWN_AI_PROVIDER_LABELS[runProvider]})</span>
        </p>
      )}

      {phase.kind === 'stopped' && phase.message && (
        <div className="rounded-lg bg-sp-card px-3 py-2">
          <p className="text-xs leading-relaxed text-sp-muted">{phase.message}</p>
          {phase.queue.length > 0 && (
            <button
              type="button"
              onClick={() => void runQueue(phase.queue, phase.queue.length)}
              className={`mt-1.5 bg-sp-bg text-sp-accent ${btn}`}
            >
              이어 하기 ({phase.queue.length}명 남음)
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
              {selected.model ? ` ${selected.model}` : ''}
              {selected.excluded ? ` · ${selected.excluded}` : ''}
              {selected.appliedAt !== undefined ? ' · 반영됨' : ''}
            </span>
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
            <div className="grid grid-cols-2 gap-2" aria-label="내 글과 비교">
              <p className="text-xs font-semibold text-sp-muted">내 글</p>
              <p className="text-xs font-semibold text-sp-muted">고른 판</p>
              {pairParagraphs(myParagraphs, selected.paragraphs).map((row, i) => (
                <div key={i} className="contents">
                  <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
                    {row.left}
                  </p>
                  <p
                    className={`whitespace-pre-wrap rounded-lg px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border ${
                      highlightOn && row.right?.role ? ROLE_BG[row.right.role] : 'bg-sp-card'
                    }`}
                  >
                    {row.right?.text ?? ''}
                  </p>
                </div>
              ))}
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
            {selected.draftKey.studentRef === target.studentRef && target.existingText?.trim() && (
              <button
                type="button"
                onClick={() => void applyVersion('append')}
                className={`bg-sp-card text-sp-text ${btn}`}
              >
                뒤에 붙이기
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
