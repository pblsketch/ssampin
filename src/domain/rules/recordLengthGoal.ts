/**
 * 생기부 초안 **분량 조절**의 계산 규칙 — 순수 함수만. 화면도 저장소도 모른다.
 *
 * 왜 도메인인가: "몇 바이트를 목표로 할지", "맞았는지", "모델에게 어떤 숫자를 줄지"는
 * 화면이 바뀌어도 같아야 하는 규칙이다. 화면에 두면 학급 운영과 수업 관리가 갈라진다.
 *
 * ★원칙 1: **모델이 센 숫자를 믿지 않는다.** 판정은 언제나 앱이 최종 저장 본문으로 다시 센다.
 * ★원칙 5: **확인된 한도만 붉게 알린다**(저장은 막지 않는다, 오너 결정 2026-09-11). 초등처럼 한도 수치가 공식 확인되지 않은 영역은
 *   구조적으로 `over-limit` 이 나올 수 없다(`isAreaLimitVerified`).
 *
 * 단서: `judgeLength` 가 안에서 부르는 `resolveAreaLimit` 은 **미지의 (영역 x 학교급)에서
 * 예외를 던진다** — 조용한 폴백을 금지한 기존 설계다. 부르는 쪽은 화면에서 고른 영역·학교급만
 * 넘기므로 실사용 위험은 낮지만, "순수 함수"라고 해서 예외가 없다는 뜻은 아니다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  effectiveAreaLimit,
  isAreaLimitConfirmed,
  neisByteLength,
  type RecordArea,
  type SchoolLevel,
} from '../entities/RecordDraft';

/** 목표 하한 비율. 목표의 이 비율 아래로 내려가면 "너무 짧다"로 본다. */
const GOAL_FLOOR_RATIO = 0.95;

/** 조절 방향. `shrink` 는 근거를 싣지 않고, `expand` 만 근거를 싣는다. */
export type LengthAdjustKind = 'shrink' | 'expand';

/**
 * 분량 판정.
 * - `over-limit`: 확정된 한도를 넘었다. 저장은 되지만 붉게 알린다(ADR-105).
 * - `over-goal`: 선생님이 고른 목표만 넘었다(한도 이내). 선생님이 고를 수 있다.
 * - `under-goal`: 목표 하한에 못 미친다.
 * - `ok`: 목표 하한과 목표 사이.
 */
export type LengthVerdict = 'over-limit' | 'over-goal' | 'under-goal' | 'ok';

/**
 * 목표 기본값 = 그 영역의 한도. `limitOverride` 는 선생님이 이 수업반·영역에 직접 정한 한도(2026-09-11) —
 * 이 파일의 함수는 모두 같은 인자를 받아 **한 한도**를 쓴다(칩·자르기·판정이 서로 다른 한도를 보지 않게).
 */
export function defaultTargetBytes(
  area: RecordArea,
  level: SchoolLevel,
  limitOverride?: number,
): number {
  return effectiveAreaLimit(area, level, limitOverride);
}

/**
 * 목표를 한도 이하로 자른다.
 *
 * ★왜 필요한가: 한도 1,500 영역에서 목표를 2,000으로 치면 1,950바이트 결과가 목표 기준으로는
 * "맞음"이 되어 [이 글로 바꾸기]가 켜지고, 정작 저장은 거부된다. 이 기능이 없애려던
 * "미리보기는 통과, 저장은 거부"를 스스로 다른 경로로 만드는 셈이다.
 *
 * 확인되지 않은 한도(초등 일부)에서는 자르지 않는다 — 확인 안 된 숫자로 선생님을 막지 않는다.
 */
export function clampTargetBytes(
  input: number,
  area: RecordArea,
  level: SchoolLevel,
  limitOverride?: number,
): number {
  const floor = 1;
  const rounded = Number.isFinite(input)
    ? Math.round(input)
    : defaultTargetBytes(area, level, limitOverride);
  const atLeast = Math.max(floor, rounded);
  if (!isAreaLimitConfirmed(area, level, limitOverride)) return atLeast;
  return Math.min(atLeast, effectiveAreaLimit(area, level, limitOverride));
}

/** 분량 목표 바로 고르기. 한도보다 작은 값만 쓰고, 한도 자체는 늘 끝에 둔다(진로 2,100 등). */
export const RECORD_TARGET_BYTE_PRESETS: readonly number[] = [750, 1_000, 1_500];

/** 이 영역에서 보여 줄 목표 칩. */
export function targetPresetsFor(
  area: RecordArea,
  level: SchoolLevel,
  limitOverride?: number,
): readonly number[] {
  const limit = effectiveAreaLimit(area, level, limitOverride);
  return [...RECORD_TARGET_BYTE_PRESETS.filter((n) => n < limit), limit];
}

/**
 * 목표 저장 키 — 수업반(담임은 `homeroom`) × 영역. 과목은 수업반이 정하므로 따로 두지 않는다.
 * ★학기는 키에 없다. 1학기·2학기를 나눠 쓰는 과목은 그 학기에 맞는 값(예: 750)을 고른다.
 */
