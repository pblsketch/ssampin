/**
 * 생기부 초안 **분량 조절**의 계산 규칙 — 순수 함수만. 화면도 저장소도 모른다.
 *
 * 왜 도메인인가: "몇 바이트를 목표로 할지", "맞았는지", "모델에게 어떤 숫자를 줄지"는
 * 화면이 바뀌어도 같아야 하는 규칙이다. 화면에 두면 학급 운영과 수업 관리가 갈라진다.
 *
 * ★원칙 1: **모델이 센 숫자를 믿지 않는다.** 판정은 언제나 앱이 최종 저장 본문으로 다시 센다.
 * ★원칙 5: **확인된 한도만 강제한다.** 초등처럼 한도 수치가 공식 확인되지 않은 영역은
 *   구조적으로 `over-limit` 이 나올 수 없다(`isAreaLimitVerified`).
 *
 * 단서: `judgeLength` 가 안에서 부르는 `resolveAreaLimit` 은 **미지의 (영역 x 학교급)에서
 * 예외를 던진다** — 조용한 폴백을 금지한 기존 설계다. 부르는 쪽은 화면에서 고른 영역·학교급만
 * 넘기므로 실사용 위험은 낮지만, "순수 함수"라고 해서 예외가 없다는 뜻은 아니다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  isAreaLimitVerified,
  neisByteLength,
  resolveAreaLimit,
  type RecordArea,
  type SchoolLevel,
} from '../entities/RecordDraft';

/** 목표 하한 비율. 목표의 이 비율 아래로 내려가면 "너무 짧다"로 본다. */
const GOAL_FLOOR_RATIO = 0.95;

/** 조절 방향. `shrink` 는 근거를 싣지 않고, `expand` 만 근거를 싣는다. */
export type LengthAdjustKind = 'shrink' | 'expand';

/**
 * 분량 판정.
 * - `over-limit`: 영역 한도를 넘었다. 저장이 거부되므로 그대로 반영할 수 없다.
 * - `over-goal`: 선생님이 고른 목표만 넘었다(한도 이내). 선생님이 고를 수 있다.
 * - `under-goal`: 목표 하한에 못 미친다.
 * - `ok`: 목표 하한과 목표 사이.
 */
export type LengthVerdict = 'over-limit' | 'over-goal' | 'under-goal' | 'ok';

/** 목표 기본값 = 그 영역의 한도. */
export function defaultTargetBytes(area: RecordArea, level: SchoolLevel): number {
  return resolveAreaLimit(area, level);
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
export function clampTargetBytes(input: number, area: RecordArea, level: SchoolLevel): number {
  const floor = 1;
  const rounded = Number.isFinite(input) ? Math.round(input) : defaultTargetBytes(area, level);
  const atLeast = Math.max(floor, rounded);
  if (!isAreaLimitVerified(area, level)) return atLeast;
  return Math.min(atLeast, resolveAreaLimit(area, level));
}

/** 목표 하한. 1,500이면 1,425. 규정상 최소 분량이 **아니다** (화면 문구가 이걸 지켜야 한다). */
export function goalFloor(targetBytes: number): number {
  return Math.ceil(targetBytes * GOAL_FLOOR_RATIO);
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
}): LengthVerdict {
  const { bytes, targetBytes, area, level } = input;
  if (isAreaLimitVerified(area, level) && bytes > resolveAreaLimit(area, level))
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
