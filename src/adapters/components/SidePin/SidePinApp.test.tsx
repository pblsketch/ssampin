/**
 * @vitest-environment jsdom
 *
 * 옆핀 화면 조립부 테스트.
 *
 * 여기서 지키는 것은 "화면이 스스로 판단하지 않는다"는 규칙과,
 * 빠뜨리면 조용히 망가지는 두 신호(그렸다 / 포인터 위치)다.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SidePinApp, toViewState } from './SidePinApp';

interface Bridge {
  onStateChanged: ReturnType<typeof vi.fn>;
  reportPointerRegion: ReturnType<typeof vi.fn>;
  togglePin: ReturnType<typeof vi.fn>;
  requestClose: ReturnType<typeof vi.fn>;
  openMain: ReturnType<typeof vi.fn>;
  reportPainted: ReturnType<typeof vi.fn>;
}

let bridge: Bridge;
let push: ((state: unknown) => void) | null = null;

/**
 * 위젯 칸은 진짜 위젯을 그린다. 그 안에서 `ResizeObserver`를 쓰는데 jsdom에는 없다.
 * 실제 앱(Electron)에는 있으므로 제품 문제가 아니라 시험 환경의 빈 자리다.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/**
 * 주제 색을 입히는 부분이 `matchMedia`로 시스템 다크 모드를 확인하는데 jsdom에는 없다.
 * 실제 앱에는 있으므로 제품 문제가 아니라 시험 환경의 빈 자리다.
 */
function stubMatchMedia(): void {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  stubMatchMedia();
  push = null;
  bridge = {
    onStateChanged: vi.fn((cb: (s: unknown) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    }),
    reportPointerRegion: vi.fn(),
    togglePin: vi.fn(),
    requestClose: vi.fn(),
    openMain: vi.fn(),
    reportPainted: vi.fn(),
  };
  (window as unknown as { electronAPI: unknown }).electronAPI = { sidePin: bridge };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

/** main이 상태를 보내온 상황 */
function send(state: Record<string, unknown>): void {
  act(() => {
    push?.({ surface: 'collapsed', pinnedZone: 'none', pointerRegion: 'outside', ...state });
  });
}

describe('보호 상태 판단 — 뒤집히면 잠금 화면 위로 메모가 샌다', () => {
  const base = { surface: 'collapsed', pinnedZone: 'none', pointerRegion: 'outside' };

  test('보호 이유가 없을 때만 잠기지 않은 것으로 본다', () => {
    expect(toViewState({ ...base, protectedReason: null })?.locked).toBe(false);
  });

  test.each(['lock', 'suspend', 'fullscreen', 'virtual-desktop-hidden', 'adapter-unhealthy'])(
    '보호 이유 %s 는 잠긴 것으로 본다',
    (reason) => {
      expect(toViewState({ ...base, protectedReason: reason })?.locked).toBe(true);
    },
  );

  test('값이 아예 없으면 잠긴 쪽으로 판단한다 — 애매할 때 보여주면 안 된다', () => {
    // 형식이 어긋난 전문이 왔을 때 내용을 보여주는 쪽으로 기울면,
    // 정작 가려야 할 순간에 새는 것은 이쪽이다.
    expect(toViewState(base)?.locked).toBe(true);
  });
});

describe('무엇을 그리는가', () => {
  test('접혔을 때는 손잡이만 보인다', () => {
    render(<SidePinApp />);

    expect(screen.getByRole('button', { name: '위젯 열기' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: '옆핀' })).toBeNull();
  });

  test('펼쳐지면 패널이 보인다', () => {
    render(<SidePinApp />);

    send({ surface: 'expanded' });

    expect(screen.getByRole('region', { name: '옆핀' })).toBeTruthy();
  });

  test('여는 중에도 패널을 그린다 — 그려야 "그렸다"고 알릴 수 있다', () => {
    render(<SidePinApp />);

    send({ surface: 'opening' });

    expect(screen.getByRole('region', { name: '옆핀' })).toBeTruthy();
  });

  test('위젯 칸에도 실제 위젯 화면이 들어간다', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    expect(screen.getByRole('region', { name: '위젯' })).toBeTruthy();
  });

  test('접힌 손잡이가 창 높이를 그대로 채운다 — 안 그러면 아래가 빈 채로 남는다', () => {
    // 부모 높이에 기대면(h-full) 높이 사슬이 한 군데만 끊겨도 손잡이가 내용 높이로
    // 쪼그라들어, 창 위쪽 일부만 차지하고 나머지가 흰 판처럼 드러난다.
    const { container } = render(<SidePinApp />);
    send({ surface: 'collapsed' });

    expect(container.querySelector('.h-screen')).toBeTruthy();
  });

  test('문서 배경을 투명하게 만든다 — 창은 투명한데 문서가 희면 흰 판이 보인다', () => {
    render(<SidePinApp />);

    expect(document.body.classList.contains('ssampin-sidepin')).toBe(true);
    expect(document.body.style.background).toBe('transparent');
  });

  test('화면이 사라지면 문서 배경을 되돌린다 — 다른 창까지 투명해지면 안 된다', () => {
    const { unmount } = render(<SidePinApp />);

    unmount();

    expect(document.body.classList.contains('ssampin-sidepin')).toBe(false);
    expect(document.body.style.background).toBe('');
  });

  test('메모 칸에는 실제 메모 화면이 들어간다', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    expect(screen.getByRole('region', { name: '메모' })).toBeTruthy();
  });
});

