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

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'electronAPI');
});

function renderRail(overrides: Partial<Parameters<typeof SidePinRail>[0]> = {}) {
  const props = {
    pointerRegion: 'outside' as const,
    backgroundColor: 'rgba(var(--sp-widget-rgb), 1)',
    onZoneEnter: vi.fn(),
    onZoneLeave: vi.fn(),
    onZoneClick: vi.fn(),
    ...overrides,
  };
  render(<SidePinRail {...props} />);
  return props;
}

/**
 * 끌기 자리를 집어 온다.
 *
 * 포인터 캡처는 jsdom에 없거나 알 수 없는 pointerId 로 던지므로 여기서 갈아 끼운다.
 * 실제 Chromium 에서는 그대로 동작한다.
 */
function gripOf(): HTMLElement {
  const grip = document.querySelector('[data-sidepin-rail-grip]') as HTMLElement;
  Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() });
  return grip;
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

  test('끌기 자리를 누르면 손잡이 이동을 시작하고, 떼면 끝낸다', () => {
    const startRailDrag = vi.fn();
    const endRailDrag = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { sidePin: { startRailDrag, endRailDrag } },
    });
    renderRail();
    const grip = gripOf();

    fireEvent.pointerDown(grip, { button: 0, isPrimary: true, pointerId: 1 });
    expect(startRailDrag).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(endRailDrag).toHaveBeenCalledTimes(1);
  });

  test('여는 버튼을 눌러 끌어도 손잡이는 움직이지 않는다 — 잡는 순간 패널이 열리는 것을 막는다', () => {
    // 예전에는 손잡이 아무 데나 눌러 끌 수 있었다. 그러면 커서가 버튼에 닿는 순간
    // 시작된 180ms 펼침 예약이 먼저 터져, 잡으려던 손잡이 창이 숨어 버렸다.
    const startRailDrag = vi.fn();
    const endRailDrag = vi.fn();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { sidePin: { startRailDrag, endRailDrag } },
    });
    const props = renderRail();
    const button = screen.getByRole('button', { name: '위젯 열기' });

    fireEvent.pointerDown(button, { button: 0, isPrimary: true, pointerId: 1, screenY: 100 });
    fireEvent.pointerMove(button, { pointerId: 1, screenY: 140 });
    fireEvent.pointerUp(button, { pointerId: 1, screenY: 140 });
    fireEvent.click(button);

    expect(startRailDrag).not.toHaveBeenCalled();
    expect(endRailDrag).not.toHaveBeenCalled();
    // 여는 자리는 여전히 순수하게 열기만 한다
    expect(props.onZoneClick).toHaveBeenCalledWith('widget');
  });

  test('끌기 자리는 여는 버튼이 아니다 — 접근성 이름을 가진 버튼으로 새지 않는다', () => {
    renderRail();

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(gripOf().getAttribute('aria-hidden')).toBe('true');
  });

  test('누르는 동안에는 표시가 흐려지지 않는다 — 메인이 판정을 outside로 고정하기 때문', () => {
    // 손잡이는 8단계로만 움직여 한 칸이 100픽셀을 넘는다. 조금 끌면 창이 그대로라,
    // 여기서 표시까지 흐려지면 "눌리지 않았다"로 읽힌다.
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: { sidePin: { startRailDrag: vi.fn(), endRailDrag: vi.fn() } },
    });
    renderRail({ pointerRegion: 'outside' });
    const grip = gripOf();

    fireEvent.pointerDown(grip, { button: 0, isPrimary: true, pointerId: 1 });

    expect(grip.innerHTML).toContain('text-sp-accent');
    expect(grip.innerHTML).not.toContain('text-sp-muted');

    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(grip.innerHTML).toContain('text-sp-muted');
  });

  test('끌기 자리에 커서가 있으면 표시가 또렷해진다', () => {
    renderRail({ pointerRegion: 'rail-grip' });
    expect(gripOf().innerHTML).toContain('text-sp-text');

    cleanup();
    renderRail({ pointerRegion: 'outside' });
    expect(gripOf().innerHTML).toContain('text-sp-muted');
  });

  test('손잡이를 벗어나면 알린다', () => {
    const props = renderRail();

    const rail = screen.getByRole('button', { name: '위젯 열기' }).closest('[data-sidepin-rail]');
    fireEvent.mouseLeave(rail!);

    expect(props.onZoneLeave).toHaveBeenCalled();
  });

  test('들어간 구역만 강조된다 — 면이 통째로 뒤집힌다', () => {
    // `text-sp-accent` 로 부분 문자열 검사를 하면 안 된다. 활성 아이콘 색인
    // `text-sp-accent-fg` 가 그 글자를 포함해, 실제로는 구분이 사라져도 통과한다.
    renderRail({ pointerRegion: 'rail-widget' });

    const widget = screen.getByRole('button', { name: '위젯 열기' });
    const memo = screen.getByRole('button', { name: '메모 열기' });

    // 활성: 칩이 강조색으로 반전되고 글자색도 뒤집힌다
    expect(widget.innerHTML).toContain('bg-sp-accent ');
    expect(widget.innerHTML).toContain('text-sp-accent-fg');
    expect(widget.innerHTML).toContain('opacity-100');

    // 비활성: 칩은 기본 면, 아이콘은 흐린 색, 방향선은 숨는다
    expect(memo.innerHTML).toContain('bg-sp-border');
    // 흐린 색(text-sp-muted)이 아니라 본문 색이어야 한다. 손잡이는 폭이 1.4cm뿐이라
    // 아이콘이 흐리면 무엇이 있는지 보이지 않는다.
    expect(memo.innerHTML).toContain('text-sp-text');
    expect(memo.innerHTML).toContain('opacity-0');
    expect(memo.innerHTML).not.toContain('text-sp-accent-fg');
  });

  test('마우스를 올리기 전에도 칩이 보인다 — "빈 막대"로 읽히면 안 된다', () => {
    // 이 손잡이는 늘 화면에 떠 있다. 아무 표시가 없으면 처음 본 교사는
    // 여기에 무엇이 있는지, 마우스를 대면 뭐가 열리는지 알 수 없다.
    renderRail({ pointerRegion: 'outside' });

    for (const name of ['위젯 열기', '메모 열기']) {
      expect(screen.getByRole('button', { name }).innerHTML).toContain('bg-sp-border');
    }
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
    // 예: bg-sp-border/50 은 이 저장소에서 동작하지 않는다
    expect(source).not.toMatch(/-sp-[a-z-]+\/\d/);
  });

  test('raw text-white 를 쓰지 않는다 — 라이트 모드에서 안 보인다', () => {
    expect(source).not.toMatch(/\btext-white\b/);
  });

  test('칩은 24px 고정이며 호버 때 비율로 다시 계산하지 않는다', () => {
    expect(source).toMatch(/h-\[24px\] w-\[24px\] shrink-0/);
    expect(source).not.toMatch(/clamp\(/);
    expect(source).not.toMatch(/\bh-6\b|\bw-6\b/);
  });

  test('실제 클릭 대상도 네이티브 hitbox와 같은 44px다', () => {
    expect(source).toMatch(/h-11 w-11/);
  });
});

