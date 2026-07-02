import { describe, it, expect } from 'vitest';
import {
  computeExpandedBounds,
  pinFromExpanded,
  ICON_EXPANDED_W,
  ICON_EXPANDED_H,
  type Rect,
} from './iconWindowGeometry';

const WORK: Rect = { x: 0, y: 0, width: 1920, height: 1040 }; // 작업표시줄 제외 workArea
const PIN = 64;

function pin(x: number, y: number): Rect {
  return { x, y, width: PIN, height: PIN };
}

describe('computeExpandedBounds — 확장 방향과 핀 위치 불변', () => {
  it('기본(우하단 핀): 위-왼쪽으로 확장, 핀은 창의 우하단', () => {
    const p = pin(1800, 950);
    const { bounds, anchor } = computeExpandedBounds(p, WORK);
    expect(anchor).toEqual({ up: true, right: true });
    expect(bounds).toEqual({
      x: 1800 + PIN - ICON_EXPANDED_W,
      y: 950 + PIN - ICON_EXPANDED_H,
      width: ICON_EXPANDED_W,
      height: ICON_EXPANDED_H,
    });
    // 핀 화면 위치 불변 (역산 일치)
    expect(pinFromExpanded(bounds, anchor, PIN)).toEqual(p);
  });

  it('화면 상단 핀: 위 공간 부족 → 아래로 확장 (핀은 창 상단)', () => {
    const p = pin(1800, 10);
    const { bounds, anchor } = computeExpandedBounds(p, WORK);
    expect(anchor.up).toBe(false);
    expect(bounds.y).toBe(10);
    expect(pinFromExpanded(bounds, anchor, PIN)).toEqual(p);
  });

  it('화면 좌측 핀: 왼쪽 공간 부족 → 오른쪽으로 확장 (핀은 창 좌측)', () => {
    const p = pin(10, 950);
    const { bounds, anchor } = computeExpandedBounds(p, WORK);
    expect(anchor.right).toBe(false);
    expect(bounds.x).toBe(10);
    expect(pinFromExpanded(bounds, anchor, PIN)).toEqual(p);
  });

  it('좌상단 구석 핀: 아래-오른쪽으로 확장', () => {
    const p = pin(5, 5);
    const { bounds, anchor } = computeExpandedBounds(p, WORK);
    expect(anchor).toEqual({ up: false, right: false });
    expect(bounds.x).toBe(5);
    expect(bounds.y).toBe(5);
    expect(pinFromExpanded(bounds, anchor, PIN)).toEqual(p);
  });

  it('workArea 원점이 0이 아닌 보조 모니터에서도 동작', () => {
    const work2: Rect = { x: -1920, y: 200, width: 1920, height: 1040 };
    const p = pin(-1900, 250); // 보조 모니터 좌상단 부근
    const { bounds, anchor } = computeExpandedBounds(p, work2);
    expect(anchor).toEqual({ up: false, right: false });
    expect(pinFromExpanded(bounds, anchor, PIN)).toEqual(p);
  });

  it('공간이 양쪽 다 부족하면 여유가 더 큰 쪽을 고른다', () => {
    // 세로가 480 미만인 작은 workArea — 위 공간 300 > 아래 공간 164
    const small: Rect = { x: 0, y: 0, width: 800, height: 400 };
    const p = pin(700, 300);
    const { anchor } = computeExpandedBounds(p, small);
    expect(anchor.up).toBe(true); // 위 여유(364) >= 아래 여유(100)
  });
});

describe('pinFromExpanded — 4방향 역산', () => {
  const expanded: Rect = { x: 100, y: 100, width: ICON_EXPANDED_W, height: ICON_EXPANDED_H };

  it('up+right → 우하단', () => {
    expect(pinFromExpanded(expanded, { up: true, right: true }, PIN)).toEqual({
      x: 100 + ICON_EXPANDED_W - PIN,
      y: 100 + ICON_EXPANDED_H - PIN,
      width: PIN,
      height: PIN,
    });
  });

  it('down+left → 좌상단', () => {
    expect(pinFromExpanded(expanded, { up: false, right: false }, PIN)).toEqual({
      x: 100,
      y: 100,
      width: PIN,
      height: PIN,
    });
  });
});
