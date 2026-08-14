/**
 * 옆핀 배경 투명도 값 검증 테스트.
 *
 * 저장값이 이상할 때 화면이 사라지면 안 된다. 손잡이가 통째로 안 보이면
 * 사용자는 옆핀을 다시 켤 방법조차 찾기 어렵다.
 */
import { describe, expect, it } from 'vitest';
import { SIDE_PIN_DEFAULT_OPACITY, normalizeOpacity } from './useSidePinAppearance';

describe('배경 투명도 값', () => {
  it('0과 1 사이 값은 그대로 쓴다', () => {
    expect(normalizeOpacity(0.4)).toBe(0.4);
    expect(normalizeOpacity(0)).toBe(0);
    expect(normalizeOpacity(1)).toBe(1);
  });

  it('설정한 적이 없으면 기본값 — 지금 모습 그대로 불투명', () => {
    expect(normalizeOpacity(undefined)).toBe(SIDE_PIN_DEFAULT_OPACITY);
  });

  it.each([
    ['범위 밖(음수)', -0.5],
    ['범위 밖(1 초과)', 1.5],
    ['숫자가 아님', '0.5'],
    ['NaN', Number.NaN],
    ['무한대', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('이상한 값(%s)은 기본값으로 되돌린다', (_label, value) => {
    expect(normalizeOpacity(value)).toBe(SIDE_PIN_DEFAULT_OPACITY);
  });
});
