/**
 * 뼈대 고르개(ADR-103) — 옛 작성 방식 고르개(`RecordStylePicker`)를 대신한다.
 *
 * 무엇이 달라졌나: 고를 축이 넷(초점·시작·묶기·요소)이었던 것이 **하나**가 된다. 선생님이 정하는
 * 것은 "장면을 어떤 차례로 놓을까" 하나뿐이고, 그 차례가 곧 초안 문단의 차례다. 세부 조정 화면은
 * 없다 — 고친 것은 지도의 장면 열에서 장면을 직접 옮겨 만들고, 마음에 들면 이름 붙여 저장한다.
 *
 * ★모달·팝오버를 쓰지 않는다. 유리 모드의 `backdrop-filter` 가 화면 고정 요소를 가둔다(실제 사고).
 *   되묻기도 그 줄 안에서 한다.
 * ★`sp-*` 토큰에 Tailwind 투명도 수식을 붙이지 않는다(규칙이 생성되지 않아 배경이 투명해진다).
 * ★색만으로 뜻을 전하지 않는다 — 자리 색점 옆에 자리 이름을 늘 함께 읽어 준다.
 * ★[이 뼈대 깔기]는 **되묻는다.** 이미 놓아 둔 근거의 자리가 바뀌는 일이라 한 번에 지나가면 안 된다.
 */
import { useState } from 'react';

import {
  builtInScaffolds,
  frameRoleLabel,
  sceneDisplayLabel,
  type NarrativeFrameId,
  type RecordScaffold,
  type RecordScaffoldScene,
} from '@domain/rules/narrativeFrames';
import {
  SCAFFOLD_ERROR_MESSAGES,
  addScaffold,
  removeScaffold,
  renameScaffold,
  scaffoldChoices,
} from '@domain/rules/recordScaffoldStore';
import { ROLE_DOT } from '@adapters/components/RecordDraft/narrativeRoleStyles';
import { RecordStyleSamplePreview } from '@adapters/components/RecordDraft/RecordStyleSamplePreview';
import type { RecordFocusId } from '@domain/entities/RecordWritingStyle';

export interface ScaffoldPickerProps {
  /** 지금 영역이 정한 틀. 다른 틀의 뼈대는 보이지 않는다. */
  readonly frame: NarrativeFrameId;
  /** 선생님이 저장해 둔 뼈대. 내장 7종은 이 목록에 없다(앱이 들고 있다). */
  readonly scaffolds: readonly RecordScaffold[];
  readonly onScaffoldsChange: (next: readonly RecordScaffold[]) => void;
  /** 고른 뼈대를 깐다. 실제 저장은 부르는 쪽이 한다. */
  readonly onApply: (scaffold: RecordScaffold) => void;
  /** 지금 이 주제에 놓여 있는 장면 배열. 있으면 「지금 배열을 뼈대로 저장」이 열린다. */
  readonly currentScenes?: readonly RecordScaffoldScene[];
  /** 이 영역에서 마지막으로 깐 뼈대 id. 목록에서 표시만 한다. */
  readonly selectedId?: string;
  /** 실행 중에는 못 바꾼다. */
  readonly disabled?: boolean;
}

const btn =
  'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** 장면 차례 한 줄 — 색점 + 자리 이름(또는 세부 카테고리). */
