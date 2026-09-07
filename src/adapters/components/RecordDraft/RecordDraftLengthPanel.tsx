/**
 * 「분량 조절」 섹션 — 오른쪽 AI 패널 안 접이식 블록(ADR-088).
 *
 * 설계: `docs/02-design/features/record-draft-length-adjustment.design.md` (디자인 협업 2026-09-07)
 *
 * ★조절 대상 글은 **누르는 순간** 등록부에서 새로 읽는다(`getSourceText`). 렌더 시점 스냅숏을
 *   쓰면 한도를 넘겨 저장이 거부된 글, 즉 정작 조절해야 할 글을 놓친다.
 * ★모달을 만들지 않는다. 되묻는 자리 두 곳도 이 카드 안 인라인 확인이다 - 유리 모드의
 *   backdrop-filter 가 화면 고정 요소를 가둔다.
 * ★`sp-*` 토큰에 Tailwind 투명도 수식을 붙이지 않는다(규칙이 생성되지 않아 배경이 투명해진다).
 */
import { useEffect, useRef, useState } from 'react';

import {
  clampTargetBytes,
  defaultTargetBytes,
  goalFloor,
  judgeLength,
  type LengthAdjustKind,
  type LengthVerdict,
} from '@domain/rules/recordLengthGoal';
import { neisByteLength, type RecordArea, type SchoolLevel } from '@domain/entities/RecordDraft';
import { aiDraftText } from '@domain/entities/RecordAiDraft';
import type { LengthAdjustCandidate } from '@adapters/components/RecordDraft/lengthAdjustRun';

const btn =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface';
const primaryBtn = 'rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg';
const dangerBtn =
  'rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20';
const chip = (on: boolean): string =>
  `rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
    on
      ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
      : 'text-sp-muted ring-sp-border hover:text-sp-text'
  }`;
const mode = (on: boolean): string =>
  `px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 ${
    on ? 'bg-sp-accent text-sp-accent-fg' : 'bg-sp-card text-sp-muted hover:text-sp-text'
  }`;

/** 실행 결과 한 벌 — 부모가 CLI 를 돌려 돌려준다. */
export interface LengthAdjustOutcome {
  readonly candidates: readonly LengthAdjustCandidate[];
  /** 조절 직전 원문(실명 그대로). [원문과 비교]의 왼쪽. */
  readonly sourceText: string;
  /** 본문에서 찾은 기재 금지 갈래. 비어 있지 않으면 **보내기 전에** 확인했어야 한다. */
  readonly sourceProhibited: readonly string[];
}

