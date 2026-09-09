/**
 * 작성 방식 고르개(ADR-099) — 2026-09-09 3층 구조로 다시 짬(보강 5, 디자인 검토 반영).
 *
 * 원칙: **아무것도 안 고르면 결정 0개, 바꾸려면 1번 클릭, 만지고 싶으면 그때 부품.**
 *
 *  1층  지금 고른 방식 카드 한 장(이름 · 언제 · 구성 순서) + [방식 바꾸기].
 *       ★그냥 [바꾸기]가 아니다 — 같은 패널에 AI 결과로 초안을 바꾸는 [바꾸기]가 이미 있다(실제 충돌).
 *       [바꾸기]는 목록이다: 이 영역에 맞는 방식이 먼저, 안 맞는 것은 「다른 방식 더 보기」 뒤로.
 *       펼친 카드 아래에만 **예시 초안**이 붙는다 — 선생님은 이름이 아니라 결과물을 보고 고른다.
 *       고르는 것은 [이 방식 쓰기]로만 확정한다. 구경하다 실수로 바뀌지 않는다.
 *  2층  [+ 한마디 덧붙이기] 하나 → 추가 지시 칸. 적혀 있으면 단추 라벨이 요약을 겸한다.
 *  3층  [세부 조정] 하나 → 시작 방식 · 묶는 방식 · 요소 · 「적용될 설정」 · [기본값으로 되돌리기].
 *
 * 내 작성 방식: 관리 화면이 없다. 2·3층에서 손댄 상태면 카드에 "바꿈" 표시 + [이 설정 저장](이름만
 * 묻는다). 저장한 방식은 [바꾸기] 목록의 「내 작성 방식」 칸에 카드로 나온다. 카드의 ⋯ 에 이름 바꾸기·삭제만.
 * 복제는 없다 — 불러와서 고치고 다른 이름으로 저장하면 같은 일이다.
 *
 * ★규정 판본 경고만은 접어도 보인다. "고른 설정이 실제로는 적용되지 않는다"는 뜻이라 숨기면 거짓말이 된다.
 * ★모달·팝오버를 쓰지 않는다(유리 모드의 backdrop-filter 가 화면 고정 요소를 가둔다). 되묻기는 그 줄 안에서.
 * ★`sp-*` 토큰에 Tailwind 투명도 수식을 붙이지 않는다(규칙이 생성되지 않아 배경이 투명해진다).
 * ★실행 중이면 통째로 잠근다: 진행 중 요청은 시작 시점 값으로 고정돼 있다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  RECORD_STYLE_INSTRUCTION_MAX,
  sameWritingStyle,
  type RecordFocusId,
  type RecordModuleId,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import {
  RECORD_GROUPING_LABELS,
  RECORD_MODULES,
  RECORD_OPENING_HINTS,
  RECORD_OPENING_LABELS,
  focusById,
  focusChoicesForArea,
  type RecordFocus,
} from '@domain/rules/recordStyleCatalog';
import {
  checkStyleReadiness,
  hasStyleAdjustments,
  resetToFocusDefaults,
  resolveComposition,
} from '@domain/rules/recordStyleCompose';
import {
  PRESET_ERROR_MESSAGES,
  addPreset,
  removePreset,
  renamePreset,
  updatePresetStyle,
  type PresetResult,
} from '@domain/rules/recordStylePresetStore';
import { NARRATIVE_ROLE_LABELS } from '@domain/rules/narrativeParagraphs';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { RecordStyleSamplePreview } from '@adapters/components/RecordDraft/RecordStyleSamplePreview';

const btn =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface disabled:opacity-50';
const dangerBtn =
  'rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20';
const field =
  'rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-xs text-sp-text focus:border-sp-accent focus:outline-none';
const linkBtn =
  'text-xs font-medium text-sp-accent transition-colors hover:underline disabled:opacity-50';
const quietBtn =
  'flex items-center gap-1 text-xs text-sp-muted transition-colors hover:text-sp-text disabled:opacity-50';

/**
 * 새 항목 id. ★`@infrastructure/utils/uuid` 를 부르지 않는다 — 어댑터가 인프라를 직접 쓰면 안 된다
 * (의존성 규칙). 브라우저 것을 쓰고 없으면 시각+난수로 만든다.
 */
