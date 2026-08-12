/**
 * 옆핀 패널 너비(DIP) 값 객체.
 *
 * 너비는 기기마다 다른 값이라 동기화 설정이 아니라 기기 전용 파일에 저장된다.
 * 파일이 손상되거나 예전 버전 값이 들어와도 창을 못 그리면 안 되므로,
 * 잘못된 값은 예외를 던지지 않고 항상 안전한 범위로 되돌린다.
 *
 * 하한 360은 기존 메모 편집기가 쓰는 최대 폭 420px와 함께 검증해야 하는 값이다
 * (`src/adapters/components/Memo/MemoEditor.tsx:194`). 이보다 좁으면 편집기가 눌린다.
 */

/** 패널 최소 너비 (DIP) — 메모 편집기가 정상 동작하는 하한 */
export const SIDE_PIN_WIDTH_MIN = 360;

/** 패널 최대 너비 (DIP) — 이보다 넓으면 작업 화면을 과하게 가린다 */
export const SIDE_PIN_WIDTH_MAX = 460;

/** 패널 기본 너비 (DIP) */
export const SIDE_PIN_WIDTH_DEFAULT = 400;

/**
 * 임의의 입력값을 유효한 패널 너비로 정규화한다.
 *
 * - 숫자가 아니거나 NaN·Infinity면 기본값(400)
 * - 소수점은 반올림해 정수 DIP로 맞춘다 (배율 환경에서 소수 좌표가 남지 않도록)
 * - 범위를 벗어나면 하한·상한으로 자른다
 */
export function clampSidePinWidth(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return SIDE_PIN_WIDTH_DEFAULT;
  }
  const rounded = Math.round(value);
  if (rounded < SIDE_PIN_WIDTH_MIN) return SIDE_PIN_WIDTH_MIN;
  if (rounded > SIDE_PIN_WIDTH_MAX) return SIDE_PIN_WIDTH_MAX;
  return rounded;
}
