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
import { useCallback, useEffect, useRef, useState } from 'react';

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
import { useRecordAiRunStore, type LengthRunStage } from '@adapters/stores/useRecordAiRunStore';

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
/** 실행 결과 한 벌 — 부모가 CLI 를 돌려 돌려준다. */
export interface LengthAdjustOutcome {
  readonly candidates: readonly LengthAdjustCandidate[];
  /** 조절 직전 원문(실명 그대로). [원문과 비교]의 왼쪽. */
  readonly sourceText: string;
  /** 본문에서 찾은 기재 금지 갈래. 비어 있지 않으면 **보내기 전에** 확인했어야 한다. */
  readonly sourceProhibited: readonly string[];
}

export interface RecordDraftLengthPanelProps {
  /**
   * 이 조절의 실행 키 = 행의 3축 키(`studentRef:area:subject`). 단계·결과는 이 키로 **스토어**에 남는다(ADR-093 결정 3).
   * 학생을 바꿨다 돌아와도 결과가 있고, 다른 학생 화면에는 보이지 않는다.
   */
  readonly runKey: string;
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
  /** [중단] — 진행 중 왕복을 멈춘다(R-6). 없으면 단추를 그리지 않는다. */
  readonly onCancel?: () => void;
}

/**
 * 단계 — 스토어의 모양 그대로(`LengthRunStage`). `failed.detail` 은 AI 가 초안 대신 보낸 설명문(R-3) —
 * 저장 후보가 아니라 읽을거리로만 보여 준다.
 */
type Stage = LengthRunStage;
const IDLE_STAGE: Stage = { kind: 'idle' };

