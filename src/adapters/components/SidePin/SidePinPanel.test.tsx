/**
 * @vitest-environment jsdom
 *
 * 옆핀 패널 렌더 테스트.
 *
 * 이 기능의 핵심 결정 하나를 여기서 지킨다 — **접힌 칸도 화면에서 사라지지 않는다.**
 * 들어온 칸이 화면을 거의 다 쓰되 반대 칸은 48px 띠로 남아, 누르면 돌아올 수 있어야 한다.
 * 띠마저 사라지면 탭이 되고, 반대 칸의 존재 자체가 안 보인다.
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
    onFocusZone: vi.fn(),
    onClose: vi.fn(),
    onOpenMain: vi.fn(),
    ...overrides,
  };
  render(<SidePinPanel {...props} />);
  return props;
}

describe('들어온 칸이 화면을 거의 다 쓴다', () => {
  /** 두 칸을 감싸는 요소를 꺼낸다 */
  function zoneOf(zone: 'widget' | 'memo'): HTMLElement {
    const el = document.querySelector(`[data-sidepin-zone="${zone}"]`);
    if (el === null) throw new Error(`${zone} 칸을 찾을 수 없다`);
    return el as HTMLElement;
  }

  test('메모 칸으로 들어오면 메모가 펼쳐지고 위젯은 띠가 된다', () => {
    renderPanel({ activeZone: 'memo' });

    expect(zoneOf('memo').getAttribute('data-sidepin-zone-fit')).toBe('full');
    expect(zoneOf('widget').getAttribute('data-sidepin-zone-fit')).toBe('band');
  });

  test('위젯 칸으로 들어오면 거울이다', () => {
    renderPanel({ activeZone: 'widget' });

    expect(zoneOf('widget').getAttribute('data-sidepin-zone-fit')).toBe('full');
    expect(zoneOf('memo').getAttribute('data-sidepin-zone-fit')).toBe('band');
  });

  test.each([['both'], [null]] as const)(
    '가리킨 곳이 없으면(%s) 둘 다 나눠 쓴다 — 임의로 한쪽을 키우지 않는다',
    (activeZone) => {
      renderPanel({ activeZone });

      expect(zoneOf('widget').getAttribute('data-sidepin-zone-fit')).toBe('shared');
      expect(zoneOf('widget').className).toContain('flex-[3]');
      expect(zoneOf('memo').className).toContain('flex-[2]');
    },
  );

  test('접힌 칸도 화면에서 사라지지 않는다 — 띠로 남는다', () => {
    renderPanel({ activeZone: 'memo' });

    expect(screen.getByRole('button', { name: '위젯 칸 펼치기' })).toBeTruthy();
  });

  test('접힌 칸의 본문은 들어내지 않고 감춘다 — 들어내면 스크롤·검색어가 초기화된다', () => {
    renderPanel({ activeZone: 'memo' });

    // 여전히 DOM에 있다(= 다시 만들어지지 않는다)
    expect(screen.getByText('위젯 자리')).toBeTruthy();
    expect(screen.getByText('위젯 자리').parentElement?.className).toContain('hidden');
  });

  test('접힌 칸은 스크롤되지 않는다 — 머리말이 밀려 나가면 펼칠 곳이 사라진다', () => {
    renderPanel({ activeZone: 'memo' });

    const widget = zoneOf('widget').className;
    expect(widget).toContain('overflow-hidden');
    expect(widget).not.toContain('overflow-y-auto');
  });

  test('띠를 누르면 그 칸으로 넘어가자고 알린다', () => {
    const props = renderPanel({ activeZone: 'memo' });

    fireEvent.click(screen.getByRole('button', { name: '위젯 칸 펼치기' }));

    expect(props.onFocusZone).toHaveBeenCalledTimes(1);
    expect(props.onFocusZone).toHaveBeenCalledWith('widget');
  });
});

