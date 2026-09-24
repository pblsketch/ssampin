import type { TimerDisplayStyle } from '@domain/entities/Settings';

/**
 * 타이머 원(부채꼴)과 숫자 크기 계산(ADR-139, spec 2-1, 설계 1장).
 *
 * 숫자 폭이 원 안지름의 약 62%(60~65%)가 되도록 원 크기에서 숫자 크기를 정한다.
 * 원 크기는 고정값이 아니라 "스테이지"(원+숫자만 차지하는 빈 공간)의 짧은 변에 맞춘다.
 * 예전 300px 고정 원에 96px 숫자를 얹어 숫자가 원을 뚫던 문제를 없앤다.
 */

export const MIN_DIAMETER = 200;
export const MAX_DIAMETER = 640;
/** 교실 화면(TV·빔)에서는 더 크게 허용한다(조정 가능). */
export const CLASSROOM_MAX_DIAMETER = 960;
const STAGE_FILL_RATIO = 0.92;
const STROKE_RATIO = 0.045;
const STROKE_MIN = 8;
const STROKE_MAX = 24;
/** 숫자 폭 ÷ 원 안지름 목표(60~65%의 가운데, 조정 가능). */
export const DIGIT_RATIO_TARGET = 0.625;
/** "00:00"(콜론을 0.32em 으로 좁힘)의 폭(em). JetBrains Mono 숫자 한 자 ≈ 0.6em. 실기기로 보정. */
export const DIGIT_WIDTH_EM = 2.72;
/** 이보다 좁은 스테이지는 ± 단추를 원 아래로 내린다. */
export const NARROW_STAGE_WIDTH = 560;
/** 부채꼴 모드에서 숫자 줄이 차지하는 높이(지름 대비). */
const PIE_DIGIT_BLOCK_RATIO = 0.34;

export interface TimerGeometry {
  readonly diameter: number;
  readonly strokeWidth: number;
  readonly innerDiameter: number;
  readonly digitFontSize: number;
  readonly isNarrow: boolean;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function forDiameter(diameter: number, isNarrow: boolean): TimerGeometry {
  const strokeWidth = clamp(STROKE_MIN, diameter * STROKE_RATIO, STROKE_MAX);
  const innerDiameter = diameter - 2 * strokeWidth;
  const digitFontSize = (innerDiameter * DIGIT_RATIO_TARGET) / DIGIT_WIDTH_EM;
  return { diameter, strokeWidth, innerDiameter, digitFontSize, isNarrow };
}

/**
 * 스테이지 크기에서 원·숫자 크기를 계산한다.
 * 부채꼴은 숫자를 원 아래에 두므로 스테이지 높이에서 숫자 줄 높이를 먼저 뺀다(두 번 근사).
 */
export function computeTimerGeometry(
  stage: { readonly width: number; readonly height: number },
  displayStyle: TimerDisplayStyle,
  maxDiameter: number = MAX_DIAMETER,
): TimerGeometry {
  const width = Math.max(0, stage.width);
  const height = Math.max(0, stage.height);
  const isNarrow = width < NARROW_STAGE_WIDTH;
  const fit = (available: number): number =>
    clamp(MIN_DIAMETER, available * STAGE_FILL_RATIO, Math.max(MIN_DIAMETER, maxDiameter));
  if (displayStyle === 'ring') {
    return forDiameter(fit(Math.min(width, height)), isNarrow);
  }
  const first = fit(Math.min(width, height));
  const second = fit(Math.min(width, height - first * PIE_DIGIT_BLOCK_RATIO));
  return forDiameter(second, isNarrow);
}

/** 원 없이 숫자만 크게(스톱워치·교실 화면 스톱워치). 숫자 8자("00:00.00")가 폭의 80%를 넘지 않게. */
export function computeDigitsOnlyFontSize(
  stage: { readonly width: number; readonly height: number },
  charCount: number,
): number {
  const widthBound = (Math.max(0, stage.width) * 0.8) / (charCount * 0.6);
  const heightBound = Math.max(0, stage.height) * 0.6;
  return clamp(40, Math.min(widthBound, heightBound), 400);
}