export function recordTargetKey(classId: string | undefined, area: RecordArea): string {
  return `${classId ?? 'homeroom'}:${area}`;
}

/**
 * 선생님이 정한 분량 목표. 없으면 한도. 한도를 넘는 값은 한도로 자른다(`clampTargetBytes`).
 * ★목표는 **안내**다 — 저장 차단은 여전히 나이스 한도로만 한다. 학교 사정의 숫자로 저장을 막지 않는다.
 */
export function resolveTargetBytes(
  area: RecordArea,
  level: SchoolLevel,
  override?: number,
  limitOverride?: number,
): number {
  return override === undefined
    ? defaultTargetBytes(area, level, limitOverride)
    : clampTargetBytes(override, area, level, limitOverride);
}

/** 목표 하한. 1,500이면 1,425. 규정상 최소 분량이 **아니다** (화면 문구가 이걸 지켜야 한다). */
export function goalFloor(targetBytes: number): number {
  return Math.ceil(targetBytes * GOAL_FLOOR_RATIO);
}

/**
 * 초안을 쓴 뒤 **앱이 자동으로 한 번 줄이는** 기준 — 목표보다 이 비율 넘게 길 때만(ADR-110).
 *
 * ★오너(2026-09-11): "1,500바이트면 조금 긴 건 괜찮은데 1,700 이상은 문제." 1,500 이면 1,650 까지는 그대로 둔다.
 *   조금 넘친 것까지 줄이면 왕복 1~2분이 더 걸린다 — 한 문장 안팎은 선생님이 고치는 편이 빠르다.
 */
export const DRAFT_AUTO_SHRINK_OVER_RATIO = 0.1;

/** 방금 쓴 초안을 자동으로 한 번 줄여야 하나. 목표 1,500 이면 1,651바이트부터 참. */
export function needsAutoShrink(bytes: number, targetBytes: number): boolean {
  return bytes > Math.floor(targetBytes * (1 + DRAFT_AUTO_SHRINK_OVER_RATIO));
}

/**
 * 문장 수. 모델은 바이트도 글자 수도 잘 못 세지만 **문장은 센다** — 그래서 "몇 문장을 빼라"를 함께 말한다(ADR-110).
 * 마침표·물음표·느낌표 뒤에 공백(줄바꿈 포함)이 오면 문장이 끝난 것으로 본다. 소수점(3.5)은 뒤가 숫자라 끊지 않는다.
 */
export function countSentences(text: string): number {
  return text.split(/[.!?。]\s+/).filter((s) => s.trim().length > 0).length;
}

/**
 * 바이트를 **이 글의** 공백 포함 글자 수로 옮긴다. 한글은 3바이트지만 공백·문장부호는 1바이트라
 * "3으로 나누기"는 공백 포함 글자 수보다 적게 나온다. 글이 비었으면 3으로 나눈다.
 * 모델에게 감을 주는 숫자일 뿐 판정에는 안 쓴다.
 */
export function charsForBytes(bytes: number, sample: string): number {
  const sampleBytes = neisByteLength(sample);
  const sampleChars = [...sample].length;
  if (sampleBytes === 0 || sampleChars === 0) return Math.max(1, Math.round(bytes / 3));
  return Math.max(1, Math.round((bytes * sampleChars) / sampleBytes));
}

/**
 * 근거가 목표를 받쳐 주기에 **빈약한가**의 기준 — 보내는 근거 글(가린 뒤 본문·메모)을 모두 합친 바이트가
 * 목표의 이 비율에 못 미치면 빈약하다고 본다(ADR-110 보강 2). 관찰 메모 몇 줄을 1,500바이트로 늘리려면
 * 근거에 없는 말을 지어낼 수밖에 없다 — 오너(2026-09-11): "근거가 빈약하면 굳이 목표 바이트에 맞추지 않아도 된다."
 * ★어림이다. 판정이 아니라 **모델에게 숫자로 알려 줄 신호**다. 경계 근처는 모델이 근거를 보고 판단한다
 *   ("근거가 빈약하면 채우지 말라"는 일반 지시는 근거 양과 상관없이 늘 나간다).
 */
export const THIN_EVIDENCE_RATIO = 0.5;

/** 보내는 근거가 목표에 비해 빈약한가. 목표 1,500 이면 근거가 750바이트 아래일 때 참. */
export function isThinEvidence(evidenceBytes: number, targetBytes: number): boolean {
  return evidenceBytes < targetBytes * THIN_EVIDENCE_RATIO;
}

/**
 * 보내는 근거가 **목표보다 많은가** — 근거 글만 모아도 목표 분량을 넘으면 다 담을 수 없다(ADR-110 보강 3).
 * 그러면 요청서가 "다 담을 수 없으니 강점·특성을 드러내는 핵심 근거를 중심으로 골라 쓰라"를 숫자와 함께 말한다.
 * 오너(2026-09-11): "근거가 너무 많으면 다 담으려 하지 말고, 핵심 근거를 중심으로 엮고, 관련이 약한 근거는 반영하지 않는다."
 * ★신호일 뿐이다 — 고르라는 일반 지시는 근거 양과 상관없이 늘 나간다. 빈약(`isThinEvidence`)과는 겹치지 않는다.
 */