describe('패널 구조', () => {
  test('가리킨 곳이 없으면 위젯과 메모가 동시에 보인다', () => {
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

describe('고정 — 지금 보는 칸을 겨눈다', () => {
  test('가리킨 곳이 없으면 두 칸을 함께 고정한다', () => {
    const props = renderPanel({ activeZone: null });

    fireEvent.click(screen.getByRole('button', { name: '고정' }));

    expect(props.onTogglePin).toHaveBeenCalledWith('both');
  });

  test('메모 칸을 보는 중이면 메모를 고정한다', () => {
    // 늘 both 를 넘기면 손잡이로 한 칸을 고정해 둔 상태에서 해제가 아니라 재고정이 되고,
    // activeZone 까지 함께 풀려 화면이 반으로 갈라진다.
    const props = renderPanel({ activeZone: 'memo' });

    fireEvent.click(screen.getByRole('button', { name: '메모 고정' }));

    expect(props.onTogglePin).toHaveBeenCalledWith('memo');
  });

  test('지금 칸이 고정돼 있으면 이름이 해제로 바뀐다', () => {
    renderPanel({ activeZone: 'memo', pinnedZone: 'memo' });

    const button = screen.getByRole('button', { name: '고정 해제' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  test('다른 칸이 고정돼 있으면 "고정 해제"라고 쓰지 않는다 — 눌러도 안 풀린다', () => {
    // 손잡이 위젯 버튼으로 고정한 뒤 메모 칸으로 넘어온 상황.
    renderPanel({ activeZone: 'memo', pinnedZone: 'widget' });

    expect(screen.queryByRole('button', { name: '고정 해제' })).toBeNull();
    expect(screen.getByRole('button', { name: '메모 고정' })).toBeTruthy();
  });

  test('양쪽 고정 상태에서 두 칸을 나눠 보고 있으면 해제로 표시된다', () => {
    renderPanel({ activeZone: 'both', pinnedZone: 'both' });

    expect(screen.getByRole('button', { name: '고정 해제' })).toBeTruthy();
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

  test('편집 때문에 접힌 띠는 누를 수 없다 — 눌러도 편집이 이겨 그대로다', () => {
    renderPanel({ memoEditing: true });

    expect(screen.queryByRole('button', { name: '위젯 칸 펼치기' })).toBeNull();
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

describe('쓰는 칸에 자리를 몰아준다', () => {
  function zoneClassesOf(): { widget: string; memo: string } {
    return {
      widget: document.querySelector('[data-sidepin-zone="widget"]')?.className ?? '',
      memo: document.querySelector('[data-sidepin-zone="memo"]')?.className ?? '',
    };
  }

  test('메모를 쓰는 중이면 위젯 칸이 접힌다', () => {
    renderPanel({ memoEditing: true });

    const { widget, memo } = zoneClassesOf();
    expect(widget).toContain('h-12');
    expect(memo).not.toContain('h-12');
  });

  test('위젯을 고치는 중이면 메모 칸이 접힌다 — 메모의 거울이다', () => {
    renderPanel({ widgetEditing: true });

    const { widget, memo } = zoneClassesOf();
    expect(memo).toContain('h-12');
    expect(widget).not.toContain('h-12');
  });

  test('둘 다 참으로 들어와도 둘 다 접히지는 않는다 — 아무것도 안 보이는 화면이 된다', () => {
    // 실제로는 한 칸이 48px 띠면 그 안에서 편집을 시작할 수 없어 동시에 참일 수 없다.
    // 그래도 방어한다. 둘 다 접히면 사용자가 되돌릴 방법이 없다.
    renderPanel({ memoEditing: true, widgetEditing: true });

    const { widget, memo } = zoneClassesOf();
    expect([widget.includes('h-12'), memo.includes('h-12')]).toContain(false);
  });

  test('아무 데도 안 쓰면 둘 다 펴져 있다 — 동시에 보이는 것이 이 기능의 전제다', () => {
    renderPanel();

    const { widget, memo } = zoneClassesOf();
    expect(widget).not.toContain('h-12');
    expect(memo).not.toContain('h-12');
  });
});
