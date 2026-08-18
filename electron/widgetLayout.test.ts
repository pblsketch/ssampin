import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearActiveWidgetLayout,
  computeWidgetLayoutBounds,
  isWidgetLayoutMode,
  resolveLayoutReapply,
  setActiveWidgetLayout,
  widgetLayoutMinimumSize,
} from './widgetLayout';

/**
 * 레이아웃은 "고정된 크기"가 아니라 "화면과의 관계"다.
 *
 * 실기기 신고(2026-08-18): 주 모니터에서 Ctrl+1(전체)을 누른 뒤 보조 모니터로 옮기면
 * 주 모니터 크기(1645×981) 그대로 남아 보조(1920×1032)를 꽉 채우지 못했다.
 *
 * 기준 환경(오너 PC): 주 2880×1800 @175%(DIP 작업영역 1645×981) /
 *                     보조 1920×1080 @100%(DIP 작업영역 1920×1032, x=1645)
 */
describe('computeWidgetLayoutBounds', () => {
  const PRIMARY = { x: 0, y: 0, width: 1645, height: 981 };
  const SECONDARY = { x: 1645, y: 0, width: 1920, height: 1032 };

  it('전체(full)는 그 모니터의 작업 영역을 그대로 채운다', () => {
    expect(computeWidgetLayoutBounds('full', PRIMARY)).toEqual(PRIMARY);
    // ★같은 레이아웃이라도 모니터가 다르면 결과가 달라야 한다 — 이것이 이번 수정의 핵심.
    expect(computeWidgetLayoutBounds('full', SECONDARY)).toEqual(SECONDARY);
  });

  it('좌우 분할(split-h)은 그 모니터의 우측 절반이다', () => {
    expect(computeWidgetLayoutBounds('split-h', SECONDARY)).toEqual({
      x: 1645 + 960,
      y: 0,
      width: 960,
      height: 1032,
    });
  });

  it('상하 분할(split-v)은 그 모니터의 하단 절반이다', () => {
    expect(computeWidgetLayoutBounds('split-v', PRIMARY)).toEqual({
      x: 0,
      y: 490,
      width: 1645,
      height: 490,
    });
  });

  it('4분할(quad)은 그 모니터의 우하단 1/4이다', () => {
    expect(computeWidgetLayoutBounds('quad', SECONDARY)).toEqual({
      x: 1645 + 960,
      y: 516,
      width: 960,
      height: 516,
    });
  });

  it('우측 사이드(sidebar-right)는 그 모니터 폭의 1/4, 전체 높이다', () => {
    expect(computeWidgetLayoutBounds('sidebar-right', SECONDARY)).toEqual({
      x: 1645 + 1440,
      y: 0,
      width: 480,
      height: 1032,
    });
  });

  it('작업 영역 원점이 음수(주 모니터 왼쪽 배치)여도 그대로 반영한다', () => {
    const leftMonitor = { x: -1920, y: -120, width: 1920, height: 1032 };
    expect(computeWidgetLayoutBounds('full', leftMonitor)).toEqual(leftMonitor);
  });
});

describe('widgetLayoutMinimumSize', () => {
  it('sidebar-right만 최소 크기를 낮춘다 — 1/4 폭이 기본 minWidth 640에 막히기 때문', () => {
    expect(widgetLayoutMinimumSize('sidebar-right')).toEqual({ width: 220, height: 320 });
    expect(widgetLayoutMinimumSize('full')).toEqual({ width: 640, height: 480 });
    expect(widgetLayoutMinimumSize('quad')).toEqual({ width: 640, height: 480 });
  });
});

describe('isWidgetLayoutMode', () => {
  it('알려진 모드만 통과시킨다 (IPC로 임의 문자열이 들어올 수 있다)', () => {
    expect(isWidgetLayoutMode('full')).toBe(true);
    expect(isWidgetLayoutMode('sidebar-right')).toBe(true);
    expect(isWidgetLayoutMode('restore')).toBe(false);
    expect(isWidgetLayoutMode('')).toBe(false);
  });
});

describe('resolveLayoutReapply', () => {
  const PRIMARY_ID = 3183574757;
  const SECONDARY_ID = 748019706;
  const SECONDARY = { x: 1645, y: 0, width: 1920, height: 1032 };

  beforeEach(() => {
    clearActiveWidgetLayout();
  });

  it('레이아웃이 없으면 개입하지 않는다 (자유 크기 — 크기 기억 규칙이 담당)', () => {
    expect(resolveLayoutReapply(SECONDARY_ID, SECONDARY)).toBeNull();
  });

  it('같은 모니터 안에서의 이동에는 개입하지 않는다', () => {
    setActiveWidgetLayout('full', SECONDARY_ID);
    expect(resolveLayoutReapply(SECONDARY_ID, SECONDARY)).toBeNull();
  });

  it('다른 모니터로 옮기면 그 모니터 기준으로 다시 계산한다 (신고 재현)', () => {
    // 주 모니터에서 Ctrl+1(전체) → 보조로 이동
    setActiveWidgetLayout('full', PRIMARY_ID);

    const reapply = resolveLayoutReapply(SECONDARY_ID, SECONDARY);

    expect(reapply).not.toBeNull();
    expect(reapply!.mode).toBe('full');
    // 주 모니터 크기(1645×981)가 아니라 보조 모니터를 꽉 채워야 한다.
    expect(reapply!.bounds).toEqual(SECONDARY);
    expect(reapply!.minSize).toEqual({ width: 640, height: 480 });
  });

  it('절반 레이아웃도 새 모니터의 절반으로 다시 계산한다', () => {
    setActiveWidgetLayout('split-h', PRIMARY_ID);

    const reapply = resolveLayoutReapply(SECONDARY_ID, SECONDARY);

    expect(reapply!.bounds.width).toBe(960); // 보조의 절반 (주의 절반 822가 아님)
    expect(reapply!.bounds.height).toBe(1032);
  });

  it('sidebar-right는 최소 크기도 함께 돌려준다 (안 바꾸면 폭이 640으로 늘어난다)', () => {
    setActiveWidgetLayout('sidebar-right', PRIMARY_ID);

    const reapply = resolveLayoutReapply(SECONDARY_ID, SECONDARY);

    expect(reapply!.bounds.width).toBe(480);
    expect(reapply!.minSize).toEqual({ width: 220, height: 320 });
  });

  it('레이아웃을 해제하면 더 이상 개입하지 않는다 (사용자가 크기를 직접 정한 경우)', () => {
    setActiveWidgetLayout('full', PRIMARY_ID);
    clearActiveWidgetLayout();

    expect(resolveLayoutReapply(SECONDARY_ID, SECONDARY)).toBeNull();
  });
});
