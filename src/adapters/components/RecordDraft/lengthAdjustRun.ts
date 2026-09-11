/**
 * 분량 조절 **실행 흐름**(ADR-088) — 화면 그림이 아니라 "무엇을 어떤 순서로 하는가"만 담는다.
 *
 * 왜 따로 두나: 조절은 CLI 왕복 · 별칭 되돌리기 · 표식 떼기 · **앱이 직접 세기** · 자동 재조정
 * 1회까지 이어지는 긴 흐름이다. 이걸 화면 파일 안에 두면 결과 표시 코드와 뒤엉켜 어느 쪽을
 * 고쳐도 다른 쪽이 깨진다.
 *
 * ★원칙 1: **모델이 센 숫자를 믿지 않는다.** 판정은 언제나 최종 저장 본문으로 앱이 다시 센다.
 * ★원칙 4: **못 맞추면 정직하게 말한다.** 자동 재조정은 **1회뿐**이고, 그래도 안 맞으면 실제
 *   수치를 보여 준다. 문자열 끝을 강제로 자르지 않고, 무한히 다시 부르지도 않는다.
 * ★근거 부족(`[근거 부족]` 표식)으로 짧게 나온 답은 **재조정 대상이 아니다.** 다시 물어도
 *   없는 근거가 생기지 않는다. 한 번 더 부르면 지어내라고 떠미는 셈이다.
 */
import { aiDraftText, type RecordAiDraftAdjust } from '@domain/entities/RecordAiDraft';
import { neisByteLength } from '@domain/entities/RecordDraft';
import {
  dropUnmarkedParagraphs,
  markedNarrativeText,
  parseNarrativeParagraphs,
  type NarrativeParagraph,
} from '@domain/rules/narrativeParagraphs';
import { stripInsufficientMark, type LengthAdjustKind } from '@domain/rules/recordLengthGoal';
import type { KeywordGroup } from '@domain/privacy/types';
import { judgeNonDraftReply } from '@domain/rules/nonDraftReply';
import {
  buildLengthAdjustPack,
  summarizeExclusions,
  type LengthAdjustPackInput,
} from '@domain/services/recordDraftPack';
import { restoreModelText } from '@domain/rules/redactOutbound';
import { askOnce, type OwnAiRunApi } from '@adapters/components/RecordDraft/ownAiRun';

/** 한 번 왕복해서 얻은 결과 한 편. 아직 디스크에 가지 않았다. */
export interface LengthAdjustCandidate {
  /** 몇 번째 왕복인가. 1 = 첫 시도, 2 = 자동 재조정. */
  readonly attempt: 1 | 2;
  /** 실명 복원·표식 분리가 끝난 문단들. 저장할 때 그대로 쓴다. */
  readonly paragraphs: readonly NarrativeParagraph[];
  /** ★앱이 최종 본문으로 **직접 센** 바이트. 모델이 말한 숫자가 아니다. */
  readonly bytes: number;
  /** 모델이 "근거가 모자랐다"고 알렸는가. */
  readonly insufficient: boolean;
  /** "제외됨 N건 (…)" 요약. 빠진 게 없으면 빈 문자열. */
  readonly excluded: string;
  /** 실제로 실린 근거 수(화면이 "근거 6건 사용"을 적는다). */
  readonly includedCount: number;
  /**
   * 초안이 아니라 설명(거절·되묻기·목록)이 돌아왔는가(2026-09-08 R-3). 참이면 화면은 이 후보를
   * **저장 후보로 내놓지 않는다** — [이 글로 바꾸기]도 [편집칸에 넣기]도 없이 사유만 보여 준다.
   */
  readonly nonDraft: boolean;
  /** `nonDraft` 일 때 사람이 읽을 이유. 아니면 빈 문자열. */
  readonly nonDraftReason: string;
}

export interface LengthAdjustRunResult {
  readonly candidates: readonly LengthAdjustCandidate[];
  /** 조절 직전 원문(실명 그대로). 판에 스냅숏으로 남고 [원문과 비교]가 쓴다. */
  readonly sourceText: string;
  /** 조절 대상 본문에서 찾은 기재 금지 갈래. 비어 있지 않으면 화면이 보내기 전에 물었어야 한다. */
  readonly sourceProhibited: readonly string[];
}

