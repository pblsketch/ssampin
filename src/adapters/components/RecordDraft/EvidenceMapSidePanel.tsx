/**
 * 근거 지도의 **오른쪽 보조 공간**(ADR-106 · 107 · 108) — 하나뿐이다. 다섯 가지 중 하나가 교대로 든다.
 *
 *  - 근거: 기존 근거 카드(전문·메모·원본 비교·AI 제외·수정·삭제)를 그대로 부모가 그려 넣는다.
 *  - 장면: 자리·카테고리 바꾸기, 앞뒤로 옮기기, 장면 메모, 놓인 근거, **자리 미정 근거를 [여기에 놓기]**, 뒤에 장면 끼우기, 지우기.
 *  - 장면 이음: 앞 장면 → 이 장면으로 넘어가는 이음말(ADR-108. 근거 사이가 아니라 장면 사이다).
 *  - 주제: 이름, 앞 주제와 잇기, 뼈대 고르기, AI 장면 배치, 이 주제로 초안 쓰기.
 *  - 주제 이음: 앞 주제 → 이 주제 사이 이음말, 연결 끊기.
 *
 * ★스토어를 모른다. 저장은 부모의 관문이 한다. 여기서는 동사 단추와 입력칸만.
 * ★낱말은 옛 흐름 보기와 같다: 장면 · 자리 미정 · 뼈대 고르기 · 이음말 · AI 제안 적용.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { InquiryThread, NarrativeScene } from '@domain/entities/InquiryThread';
import { NARRATIVE_NOTE_MAX, NARRATIVE_SCENE_MAX } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { NarrativeRole } from '@domain/rules/narrativeParagraphs';
import { boardBtn } from '@adapters/components/RecordDraft/evidenceBoardStyles';
import { evidenceHead } from '@adapters/components/RecordDraft/EvidenceMapNode';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { EVALUATION_EMPTY_LONG } from '@adapters/components/RecordDraft/evaluationGuide';

/** 주제 이음말 입력 지름길 — 값이 아니라 입력 도우미다(자유 글이 정본). */
export const LINK_NOTE_CHIPS: readonly string[] = ['변화', '뒷받침', '다른 모습'];
/** 장면 이음말 지름길 — 앞 자리에서 다음 자리로 넘어가는 흔한 말. */
export const SCENE_LEAD_IN_CHIPS: readonly string[] = [
  '질문이 시도로',
  '시도를 돌아보며',
  '결과를 확인하고',
];

export type EvidenceMapSideContent =
  | {
      readonly kind: 'node';
      readonly evidenceId: string;
      /** 부모가 그린 기존 근거 카드(전체). */
      readonly card: ReactNode;
      /** 거울 카드(아직 근거 아님)면 그 사실을 말한다. */
      readonly mirror: boolean;
    }
  | {
      readonly kind: 'scene';
      readonly threadId: string;
      readonly threadTitle: string;
      readonly scene: NarrativeScene;
      /** 저장된 장면이 아니라 화면이 끼워 넣은 평가 자리인가. */
      readonly virtual: boolean;
      readonly slot: string;
      readonly detail: string | null;
      /** 장면 차례(0부터)와 장면 수. ←→ 잠금 판정용. */
      readonly index: number;
      readonly count: number;
      readonly items: readonly RecordEvidence[];
      /** 이 주제의 자리 미정 근거 — [여기에 놓기]로 이 장면에 넣는다. */
      readonly unplaced: readonly RecordEvidence[];
      /** 마친 주제 — 바꾸지 못한다. */
      readonly locked: boolean;
    }
  | {
      readonly kind: 'sceneLink';
      readonly threadId: string;
      /** 뒤 장면(이음말이 저장되는 곳). */
      readonly scene: NarrativeScene;
      readonly fromHead: string;
      readonly toHead: string;
      readonly leadIn: string;
      readonly locked: boolean;
    }
  | {
      readonly kind: 'thread';
      readonly thread: InquiryThread;
      readonly evidenceCount: number;
      /** 저장된 장면 수(가상 평가 자리 제외). */
      readonly sceneCount: number;
      readonly unplacedCount: number;
      /** 앞 주제로 고를 수 있는 다른 주제들. */
      readonly others: readonly { readonly id: string; readonly title: string }[];
      /** 이 주제가 속한 이어진 흐름의 길이(1이면 혼자). */
      readonly chainLength: number;
      readonly locked: boolean;
    }
  | {
      readonly kind: 'threadLink';
      readonly thread: InquiryThread;
      readonly fromTitle: string;
      readonly note: string;
    };

