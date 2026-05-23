import { describe, it, expect } from 'vitest';
import { computeResizeBounds } from './desktopWidgetManager';

const START = { x: 1000, y: 500, width: 400, height: 300 };
const MIN_W = 300;
const MIN_H = 200;

describe('computeResizeBounds — Phase 7-D 2차 fix 회귀 가드', () => {
  it('left edge dx > 0 (clamp 미적용): newX = start.x + dx, newW = start.width - dx', () => {
    const r = computeResizeBounds('left', START, 50, 0, MIN_W, MIN_H);
    expect(r).toEqual({ x: 1050, y: 500, width: 350, height: 300 });
  });

  it('left edge dx > startWidth - MIN_W (clamp 진입): newX = start.x + start.width - MIN_W, newW = MIN_W', () => {
    // dx = 200 > start.width - MIN_W = 100 → clamp
    const r = computeResizeBounds('left', START, 200, 0, MIN_W, MIN_H);
    expect(r).toEqual({ x: 1100, y: 500, width: MIN_W, height: 300 });
  });

  it('right edge dx > 0 (회귀 가드): newX 불변, newW = start.width + dx', () => {
    const r = computeResizeBounds('right', START, 50, 0, MIN_W, MIN_H);
    expect(r).toEqual({ x: 1000, y: 500, width: 450, height: 300 });
  });

  it('top-left corner: x/y/w/h 모두 변경 + left/top 양쪽 origin 보정 동시 적용', () => {
    const r = computeResizeBounds('top-left', START, -30, -20, MIN_W, MIN_H);
    expect(r).toEqual({ x: 970, y: 480, width: 430, height: 320 });
  });

  it('SWP flag SSOT 메타테스트: moveAndResizeWidgetSync는 SWP_ASYNCWINDOWPOS 비포함', async () => {
    // ADR-007/ADR-008 패턴 — 부호/플래그 회귀 차단.
    // moveAndResizeWidgetSync 구현이 sync 채택(SWP_ASYNCWINDOWPOS 제외)임을 정적으로 보장.
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(path.resolve(__dirname, 'platform/win32Desktop.ts'), 'utf-8');
    const fnMatch = source.match(/export function moveAndResizeWidgetSync[\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![0];
    // SWP_ASYNCWINDOWPOS가 실제 플래그 연산(|)에 사용되면 안 됨.
    // 주석에서 언급(제외 명시)되는 것은 허용 — 코드 라인만 추출해 검사.
    const codeLines = body
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    expect(codeLines).not.toMatch(/SWP_ASYNCWINDOWPOS/);
    expect(body).toMatch(/SWP_NOZORDER/);
    expect(body).toMatch(/SWP_NOACTIVATE/);
  });
});
