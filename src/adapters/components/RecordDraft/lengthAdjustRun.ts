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
  parseNarrativeParagraphs,
  type NarrativeParagraph,
} from '@domain/rules/narrativeParagraphs';
import { stripInsufficientMark } from '@domain/rules/recordLengthGoal';
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
}

export interface LengthAdjustRunResult {
  readonly candidates: readonly LengthAdjustCandidate[];
  /** 조절 직전 원문(실명 그대로). 판에 스냅숏으로 남고 [원문과 비교]가 쓴다. */
  readonly sourceText: string;
  /** 조절 대상 본문에서 찾은 기재 금지 갈래. 비어 있지 않으면 화면이 보내기 전에 물었어야 한다. */
  readonly sourceProhibited: readonly string[];
}

/** 목표를 못 맞춰 다시 물을 때, 얼마나 밀어 줄지. 실제 결과와 목표의 차이를 그대로 반영한다. */
export function retryTargetBytes(
  firstBytes: number,
  targetBytes: number,
  floorBytes: number,
): number {
  // 넘쳤으면 넘친 만큼 더 줄이라고 하고, 모자랐으면 모자란 만큼 더 채우라고 한다.
  if (firstBytes > targetBytes) return Math.max(1, targetBytes - (firstBytes - targetBytes));
  return targetBytes + (floorBytes - firstBytes);
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
): { paragraphs: readonly NarrativeParagraph[]; bytes: number; insufficient: boolean } {
  const restored = restoreModelText(raw, mappings);
  const { text, insufficient } = stripInsufficientMark(restored);
  const paragraphs = parseNarrativeParagraphs(text);
  // ★저장될 본문 그대로 센다(`aiDraftText` = 문단을 공백 하나로 이은 것). 프롬프트 길이가 아니다.
  return { paragraphs, bytes: neisByteLength(aiDraftText({ paragraphs })), insufficient };
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
}

/**
 * 조절을 실행한다. 목표를 벗어나면 **최대 한 번** 다시 묻는다.
 *
 * ★재조정도 **같은 조립 함수를 원문으로 다시** 지난다. 이미 가린 문자열을 재사용하지 않는다 -
 *   그렇게 하면 첫 회만 안전한 기능이 된다(이음매 게이트가 이걸 본다).
 */
export async function runLengthAdjust(input: LengthAdjustRunInput): Promise<LengthAdjustRunResult> {
  const { api, provider, systemPrompt, pack, floorBytes, onAttempt } = input;
  const candidates: LengthAdjustCandidate[] = [];

  onAttempt?.(1);
  const first = buildLengthAdjustPack(pack);
  const firstRaw = await askOnce(api, provider, first.text, systemPrompt);
  const firstOut = measureAnswer(firstRaw, first.mappings);
  candidates.push({
    attempt: 1,
    paragraphs: firstOut.paragraphs,
    bytes: firstOut.bytes,
    insufficient: firstOut.insufficient,
    excluded: summarizeExclusions(first.exclusions),
    includedCount: first.includedCount,
  });

  const onTarget = firstOut.bytes <= pack.targetBytes && firstOut.bytes >= floorBytes;
  // ★근거 부족은 재조정에서 제외한다. 다시 물어도 없는 근거가 생기지 않는다.
  if (onTarget || firstOut.insufficient) {
    return {
      candidates,
      sourceText: pack.sourceText,
      sourceProhibited: first.sourceProhibited,
    };
  }

  onAttempt?.(2);
  const second = buildLengthAdjustPack({
    ...pack,
    targetBytes: retryTargetBytes(firstOut.bytes, pack.targetBytes, floorBytes),
  });
  const secondRaw = await askOnce(api, provider, second.text, systemPrompt);
  const secondOut = measureAnswer(secondRaw, second.mappings);
  candidates.push({
    attempt: 2,
    paragraphs: secondOut.paragraphs,
    bytes: secondOut.bytes,
    insufficient: secondOut.insufficient,
    excluded: summarizeExclusions(second.exclusions),
    includedCount: second.includedCount,
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
