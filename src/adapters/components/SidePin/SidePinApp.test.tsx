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
import { SidePinApp } from './SidePinApp';

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

beforeEach(() => {
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

  test('내용이 아직 없는 영역임을 숨기지 않는다', () => {
    render(<SidePinApp />);
    send({ surface: 'expanded' });

    expect(screen.getAllByText('다음 단계에서 내용이 들어갑니다').length).toBe(2);
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