export interface EvidenceMapSidePanelProps {
  readonly content: EvidenceMapSideContent;
  onClose: () => void;
  /** 근거 한 장으로 상세를 옮긴다(장면의 놓인 근거 목록에서). */
  onSelectNode?: (id: string) => void;
  /** 이 선생님이 최근 쓴 주제 이음말 — 칩. */
  readonly recentLinkNotes?: readonly string[];
  /** 이 선생님이 최근 쓴 장면 이음말 — 칩. */
  readonly recentSceneLeadIns?: readonly string[];
  // ── 장면 ──
  onEditSceneCategory?: (threadId: string, sceneId: string) => void;
  /** 장면 메모를 쓰는 중인가 — 부모가 학생 넘기기 전에 묻는 데 쓴다(쓰다 만 글을 잃지 않게). */
  onSceneNoteEditingChange?: (threadId: string, sceneId: string, editing: boolean) => void;
  onSaveSceneNote?: (threadId: string, sceneId: string, note: string) => Promise<void>;
  onMoveScene?: (threadId: string, sceneId: string, dir: -1 | 1) => void;
  onRemoveScene?: (threadId: string, sceneId: string) => void;
  /** 이 장면 **뒤에** 새 장면을 끼운다(`at` = index + 1). */
  onAddSceneAfter?: (threadId: string, at: number) => void;
  onPlaceInScene?: (threadId: string, sceneId: string, ids: readonly string[]) => void;
  onDetachFromScene?: (threadId: string, ids: readonly string[]) => void;
  /** 자리 미정 밖(주제 미정 근거)에서도 고르는 큰 고르기 창. */
  onPickEvidenceForScene?: (threadId: string, sceneId: string) => void;
  // ── 장면 이음 ──
  onSaveSceneLeadIn?: (threadId: string, sceneId: string, leadIn: string) => Promise<void>;
  // ── 주제 ──
  onRenameThread?: (threadId: string, title: string) => void;
  onSetThreadLink?: (threadId: string, fromThreadId: string | null) => void;
  onLayScaffold?: (threadId: string) => void;
  onSuggestScenes?: (threadId: string, instruction?: string) => void;
  onDraftFromThread?: (threadId: string, chain: boolean) => void;
  onOpenThread?: (threadId: string) => void;
  // ── 주제 이음 ──
  onSaveThreadLinkNote?: (threadId: string, note: string) => void;
  onUnlinkThread?: (threadId: string) => void;
}

const primaryBtn =
  'rounded-lg bg-sp-accent px-2.5 py-1 text-xs font-semibold text-sp-accent-fg transition-colors hover:opacity-90 disabled:opacity-40';
const dangerBtn =
  'rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/10 disabled:opacity-40';
const textarea =
  'w-full resize-none rounded-lg border border-sp-border bg-sp-card px-2 py-1.5 text-xs leading-relaxed text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-60';

