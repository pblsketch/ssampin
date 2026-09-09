/**
 * 「작성 방식」 고르개 — AI 초안 패널 맨 위 한 줄 + 접이식 자세한 설정(ADR-099).
 *
 * 설계: `docs/02-design/features/record-draft-template-library.design.md` §10.
 * 디자인 검토: 2026-09-09(designer 에이전트). 반영한 것 5가지:
 *  1. 저장한 「내 작성 방식」을 같은 드롭다운의 두 번째 묶음으로 — 자주 하는 재사용은 [자세히] 없이 끝난다.
 *  2. 「적용될 설정」은 화살표 사슬이 아니라 **번호 + 형광펜 색점** 세로 목록. 440px 에서 순서가 안 헷갈린다.
 *  3. 요소는 체크박스가 아니라 색점 달린 알약 토글 — 초안 본문의 형광펜 색과 같은 어휘를 쓴다.
 *  4. 프리셋 관리는 한 단 더 접는다. 삭제·이름 바꾸기는 **그 줄 안에서** 단추 줄을 바꿔치기한다.
 *  5. 조언성 경고는 「적용될 설정」 카드 안에(원인 곁에), 실제 동작이 달라지는 규정 판본 경고만 밖으로.
 *
 * ★접었을 때 보이는 것은 한 줄이다. 고르지 않으면 오늘과 같아야 하므로 기본값에서는 아무 표시도 없다.
 * ★규정 판본 경고만은 접어도 보인다. "고른 설정이 실제로는 적용되지 않는다"는 뜻이라 숨기면 거짓말이 된다.
 * ★모달을 쓰지 않는다(유리 모드의 backdrop-filter 가 화면 고정 요소를 가둔다). 되묻기는 인라인이다.
 * ★`sp-*` 토큰에 Tailwind 투명도 수식을 붙이지 않는다(규칙이 생성되지 않아 배경이 투명해진다).
 */
import { useMemo, useState } from 'react';