/** 2차 시도의 계획 — 무엇을(1차 글 / 원문) 어느 방향으로 다시 조절할지. */
export interface RetryPlan {
  readonly kind: LengthAdjustKind;
  /** `first` = 1차 결과에서 이어 조절한다. `source` = 원문으로 돌아가 다시 조절한다. */
  readonly from: 'first' | 'source';
  /** 원문으로 돌아갈 때 모델에게 알려 줄 직전 결과(최종 본문 바이트). */
  readonly previousBytes?: number;
}

/**
 * 1차가 목표를 빗나갔을 때 2차를 **무엇에서 어느 방향으로** 할지(ADR-110).
 *
 * ★예전에는 늘 원문으로 돌아가 목표를 반대로 밀었다(1,610 이면 1,390, 1,300 이면 1,625 를 목표로). 그러면
 *   모자랐던 채우기와 너무 많이 뺀 줄이기가 **한도 위 목표**(1,625)를 받아 한도를 넘겼고, 넘친 줄이기는
 *   원문 전체를 다시 줄이느라 또 빗나갔다.
 * ★이제는 목표를 선생님이 고른 값 그대로 두고 **1차 결과에서 이어 간다** — 넘쳤으면 1차 글을 마저 줄이고,
 *   채우다 모자랐으면 1차 글을 마저 채운다. 남은 차이만 고치면 되니 맞히기 쉽다.
 * ★줄이다 너무 많이 뺐으면 원문으로 돌아가 "지난번엔 N바이트였다"를 알린다. 1차 글을 채우려면 근거가 있어야 하는데
 *   줄이기는 근거를 싣지 않는다.
 */
export function planRetry(input: {
  readonly kind: LengthAdjustKind;
  readonly firstBytes: number;
  readonly targetBytes: number;
}): RetryPlan {
  if (input.firstBytes > input.targetBytes) return { kind: 'shrink', from: 'first' };
  if (input.kind === 'expand') return { kind: 'expand', from: 'first' };
  return { kind: 'shrink', from: 'source', previousBytes: input.firstBytes };
}

/**
 * 답 한 편을 **저장할 모양 그대로** 만든 뒤 바이트를 센다.
 *
 * 순서를 지켜야 한다: 별칭 복원 → `[근거 부족]` 표식 떼기 → 문단 표식 분리 → 본문 조립 → 세기.
 * ★문단 파서는 아는 낱말(`[동기]` 등)만 표식으로 보므로 `[근거 부족]` 은 저절로 안 떨어진다.
 *   순서를 바꾸면 그 표식이 생기부 본문에 그대로 들어간다.
 */
export function measureAnswer(
  raw: string,
  mappings: Parameters<typeof restoreModelText>[1],
): {
  paragraphs: readonly NarrativeParagraph[];
  bytes: number;
  insufficient: boolean;
  nonDraft: boolean;
  nonDraftReason: string;
} {
  const restored = restoreModelText(raw, mappings);
  const { text, insufficient } = stripInsufficientMark(restored);
  // ★표식 없는 설명 줄("줄인 글입니다" 등)은 버린다 — 초안 쓰기와 같은 규칙(ADR-099 보강 5). 안 버리면 그 줄이
  //   분량에 섞여 목표를 빗나간 것처럼 보이고 생기부 본문에도 들어간다. 표식이 하나도 없으면 아무것도 안 버린다.
  const paragraphs = dropUnmarkedParagraphs(parseNarrativeParagraphs(text));
  // 거절·되묻기 설명문은 초안이 아니다 — 저장 후보로 세지 않는다(R-3).
  const verdict = judgeNonDraftReply(text);
  // ★저장될 본문 그대로 센다(`aiDraftText` = 문단을 공백 하나로 이은 것). 프롬프트 길이가 아니다.
  return {
    paragraphs,
    bytes: neisByteLength(aiDraftText({ paragraphs })),
    insufficient,
    nonDraft: verdict.nonDraft,
    nonDraftReason: verdict.reason,
  };
}

