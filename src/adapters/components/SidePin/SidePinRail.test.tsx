/**
 * @vitest-environment jsdom
 *
 * 옆핀 손잡이 렌더 테스트.
 *
 * 동작뿐 아니라 **디자인 규칙 준수 자체**도 고정한다. 하드코딩 색·글로우·직각은
 * 이 저장소에서 반복해서 지적된 것들이라, 사람이 매번 눈으로 보는 대신 그물을 둔다.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SidePinRail } from './SidePinRail';

afterEach(cleanup);

function renderRail(overrides: Partial<Parameters<typeof SidePinRail>[0]> = {}) {
  const props = {
    pointerRegion: 'outside' as const,
    onZoneEnter: vi.fn(),
    onZoneLeave: vi.fn(),
    onZoneClick: vi.fn(),
    ...overrides,
  };
  render(<SidePinRail {...props} />);
  return props;
}

describe('손잡이 동작', () => {
  test('위젯·메모 두 입구를 한국어 이름으로 제공한다', () => {
    renderRail();

    expect(screen.getByRole('button', { name: '위젯 열기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '메모 열기' })).toBeTruthy();
  });

  test('구역에 들어가면 어느 쪽인지 알린다', () => {
    const props = renderRail();

    fireEvent.mouseEnter(screen.getByRole('button', { name: '메모 열기' }));

    expect(props.onZoneEnter).toHaveBeenCalledWith('rail-memo');
  });

  test('키보드 포커스도 진입으로 친다 — 마우스 없이 열 수 있어야 한다', () => {
    const props = renderRail();

    fireEvent.focus(screen.getByRole('button', { name: '위젯 열기' }));

    expect(props.onZoneEnter).toHaveBeenCalledWith('rail-widget');
  });

  test('클릭하면 그 구역을 연다', () => {
    const props = renderRail();

    fireEvent.click(screen.getByRole('button', { name: '위젯 열기' }));

    expect(props.onZoneClick).toHaveBeenCalledWith('widget');
  });

  test('손잡이를 벗어나면 알린다', () => {
    const props = renderRail();

    fireEvent.mouseLeave(screen.getByRole('button', { name: '위젯 열기' }).parentElement!);

    expect(props.onZoneLeave).toHaveBeenCalled();
  });

  test('들어간 구역만 강조된다', () => {
    renderRail({ pointerRegion: 'rail-widget' });

    const widget = screen.getByRole('button', { name: '위젯 열기' });
    const memo = screen.getByRole('button', { name: '메모 열기' });

    expect(widget.innerHTML).toContain('text-sp-accent');
    expect(memo.innerHTML).not.toContain('text-sp-accent');
  });
});

describe('디자인 규칙', () => {
  const source = readFileSync(resolve(__dirname, 'SidePinRail.tsx'), 'utf-8');

  test('하드코딩 색을 쓰지 않는다 — sp-* 토큰만', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(bg|text|border)-(red|blue|green|gray|slate|zinc)-\d{2,3}\b/);
  });

  test('글로우를 쓰지 않는다 — 이 제품의 안티레퍼런스다', () => {
    expect(source).not.toMatch(/shadow-\[|drop-shadow|blur-|glow/);
  });

  test('직각을 쓰지 않고, rounded-sp-* 도 쓰지 않는다', () => {
    expect(source).toMatch(/rounded-/);
    expect(source).not.toMatch(/rounded-none/);
    expect(source).not.toMatch(/rounded-sp-/);
  });

  test('sp-* 토큰에 투명도 수식을 붙이지 않는다 — 조용히 투명해진다', () => {
    // 예: bg-sp-card/50 은 이 저장소에서 동작하지 않는다
    expect(source).not.toMatch(/-sp-[a-z-]+\/\d/);
  });

  test('raw text-white 를 쓰지 않는다 — 라이트 모드에서 안 보인다', () => {
    expect(source).not.toMatch(/\btext-white\b/);
  });
});
