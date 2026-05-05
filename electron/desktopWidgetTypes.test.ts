/**
 * dipToPhysical 단위 테스트.
 *
 * Phase 5 — DIP(Electron device-independent pixel) → Win32 physical pixel 변환.
 * 순수 함수이므로 electron 의존 없이 테스트 가능.
 */

import { describe, it, expect } from 'vitest';
import { dipToPhysical } from './desktopWidgetTypes';

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
