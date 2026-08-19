import { describe, expect, it } from 'vitest';
import {
  computeWidgetResizeRects,
  WIDGET_RESIZE_CORNER_SIZE,
  WIDGET_RESIZE_CURSORS,
  WIDGET_RESIZE_EDGE_THICKNESS,
  WIDGET_RESIZE_EDGES,
} from './widgetResizeGeometry';

describe('widgetResizeGeometry', () => {
  const W = 900;
  const H = 700;

  it('여덟 손잡이가 모두 정의된다', () => {
    const rects = computeWidgetResizeRects(W, H);
    expect(Object.keys(rects).sort()).toEqual([...WIDGET_RESIZE_EDGES].sort());
    for (const edge of WIDGET_RESIZE_EDGES) {
      expect(WIDGET_RESIZE_CURSORS[edge], `${edge} 커서 미정의`).toBeTruthy();
    }
  });

  it('모든 손잡이가 창 안에 있다', () => {
    const rects = computeWidgetResizeRects(W, H);
    for (const edge of WIDGET_RESIZE_EDGES) {
      const r = rects[edge];
      expect(r.x, `${edge} x`).toBeGreaterThanOrEqual(0);
      expect(r.y, `${edge} y`).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, `${edge} 우측`).toBeLessThanOrEqual(W);
      expect(r.y + r.height, `${edge} 하단`).toBeLessThanOrEqual(H);
    }
  });

  it('가장자리 띠와 모서리가 겹치지 않는다 — 겹치면 대각선 조절이 한 축만 잡힌다', () => {
    const rects = computeWidgetResizeRects(W, H);
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

    const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
    const edges = ['top', 'bottom', 'left', 'right'] as const;
    for (const c of corners) {
      for (const e of edges) {
        expect(overlaps(rects[c], rects[e]), `${c} 와 ${e} 가 겹친다`).toBe(false);
      }
    }
  });

  it('★잡기 쉬우려면 띠가 충분히 두꺼워야 한다 (2026-08-19 "잘 안 잡혀" 신고)', () => {
    // 예전 값은 가장자리 6 · 모서리 12 였다. 바탕화면 아래 모드에서는 커서가 ↔ 로 바뀌지
    // 못해 띠의 위치를 눈으로 알 수 없으므로, 표적이 작으면 사실상 못 잡는다.
    expect(WIDGET_RESIZE_EDGE_THICKNESS).toBeGreaterThanOrEqual(8);
    expect(WIDGET_RESIZE_CORNER_SIZE).toBeGreaterThanOrEqual(WIDGET_RESIZE_EDGE_THICKNESS);

    const rects = computeWidgetResizeRects(W, H);
    expect(rects.left.width).toBe(WIDGET_RESIZE_EDGE_THICKNESS);
    expect(rects.top.height).toBe(WIDGET_RESIZE_EDGE_THICKNESS);
    expect(rects['bottom-right'].width).toBe(WIDGET_RESIZE_CORNER_SIZE);
  });

  it('창이 손잡이보다 작아져도 음수 크기를 만들지 않는다', () => {
    const rects = computeWidgetResizeRects(10, 10);
    for (const edge of WIDGET_RESIZE_EDGES) {
      expect(rects[edge].width, `${edge} 폭`).toBeGreaterThanOrEqual(0);
      expect(rects[edge].height, `${edge} 높이`).toBeGreaterThanOrEqual(0);
    }
  });

  it('마주 보는 손잡이는 서로 거울상이다', () => {
    const rects = computeWidgetResizeRects(W, H);
    expect(rects.left.width).toBe(rects.right.width);
    expect(rects.top.height).toBe(rects.bottom.height);
    expect(rects.right.x + rects.right.width).toBe(W);
    expect(rects.bottom.y + rects.bottom.height).toBe(H);
  });
});