/** 이음말·장면 메모 입력 — 세 곳(장면 메모·장면 이음·주제 이음)이 같은 칸을 쓴다. */
function NoteField({
  label,
  ariaLabel,
  value,
  chips,
  placeholder,
  disabled,
  onSave,
  saveLabel,
  onEditingChange,
}: {
  readonly label: string;
  /** 접근 이름 — 화면 라벨과 다르게 짧게(예: 이음말). */
  readonly ariaLabel: string;
  readonly value: string;
  readonly chips: readonly string[];
  readonly placeholder: string;
  readonly disabled?: boolean;
  readonly saveLabel: string;
  onSave: (note: string) => void | Promise<void>;
  /** 저장하지 않은 글이 있는지 — 있으면 true. 사라질 때 false 로 돌려준다. */
  onEditingChange?: (editing: boolean) => void;
}): ReactElement {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  // 다른 대상을 고르면 그 대상의 글로 바뀐다(앞 입력이 남지 않게).
  useEffect(() => {
    setDraft(value);
    setError(false);
  }, [value]);
  const dirty = draft.trim() !== value;
  // 콜백은 렌더마다 새로 만들어지므로 ref 로 받아 effect 의존에서 뺀다.
  const onEditingRef = useRef(onEditingChange);
  onEditingRef.current = onEditingChange;
  useEffect(() => {
    onEditingRef.current?.(dirty);
    return () => {
      if (dirty) onEditingRef.current?.(false);
    };
  }, [dirty]);
  const save = (): void => {
    if (!dirty) return;
    setError(false);
    Promise.resolve(onSave(draft.trim())).catch(() => setError(true));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1 text-xs text-sp-muted">
        {label}
        <textarea
          value={draft}
          rows={3}
          maxLength={NARRATIVE_NOTE_MAX}
          aria-label={ariaLabel}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
          }}
          className={textarea}
        />
      </label>
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => setDraft(chip)}
            className="rounded-full px-2 py-0.5 text-xs text-sp-muted ring-1 ring-sp-border transition-colors hover:text-sp-text disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-xs text-sp-muted">
          {draft.length}/{NARRATIVE_NOTE_MAX}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-500">
          저장하지 못했습니다. 다시 눌러 주세요.
        </p>
      )}
      <div>
        <button type="button" onClick={save} disabled={!dirty || disabled} className={primaryBtn}>
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function EvidenceRow({
  evidence,
  action,
  onSelect,
}: {
  readonly evidence: RecordEvidence;
  readonly action?: {
    readonly label: string;
    readonly onClick: () => void;
    readonly title?: string;
  };
  onSelect?: () => void;
}): ReactElement {
  const head = evidenceHead(evidence.content, 28);
  return (
    <li className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ring-1 ring-sp-border">
      {onSelect !== undefined ? (
        <button
          type="button"
          onClick={onSelect}
          title="근거 상세로"
          className="min-w-0 flex-1 truncate text-left text-sp-text hover:text-sp-accent"
        >
          {head}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sp-text">{head}</span>
      )}
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          {...(action.title === undefined ? {} : { title: action.title })}
          className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-medium text-sp-accent ring-1 ring-sp-border transition-colors hover:bg-blue-500/10"
        >
          {action.label}
        </button>
      )}
    </li>
  );
}