export interface LengthAdjustRunInput {
  readonly api: OwnAiRunApi;
  readonly provider: 'claude' | 'codex';
  /** 규정 지시문(1층). ★없으면 부르는 쪽이 실행하지 않는다 - 조절도 같은 게이트를 받는다. */
  readonly systemPrompt: string;
  /** 꾸러미 재료. `targetBytes` 는 재조정 때 이 함수가 바꿔 다시 조립한다. */
  readonly pack: LengthAdjustPackInput;
  /** 목표 하한(최종 본문 기준). 판정에 쓴다. */
  readonly floorBytes: number;
  /** 각 왕복 전에 화면에 알린다(진행 문구). */
  readonly onAttempt?: (attempt: 1 | 2) => void;
  /** [중단]. abort 되면 진행 중 왕복이 `cancelled` 로 거절된다(R-6). */
  readonly signal?: AbortSignal;
}

/**
 * 조절을 실행한다. 목표를 벗어나면 **최대 한 번** 다시 묻는다.
 *
 * ★재조정도 **같은 조립 함수를 원문으로 다시** 지난다. 이미 가린 문자열을 재사용하지 않는다 -
 *   그렇게 하면 첫 회만 안전한 기능이 된다(이음매 게이트가 이걸 본다).
 */
export async function runLengthAdjust(input: LengthAdjustRunInput): Promise<LengthAdjustRunResult> {
  const { api, provider, systemPrompt, pack, floorBytes, onAttempt, signal } = input;
  const candidates: LengthAdjustCandidate[] = [];

  onAttempt?.(1);
  const first = buildLengthAdjustPack(pack);
  const firstRaw = await askOnce(api, provider, first.text, systemPrompt, signal);
  const firstOut = measureAnswer(firstRaw, first.mappings);
  candidates.push({
    attempt: 1,
    paragraphs: firstOut.paragraphs,
    bytes: firstOut.bytes,
    insufficient: firstOut.insufficient,
    excluded: summarizeExclusions(first.exclusions),
    includedCount: first.includedCount,
    nonDraft: firstOut.nonDraft,
    nonDraftReason: firstOut.nonDraftReason,
  });

  const onTarget = firstOut.bytes <= pack.targetBytes && firstOut.bytes >= floorBytes;
  // ★근거 부족은 재조정에서 제외한다. 다시 물어도 없는 근거가 생기지 않는다.
  // ★설명문(거절)도 재조정하지 않는다 — 같은 원문으로 다시 물으면 같은 거절이 온다(R-3).
  if (onTarget || firstOut.insufficient || firstOut.nonDraft) {
    return {
      candidates,
      sourceText: pack.sourceText,
      sourceProhibited: first.sourceProhibited,
    };
  }

  onAttempt?.(2);
  const plan = planRetry({
    kind: pack.kind,
    firstBytes: firstOut.bytes,
    targetBytes: pack.targetBytes,
  });
  const second = buildLengthAdjustPack({
    ...pack,
    kind: plan.kind,
    // ★1차 글에서 이어 갈 때도 **실명 본문**을 같은 조립 함수로 다시 가린다 — 가린 문자열을 재사용하지 않는다.
    //   표식을 붙여 보내 문단 역할(형광펜 색)을 지킨다. 목표는 선생님이 고른 값 그대로다.
    sourceText: plan.from === 'first' ? markedNarrativeText(firstOut.paragraphs) : pack.sourceText,
    ...(plan.previousBytes !== undefined ? { previousBytes: plan.previousBytes } : {}),
  });
  const secondRaw = await askOnce(api, provider, second.text, systemPrompt, signal);
  const secondOut = measureAnswer(secondRaw, second.mappings);
  candidates.push({
    attempt: 2,
    paragraphs: secondOut.paragraphs,
    bytes: secondOut.bytes,
    insufficient: secondOut.insufficient,
    excluded: summarizeExclusions(second.exclusions),
    includedCount: second.includedCount,
    nonDraft: secondOut.nonDraft,
    nonDraftReason: secondOut.nonDraftReason,
  });

  return { candidates, sourceText: pack.sourceText, sourceProhibited: first.sourceProhibited };
}