describe('빠뜨리면 조용히 망가지는 신호', () => {
  test('패널을 그리면 "다 그렸다"고 알린다 — 없으면 3초 뒤 혼자 닫힌다', async () => {
    render(<SidePinApp />);
    send({ surface: 'opening' });

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(bridge.reportPainted).toHaveBeenCalled();
  });

  test('접힌 상태에서는 그렸다고 알리지 않는다', async () => {
    render(<SidePinApp />);

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });

    expect(bridge.reportPainted).not.toHaveBeenCalled();
  });

  test('손잡이 구역에 들어가면 어디인지 알린다', () => {
    render(<SidePinApp />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: '메모 열기' }));

    expect(bridge.reportPointerRegion).toHaveBeenCalledWith('rail-memo');
  });
});

describe('사람이 한 일을 되돌려 보낸다', () => {
  test('고정 버튼', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    fireEvent.click(screen.getByRole('button', { name: '고정' }));

    expect(bridge.togglePin).toHaveBeenCalledWith('both');
  });

  test('닫기 버튼', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(bridge.requestClose).toHaveBeenCalled();
  });

  test('쌤핀 열기 버튼 — 메인으로 돌아갈 유일한 길', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    fireEvent.click(screen.getByRole('button', { name: '쌤핀 열기' }));

    expect(bridge.openMain).toHaveBeenCalled();
  });
});

describe('화면은 스스로 판단하지 않는다', () => {
  test('손잡이를 클릭해도 화면이 먼저 펼치지 않는다 — main의 답을 기다린다', () => {
    render(<SidePinApp />);

    fireEvent.click(screen.getByRole('button', { name: '위젯 열기' }));

    // 알리기만 하고, 상태는 그대로다
    expect(bridge.togglePin).toHaveBeenCalledWith('widget');
    expect(screen.queryByRole('region', { name: '옆핀' })).toBeNull();
  });

  test('알 수 없는 상태가 오면 무시하고 이전 화면을 유지한다', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    act(() => {
      push?.({ 이상한: '값' });
    });

    expect(screen.getByRole('region', { name: '옆핀' })).toBeTruthy();
  });

  test('연결 통로가 없어도 터지지 않는다 — 브라우저 모드 대비', () => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;

    expect(() => render(<SidePinApp />)).not.toThrow();
  });
});