function SceneEditor({
  content,
  props,
}: {
  readonly content: Extract<EvidenceMapSideContent, { kind: 'scene' }>;
  readonly props: EvidenceMapSidePanelProps;
}): ReactElement {
  const { threadId, scene, virtual, slot, detail, index, count, items, unplaced, locked } = content;
  const isEval = scene.role === 'evaluation';
  const role: NarrativeRole = scene.role;
  const aiNote = scene.noteSource === 'ai';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT[role]}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-sp-text">
            {slot}
            {detail !== null && <span className="font-normal text-sp-muted">: {detail}</span>}
          </p>
          <p className="text-xs text-sp-muted">
            {content.threadTitle} · {index + 1}번째 장면 · 근거 {items.length}건
          </p>
        </div>
      </div>
      {virtual && (
        <p className="rounded-lg bg-sp-card px-2 py-1.5 text-xs leading-relaxed text-sp-muted ring-1 ring-sp-border">
          아직 저장되지 않은 평가 자리입니다. 여기에 무엇을 적거나 놓으면 그때 자리가 생깁니다.
        </p>
      )}
      {locked && <p className="text-xs text-sp-muted">마친 주제라 바꿀 수 없습니다.</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={locked}
          onClick={() => props.onEditSceneCategory?.(threadId, scene.id)}
          title="이 자리의 세부 카테고리나 이름을 바꿉니다"
          className={`${boardBtn} text-sp-text`}
        >
          카테고리 바꾸기
        </button>
        <button
          type="button"
          disabled={locked || virtual || index === 0}
          onClick={() => props.onMoveScene?.(threadId, scene.id, -1)}
          aria-label="장면을 앞으로 옮기기"
          title="앞으로"
          className={`${boardBtn} text-sp-muted hover:text-sp-text`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            arrow_back
          </span>
        </button>
        <button
          type="button"
          disabled={locked || virtual || index >= count - 1}
          onClick={() => props.onMoveScene?.(threadId, scene.id, 1)}
          aria-label="장면을 뒤로 옮기기"
          title="뒤로"
          className={`${boardBtn} text-sp-muted hover:text-sp-text`}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            arrow_forward
          </span>
        </button>
        <span className="flex-1" />
        {!isEval && (
          <button
            type="button"
            disabled={locked || virtual}
            onClick={() => props.onRemoveScene?.(threadId, scene.id)}
            title="장면만 지웁니다. 놓여 있던 근거는 '자리 미정'으로 갑니다."
            className={dangerBtn}
          >
            장면 지우기
          </button>
        )}
      </div>

      <NoteField
        key={`${threadId}:${scene.id}`}
        label={
          aiNote
            ? '장면 메모 (AI 제안 · 손대면 선생님 것이 됩니다)'
            : '장면 메모 (이 장면에서 읽은 것)'
        }
        ariaLabel="장면 메모"
        value={scene.note ?? ''}
        chips={[]}
        placeholder={
          isEval ? '예: 근거를 끝까지 따져 묻는 학생' : '예: 스스로 세운 질문을 끝까지 붙든 장면'
        }
        saveLabel="메모 저장"
        disabled={locked}
        onSave={(note) => props.onSaveSceneNote?.(threadId, scene.id, note) ?? Promise.resolve()}
        onEditingChange={(editing) => props.onSceneNoteEditingChange?.(threadId, scene.id, editing)}
      />

      <section aria-label="이 장면에 놓인 근거" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-sp-muted">
          놓인 근거 {items.length}건 · 적힌 차례가 글 차례입니다
        </h4>
        {items.length === 0 && isEval ? (
          // 평가 근거는 따로 없는 게 보통이다 — 비워 두면 초안이 근거 전체로 채운다(ADR-109).
          <p
            data-scene-eval-empty=""
            className="rounded-lg bg-sp-card px-2 py-1.5 text-xs leading-relaxed text-sp-muted ring-1 ring-sp-border"
          >
            {EVALUATION_EMPTY_LONG} 이 학생을 한마디로 본 것이 있으면 위 장면 메모에 적어 두세요. AI
            가 그 판단을 바탕으로 씁니다.
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs leading-relaxed text-sp-muted">
            아직 없습니다. 지도에서 카드를 이 열로 끌어 놓거나 아래 자리 미정에서 고르세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((e) => (
              <EvidenceRow
                key={e.id}
                evidence={e}
                {...(props.onSelectNode === undefined
                  ? {}
                  : { onSelect: () => props.onSelectNode?.(e.id) })}
                {...(locked || props.onDetachFromScene === undefined
                  ? {}
                  : {
                      action: {
                        label: '빼기',
                        title: "장면에서만 뺍니다. 주제에는 그대로 있습니다('자리 미정').",
                        onClick: () => props.onDetachFromScene?.(threadId, [e.id]),
                      },
                    })}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="자리 미정 근거" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-sp-muted">자리 미정 {unplaced.length}건</h4>
        {unplaced.length === 0 ? (
          <p className="text-xs leading-relaxed text-sp-muted">
            이 주제의 근거는 모두 장면에 들어갔습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {unplaced.map((e) => (
              <EvidenceRow
                key={e.id}
                evidence={e}
                {...(props.onSelectNode === undefined
                  ? {}
                  : { onSelect: () => props.onSelectNode?.(e.id) })}
                {...(locked || props.onPlaceInScene === undefined
                  ? {}
                  : {
                      action: {
                        label: '여기에 놓기',
                        onClick: () => props.onPlaceInScene?.(threadId, scene.id, [e.id]),
                      },
                    })}
              />
            ))}
          </ul>
        )}
        {!locked && props.onPickEvidenceForScene !== undefined && (
          <button
            type="button"
            onClick={() => props.onPickEvidenceForScene?.(threadId, scene.id)}
            className={`${boardBtn} self-start text-sp-muted hover:text-sp-text`}
          >
            + 주제 미정 근거에서 고르기
          </button>
        )}
      </section>

      {!locked && props.onAddSceneAfter !== undefined && (
        <button
          type="button"
          disabled={count >= NARRATIVE_SCENE_MAX}
          onClick={() => props.onAddSceneAfter?.(threadId, index + 1)}
          title={
            count >= NARRATIVE_SCENE_MAX
              ? `장면은 ${NARRATIVE_SCENE_MAX}개까지입니다`
              : '이 장면 바로 뒤에 새 장면을 끼웁니다'
          }
          className={`${boardBtn} self-start text-sp-muted hover:text-sp-text`}
        >
          + 이 뒤에 장면 끼우기
        </button>
      )}
    </div>
  );
}

function SceneLinkEditor({
  content,
  props,
}: {
  readonly content: Extract<EvidenceMapSideContent, { kind: 'sceneLink' }>;
  readonly props: EvidenceMapSidePanelProps;
}): ReactElement {
  const { threadId, scene, fromHead, toHead, leadIn, locked } = content;
  const chips = [...(props.recentSceneLeadIns ?? []), ...SCENE_LEAD_IN_CHIPS]
    .filter((c, i, a) => a.indexOf(c) === i)
    .slice(0, 6);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-sp-text">
        <span className="font-semibold">{fromHead}</span>
        <span
          aria-hidden="true"
          className="material-symbols-outlined mx-1 align-middle text-sm text-sp-muted"
        >
          arrow_forward
        </span>
        <span className="sr-only">에서 </span>
        <span className="font-semibold">{toHead}</span>
        <span className="sr-only">로</span>
      </p>
      <p className="text-xs leading-relaxed text-sp-muted">
        앞 장면에서 이 장면으로 어떻게 넘어가는지 한 줄로 적습니다. 초안을 쓸 때 두 장면 사이 문장의
        실마리가 됩니다.
      </p>
      {locked && <p className="text-xs text-sp-muted">마친 주제라 바꿀 수 없습니다.</p>}
      <NoteField
        key={`${threadId}:${scene.id}:lead`}
        label="이음말 (선택)"
        ariaLabel="이음말"
        value={leadIn}
        chips={chips}
        placeholder="예: 질문이 실험으로 이어짐"
        saveLabel="이음말 저장"
        disabled={locked}
        onSave={(next) => props.onSaveSceneLeadIn?.(threadId, scene.id, next) ?? Promise.resolve()}
      />
    </div>
  );
}

function ThreadEditor({
  content,
  props,
}: {
  readonly content: Extract<EvidenceMapSideContent, { kind: 'thread' }>;
  readonly props: EvidenceMapSidePanelProps;
}): ReactElement {
  const { thread, evidenceCount, sceneCount, unplacedCount, others, chainLength, locked } = content;
  const [title, setTitle] = useState(thread.title);
  useEffect(() => {
    setTitle(thread.title);
  }, [thread.id, thread.title]);
  const titleDirty = title.trim().length > 0 && title.trim() !== thread.title;
  const [instruction, setInstruction] = useState('');
  const fromId = thread.link?.fromThreadId ?? '';
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-xs text-sp-muted">
        주제 이름
        <div className="flex items-center gap-1.5">
          <input
            value={title}
            disabled={locked}
            aria-label="주제 이름"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && titleDirty) props.onRenameThread?.(thread.id, title.trim());
            }}
            className="min-w-0 flex-1 rounded-lg border border-sp-border bg-sp-card px-2 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!titleDirty || locked}
            onClick={() => props.onRenameThread?.(thread.id, title.trim())}
            className={primaryBtn}
          >
            저장
          </button>
        </div>
      </label>
      <p className="text-xs text-sp-muted">
        근거 {evidenceCount}건 · 장면 {sceneCount}개
        {unplacedCount > 0 && ` · 자리 미정 ${unplacedCount}건`}
        {locked && ' · 마친 주제'}
      </p>

      <section aria-label="글 순서" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-sp-muted">글 순서(장면)</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={locked}
            onClick={() => props.onLayScaffold?.(thread.id)}
            title="평가·동기·과정·결과 같은 자리를 깔거나 바꿉니다"
            className={`${boardBtn} text-sp-text`}
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined mr-1 align-middle text-sm"
            >
              view_agenda
            </span>
            {sceneCount === 0 ? '뼈대 깔기' : '뼈대 고르기'}
          </button>
          {props.onSuggestScenes !== undefined && (
            <button
              type="button"
              disabled={locked || evidenceCount === 0}
              onClick={() =>
                props.onSuggestScenes?.(
                  thread.id,
                  instruction.trim().length > 0 ? instruction.trim() : undefined,
                )
              }
              title="AI 가 근거를 읽고 장면 배치를 점선으로 제안합니다. 적용 전에는 저장되지 않아요."
              className={`${boardBtn} text-sp-accent`}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined mr-1 align-middle text-sm"
              >
                auto_awesome
              </span>
              AI 장면 배치 제안
            </button>
          )}
        </div>
        {props.onSuggestScenes !== undefined && (
          <input
            value={instruction}
            disabled={locked}
            aria-label="AI 에게 추가로 요청할 것"
            placeholder="추가 요청 (선택) 예: 결과보다 과정을 앞세워 줘"
            onChange={(e) => setInstruction(e.target.value)}
            className="rounded-lg border border-sp-border bg-sp-card px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none disabled:opacity-60"
          />
        )}
      </section>

      <section aria-label="앞 주제와 잇기" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-sp-muted">앞 주제와 잇기</h4>
        <select
          aria-label="앞 주제"
          value={fromId}
          disabled={locked || props.onSetThreadLink === undefined}
          onChange={(e) =>
            props.onSetThreadLink?.(thread.id, e.target.value.length > 0 ? e.target.value : null)
          }
          className="rounded-lg bg-sp-card px-2 py-1.5 text-xs text-sp-text ring-1 ring-sp-border disabled:opacity-60"
        >
          <option value="">잇지 않음 (혼자 시작하는 주제)</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <p className="text-xs leading-relaxed text-sp-muted">
          이으면 이 주제가 앞 주제 바로 아래에 오고, 둘 사이 화살표에 이음말을 적을 수 있습니다.
        </p>
      </section>

      <section aria-label="초안" className="flex flex-col gap-1.5">
        <h4 className="text-xs font-semibold text-sp-muted">초안</h4>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={evidenceCount === 0 || props.onDraftFromThread === undefined}
            onClick={() => props.onDraftFromThread?.(thread.id, false)}
            className={primaryBtn}
          >
            이 주제로 초안 쓰기
          </button>
          {chainLength > 1 && (
            <button
              type="button"
              disabled={props.onDraftFromThread === undefined}
              onClick={() => props.onDraftFromThread?.(thread.id, true)}
              title={`이어진 주제 ${chainLength}개를 한 글로 씁니다`}
              className={`${boardBtn} text-sp-text`}
            >
              이어진 흐름 전체로
            </button>
          )}
        </div>
      </section>

      {props.onOpenThread !== undefined && (
        <button
          type="button"
          onClick={() => props.onOpenThread?.(thread.id)}
          className={`${boardBtn} self-start text-sp-muted hover:text-sp-text`}
        >
          키워드·역량·닫기 등 주제 설정 더 보기
        </button>
      )}
    </div>
  );
}