export interface RecordDraftLengthPanelProps {
  readonly area: RecordArea;
  readonly level: SchoolLevel;
  readonly areaLimit: number;
  readonly areaLimitVerified: boolean;
  /** ★누르는 시점에 등록부에서 새로 읽는다. 렌더 시점 스냅숏이 아니다. */
  readonly getSourceText: () => string;
  /** 보내기 전 확인용 — 지금 글에 기재 금지 항목이 있는지. 화면이 묻고, 지우지는 않는다. */
  readonly detectProhibited: (text: string) => readonly string[];
  readonly evidenceCount: number;
  readonly threadTitle?: string;
  /** "대상: …" 라벨. 없으면 직접 작성한 글로 본다. */
  readonly sourceVersionLabel?: string;
  /** 이 섹션이 시작하지 않은 다른 AI 작업이 도는 중인가. */
  readonly lockedByOther: boolean;
  /** 실행. 실패하면 사람이 읽을 문구를 담아 던진다. */
  readonly onRun: (kind: LengthAdjustKind, targetBytes: number) => Promise<LengthAdjustOutcome>;
  /** [이 글로 바꾸기] — 판으로 남기고 초안 칸에 반영한다. */
  readonly onApply: (
    picked: LengthAdjustCandidate,
    outcome: LengthAdjustOutcome,
    kind: LengthAdjustKind,
    targetBytes: number,
  ) => Promise<void>;
  /** [편집칸에 넣기(저장 안 함)] — 한도를 넘겨 저장할 수 없는 결과를 회수한다. */
  readonly onInsertOnly: (text: string) => void;
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirm-prohibited'; readonly categories: readonly string[] }
  | { readonly kind: 'running'; readonly attempt: 1 | 2 }
  | { readonly kind: 'result'; readonly outcome: LengthAdjustOutcome }
  | { readonly kind: 'failed'; readonly message: string };

export function RecordDraftLengthPanel({
  area,
  level,
  areaLimit,
  areaLimitVerified,
  getSourceText,
  detectProhibited,
  evidenceCount,
  threadTitle,
  sourceVersionLabel,
  lockedByOther,
  onRun,
  onApply,
  onInsertOnly,
}: RecordDraftLengthPanelProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LengthAdjustKind>('shrink');
  const [targetInput, setTargetInput] = useState(String(defaultTargetBytes(area, level)));
  const [clampedNotice, setClampedNotice] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [pickedAttempt, setPickedAttempt] = useState<1 | 2>(1);
  const [compareOn, setCompareOn] = useState(false);
  /** 반영 직전 "그 사이에 고치셨어요" 확인. */
  const [staleConfirm, setStaleConfirm] = useState<'apply' | 'insert' | null>(null);
  /** ★중복 실행 잠금은 참조로 한다. 상태로 하면 빠르게 두 번 눌렀을 때 둘 다 통과한다. */
  const busyRef = useRef(false);

  const sourceText = getSourceText();
  const sourceBytes = neisByteLength(sourceText);
  const empty = sourceText.trim().length === 0;
  const targetBytes = clampTargetBytes(Number(targetInput), area, level);

  const result = stage.kind === 'result' ? stage.outcome : null;
  const picked =
    result?.candidates.find((c) => c.attempt === pickedAttempt) ?? result?.candidates[0] ?? null;
  const resultText = picked ? aiDraftText({ paragraphs: picked.paragraphs }) : '';
  const verdict: LengthVerdict | null = picked
    ? judgeLength({ bytes: picked.bytes, targetBytes, area, level })
    : null;

  // 한도를 넘긴 결과가 나오면 접혀 있어도 펼친다 — 조용히 실패하는 화면을 만들지 않는다.
  useEffect(() => {
    if (verdict === 'over-limit') setOpen(true);
  }, [verdict]);

  const byteCls =
    areaLimitVerified && sourceBytes > areaLimit
      ? 'text-red-500'
      : sourceBytes / Math.max(1, areaLimit) > 0.8
        ? 'text-amber-500'
        : 'text-sp-muted';

  const execute = async (k: LengthAdjustKind, t: number): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStage({ kind: 'running', attempt: 1 });
    setCompareOn(false);
    try {
      const outcome = await onRun(k, t);
      setPickedAttempt(outcome.candidates.length >= 2 ? 2 : 1);
      const text = outcome.candidates[outcome.candidates.length - 1];
      // 원문이 그대로 돌아온 경우 — 원인을 모르므로 추측하지 않고 사실만 말한다.
      if (
        text &&
        aiDraftText({ paragraphs: text.paragraphs }).trim() === outcome.sourceText.trim()
      ) {
        setStage({ kind: 'failed', message: '분량이 바뀌지 않았어요.' });
        return;
      }
      setStage({ kind: 'result', outcome });
    } catch (err: unknown) {
      setStage({
        kind: 'failed',
        message:
          typeof err === 'string'
            ? err
            : err instanceof Error && err.message.trim().length > 0
              ? err.message
              : '조절하지 못했어요. 다시 시도해 주세요.',
      });
    } finally {
      // ★반드시 여기서 푼다. 안 풀면 이 섹션이 영영 잠긴다.
      busyRef.current = false;
    }
  };

  /** [조절안 만들기] — 기재 금지 항목이 있으면 **보내기 전에** 한 번 묻는다. */
  const runOrConfirm = (): void => {
    const categories = detectProhibited(getSourceText());
    if (categories.length > 0) {
      setStage({ kind: 'confirm-prohibited', categories });
      return;
    }
    void execute(kind, targetBytes);
  };

  /** 반영 직전 게이트 — 조절을 시작한 뒤 글이 바뀌었으면 바로 덮지 않는다. */
  const guarded = (what: 'apply' | 'insert'): void => {
    if (!result || !picked) return;
    if (getSourceText().trim() !== result.sourceText.trim()) {
      setStaleConfirm(what);
      return;
    }
    void proceed(what);
  };

  const proceed = async (what: 'apply' | 'insert'): Promise<void> => {
    if (!result || !picked) return;
    setStaleConfirm(null);
    if (what === 'insert') {
      onInsertOnly(resultText);
      return;
    }
    try {
      await onApply(picked, result, kind, targetBytes);
    } catch (err: unknown) {
      setStage({
        kind: 'failed',
        message:
          err instanceof Error && err.message.trim().length > 0
            ? `반영하지 못했습니다: ${err.message}`
            : '반영하지 못했습니다. 글은 그대로입니다.',
      });
    }
  };