function newPresetId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `style-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const pill = (on: boolean): string =>
  `rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
    on
      ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
      : 'text-sp-muted ring-sp-border hover:text-sp-text'
  }`;

/** 구성 순서 한 줄 — 상단 배지·「적용될 설정」과 같은 어휘(번호 + 색점 + 이름). */
function OrderLine({ style }: { readonly style: RecordWritingStyle }): React.JSX.Element {
  const modules = resolveComposition(style).modules;
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="style-order-line">
      {modules.map((m, i) => (
        <li key={m.id} className="flex items-center gap-1 text-xs">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sp-bg text-[10px] font-semibold text-sp-text">
            {i + 1}
          </span>
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${ROLE_DOT[m.role]}`}
          />
          <span className="text-sp-text">{m.label}</span>
          <span className="sr-only">{NARRATIVE_ROLE_LABELS[m.role]}</span>
        </li>
      ))}
    </ol>
  );
}

export interface RecordStylePickerProps {
  readonly style: RecordWritingStyle;
  readonly onChange: (next: RecordWritingStyle) => void;
  readonly presets: readonly RecordStylePreset[];
  readonly onPresetsChange: (next: readonly RecordStylePreset[]) => void;
  /** 지금 쓰는 영역(`RecordArea` 값). 영역에 맞는 방식이 먼저 온다. */
  readonly area: string;
  /** 실제로 보낼 근거 건수. */
  readonly evidenceCount: number;
  /** 근거에 적힌 서로 다른 날짜의 수. */
  readonly distinctDateCount: number;
  /** 서버에서 받아 둔 작성 규정 판본. 모르면 undefined. */
  readonly promptVersion?: number;
  /** 실행 중에는 못 바꾼다: 진행 중 요청은 시작 시점 값으로 고정돼 있다. */
  readonly disabled?: boolean;
  /**
   * 바깥(상단 바의 작성 방식 배지)에서 "[바꾸기] 목록을 열어 달라"고 보내는 신호. 값이 바뀔 때만 연다.
   * ★불리언으로 두면 한 번 열고 닫은 뒤 다시 누를 때 반응하지 않는다. 그래서 세는 값이다.
   */
  readonly openSignal?: number;
}