function ThreadLinkEditor({
  content,
  props,
}: {
  readonly content: Extract<EvidenceMapSideContent, { kind: 'threadLink' }>;
  readonly props: EvidenceMapSidePanelProps;
}): ReactElement {
  const { thread, fromTitle, note } = content;
  const chips = [...(props.recentLinkNotes ?? []), ...LINK_NOTE_CHIPS].filter(
    (c, i, a) => a.indexOf(c) === i,
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-sp-text">
        <span className="font-semibold">{fromTitle}</span>
        <span
          aria-hidden="true"
          className="material-symbols-outlined mx-1 align-middle text-sm text-sp-muted"
        >
          arrow_forward
        </span>
        <span className="sr-only">에서 </span>
        <span className="font-semibold">{thread.title}</span>
        <span className="sr-only">로</span>
      </p>
      <p className="text-xs leading-relaxed text-sp-muted">
        앞 주제에서 이 주제로 어떻게 넘어가는지 한 줄로 적습니다. 초안을 쓸 때 두 주제 사이 문장이
        됩니다.
      </p>
      <NoteField
        key={thread.id}
        label="이음말 (선택)"
        ariaLabel="이음말"
        value={note}
        chips={chips}
        placeholder="예: 실험 결과가 새 질문으로 이어짐"
        saveLabel="이음말 저장"
        onSave={(next) => props.onSaveThreadLinkNote?.(thread.id, next)}
      />
      <div className="flex items-center">
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => props.onUnlinkThread?.(thread.id)}
          title="주제 사이 연결만 끊습니다. 두 주제와 근거는 그대로입니다."
          className={dangerBtn}
        >
          연결 끊기
        </button>
      </div>
    </div>
  );
}