describe('끌 때 글자가 파랗게 잡히지 않는가', () => {
  /**
   * 주석을 먼저 걷어낸다.
   *
   * 주석에는 중괄호가 없어서, 그냥 두면 규칙 바로 위의 설명문이 통째로 선택자에
   * 딸려 들어온다(처음 이렇게 짰다가 실제로 걸렸다).
   */
  const CSS = readFileSync(resolve(__dirname, '../../../index.css'), 'utf-8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  /**
   * `user-select: none` 을 거는 규칙의 **선택자**만 모은다.
   *
   * `-webkit-user-select` 는 세지 않는다(같은 규칙을 두 번 세게 된다). 앞 글자가
   * 붙임표가 아닌 것만 본다.
   */
  const blockingSelectors = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((rule) => /(^|[^-])user-select:\s*none/.test(rule[2] as string))
    .map((rule) => (rule[1] as string).trim());

  test('손잡이에 글자 선택 막기를 건다', () => {
    // 규칙을 못 찾고 빈 목록끼리 비교하면 아래 검사들이 무의미하게 통과한다.
    expect(blockingSelectors.length).toBeGreaterThan(0);
    expect(blockingSelectors).toContain('[data-sidepin-rail]');
  });

  test('CSS 가 가리키는 표식을 손잡이가 실제로 달고 있다 — 이름이 어긋나면 규칙이 헛돈다', () => {
    renderRail();

    const rail = document.querySelector('[data-sidepin-rail]');
    expect(rail).toBeTruthy();
    // 끌기 자리가 그 안에 있어야 누르는 순간 선택이 시작되지 않는다.
    expect(rail!.contains(gripOf())).toBe(true);
  });

  test('패널 쪽으로 범위를 넓히지 않는다 — 메모를 고치고 긁어 복사하는 흐름이 죽는다', () => {
    // 옆핀 메모는 읽고 옮겨 적는 용도로도 쓰이고, 메모 편집기는 글자를 고르고
    // 고치는 것이 본업이다. 손잡이 말고 옆핀의 다른 자리를 막으면 여기서 걸린다.
    const sidePinSelectors = blockingSelectors.filter((selector) =>
      /sidepin|ssampin-sidepin/i.test(selector),
    );

    expect(sidePinSelectors).toEqual(['[data-sidepin-rail]']);
  });

  test('패널 쪽 화면이 코드로도 선택을 막지 않는다', () => {
    // CSS 를 피해 인라인(style.userSelect)으로 막는 우회로도 같이 닫는다.
    for (const file of [
      'SidePinPanel.tsx',
      'SidePinMemoZone.tsx',
      'SidePinMemoList.tsx',
      'SidePinMemoEditor.tsx',
      'SidePinWidgetZone.tsx',
    ]) {
      const source = readFileSync(resolve(__dirname, file), 'utf-8');
      expect(source).not.toMatch(/userSelect|user-select|select-none/);
    }
  });
});