export function isRichEvidence(evidenceBytes: number, targetBytes: number): boolean {
  return evidenceBytes > targetBytes;
}

/**
 * 분량 판정. **인자로 (area, level)을 받는다.**
 *
 * ★`(limit, limitVerified)` 두 개를 따로 받으면 부르는 쪽에서 짝이 어긋날 수 있다.
 * 한도와 확인 여부는 여기서 함께 구한다 — 어긋날 방법 자체를 없앤다.
 * ★판정 순서를 못 박는다: `over-limit` 을 **가장 먼저** 본다.
 */
export function judgeLength(input: {
  readonly bytes: number;
  readonly targetBytes: number;
  readonly area: RecordArea;
  readonly level: SchoolLevel;
  /** 선생님이 직접 정한 한도(있으면). */
  readonly limitOverride?: number;
}): LengthVerdict {
  const { bytes, targetBytes, area, level, limitOverride } = input;
  if (
    isAreaLimitConfirmed(area, level, limitOverride) &&
    bytes > effectiveAreaLimit(area, level, limitOverride)
  )
    return 'over-limit';
  if (bytes > targetBytes) return 'over-goal';
  if (bytes < goalFloor(targetBytes)) return 'under-goal';
  return 'ok';
}

/**
 * [뒤에 붙이기] 합산 길이. **화면 코드와 글자 단위로 같아야 한다.**
 *
 * `RecordDraftAiPanel` 의 mergedText 계산:
 *   mode === 'append' && base.trim().length > 0 ? `${base.trim()} ${text}` : text
 *
 * ★분석 문서는 "기존 글 + 빈 줄 + 새 글"이라 적었으나 코드는 **공백 한 칸**으로 잇는다
 * (오너 결정 2026-09-06: 생기부는 한 덩어리 글이다). 앞글이 비어 있으면 공백도 없다.
 * 여기까지 맞춰야 "미리보기는 통과, 저장은 거부"가 생기지 않는다.
 */
export function appendedBytes(base: string, addition: string): number {
  const head = base.trim();
  if (head.length === 0) return neisByteLength(addition);
  return neisByteLength(head) + 1 + neisByteLength(addition);
}

/**
 * 실명본과 별칭본의 바이트 차이. 예: 실명 '김지훈'(9B)이 별칭 '［이름1］'(13B)이면 `9 - 13 = -4`.
 *
 * ★이건 정확한 계산식이 아니라 **어림 보정**이다. 모델의 답에 별칭이 원문과 다른 횟수로
 * 등장하면 과보정·소보정이 난다. 최종 판정은 언제나 앱이 센 실제 바이트다.
 */
export function aliasByteDelta(real: string, masked: string): number {
  return neisByteLength(real) - neisByteLength(masked);
}

/**
 * 모델에게 적어 보낼 목표 상한. 모델은 별칭만 보고 쓰므로, 답을 실명으로 되돌리면 그만큼
 * 길이가 달라진다. 그래서 목표를 미리 반대로 밀어 준다. 위 예에서는 `1500 - (-4) = 1504`.
 */
export function modelTargetBytes(finalTargetBytes: number, delta: number): number {
  return finalTargetBytes - delta;
}

/**
 * 모델에게 적어 보낼 목표 하한. **상한과 같은 delta 로 보정한다.**
 *
 * ★상한만 보정하면 지시문의 두 숫자가 서로 다른 기준이 된다. 위 예에서는 `1425 - (-4) = 1429`.
 */
export function modelFloorBytes(finalTargetBytes: number, delta: number): number {
  return goalFloor(finalTargetBytes) - delta;
}

/** 모델이 "근거가 모자랐다"고 알릴 때 쓰는 표식. 저장 본문에는 남기지 않는다. */
export const INSUFFICIENT_MARK = '[근거 부족]';

/**
 * `[근거 부족]` 표식을 떼어 낸다.
 *
 * ★왜 따로 떼야 하나: `parseNarrativeParagraphs` 는 문단 첫머리의 **아는 낱말**
 * (`[평가]`·`[동기]`·`[과정]`·`[결과]`)만 표식으로 인정하고, 모르는 낱말은 본문에 남긴다.
 * 즉 `[근거 부족]` 은 저절로 떨어지지 않는다. 안 떼면 생기부 본문에 그대로 들어간다.
 *
 * 별도 줄로 온 경우와 마지막 문장 뒤에 붙어 온 경우를 **둘 다** 떼어 낸다.
 * 표식이 있었으면 화면은 자동 재조정을 하지 않고 "근거가 부족해 목표보다 짧게 작성했어요."로 멈춘다.
 */
export function stripInsufficientMark(text: string): {
  readonly text: string;
  readonly insufficient: boolean;
} {
  if (!text.includes(INSUFFICIENT_MARK)) return { text, insufficient: false };
  const stripped = text
    .split('\n')
    .map((line) => line.split(INSUFFICIENT_MARK).join(' '))
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: stripped, insufficient: true };
}