/** 고른 후보를 판으로 남길 때 붙일 조절 내역. */
export function adjustRecordOf(input: {
  readonly kind: 'shrink' | 'expand';
  readonly targetBytes: number;
  readonly sourceText: string;
  readonly sourceVersionId?: string;
  readonly candidates: readonly LengthAdjustCandidate[];
  readonly picked: LengthAdjustCandidate;
}): RecordAiDraftAdjust {
  return {
    kind: input.kind,
    targetBytes: input.targetBytes,
    sourceText: input.sourceText,
    resultBytes: input.picked.bytes,
    // ★실제 왕복 횟수와 "고른 쪽"은 다른 값이다. 뭉개면 두 번 돈 사실이 기록에서 사라진다.
    attempts: input.candidates.length >= 2 ? 2 : 1,
    pickedAttempt: input.picked.attempt,
    ...(input.sourceVersionId !== undefined ? { sourceVersionId: input.sourceVersionId } : {}),
  };
}

/** 초안을 쓴 직후 자동으로 한 번 줄인 결과. 아직 디스크에 가지 않았다. */
export interface DraftShrinkResult {
  readonly paragraphs: readonly NarrativeParagraph[];
  /** ★앱이 저장될 본문으로 **직접 센** 바이트. */
  readonly bytes: number;
}

export interface DraftShrinkInput {
  readonly api: OwnAiRunApi;
  readonly provider: 'claude' | 'codex';
  /** 규정 지시문(1층) — 초안을 쓸 때 받은 것을 그대로 쓴다. */
  readonly systemPrompt: string;
  readonly signal?: AbortSignal;
  /** 학생 **실명**. 조립 함수가 가린다. */
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  readonly areaLabel: string;
  readonly threadTitle?: string;
  /** 방금 쓴 초안(실명 복원·표식 분리가 끝난 문단). */
  readonly paragraphs: readonly NarrativeParagraph[];
  /** 선생님이 고른 분량 목표(최종 본문 기준). */
  readonly targetBytes: number;
}

/**
 * 초안을 쓴 직후 **한 번만** 줄인다(ADR-110). 분량 조절의 줄이기 꾸러미를 그대로 쓴다 — 가리기·표식 지시·
 * "몇 문장을 빼라"가 분량 조절과 같아야 한다.
 *
 * ★문단 역할(형광펜 색)을 지키려고 표식을 붙여 보낸다. 분량은 꾸러미가 표식을 뗀 본문으로 센다.
 * ★기재 금지 확인은 묻지 않는다 — 보내는 글은 방금 그 모델이 쓴 초안이라 새로 나가는 선생님 자료가 없다.
 * ★다시 묻지 않는다. 초안 한 번 + 줄이기 한 번이면 이미 2~4분이다. 더 줄이는 것은 「분량 조절」의 몫이다.
 * ★설명문이 오거나 줄지 않았으면 `null` — 부르는 쪽은 처음 초안을 그대로 쓴다. 실행 실패는 던진다.
 */
export async function shrinkDraftOnce(input: DraftShrinkInput): Promise<DraftShrinkResult | null> {
  const fromBytes = neisByteLength(aiDraftText({ paragraphs: input.paragraphs }));
  const pack = buildLengthAdjustPack({
    kind: 'shrink',
    studentName: input.studentName,
    roster: input.roster,
    areaLabel: input.areaLabel,
    ...(input.threadTitle !== undefined ? { threadTitle: input.threadTitle } : {}),
    sourceText: markedNarrativeText(input.paragraphs),
    targetBytes: input.targetBytes,
  });
  const raw = await askOnce(input.api, input.provider, pack.text, input.systemPrompt, input.signal);
  const out = measureAnswer(raw, pack.mappings);
  if (out.nonDraft || out.paragraphs.length === 0 || out.bytes >= fromBytes) return null;
  return { paragraphs: out.paragraphs, bytes: out.bytes };
}
