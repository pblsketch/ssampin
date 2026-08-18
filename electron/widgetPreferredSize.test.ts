import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPreferredSize,
  peekPreferredSize,
  rememberSizeBeforeFit,
  takePreferredSizeIfFits,
} from './widgetPreferredSize';

/**
 * "줄이기 전 크기" 기억의 그물.
 *
 * 실기기 신고(2026-08-18): 보조(1920×1032)를 꽉 채운 위젯을 주(1645×981)로 옮기면
 * 줄어드는데, 다시 보조로 돌아와도 작은 채로 남아 화면이 비었다.
 * 축소는 **그 화면에서만 유효한 임시 조치**여야 한다.
 */
describe('widgetPreferredSize', () => {
  const PRIMARY = { width: 1645, height: 981 };
  const SECONDARY = { width: 1920, height: 1032 };

  beforeEach(() => {
    clearPreferredSize();
  });

  it('축소 전 크기를 기억했다가 들어가는 화면에서 되살린다', () => {
    rememberSizeBeforeFit({ width: 1920, height: 1032 });

    // 주 모니터에는 안 들어가므로 되살리지 않고 기억을 유지한다.
    expect(takePreferredSizeIfFits(PRIMARY)).toBeNull();
    expect(peekPreferredSize()).toEqual({ width: 1920, height: 1032 });

    // 보조로 돌아오면 되살리고 기억을 비운다.
    expect(takePreferredSizeIfFits(SECONDARY)).toEqual({ width: 1920, height: 1032 });
    expect(peekPreferredSize()).toBeNull();
  });

  it('이미 기억이 있으면 덮어쓰지 않는다 — 원본을 지켜야 한다', () => {
    rememberSizeBeforeFit({ width: 1920, height: 1032 }); // 사용자가 의도한 원래 크기
    rememberSizeBeforeFit({ width: 1645, height: 981 }); // 중간에 이미 줄어든 크기

    // 덮어썼다면 되살릴 크기가 매번 작아져 원래 크기를 영영 잃는다.
    expect(peekPreferredSize()).toEqual({ width: 1920, height: 1032 });
  });

  it('사용자가 크기를 직접 정하면 기억을 버린다', () => {
    rememberSizeBeforeFit({ width: 1920, height: 1032 });
    clearPreferredSize();

    expect(takePreferredSizeIfFits(SECONDARY)).toBeNull();
  });

  it('기억이 없으면 아무것도 돌려주지 않는다', () => {
    expect(takePreferredSizeIfFits(SECONDARY)).toBeNull();
  });

  it('비정상 크기는 기억하지 않는다 (화면 정보를 못 읽은 상황)', () => {
    rememberSizeBeforeFit({ width: 0, height: 1032 });
    expect(peekPreferredSize()).toBeNull();

    rememberSizeBeforeFit({ width: Number.NaN, height: 500 });
    expect(peekPreferredSize()).toBeNull();
  });

  it('딱 맞는 크기(작업 영역과 동일)는 들어가는 것으로 본다', () => {
    rememberSizeBeforeFit({ ...SECONDARY });
    expect(takePreferredSizeIfFits(SECONDARY)).toEqual(SECONDARY);
  });
});