  const preview = (text: string): JSX.Element => (
    <p
      className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text"
      data-testid="length-adjust-preview"
    >
      {text}
    </p>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sp-border bg-sp-bg p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="length-panel-body"
        className="flex w-full items-center gap-1.5 text-left text-xs text-sp-muted transition-colors hover:text-sp-text"
      >
        <span
          className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
        <span className="material-symbols-outlined text-sm">straighten</span>
        <span className="text-sm font-semibold text-sp-text">분량 조절</span>
        {!empty && (
          <span className="ml-auto text-xs text-sp-muted">
            대상: {sourceVersionLabel ?? '직접 작성한 글'}
          </span>
        )}
      </button>

      {open && (
        <div id="length-panel-body" className="flex flex-col gap-2">
          {empty ? (
            <p className="px-1 text-xs leading-relaxed text-sp-muted">
              이 칸에 쓴 글이 없어서 분량을 조절할 수 없어요. 먼저 글을 쓰거나 AI 초안을 받아
              주세요.
            </p>
          ) : stage.kind === 'running' ? (
            <p
              className="flex items-center gap-1.5 text-sm text-sp-muted"
              role="status"
              aria-live="polite"
            >
              <span className="material-symbols-outlined animate-spin text-base">
                progress_activity
              </span>
              {stage.attempt === 1
                ? '1차 조절 중이에요. 1~2분 걸릴 수 있어요.'
                : '목표에 못 미쳐 자동으로 다시 조절하고 있어요.'}
            </p>
          ) : stage.kind === 'failed' ? (
            <div
              className="flex items-center gap-2 rounded-lg bg-sp-card px-3 py-2"
              role="status"
              aria-live="polite"
            >
              <span className="material-symbols-outlined text-sm text-sp-muted">error_outline</span>
              <p className="flex-1 text-xs leading-relaxed text-sp-muted">{stage.message}</p>
              <button
                type="button"
                onClick={() => setStage({ kind: 'idle' })}
                className={`shrink-0 bg-sp-bg text-sp-accent ${btn}`}
              >
                다시 시도
              </button>
            </div>
          ) : stage.kind === 'confirm-prohibited' ? (
            <div
              className="flex flex-col gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/20"
              role="alert"
            >
              <p className="flex items-start gap-1 text-xs leading-relaxed text-red-500">
                <span className="material-symbols-outlined text-sm">warning</span>
                기재 금지 항목({stage.categories.join(', ')})이 들어 있는 문장이 함께 나갑니다. 먼저
                지우시겠어요?
              </p>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setStage({ kind: 'idle' })}
                  className={`${btn} bg-sp-card text-sp-text`}
                >
                  먼저 지우러 가기
                </button>
                <button
                  type="button"
                  onClick={() => void execute(kind, targetBytes)}
                  className={dangerBtn}
                >
                  그대로 보내기
                </button>
              </div>
            </div>
          ) : result && picked && verdict ? (
            <div className="flex flex-col gap-2" role="status" aria-live="polite">
              {result.candidates.length >= 2 && (
                <div
                  className="flex flex-wrap items-center gap-1"
                  role="tablist"
                  aria-label="분량 조절 결과"
                >
                  <span className="text-xs text-sp-muted">결과</span>
                  {result.candidates.map((c) => (
                    <button
                      key={c.attempt}
                      type="button"
                      role="tab"
                      aria-selected={pickedAttempt === c.attempt}
                      onClick={() => setPickedAttempt(c.attempt)}
                      className={chip(pickedAttempt === c.attempt)}
                    >
                      {c.attempt}차 {c.bytes.toLocaleString()}B
                    </button>
                  ))}
                </div>
              )}

              <p className="text-sm font-semibold text-sp-text">
                {sourceBytes.toLocaleString()} 에서 {picked.bytes.toLocaleString()}바이트 ·{' '}
                {verdict === 'over-goal'
                  ? `목표보다 ${(picked.bytes - targetBytes).toLocaleString()}바이트 많음`
                  : verdict === 'under-goal'
                    ? `목표보다 ${(goalFloor(targetBytes) - picked.bytes).toLocaleString()}바이트 적음`
                    : `${Math.abs(sourceBytes - picked.bytes).toLocaleString()}바이트 ${picked.bytes < sourceBytes ? '줄임' : '늘림'}`}
              </p>

              {picked.insufficient && (
                <p className="flex items-center gap-1 text-xs text-sp-muted">
                  <span className="material-symbols-outlined text-sm">info</span>
                  근거가 부족해 목표보다 짧게 작성했어요.
                </p>
              )}
              {kind === 'expand' && picked.excluded.length > 0 && (
                <p className="text-xs text-sp-muted">
                  근거 {picked.includedCount}건 사용 · {picked.excluded}
                </p>
              )}

              {compareOn ? (
                <div className="flex flex-col gap-2" aria-label="원문과 비교">
                  <p className="text-xs font-semibold text-sp-muted">
                    원문 ({sourceBytes.toLocaleString()}B)
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
                    {result.sourceText}
                  </p>
                  <p className="text-xs font-semibold text-sp-muted">
                    조절안 ({picked.bytes.toLocaleString()}B)
                  </p>
                  <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
                    {resultText}
                  </p>
                </div>
              ) : (
                preview(resultText)
              )}

              {verdict === 'over-limit' && (
                <p className="flex items-center gap-1 text-xs text-red-500">
                  <span className="material-symbols-outlined text-sm">error</span>
                  저장하려면 {(picked.bytes - areaLimit).toLocaleString()}바이트를 더 줄여야 해요.
                </p>
              )}

              {staleConfirm !== null ? (
                <div
                  className="flex flex-col gap-2 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/20"
                  role="alert"
                >
                  <p className="text-xs text-amber-600">그 사이에 글을 고치셨어요.</p>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setStaleConfirm(null);
                        setStage({ kind: 'idle' });
                        void execute(kind, targetBytes);
                      }}
                      className={primaryBtn}
                    >
                      최신 글로 다시 조절
                    </button>
                    <button
                      type="button"
                      onClick={() => void proceed(staleConfirm)}
                      className={`bg-sp-card text-sp-text ${btn}`}
                    >
                      {staleConfirm === 'insert' ? '그래도 편집칸에 넣기' : '그래도 이 글로 바꾸기'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCompareOn((v) => !v)}
                    aria-pressed={compareOn}
                    className={`bg-sp-card text-sp-text ${btn}`}
                  >
                    {compareOn ? '비교 닫기' : '원문과 비교'}
                  </button>
                  {verdict === 'over-limit' ? (
                    <button
                      type="button"
                      onClick={() => guarded('insert')}
                      className={`ml-auto ${primaryBtn}`}
                    >
                      편집칸에 넣기(저장 안 함)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => guarded('apply')}
                      className={`ml-auto ${primaryBtn}`}
                    >
                      이 글로 바꾸기
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <fieldset disabled={lockedByOther} className="contents">
                <div className="flex items-center justify-between text-xs">
                  <span className={byteCls}>현재 {sourceBytes.toLocaleString()}바이트</span>
                  <span className="text-sp-muted">
                    영역 한도 {areaLimit.toLocaleString()}바이트
                  </span>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-sp-text">
                  목표 분량
                  <input
                    type="number"
                    inputMode="numeric"
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    onBlur={() => {
                      const next = clampTargetBytes(Number(targetInput), area, level);
                      setClampedNotice(next !== Number(targetInput));
                      setTargetInput(String(next));
                    }}
                    aria-label="목표 분량(바이트)"
                    className="w-20 rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-center text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                  />
                  <span className="text-sp-muted">바이트</span>
                </label>
                {clampedNotice && (
                  <p className="text-xs text-sp-muted">
                    이 영역 한도는 {areaLimit.toLocaleString()}바이트예요.
                  </p>
                )}
                {!areaLimitVerified && (
                  <p className="text-xs text-sp-muted">한도 수치는 확인 중이에요.</p>
                )}

                <div
                  className="inline-flex w-fit overflow-hidden rounded-lg ring-1 ring-sp-border"
                  role="radiogroup"
                  aria-label="분량 조절 방향"
                >
                  <button
                    type="button"
                    onClick={() => setKind('shrink')}
                    aria-pressed={kind === 'shrink'}
                    className={mode(kind === 'shrink')}
                  >
                    줄이기
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind('expand')}
                    aria-pressed={kind === 'expand'}
                    disabled={evidenceCount === 0}
                    className={mode(kind === 'expand')}
                  >
                    근거로 보충하기
                  </button>
                </div>

                {kind === 'expand' && (
                  <p className="text-xs text-sp-muted">
                    주제: {threadTitle ?? '전체 근거'}
                    {threadTitle !== undefined && ' (조절 대상 판 기준)'}
                  </p>
                )}
                {kind !== 'expand' && evidenceCount === 0 && (
                  <p className="text-xs leading-relaxed text-sp-muted">
                    이 영역에 쓸 근거가 없어서 보충할 수 없어요. 근거 정리 보드에서 먼저 모아
                    주세요.
                  </p>
                )}

                <p className="text-xs leading-relaxed text-sp-muted">
                  {kind === 'shrink'
                    ? '핵심 활동과 교사 평가를 유지하며 줄입니다.'
                    : '빠진 과정과 결과를 근거 자료로 채우고, 새로운 내용은 지어내지 않습니다.'}
                </p>

                <button
                  type="button"
                  onClick={runOrConfirm}
                  className={`w-fit self-end ${primaryBtn}`}
                >
                  조절안 만들기
                </button>
              </fieldset>
              {lockedByOther && (
                <p className="text-xs text-sp-muted">다른 AI 작업이 끝나면 이어서 할 수 있어요.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