function SceneRow({
  frame,
  scenes,
}: {
  readonly frame: NarrativeFrameId;
  readonly scenes: readonly RecordScaffoldScene[];
}): React.JSX.Element {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {scenes.map((s, i) => (
        <li
          key={`${s.role}-${s.moduleId ?? s.label ?? i}`}
          className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-sp-muted"
        >
          <span className="font-semibold text-sp-text">{i + 1}</span>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${ROLE_DOT[s.role]}`} />
          <span>{sceneDisplayLabel(frame, s)}</span>
        </li>
      ))}
    </ol>
  );
}

export function ScaffoldPicker({
  frame,
  scaffolds,
  onScaffoldsChange,
  onApply,
  currentScenes,
  selectedId,
  disabled = false,
}: ScaffoldPickerProps): React.JSX.Element {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 예시 초안을 펼쳐 둔 내장 뼈대. 선생님은 이름이 아니라 **결과물**을 보고 고른다. */
  const [sampleFor, setSampleFor] = useState<string | null>(null);

  const choices = scaffoldChoices(builtInScaffolds(), scaffolds, frame);

  const spoken = (s: RecordScaffold): string =>
    `${s.name}. 장면 ${s.scenes.length}개. ${s.scenes
      .map(
        (sc, i) =>
          `${i + 1}번째 ${sceneDisplayLabel(frame, sc)}(${frameRoleLabel(frame, sc.role)})`,
      )
      .join(', ')}.`;

  const save = (): void => {
    if (currentScenes === undefined) return;
    const r = addScaffold(scaffolds, {
      name: savingName ?? '',
      frame,
      scenes: currentScenes,
      now: Date.now(),
    });
    if (!r.ok) {
      setError(r.error === undefined ? null : SCAFFOLD_ERROR_MESSAGES[r.error]);
      return;
    }
    onScaffoldsChange(r.scaffolds);
    setSavingName(null);
    setError(null);
  };

  const rename = (id: string): void => {
    const r = renameScaffold(scaffolds, id, renameText);
    if (!r.ok) {
      setError(r.error === undefined ? null : SCAFFOLD_ERROR_MESSAGES[r.error]);
      return;
    }
    onScaffoldsChange(r.scaffolds);
    setRenamingId(null);
    setError(null);
  };

  const remove = (id: string): void => {
    const r = removeScaffold(scaffolds, id);
    if (!r.ok) {
      setError(r.error === undefined ? null : SCAFFOLD_ERROR_MESSAGES[r.error]);
      return;
    }
    onScaffoldsChange(r.scaffolds);
    setRemovingId(null);
    setError(null);
  };

  return (
    <div data-testid="scaffold-picker" className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-sp-muted">
        뼈대는 <b className="text-sp-text">장면을 놓는 차례</b>입니다. 깔고 나서 지도의 장면 열에서
        자유롭게 옮기고 지울 수 있습니다.
      </p>

      <ul className="flex flex-col gap-1.5">
        {choices.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <li
              key={s.id}
              className={`rounded-xl px-3 py-2 ring-1 ${
                isSelected ? 'bg-sp-surface ring-sp-accent' : 'bg-sp-card ring-sp-border'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-sp-text">{s.name}</span>
                    {s.builtIn === true && (
                      <span className="shrink-0 rounded-full bg-sp-surface px-1.5 py-0.5 text-[11px] text-sp-muted ring-1 ring-sp-border">
                        기본
                      </span>
                    )}
                    {isSelected && (
                      <span className="shrink-0 text-[11px] font-semibold text-sp-accent">
                        지금 이 영역에 깔린 뼈대
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <SceneRow frame={frame} scenes={s.scenes} />
                  </div>
                  <span className="sr-only">{spoken(s)}</span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {confirmId === s.id ? (
                    <>
                      <span className="text-xs text-sp-muted">놓아 둔 근거의 자리가 바뀝니다.</span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onApply(s);
                          setConfirmId(null);
                        }}
                        className={`${btn} bg-sp-accent text-sp-accent-fg hover:opacity-90`}
                      >
                        깔기
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className={`${btn} text-sp-muted hover:bg-sp-surface`}
                      >
                        그만두기
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setConfirmId(s.id)}
                      className={`${btn} bg-sp-surface text-sp-text ring-1 ring-sp-border hover:bg-sp-card`}
                    >
                      이 뼈대 깔기
                    </button>
                  )}
                  {s.builtIn === true && confirmId !== s.id && (
                    <button
                      type="button"
                      onClick={() => setSampleFor((v) => (v === s.id ? null : s.id))}
                      aria-expanded={sampleFor === s.id}
                      className={`${btn} text-sp-muted hover:bg-sp-surface`}
                    >
                      예시 보기
                    </button>
                  )}
                  {s.builtIn !== true && confirmId !== s.id && (
                    <>
                      <button
                        type="button"
                        aria-label={`${s.name} 이름 바꾸기`}
                        onClick={() => {
                          setRenamingId(s.id);
                          setRenameText(s.name);
                          setError(null);
                        }}
                        className={`${btn} text-sp-muted hover:bg-sp-surface`}
                      >
                        이름
                      </button>
                      <button
                        type="button"
                        aria-label={`${s.name} 지우기`}
                        onClick={() => setRemovingId(s.id)}
                        className={`${btn} text-sp-muted hover:bg-sp-surface`}
                      >
                        지우기
                      </button>
                    </>
                  )}
                </div>
              </div>

              {renamingId === s.id && (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    aria-label="뼈대 이름"
                    className="min-w-0 flex-1 rounded-lg bg-sp-surface px-2 py-1 text-xs text-sp-text ring-1 ring-sp-border"
                  />
                  <button
                    type="button"
                    onClick={() => rename(s.id)}
                    className={`${btn} bg-sp-accent text-sp-accent-fg hover:opacity-90`}
                  >
                    바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className={`${btn} text-sp-muted hover:bg-sp-surface`}
                  >
                    그만두기
                  </button>
                </div>
              )}

              {sampleFor === s.id && s.builtIn === true && (
                <div className="mt-2">
                  <RecordStyleSamplePreview
                    focusId={s.id.slice('builtin:'.length) as RecordFocusId}
                  />
                </div>
              )}

              {removingId === s.id && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="flex-1 text-xs text-sp-muted">
                    지운 뼈대는 되돌릴 수 없습니다. 이미 깔아 둔 장면은 그대로 남습니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className={`${btn} bg-red-500 text-white hover:opacity-90`}
                  >
                    지우기
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemovingId(null)}
                    className={`${btn} text-sp-muted hover:bg-sp-surface`}
                  >
                    그만두기
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {currentScenes !== undefined && currentScenes.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-sp-border pt-2">
          {savingName === null ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setSavingName('');
                setError(null);
              }}
              className={`${btn} self-start text-sp-accent hover:bg-sp-surface`}
            >
              + 지금 배열을 내 뼈대로 저장
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={savingName}
                placeholder="뼈대 이름"
                onChange={(e) => setSavingName(e.target.value)}
                aria-label="새 뼈대 이름"
                className="min-w-0 flex-1 rounded-lg bg-sp-surface px-2 py-1 text-xs text-sp-text ring-1 ring-sp-border"
              />
              <button
                type="button"
                onClick={save}
                className={`${btn} bg-sp-accent text-sp-accent-fg hover:opacity-90`}
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavingName(null);
                  setError(null);
                }}
                className={`${btn} text-sp-muted hover:bg-sp-surface`}
              >
                그만두기
              </button>
            </div>
          )}
        </div>
      )}

      {error !== null && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