export function RecordStylePicker({
  style,
  onChange,
  presets,
  onPresetsChange,
  area,
  evidenceCount,
  distinctDateCount,
  promptVersion,
  disabled = false,
  openSignal,
}: RecordStylePickerProps): React.JSX.Element {
  /** [바꾸기] 목록이 열려 있는가. 열리면 1층 카드 자리를 목록이 차지한다. */
  const [listOpen, setListOpen] = useState(false);
  /** 목록에서 펼쳐 둔 카드(예시가 붙는 자리). 초점 id 또는 `preset:<id>`. 한 번에 하나. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  /** 방금 불러온 「내 작성 방식」. 설정을 손대면 "바꿈"이 되고, 다시 저장하면 그 방식을 덮어쓴다. */
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const firstRowRef = useRef<HTMLButtonElement>(null);

  const focus = focusById(style.focus);
  const warnings = useMemo(
    () =>
      checkStyleReadiness({
        style,
        evidenceCount,
        distinctDateCount,
        area,
        ...(promptVersion === undefined ? {} : { promptVersion }),
      }),
    [style, evidenceCount, distinctDateCount, area, promptVersion],
  );
  const versionWarning = warnings.find((w) => w.kind === 'prompt-version') ?? null;
  const adviceWarnings = warnings.filter((w) => w.kind !== 'prompt-version');
  const choices = useMemo(() => focusChoicesForArea(area), [area]);
  const fitting = choices.filter((c) => c.fitsArea);
  const others = choices.filter((c) => !c.fitsArea);
  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  /** "바꿈": 불러온 방식이 있으면 그 저장값과, 없으면 이 초점의 기본값과 다른가. */
  const isModified =
    activePreset !== null
      ? !sameWritingStyle(style, activePreset.style)
      : hasStyleAdjustments(style);
  const instruction = (style.instruction ?? '').trim();

  /**
   * 바깥에서 온 열기 신호. 첫 렌더(0)에는 반응하지 않는다 — 패널을 열 때마다 저절로 열리면 안 된다.
   * 열었으면 첫 카드에 초점을 둔다. 키보드만 쓰는 선생님이 배지를 누르고 곧바로 고를 수 있어야 한다.
   */
  useEffect(() => {
    if (openSignal === undefined || openSignal <= 0) return;
    setListOpen(true);
  }, [openSignal]);
  useEffect(() => {
    if (listOpen) firstRowRef.current?.focus();
  }, [listOpen]);

  const set = (patch: Partial<RecordWritingStyle>): void => onChange({ ...style, ...patch });

  const closeList = (): void => {
    setListOpen(false);
    setExpandedId(null);
    setMenuOpenId(null);
    setRenamingId(null);
    setConfirmDeleteId(null);
  };

  /**
   * 목록에서 방식을 고르면 **그 방식의 기본값**이 된다(시작·묶기·요소 조정을 버린다). 카드에 보이는 이름과
   * 실제 구성이 같아야 하고, 방금 고른 방식에 "바꿈"이 붙어 있으면 뜻이 없다. 한마디(추가 지시)만 남긴다 —
   * 선생님의 말이지 방식의 일부가 아니다.
   */
  const chooseFocus = (id: RecordFocusId): void => {
    setActivePresetId(null);
    setExtrasOpen(false);
    onChange({
      ...resetToFocusDefaults({ ...style, focus: id }),
      ...(style.instruction === undefined ? {} : { instruction: style.instruction }),
    });
    closeList();
  };

  const choosePreset = (p: RecordStylePreset): void => {
    setPresetError(null);
    setActivePresetId(p.id);
    onChange(p.style);
    closeList();
  };

  const toggleModule = (id: RecordModuleId, on: boolean): void => {
    const off = new Set(style.disabledModules ?? []);
    const extra = new Set(style.extraModules ?? []);
    if (focus.body.includes(id)) {
      if (on) off.delete(id);
      else off.add(id);
    } else if (on) extra.add(id);
    else extra.delete(id);
    onChange({ ...style, disabledModules: [...off], extraModules: [...extra] });
  };

  const apply = (r: PresetResult, onOk?: () => void): void => {
    if (!r.ok) {
      setPresetError(r.error ? PRESET_ERROR_MESSAGES[r.error] : '저장하지 못했습니다.');
      return;
    }
    setPresetError(null);
    onPresetsChange(r.presets);
    onOk?.();
  };

  const trimmedNew = newName.trim();
  const duplicateNew = presets.some((p) => p.name.trim() === trimmedNew);

  /** 방향키로 목록의 카드 사이를 오간다. 초점만 옮기고 값은 안 바꾼다. */
  const onRowKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = Array.from(
      e.currentTarget
        .closest('[data-testid="style-choice-list"]')
        ?.querySelectorAll<HTMLButtonElement>('button[data-style-row]') ?? [],
    );
    const at = rows.indexOf(e.currentTarget);
    if (at < 0) return;
    e.preventDefault();
    const next = rows[e.key === 'ArrowDown' ? at + 1 : at - 1];
    next?.focus();
  };

  // ── 1층: 고른 방식 카드 ──────────────────────────────────────────────────
  const selectedCard = (
    <div
      className="flex flex-col gap-2 rounded-lg border border-sp-border bg-sp-card p-3"
      data-testid="style-selected-card"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-sp-text">
          <span className="truncate">
            {activePreset !== null ? activePreset.name : focus.label}
          </span>
          {isModified && (
            <span
              data-testid="style-modified-badge"
              className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 ring-1 ring-amber-500/20"
            >
              바꿈
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => {
            setListOpen(true);
            setExpandedId(null);
          }}
          className={`shrink-0 ${linkBtn}`}
        >
          방식 바꾸기
        </button>
      </div>
      {activePreset !== null && <p className="text-xs text-sp-muted">바탕: {focus.label}</p>}
      <p className="text-xs leading-relaxed text-sp-muted">{focus.whenToUse}</p>
      <OrderLine style={style} />
      {isModified && (
        <div className="flex flex-col gap-1.5 border-t border-sp-border pt-1.5">
          {saveOpen ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="min-w-0 flex-1">
                <span className="sr-only">저장할 작성 방식 이름</span>
                <input
                  type="text"
                  autoFocus
                  value={newName}
                  placeholder="이름을 적어 저장"
                  onChange={(e) => setNewName(e.target.value)}
                  className={`${field} w-full`}
                />
              </label>
              <button
                type="button"
                disabled={trimmedNew.length === 0 || duplicateNew}
                onClick={() => {
                  // id 를 먼저 만들어 둔다: 저장이 되면 그 방식을 "불러온 상태"로 두어 "바꿈"이 사라진다.
                  const id = newPresetId();
                  apply(addPreset(presets, newName, style, Date.now(), id), () => {
                    setNewName('');
                    setSaveOpen(false);
                    setActivePresetId(id);
                  });
                }}
                className={`bg-sp-bg text-sp-accent ${btn}`}
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveOpen(false);
                  setNewName('');
                }}
                className={`bg-sp-bg text-sp-text ${btn}`}
              >
                그만두기
              </button>
              {duplicateNew && <p className="w-full text-xs text-red-500">이미 있는 이름이에요.</p>}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activePreset !== null && (
                <button
                  type="button"
                  onClick={() =>
                    apply(updatePresetStyle(presets, activePreset.id, style, Date.now()))
                  }
                  className={linkBtn}
                  title={`「${activePreset.name}」을 지금 설정으로 덮어씁니다.`}
                >
                  「{activePreset.name}」에 덮어쓰기
                </button>
              )}
              <button type="button" onClick={() => setSaveOpen(true)} className={linkBtn}>
                {activePreset !== null ? '다른 이름으로 저장' : '이 설정 저장'}
              </button>
            </div>
          )}
          {presetError !== null && (
            <p className="text-xs text-red-500" role="alert">
              {presetError}
            </p>
          )}
        </div>
      )}
    </div>
  );

  // ── [바꾸기] 목록의 카드 한 장 ────────────────────────────────────────────
  const focusRow = (
    c: { focus: RecordFocus; fitsArea: boolean },
    first: boolean,
  ): React.JSX.Element => {
    const f = c.focus;
    const expanded = expandedId === f.id;
    const current = activePreset === null && f.id === style.focus;
    const tagged = c.fitsArea && f.preferredAreas !== undefined;
    return (
      <div
        key={f.id}
        className={`rounded-lg ring-1 ${expanded ? 'ring-sp-accent' : 'ring-sp-border'}`}
        data-testid="style-choice"
        data-focus={f.id}
      >
        <button
          type="button"
          data-style-row
          ref={first ? firstRowRef : undefined}
          aria-expanded={expanded}
          aria-current={current ? 'true' : undefined}
          onKeyDown={onRowKeyDown}
          onClick={() => setExpandedId((v) => (v === f.id ? null : f.id))}
          className={`flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sp-surface ${
            current ? 'bg-blue-500/10' : ''
          }`}
        >
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-sp-text">
            {f.label}
            {tagged && (
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                이 영역에 맞음
              </span>
            )}
            {current && (
              <span className="text-[10px] font-medium text-sp-accent">지금 쓰는 중</span>
            )}
          </span>
          {!expanded && <span className="truncate text-xs text-sp-muted">{f.whenToUse}</span>}
        </button>
        {expanded && (
          <div className="flex flex-col gap-2 border-t border-sp-border px-2.5 py-2">
            <p className="text-xs leading-relaxed text-sp-muted">{f.whenToUse}</p>
            <RecordStyleSamplePreview focusId={f.id} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => chooseFocus(f.id)}
                className="rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
              >
                이 방식 쓰기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── [바꾸기] 목록의 「내 작성 방식」 카드 — ⋯ 는 그 줄 안에서 단추를 바꿔치기한다(팝오버 없음) ──
  const presetRow = (p: RecordStylePreset): React.JSX.Element => {
    const key = `preset:${p.id}`;
    const expanded = expandedId === key;
    const current = activePresetId === p.id;
    const menuOpen = menuOpenId === p.id;
    const base = focusById(p.style.focus);
    return (
      <div
        key={p.id}
        className={`flex flex-col rounded-lg ring-1 ${expanded ? 'ring-sp-accent' : 'ring-sp-border'}`}
        data-testid="style-preset-choice"
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-style-row
            aria-expanded={expanded}
            aria-current={current ? 'true' : undefined}
            onKeyDown={onRowKeyDown}
            onClick={() => setExpandedId((v) => (v === key ? null : key))}
            className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sp-surface ${
              current ? 'bg-blue-500/10' : ''
            }`}
          >
            <span className="truncate text-sm font-medium text-sp-text">{p.name}</span>
            <span className="truncate text-xs text-sp-muted">바탕: {base.label}</span>
          </button>
          <button
            type="button"
            aria-label={`${p.name} 더보기`}
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpenId(menuOpen ? null : p.id);
              setRenamingId(null);
              setConfirmDeleteId(null);
            }}
            className="mr-1 rounded-lg px-1.5 py-1 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base">
              more_horiz
            </span>
          </button>
        </div>
        {menuOpen && renamingId !== p.id && confirmDeleteId !== p.id && (
          <div className="flex gap-1.5 border-t border-sp-border px-2.5 py-1.5">
            <button
              type="button"
              onClick={() => {
                setRenamingId(p.id);
                setNameDraft(p.name);
              }}
              className={`bg-sp-bg text-sp-text ${btn}`}
            >
              이름 바꾸기
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteId(p.id)}
              className={`bg-sp-bg text-sp-text ${btn}`}
            >
              삭제
            </button>
          </div>
        )}
        {renamingId === p.id && (
          <div className="flex items-center gap-1.5 border-t border-sp-border px-2.5 py-1.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">새 이름</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className={`${field} w-full`}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                apply(renamePreset(presets, p.id, nameDraft, Date.now()), () => {
                  setRenamingId(null);
                  setMenuOpenId(null);
                })
              }
              className={`bg-sp-bg text-sp-accent ${btn}`}
            >
              저장
            </button>
            <button type="button" onClick={() => setRenamingId(null)} className={quietBtn}>
              그만두기
            </button>
          </div>
        )}
        {confirmDeleteId === p.id && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-sp-border px-2.5 py-1.5">
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-sp-muted">
              「{p.name}」을 지울까요? 이 방식으로 이미 만든 초안은 그대로 남아요.
            </span>
            <button type="button" onClick={() => setConfirmDeleteId(null)} className={quietBtn}>
              그만두기
            </button>
            <button
              type="button"
              onClick={() => {
                apply(removePreset(presets, p.id));
                setConfirmDeleteId(null);
                setMenuOpenId(null);
                if (activePresetId === p.id) setActivePresetId(null);
              }}
              className={dangerBtn}
            >
              지우기
            </button>
          </div>
        )}
        {expanded && (
          <div className="flex flex-col gap-2 border-t border-sp-border px-2.5 py-2">
            <OrderLine style={p.style} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => choosePreset(p)}
                className="rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
              >
                이 방식 쓰기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const choiceList = (
    <div className="flex flex-col gap-1.5" data-testid="style-choice-list">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-sp-text">작성 방식 고르기</span>
        <button type="button" onClick={closeList} className={quietBtn}>
          닫기
        </button>
      </div>
      <div role="list" aria-label="작성 방식 고르기" className="flex flex-col gap-1.5">
        {fitting.map((c, i) => focusRow(c, i === 0))}
        {presets.length > 0 && (
          <div className="mt-1 flex flex-col gap-1.5 border-t border-sp-border pt-1.5">
            <p className="px-1 text-xs font-semibold text-sp-muted">내 작성 방식</p>
            {presets.map(presetRow)}
          </div>
        )}
        {presetError !== null && (
          <p className="text-xs text-red-500" role="alert">
            {presetError}
          </p>
        )}
        {others.length > 0 && (
          <details className="rounded-lg">
            <summary className="cursor-pointer list-none px-1 py-1 text-xs text-sp-muted hover:text-sp-text">
              다른 방식 더 보기 ({others.length})
            </summary>
            <div className="flex flex-col gap-1.5 pt-1.5">
              {others.map((c) => focusRow(c, false))}
            </div>
          </details>
        )}
      </div>
    </div>
  );

  // ── 2층·3층 진입 줄 ──────────────────────────────────────────────────────
  const entryRow = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5">
      <button
        type="button"
        onClick={() => setInstructionOpen((v) => !v)}
        aria-expanded={instructionOpen}
        className={`${quietBtn} max-w-[240px]`}
      >
        <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-sm">
          chat_bubble
        </span>
        <span className="truncate">
          {instruction.length > 0 ? `한마디: ${instruction}` : '+ 한마디 덧붙이기'}
        </span>
      </button>
      <span aria-hidden="true" className="text-sp-border">
        ·
      </span>
      <button
        type="button"
        onClick={() => setDetailOpen((v) => !v)}
        aria-expanded={detailOpen}
        aria-controls="record-style-detail"
        className={quietBtn}
      >
        세부 조정
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-sm transition-transform ${detailOpen ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
        {!detailOpen && adviceWarnings.length > 0 && (
          <span
            data-testid="style-advice-dot"
            className="h-1.5 w-1.5 rounded-full bg-amber-500"
            aria-label={`확인할 안내 ${adviceWarnings.length}건`}
          />
        )}
      </button>
    </div>
  );

  const instructionBox = (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="sr-only">한마디 덧붙이기</span>
        <textarea
          value={style.instruction ?? ''}
          maxLength={RECORD_STYLE_INSTRUCTION_MAX}
          rows={3}
          autoFocus
          placeholder="예: 발표 장면을 특히 살려 주세요."
          onChange={(e) => set({ instruction: e.target.value })}
          className={`${field} resize-y leading-relaxed`}
        />
      </label>
      <p className="text-xs leading-relaxed text-sp-muted">
        {(style.instruction ?? '').length}/{RECORD_STYLE_INSTRUCTION_MAX}자 · 공통 작성 규정, 기재
        금지 항목, 개인정보 가리기는 이 칸으로 끌 수 없어요.
      </p>
    </div>
  );

  const modulePill = (id: RecordModuleId, on: boolean): React.JSX.Element => {
    const m = RECORD_MODULES[id];
    return (
      <button
        key={id}
        type="button"
        aria-pressed={on}
        onClick={() => toggleModule(id, !on)}
        title={`${NARRATIVE_ROLE_LABELS[m.role]} · ${m.purpose}`}
        className={`flex items-center gap-1 ${pill(on)}`}
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[m.role]}`} />
        {m.label}
      </button>
    );
  };

  // ── 3층: 세부 조정 ───────────────────────────────────────────────────────
  const detail = (
    <div
      id="record-style-detail"
      data-testid="style-detail"
      className="flex flex-col gap-3 rounded-lg border border-sp-border bg-sp-bg p-3"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-sp-text">글의 흐름</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="시작 방식">
          {(['evaluation', 'performance', 'question'] as const).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={style.opening === o}
              onClick={() => set({ opening: o })}
              className={pill(style.opening === o)}
            >
              {RECORD_OPENING_LABELS[o]}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-sp-muted">
          {RECORD_OPENING_HINTS[style.opening]}
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="근거 묶는 방식">
          {(['single', 'connected', 'byAchievement'] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={style.grouping === g}
              onClick={() => set({ grouping: g })}
              className={pill(style.grouping === g)}
            >
              {RECORD_GROUPING_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-sp-border pt-2">
        <span className="text-xs font-semibold text-sp-text">넣을 요소</span>
        <div className="flex flex-wrap gap-1.5" data-testid="style-body-modules">
          {focus.body.map((id) => modulePill(id, !(style.disabledModules ?? []).includes(id)))}
        </div>
        {focus.extras.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setExtrasOpen((v) => !v)}
              aria-expanded={extrasOpen}
              className="self-start text-xs text-sp-muted transition-colors hover:text-sp-text"
            >
              {extrasOpen
                ? '더 넣을 수 있는 요소 접기'
                : `더 넣을 수 있는 요소 ${focus.extras.length}개`}
            </button>
            {extrasOpen && (
              <div className="flex flex-wrap gap-1.5" data-testid="style-extra-modules">
                {focus.extras.map((id) => modulePill(id, (style.extraModules ?? []).includes(id)))}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className="flex flex-col gap-1.5 rounded-lg bg-sp-card p-2"
        data-testid="style-applied-plan"
      >
        <p className="text-xs font-semibold text-sp-text">적용될 설정</p>
        <OrderLine style={style} />
        <p className="text-xs text-sp-muted">묶는 방식: {RECORD_GROUPING_LABELS[style.grouping]}</p>
        {adviceWarnings.map((w) => (
          <p key={w.kind} className="flex items-start gap-1 text-xs leading-relaxed text-sp-muted">
            <span aria-hidden="true" className="material-symbols-outlined text-sm text-amber-500">
              info
            </span>
            {w.message}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sp-border pt-2">
        <p className="text-xs text-sp-muted">
          {hasStyleAdjustments(style)
            ? '방식의 기본값에서 몇 가지를 바꿨어요.'
            : '방식의 기본값 그대로예요.'}
        </p>
        <button
          type="button"
          disabled={!hasStyleAdjustments(style)}
          onClick={() => {
            setActivePresetId(null);
            onChange(resetToFocusDefaults(style));
          }}
          className={`bg-sp-bg text-sp-text ${btn}`}
        >
          기본값으로 되돌리기
        </button>
      </div>
    </div>
  );

  return (
    <fieldset
      disabled={disabled}
      className="flex min-w-0 flex-col gap-2"
      data-testid="record-style-picker"
    >
      <legend className="sr-only">작성 방식</legend>
      {/* 규정 판본 경고만 접어도 보인다: 고른 설정이 실제로는 적용되지 않는다는 뜻이다. */}
      {versionWarning !== null && (
        <p
          data-testid="style-version-warning"
          className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-600 ring-1 ring-amber-500/20"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-sm">
            schedule
          </span>
          {versionWarning.message}
        </p>
      )}
      {listOpen ? choiceList : selectedCard}
      {!listOpen && entryRow}
      {!listOpen && instructionOpen && instructionBox}
      {!listOpen && detailOpen && detail}
    </fieldset>
  );
}
