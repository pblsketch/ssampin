// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 옆핀 모니터 설정 — 화면에 나타나는 조건과 고를 때의 처리.
 *
 * 여기서 지키려는 것 두 가지:
 *   ① **고를 것이 없으면 나타나지 않는다.** 모니터가 한 대뿐인 선생님에게 이 항목은
 *      누를 이유가 없는 잡음이고, 브라우저 모드에서는 아예 동작하지 않는다.
 *   ② **`deferred`를 실패로 다루지 않는다.** 메모를 쓰는 중이면 저장만 하고 창 이동을
 *      미루는데, 이때 라디오를 되돌리면 사용자는 설정이 안 먹은 줄 안다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SidePinDisplaySection } from './SidePinDisplaySection';

const PRIMARY = {
  id: '1',
  name: '모니터 1',
  position: '주 모니터',
  resolution: '1920×1080',
  scalePercent: 100,
  isPrimary: true,
  menuLabel: '모니터 1 · 주 모니터 (1920×1080)',
};
const SECOND = {
  id: '2',
  name: '모니터 2',
  position: '오른쪽',
  resolution: '2560×1440',
  scalePercent: 150,
  isPrimary: false,
  menuLabel: '모니터 2 · 오른쪽 (2560×1440, 배율 150%)',
};

function stubSidePin(overrides: {
  displays?: unknown[];
  selectedDisplayId?: string | null;
  setDisplay?: ReturnType<typeof vi.fn>;
  listDisplays?: unknown;
}): { setDisplay: ReturnType<typeof vi.fn> } {
  const setDisplay = overrides.setDisplay ?? vi.fn().mockResolvedValue('applied');
  const listDisplays =
    overrides.listDisplays === undefined
      ? vi.fn().mockResolvedValue({
          displays: overrides.displays ?? [PRIMARY, SECOND],
          selectedDisplayId: overrides.selectedDisplayId ?? null,
        })
      : overrides.listDisplays;

  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    sidePin: { listDisplays, setDisplay },
  };
  return { setDisplay };
}

beforeEach(() => {
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
});

describe('나타나는 조건', () => {
  it('모니터가 두 대 이상이면 나타난다', async () => {
    stubSidePin({});
    render(<SidePinDisplaySection />);

    expect(await screen.findByText('옆핀 모니터')).toBeInTheDocument();
    expect(screen.getByText('모니터 2')).toBeInTheDocument();
  });

  it('모니터가 한 대뿐이면 나타나지 않는다', async () => {
    stubSidePin({ displays: [PRIMARY] });
    const { container } = render(<SidePinDisplaySection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('브라우저 모드(electron 통로 없음)에서는 나타나지 않는다', async () => {
    const { container } = render(<SidePinDisplaySection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('옛 preload 위에서 도는 중이면(listDisplays 없음) 나타나지 않는다', async () => {
    // preload는 앱을 다시 켜야 갱신된다 — 그 사이 화면이 죽으면 안 된다
    (window as unknown as { electronAPI?: unknown }).electronAPI = { sidePin: {} };
    const { container } = render(<SidePinDisplaySection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('목록을 못 읽어도 화면이 죽지 않는다', async () => {
    stubSidePin({ listDisplays: vi.fn().mockRejectedValue(new Error('nope')) });
    const { container } = render(<SidePinDisplaySection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('고르기', () => {
  it('모니터를 고르면 그 번호로 저장을 요청한다', async () => {
    const { setDisplay } = stubSidePin({});
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    fireEvent.click(screen.getAllByRole('radio')[2]!);

    await waitFor(() => expect(setDisplay).toHaveBeenCalledWith('2'));
  });

  it('자동을 고르면 null로 되돌린다', async () => {
    const { setDisplay } = stubSidePin({ selectedDisplayId: '2' });
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    fireEvent.click(screen.getAllByRole('radio')[0]!);

    await waitFor(() => expect(setDisplay).toHaveBeenCalledWith(null));
  });

  it('저장된 선택이 라디오에 반영된다', async () => {
    stubSidePin({ selectedDisplayId: '2' });
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    expect(screen.getAllByRole('radio')[2]).toBeChecked();
    expect(screen.getAllByRole('radio')[0]).not.toBeChecked();
  });

  it('★메모 작성 중(deferred)이면 선택을 되돌리지 않는다', async () => {
    // 저장은 이미 끝났다. 되돌리면 사용자는 설정이 안 먹은 줄 안다.
    stubSidePin({ setDisplay: vi.fn().mockResolvedValue('deferred') });
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    fireEvent.click(screen.getAllByRole('radio')[2]!);

    await waitFor(() => expect(screen.getAllByRole('radio')[2]).toBeChecked());
  });

  it('없는 모니터면 선택을 되돌린다', async () => {
    stubSidePin({ setDisplay: vi.fn().mockResolvedValue('unknown-display') });
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    fireEvent.click(screen.getAllByRole('radio')[2]!);

    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toBeChecked());
  });

  it('통로가 터져도 선택을 되돌리고 화면은 살아 있다', async () => {
    stubSidePin({ setDisplay: vi.fn().mockRejectedValue(new Error('boom')) });
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    fireEvent.click(screen.getAllByRole('radio')[2]!);

    await waitFor(() => expect(screen.getAllByRole('radio')[0]).toBeChecked());
  });
});

describe('보여 주는 내용', () => {
  it('이 컴퓨터에만 저장된다는 사실을 알린다', async () => {
    // 다른 설정과 달리 동기화되지 않는다 — 말해 주지 않으면 기기마다 다른 이유를 모른다
    stubSidePin({});
    render(<SidePinDisplaySection />);

    expect(await screen.findByText(/이 컴퓨터에만 저장됩니다/)).toBeInTheDocument();
  });

  it('배율이 100%가 아니면 함께 보여 준다', async () => {
    stubSidePin({});
    render(<SidePinDisplaySection />);
    await screen.findByText('모니터 2');

    expect(screen.getByText(/오른쪽 · 2560×1440 · 배율 150%/)).toBeInTheDocument();
    // 100%인 모니터에는 배율을 적지 않는다
    expect(screen.getByText(/주 모니터 · 1920×1080$/)).toBeInTheDocument();
  });
});
