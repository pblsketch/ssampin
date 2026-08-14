/**
 * @vitest-environment jsdom
 *
 * 옆핀 패널 렌더 테스트.
 *
 * 이 기능의 핵심 결정 하나를 여기서 지킨다 — **위젯과 메모를 탭으로 갈아 끼우지 않는다.**
 * 둘이 동시에 보이지 않으면 "잠깐 확인하고 닫는다"는 목적이 무너진다.
 */
import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SidePinPanel } from './SidePinPanel';

afterEach(cleanup);

function renderPanel(overrides: Partial<Parameters<typeof SidePinPanel>[0]> = {}) {
  const props = {
    pinnedZone: 'none' as const,
    activeZone: null,
    backgroundColor: 'rgba(var(--sp-widget-rgb), 1)',
    appearanceOpen: false,
    onToggleAppearance: vi.fn(),
    widgetSlot: <div>위젯 자리</div>,
    memoSlot: <div>메모 자리</div>,
    onTogglePin: vi.fn(),
    onClose: vi.fn(),
    onOpenMain: vi.fn(),
    ...overrides,
  };
  render(<SidePinPanel {...props} />);
  return props;
}

describe('들어온 칸이 더 넓다', () => {
  /** 두 칸을 감싸는 요소의 클래스를 꺼낸다 */
  function zoneClasses(): { widget: string; memo: string } {
    const widget = screen.getByText('위젯 자리').parentElement;
    const memo = screen.getByText('메모 자리').parentElement;
    return { widget: widget?.className ?? '', memo: memo?.className ?? '' };
  }

  test('메모 칸으로 들어오면 메모가 더 넓다', () => {
    renderPanel({ activeZone: 'memo' });

    const { widget, memo } = zoneClasses();
    expect(memo).toContain('flex-[3]');
    expect(widget).toContain('flex-[2]');
  });

  test('위젯 칸으로 들어오면 위젯이 더 넓다', () => {
    renderPanel({ activeZone: 'widget' });

    const { widget, memo } = zoneClasses();
    expect(widget).toContain('flex-[3]');
    expect(memo).toContain('flex-[2]');
  });

  test('가리킨 곳이 없으면(단축키 등) 임의로 메모를 키우지 않는다', () => {
    // 사용자가 정하지 않은 것을 앱이 정하면 안 된다. 기본은 위젯이 넓은 쪽이다.
    renderPanel({ activeZone: null });

    expect(zoneClasses().widget).toContain('flex-[3]');
  });

  test('한쪽을 아예 숨기지는 않는다 — 위아래로 나란히 둔 이유가 사라진다', () => {
    renderPanel({ activeZone: 'memo' });

    expect(screen.getByText('위젯 자리')).toBeTruthy();
    expect(screen.getByText('메모 자리')).toBeTruthy();
  });
});

describe('패널 구조', () => {
  test('위젯과 메모가 동시에 보인다 — 탭으로 갈아 끼우지 않는다', () => {
    renderPanel();

    expect(screen.getByText('위젯 자리')).toBeTruthy();
    expect(screen.getByText('메모 자리')).toBeTruthy();
  });

  test('한국어 이름을 가진 영역이다', () => {
    renderPanel();

    expect(screen.getByRole('region', { name: '옆핀' })).toBeTruthy();
  });

  test('고정·닫기 버튼이 있다', () => {
    renderPanel();

    expect(screen.getByRole('button', { name: '고정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
  });

  test('메인 쌤핀으로 돌아갈 길이 반드시 있다', () => {
    // 옆핀은 위젯·아이콘과 같은 계열의 "접어 둔 상태"라 메인 창이 숨어 있다.
    // 돌아갈 버튼이 없으면 사용자는 트레이를 뒤지거나 앱을 다시 켠다.
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '쌤핀 열기' }));

    expect(props.onOpenMain).toHaveBeenCalled();
  });
});

describe('고정', () => {
  test('고정 버튼을 누르면 두 영역을 함께 고정한다', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '고정' }));

    expect(props.onTogglePin).toHaveBeenCalledWith('both');
  });

  test('고정된 상태는 눌린 상태로 표시되고 이름이 해제로 바뀐다', () => {
    renderPanel({ pinnedZone: 'both' });

    const button = screen.getByRole('button', { name: '고정 해제' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  test('닫기를 누르면 알린다', () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('메모 편집 중', () => {
  test('편집 중에도 위젯 영역이 사라지지는 않는다 — 요약 높이로 접힐 뿐이다', () => {
    renderPanel({ memoEditing: true });

    expect(screen.getByText('위젯 자리')).toBeTruthy();
    expect(screen.getByText('메모 자리')).toBeTruthy();
  });
});

describe('디자인 규칙', () => {
  const source = readFileSync(resolve(__dirname, 'SidePinPanel.tsx'), 'utf-8');

  test('하드코딩 색을 쓰지 않는다 — sp-* 토큰만', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(bg|text|border)-(red|blue|green|gray|slate|zinc)-\d{2,3}\b/);
  });

  test('글로우를 쓰지 않는다', () => {
    expect(source).not.toMatch(/shadow-\[|drop-shadow|blur-|glow/);
  });

  test('직각을 쓰지 않고, rounded-sp-* 도 쓰지 않는다', () => {
    expect(source).toMatch(/rounded-/);
    expect(source).not.toMatch(/rounded-none/);
    expect(source).not.toMatch(/rounded-sp-/);
  });

  test('sp-* 토큰에 투명도 수식을 붙이지 않는다', () => {
    expect(source).not.toMatch(/-sp-[a-z-]+\/\d/);
  });

  test('raw text-white 를 쓰지 않는다', () => {
    expect(source).not.toMatch(/\btext-white\b/);
  });

  test('스크롤 영역에 min-h-0 이 있다 — 없으면 헤더가 잘린다', () => {
    // 이 저장소에서 이미 겪은 문제(modal-scroll-overflow-fix)라 그물을 둔다
    const scrollAreas = source.match(/overflow-y-auto/g) ?? [];
    const minH0 = source.match(/min-h-0/g) ?? [];
    expect(minH0.length).toBeGreaterThanOrEqual(scrollAreas.length);
  });

  test('Anime.js가 시작하기 전부터 패널은 화면 오른쪽 바깥에 있다', () => {
    expect(source).toMatch(/transform:\s*SIDE_PIN_HIDDEN_TRANSFORM/);
    expect(source).toMatch(/opacity:\s*SIDE_PIN_HIDDEN_OPACITY/);
  });
});