const TITLES: Readonly<Record<EvidenceMapSideContent['kind'], string>> = {
  node: '근거 상세',
  scene: '장면',
  sceneLink: '장면 이음',
  thread: '주제',
  threadLink: '주제 이음',
};

export function EvidenceMapSidePanel(props: EvidenceMapSidePanelProps): ReactElement {
  const { content, onClose } = props;
  const title = TITLES[content.kind];
  return (
    <aside
      aria-label={title}
      data-testid="evidence-map-side"
      className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-sp-border bg-sp-surface p-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-sp-text">{title}</h3>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="보조 공간 닫기"
          className="rounded-lg p-1 text-sp-muted transition-colors hover:bg-sp-card hover:text-sp-text"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-base">
            close
          </span>
        </button>
      </div>
      {content.kind === 'node' ? (
        <>
          {content.card}
          {content.mirror && (
            <p className="text-xs leading-relaxed text-sp-muted">
              아직 근거로 저장되지 않은 원본입니다. 주제로 끌어 놓거나 [주제로 보내기]로 저장하면
              장면에 놓을 수 있습니다.
            </p>
          )}
        </>
      ) : content.kind === 'scene' ? (
        <SceneEditor content={content} props={props} />
      ) : content.kind === 'sceneLink' ? (
        <SceneLinkEditor content={content} props={props} />
      ) : content.kind === 'thread' ? (
        <ThreadEditor content={content} props={props} />
      ) : (
        <ThreadLinkEditor content={content} props={props} />
      )}
    </aside>
  );
}
