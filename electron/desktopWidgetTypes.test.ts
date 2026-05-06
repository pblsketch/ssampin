/**
 * dipToPhysical 단위 테스트.
 *
 * Phase 5 — DIP(Electron device-independent pixel) → Win32 physical pixel 변환.
 * 순수 함수이므로 electron 의존 없이 테스트 가능.
 */

import { describe, it, expect } from 'vitest';
import { dipToPhysical, isInsideAnyRect } from './desktopWidgetTypes';

describe('dipToPhysical', () => {
  it('scaleFactor === 1 → 항등 변환', () => {
    const result = dipToPhysical({ x: 100, y: 200, width: 800, height: 600 }, 1);
    expect(result).toEqual({ x: 100, y: 200, width: 800, height: 600 });
  });

  it('scaleFactor === 1.25 → 25% 확대', () => {
    const result = dipToPhysical({ x: 100, y: 100, width: 100, height: 100 }, 1.25);
    // x=125, y=125, right=Math.round(200*1.25)=250 → width=125
    expect(result).toEqual({ x: 125, y: 125, width: 125, height: 125 });
  });

  it('scaleFactor === 1.5 → 50% 확대', () => {
    const result = dipToPhysical({ x: 100, y: 100, width: 100, height: 100 }, 1.5);
    // x=150, y=150, right=Math.round(200*1.5)=300 → width=150
    expect(result).toEqual({ x: 150, y: 150, width: 150, height: 150 });
  });

  it('scaleFactor === 2 → 200% (4K 모니터)', () => {
    const result = dipToPhysical({ x: 0, y: 0, width: 1920, height: 1080 }, 2);
    expect(result).toEqual({ x: 0, y: 0, width: 3840, height: 2160 });
  });

  it('우/하단 round 후 차이로 width 계산 — 누적 오차 차단', () => {
    // 만약 width를 별도 round했다면: round(0.5*1.5)=1, round(1*1.5)=2 → width=2
    // right-x 방식: right=round(1.5*1.5)=2, x=round(0.5*1.5)=1 → width=1 (정확)
    const result = dipToPhysical({ x: 0.5, y: 0.5, width: 1, height: 1 }, 1.5);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('음수 좌표 (멀티모니터 좌측 monitor 시작점) 정상 처리', () => {
    const result = dipToPhysical({ x: -1920, y: 0, width: 1920, height: 1080 }, 1);
    expect(result).toEqual({ x: -1920, y: 0, width: 1920, height: 1080 });
  });

  it('scaleFactor가 falsy일 가능성 있는 환경에서 호출자가 1로 강제하면 안전', () => {
    // dipToPhysical 자체는 scaleFactor를 그대로 받지만, manager에서 `display.scaleFactor || 1`
    // 처리. 여기선 1 fallback 결과만 확인.
    const result = dipToPhysical({ x: 100, y: 200, width: 300, height: 400 }, 1);
    expect(result).toEqual({ x: 100, y: 200, width: 300, height: 400 });
  });

  it('소수점 scaleFactor (1.75 = 175%) 정상 round', () => {
    const result = dipToPhysical({ x: 0, y: 0, width: 1000, height: 1000 }, 1.75);
    expect(result.width).toBe(1750);
    expect(result.height).toBe(1750);
  });
});

describe('isInsideAnyRect (Phase 7-C 헤더 드래그 hit-test)', () => {
  it('빈 배열은 항상 false', () => {
    expect(isInsideAnyRect({ x: 100, y: 100 }, [])).toBe(false);
  });

  it('단일 사각형 내부 좌표는 true', () => {
    const rects = [{ x: 100, y: 100, width: 200, height: 50 }];
    expect(isInsideAnyRect({ x: 150, y: 120 }, rects)).toBe(true);
    expect(isInsideAnyRect({ x: 100, y: 100 }, rects)).toBe(true); // 좌상단 포함
  });

  it('우/하단 경계는 exclusive (right/bottom edge 자체는 miss)', () => {
    const rects = [{ x: 100, y: 100, width: 200, height: 50 }];
    // x = 100 + 200 = 300 → exclusive
    expect(isInsideAnyRect({ x: 300, y: 120 }, rects)).toBe(false);
    expect(isInsideAnyRect({ x: 150, y: 150 }, rects)).toBe(false);
  });

  it('다중 사각형 중 하나라도 포함하면 true', () => {
    const rects = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 500, y: 500, width: 100, height: 100 },
    ];
    expect(isInsideAnyRect({ x: 50, y: 50 }, rects)).toBe(true);
    expect(isInsideAnyRect({ x: 550, y: 550 }, rects)).toBe(true);
    expect(isInsideAnyRect({ x: 250, y: 250 }, rects)).toBe(false);
  });

  it('어느 사각형에도 포함 안 되면 false', () => {
    const rects = [{ x: 100, y: 100, width: 200, height: 50 }];
    expect(isInsideAnyRect({ x: 0, y: 0 }, rects)).toBe(false);
    expect(isInsideAnyRect({ x: 400, y: 200 }, rects)).toBe(false);
  });

  it('음수 좌표 및 사각형(멀티모니터 좌측) 정상 처리', () => {
    const rects = [{ x: -1920, y: 0, width: 100, height: 50 }];
    expect(isInsideAnyRect({ x: -1900, y: 20 }, rects)).toBe(true);
    expect(isInsideAnyRect({ x: -2000, y: 20 }, rects)).toBe(false);
  });
});