import {
  RECORD_STYLE_INSTRUCTION_MAX,
  type RecordModuleId,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import {
  RECORD_FOCUSES,
  RECORD_GROUPING_LABELS,
  RECORD_MODULES,
  RECORD_OPENING_HINTS,
  RECORD_OPENING_LABELS,
  focusById,
} from '@domain/rules/recordStyleCatalog';
import {
  checkStyleReadiness,
  isDefaultStyle,
  resolveComposition,
} from '@domain/rules/recordStyleCompose';
import {
  PRESET_ERROR_MESSAGES,
  addPreset,
  duplicatePreset,
  removePreset,
  renamePreset,
  updatePresetStyle,
  type PresetResult,
} from '@domain/rules/recordStylePresetStore';
import { NARRATIVE_ROLE_LABELS } from '@domain/rules/narrativeParagraphs';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';

const btn =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface disabled:opacity-50';
const dangerBtn =
  'rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20';
const field =
  'rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-xs text-sp-text focus:border-sp-accent focus:outline-none';

/**
 * 새 항목 id. ★`@infrastructure/utils/uuid` 를 부르지 않는다 — 어댑터가 인프라를 직접 쓰면 안 된다
 * (의존성 규칙). `ownAiRun.ts` 와 같은 방식으로 브라우저 것을 쓰고 없으면 시각+난수로 만든다.
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

export interface RecordStylePickerProps {
  readonly style: RecordWritingStyle;
  readonly onChange: (next: RecordWritingStyle) => void;
  readonly presets: readonly RecordStylePreset[];
  readonly onPresetsChange: (next: readonly RecordStylePreset[]) => void;
  /** 지금 쓰는 영역(`RecordArea` 값). 영역과 초점이 안 맞으면 알려 준다. */
  readonly area: string;
  /** 실제로 보낼 근거 건수. */
  readonly evidenceCount: number;
  /** 근거에 적힌 서로 다른 날짜의 수. */
  readonly distinctDateCount: number;
  /** 서버에서 받아 둔 작성 규정 판본. 모르면 undefined. */
  readonly promptVersion?: number;
  /** 실행 중에는 못 바꾼다: 진행 중 요청은 시작 시점 값으로 고정돼 있다. */
  readonly disabled?: boolean;
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
}: RecordStylePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  /** 방금 불러온 「내 작성 방식」. 설정을 손대면 풀린다(더 이상 그 방식이 아니다). */
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const focus = focusById(style.focus);
  const resolved = useMemo(() => resolveComposition(style), [style]);
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
  const isDefault = isDefaultStyle(style);

  const set = (patch: Partial<RecordWritingStyle>): void => {
    setActivePresetId(null);
    onChange({ ...style, ...patch });
  };

  /** 초점을 바꾸면 요소 조정은 버린다: 다른 초점의 요소 id 를 들고 가면 뜻이 없다. */
  const changeFocus = (id: string): void => {
    const next = RECORD_FOCUSES.find((f) => f.id === id);
    if (!next) return;
    setActivePresetId(null);
    setExtrasOpen(false);
    onChange({
      focus: next.id,
      opening: style.opening,
      grouping: style.grouping,
      ...(style.instruction === undefined ? {} : { instruction: style.instruction }),
    });
  };

  const onSelect = (value: string): void => {
    if (value.startsWith('preset:')) {
      const p = presets.find((x) => x.id === value.slice('preset:'.length));
      if (!p) return;
      setPresetError(null);
      setActivePresetId(p.id);
      onChange(p.style);
      return;
    }
    changeFocus(value);
  };

  const toggleModule = (id: RecordModuleId, on: boolean): void => {
    const off = new Set(style.disabledModules ?? []);
    const extra = new Set(style.extraModules ?? []);
    if (focus.body.includes(id)) {
      if (on) off.delete(id);
      else off.add(id);
    } else if (on) extra.add(id);
    else extra.delete(id);
    setActivePresetId(null);
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
  const selectValue = activePresetId !== null ? `preset:${activePresetId}` : style.focus;

  return (
    <div className="flex flex-col gap-2">
      {/* 접었을 때 보이는 한 줄. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-sp-muted">작성 방식</span>
        <label className="min-w-0">
          <span className="sr-only">작성 초점 또는 저장한 작성 방식 고르기</span>
          <select
            value={selectValue}
            disabled={disabled}
            onChange={(e) => onSelect(e.target.value)}
            className={`${field} ${isDefault ? '' : 'text-sp-accent'}`}
          >
            <optgroup label="초점">
              {RECORD_FOCUSES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
            {presets.length > 0 && (
              <optgroup label="내 작성 방식">
                {presets.map((p) => (
                  <option key={p.id} value={`preset:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="record-style-detail"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-sp-muted transition-colors hover:text-sp-text"
        >
          <span
            aria-hidden="true"
            className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
          자세히
          {!open && adviceWarnings.length > 0 && (
            <span
              data-testid="style-advice-dot"
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              aria-label={`확인할 안내 ${adviceWarnings.length}건`}
            />
          )}
        </button>
      </div>

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

      {open && (
        <fieldset
          id="record-style-detail"
          disabled={disabled}
          className="flex flex-col gap-3 rounded-lg border border-sp-border bg-sp-bg p-3"
        >
          <p className="text-xs leading-relaxed text-sp-muted">{focus.whenToUse}</p>

          {/* 글의 흐름 */}
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

          {/* 넣을 요소 */}
          <div className="flex flex-col gap-1.5 border-t border-sp-border pt-2">
            <span className="text-xs font-semibold text-sp-text">넣을 요소</span>
            <div className="flex flex-wrap gap-1.5" data-testid="style-body-modules">
              {focus.body.map((id) => {
                const on = !(style.disabledModules ?? []).includes(id);
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
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[m.role]}`}
                    />
                    {m.label}
                  </button>
                );
              })}
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
                    {focus.extras.map((id) => {
                      const on = (style.extraModules ?? []).includes(id);
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
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${ROLE_DOT[m.role]}`}
                          />
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 추가 지시 */}
          <div className="flex flex-col gap-1 border-t border-sp-border pt-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-sp-text">추가 지시</span>
              <textarea
                value={style.instruction ?? ''}
                maxLength={RECORD_STYLE_INSTRUCTION_MAX}
                rows={3}
                placeholder="예: 발표 장면을 특히 살려 주세요."
                onChange={(e) => set({ instruction: e.target.value })}
                className={`${field} resize-y leading-relaxed`}
              />
            </label>
            <p className="text-xs leading-relaxed text-sp-muted">
              {(style.instruction ?? '').length}/{RECORD_STYLE_INSTRUCTION_MAX}자 · 공통 작성 규정,
              기재 금지 항목, 개인정보 가리기는 이 칸으로 끌 수 없어요.
            </p>
          </div>

          {/* 적용될 설정 + 조언성 안내 */}
          <div
            className="flex flex-col gap-1.5 rounded-lg bg-sp-card p-2"
            data-testid="style-applied-plan"
          >
            <p className="text-xs font-semibold text-sp-text">적용될 설정</p>
            <ol className="flex flex-col gap-1">
              {resolved.modules.map((m, i) => (
                <li key={m.id} className="flex items-center gap-1.5 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sp-bg text-xs font-semibold text-sp-text">
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
            <p className="text-xs text-sp-muted">
              묶는 방식: {RECORD_GROUPING_LABELS[style.grouping]}
            </p>
            {isDefault && (
              <p className="text-xs leading-relaxed text-sp-muted">
                지금은 기존 방식 그대로예요. 아무것도 바꾸지 않으면 예전과 똑같이 만들어져요.
              </p>
            )}
            {adviceWarnings.map((w) => (
              <p
                key={w.kind}
                className="flex items-start gap-1 text-xs leading-relaxed text-sp-muted"
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-sm text-amber-500"
                >
                  info
                </span>
                {w.message}
              </p>
            ))}
          </div>

          {/* 내 작성 방식 관리 — 한 단 더 접는다(매번 쓰는 일이 아니다). */}
          <div className="flex flex-col gap-1.5 border-t border-sp-border pt-2">
            <button
              type="button"
              onClick={() => setManageOpen((v) => !v)}
              aria-expanded={manageOpen}
              className="flex items-center gap-1 self-start text-xs font-semibold text-sp-text"
            >
              <span
                aria-hidden="true"
                className={`material-symbols-outlined text-sm transition-transform ${manageOpen ? 'rotate-180' : ''}`}
              >
                expand_more
              </span>
              내 작성 방식 {presets.length > 0 ? `(${presets.length})` : ''}
            </button>
            {manageOpen && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">저장할 작성 방식 이름</span>
                    <input
                      type="text"
                      value={newName}
                      placeholder="이름을 적어 지금 설정을 저장"
                      onChange={(e) => setNewName(e.target.value)}
                      className={`${field} w-full`}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={trimmedNew.length === 0 || duplicateNew}
                    onClick={() =>
                      apply(addPreset(presets, newName, style, Date.now(), newPresetId()), () =>
                        setNewName(''),
                      )
                    }
                    className={`bg-sp-card text-sp-text ${btn}`}
                  >
                    저장
                  </button>
                </div>
                {duplicateNew && <p className="text-xs text-red-500">이미 있는 이름이에요.</p>}
                {presetError !== null && (
                  <p className="text-xs text-red-500" role="alert">
                    {presetError}
                  </p>
                )}
                {presets.length === 0 ? (
                  <p className="text-xs leading-relaxed text-sp-muted">
                    저장한 방식이 아직 없어요. 자주 쓰는 조합을 저장해 두면 다음부터 위 목록에서
                    바로 골라요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {presets.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center gap-1.5 rounded-lg bg-sp-card px-2 py-1.5 text-xs"
                      >
                        {renamingId === p.id ? (
                          <>
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
                                apply(renamePreset(presets, p.id, nameDraft, Date.now()), () =>
                                  setRenamingId(null),
                                )
                              }
                              className={`bg-sp-bg text-sp-accent ${btn}`}
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className={`bg-sp-bg text-sp-text ${btn}`}
                            >
                              그만두기
                            </button>
                          </>
                        ) : confirmDeleteId === p.id ? (
                          <>
                            <span className="min-w-0 flex-1 leading-relaxed text-sp-muted">
                              「{p.name}」을 지울까요? 이 방식으로 이미 만든 초안은 그대로 남아요.
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className={`bg-sp-bg text-sp-text ${btn}`}
                            >
                              그만두기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                apply(removePreset(presets, p.id));
                                setConfirmDeleteId(null);
                                if (activePresetId === p.id) setActivePresetId(null);
                              }}
                              className={dangerBtn}
                            >
                              지우기
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sp-text">{p.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                apply(updatePresetStyle(presets, p.id, style, Date.now()), () =>
                                  setActivePresetId(p.id),
                                )
                              }
                              className={`bg-sp-bg text-sp-text ${btn}`}
                              title="지금 화면의 설정으로 이 방식을 덮어씁니다."
                            >
                              지금 설정으로 바꾸기
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                apply(duplicatePreset(presets, p.id, Date.now(), newPresetId()))
                              }
                              className={`bg-sp-bg text-sp-text ${btn}`}
                            >
                              복제
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(p.id);
                                setNameDraft(p.name);
                                setConfirmDeleteId(null);
                              }}
                              className={`bg-sp-bg text-sp-text ${btn}`}
                            >
                              이름 바꾸기
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteId(p.id);
                                setRenamingId(null);
                              }}
                              className={`bg-sp-bg text-sp-text ${btn}`}
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </fieldset>
      )}
    </div>
  );
}