export function RecordDraftLengthPanel({
  runKey,
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
  onCancel,
}: RecordDraftLengthPanelProps) {
  const [open, setOpen] = useState(false);
  const [targetInput, setTargetInput] = useState(String(defaultTargetBytes(area, level)));
  const [clampedNotice, setClampedNotice] = useState(false);
  /**
   * 단계는 스토어가 든다(ADR-093 결정 3, ADR-088 결정 7 이행). 이 패널은 학생이 바뀌면 새로 만들어지는데,
   * 단계가 인스턴스에 있으면 결과가 사라지고 실행 중 바꾸면 결과가 소리 없이 버려진다(P7).
   */
  const storeStage = useRecordAiRunStore((s) => s.length[runKey]);
  const stage: Stage = storeStage ?? IDLE_STAGE;
  const setLengthStage = useRecordAiRunStore((s) => s.setLengthStage);
  const setStage = useCallback(
    (next: Stage): void => setLengthStage(runKey, next),
    [setLengthStage, runKey],
  );
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
  /**
   * 방향은 고르지 않는다(2026-09-08 오너 결정). 대상 글이 목표보다 길면 줄이고, 짧으면 근거로 채운다.
   * 선생님이 정하는 건 목표 바이트 하나다 — "줄이기/보충하기"를 따로 고르게 하면 짧은 학생에게
   * 줄이기가 켜진 채 남는 일이 생겼다.
   */
  const kind: LengthAdjustKind = sourceBytes > targetBytes ? 'shrink' : 'expand';
  const gap = sourceBytes - targetBytes;
  /** 이미 목표 안(하한~목표)이면 조절할 것이 없다. */
  const alreadyOnTarget =
    !empty && sourceBytes <= targetBytes && sourceBytes >= goalFloor(targetBytes);
  /** 채워야 하는데 근거가 없으면 지어내기를 부르는 자리다 — 실행을 잠근다. */
  const cannotExpand = kind === 'expand' && evidenceCount === 0;
  const canRun = !empty && !alreadyOnTarget && !cannotExpand;

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
  // ★조절 **대상**이 이미 한도를 넘었을 때도 펼친다(2026-09-08 R-4). AI 초안이 1,507B 로 나와
  //   [바꾸기]가 거부된 순간이 바로 이 섹션을 써야 할 때인데, 접힌 채라 선생님이 찾지 못했다.
  const sourceOverLimit = areaLimitVerified && !empty && sourceBytes > areaLimit;
  useEffect(() => {
    if (sourceOverLimit) setOpen(true);
  }, [sourceOverLimit]);

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
      const raw = await onRun(k, t);
      // ★설명문(거절·되묻기)은 저장 후보에서 뺀다(R-3). 전부 설명문이면 실패로 말하고 그 글은
      //   읽을거리로만 보여 준다 — 편집칸에 넣을 길을 남기지 않는다.
      const usable = raw.candidates.filter((c) => !c.nonDraft);
      if (usable.length === 0) {
        const last = raw.candidates[raw.candidates.length - 1];
        setStage({
          kind: 'failed',
          message: `${last?.nonDraftReason ?? 'AI가 초안 대신 설명을 보냈어요.'} 원문은 그대로예요. 근거를 더 넣거나 목표를 바꿔 다시 시도해 보세요.`,
          ...(last ? { detail: aiDraftText({ paragraphs: last.paragraphs }) } : {}),
        });
        return;
      }
      const outcome: LengthAdjustOutcome = { ...raw, candidates: usable };
      setPickedAttempt(usable[usable.length - 1]?.attempt ?? 1);
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
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className={`ml-auto bg-sp-card text-sp-text ${btn}`}
                >
                  중단
                </button>
              )}
            </p>
          ) : stage.kind === 'failed' ? (
            <div
              className="flex flex-col gap-2 rounded-lg bg-sp-card px-3 py-2"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-sp-muted">
                  error_outline
                </span>
                <p className="flex-1 text-xs leading-relaxed text-sp-muted">{stage.message}</p>
                <button
                  type="button"
                  onClick={() => setStage({ kind: 'idle' })}
                  className={`shrink-0 bg-sp-bg text-sp-accent ${btn}`}
                >
                  다시 시도
                </button>
              </div>
              {stage.detail !== undefined && (
                <details className="text-xs text-sp-muted">
                  <summary className="cursor-pointer">AI가 보낸 설명 보기</summary>
                  <p
                    className="mt-1 whitespace-pre-wrap rounded-lg bg-sp-bg px-2 py-1.5 leading-relaxed"
                    data-testid="length-adjust-non-draft"
                  >
                    {stage.detail}
                  </p>
                </details>
              )}
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
                {/* 어느 글의 몇 바이트인지 한 줄로 — 판 미리보기 머리의 숫자와 같은 함수·같은 본문이다. */}
                <div className="flex items-center justify-between text-xs">
                  <span className={byteCls} data-testid="length-adjust-source-bytes">
                    {sourceVersionLabel ?? '직접 작성한 글'} {sourceBytes.toLocaleString()}바이트
                  </span>
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

                {/* 방향은 목표가 정한다 — 무엇을 할지 한 줄로 말하고, 못 할 때는 왜 못 하는지 말한다. */}
                <p
                  className="text-xs leading-relaxed text-sp-muted"
                  data-testid="length-adjust-plan"
                >
                  {alreadyOnTarget
                    ? '이미 목표 안이에요. 목표를 바꾸면 그에 맞춰 조절합니다.'
                    : kind === 'shrink'
                      ? `목표보다 ${gap.toLocaleString()}바이트 많아 줄입니다. 핵심 활동과 교사 평가는 그대로 두고 덜 중요한 문장부터 뺍니다.`
                      : cannotExpand
                        ? `목표보다 ${(-gap).toLocaleString()}바이트 적지만 이 영역에 쓸 근거가 없어서 채울 수 없어요. 근거 정리 보드에서 먼저 모아 주세요.`
                        : `목표보다 ${(-gap).toLocaleString()}바이트 적어 근거 자료로 채웁니다. 새로운 내용은 지어내지 않습니다.`}
                </p>
                {kind === 'expand' && !cannotExpand && !alreadyOnTarget && (
                  <p className="text-xs text-sp-muted">
                    주제: {threadTitle ?? '전체 근거'}
                    {threadTitle !== undefined && ' (조절 대상 판 기준)'}
                  </p>
                )}

                <button
                  type="button"
                  onClick={runOrConfirm}
                  disabled={!canRun}
                  className={`w-fit self-end ${primaryBtn} disabled:opacity-40`}
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
