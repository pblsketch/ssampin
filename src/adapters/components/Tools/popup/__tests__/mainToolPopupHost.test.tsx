/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PopupToolId, ToolPopupOpenResult } from '@domain/entities/ToolPopup';
import { POPUP_TOOL_IDS } from '@domain/entities/ToolPopup';
import { TOOL_REGISTRY, isDualToolId } from '@adapters/components/Tools/toolRegistry';
import { useToolPopupStore } from '@adapters/stores/useToolPopupStore';
import type { ToolPopupBridge } from '../toolPopupBridge';
import { __setToolPopupBridgeForTest } from '../toolPopupBridge';
import { MainToolPopupHost } from '../MainToolPopupHost';
import { useToolPopupInitial, useToolPopupSlot } from '../toolPopupSession';
import { ToolLayout } from '@adapters/components/Tools/ToolLayout';

interface FakeBridge extends ToolPopupBridge {
  readonly openCalls: { count: number };
  settle(result: ToolPopupOpenResult): void;
  emitChanged(ids: readonly PopupToolId[]): void;
}

function createFakeBridge(): FakeBridge {
  let resolveOpen: ((result: ToolPopupOpenResult) => void) | null = null;
  const changeListeners = new Set<(ids: readonly PopupToolId[]) => void>();
  const openCalls = { count: 0 };

  const bridge: FakeBridge = {
    supportsAlwaysOnTop: true,
    openCalls,
    open: () => {
      openCalls.count += 1;
      return new Promise<ToolPopupOpenResult>((resolve) => {
        resolveOpen = resolve;
      });
    },
    claimHandoff: async () => null,
    markReady: async () => {},
    focus: async () => true,
    close: async () => true,
    setAlwaysOnTop: async () => true,
    list: async () => [],
    returnToMain: async () => true,
    onChanged: (callback) => {
      changeListeners.add(callback);
      return () => void changeListeners.delete(callback);
    },
    onReturned: () => () => {},
    settle: (result) => resolveOpen?.(result),
    emitChanged: (ids) => {
      for (const listener of changeListeners) listener(ids);
    },
  };
  return bridge;
}

/**
 * 팝업 이관에 참여하는 아주 작은 가짜 도구.
 * 진짜 `ToolLayout` 을 쓴다 — [팝업으로 옮기기] 단추가 실제로 붙는지까지 함께 본다.
 */
function FakeTool({
  onCapture,
  onResume,
}: {
  readonly onCapture?: () => void;
  readonly onResume?: () => void;
}): JSX.Element {
  useToolPopupSlot('fake', {
    capture: () => {
      onCapture?.();
      return { hello: '안녕' };
    },
    resume: () => onResume?.(),
  });
  return (
    <ToolLayout title="가짜" emoji="🧪" onBack={() => {}} isFullscreen={false}>
      <span>가짜 도구 본체</span>
    </ToolLayout>
  );
}

let bridge: FakeBridge;

beforeEach(() => {
  bridge = createFakeBridge();
  __setToolPopupBridgeForTest(bridge);
  useToolPopupStore.setState({ openToolIds: [], returned: null, subscribed: false });
});

afterEach(() => {
  cleanup();
  __setToolPopupBridgeForTest(null);
});

describe('팝업 지원 목록 — 쌤도구 정본과 어긋나지 않는다', () => {
  it('9종이 모두 실제 도구 등록부에 있고 병렬 보기 대상이기도 하다', () => {
    for (const toolId of POPUP_TOOL_IDS) {
      expect(TOOL_REGISTRY[toolId]).toBeDefined();
      expect(TOOL_REGISTRY[toolId].id).toBe(toolId);
      expect(isDualToolId(toolId)).toBe(true);
    }
  });
});

describe('MainToolPopupHost — 본문에서 팝업으로 옮기기', () => {
  it('팝업을 지원하지 않는 화면은 그대로 통과시킨다', () => {
    render(
      <MainToolPopupHost page="tool-chalkboard">
        <FakeTool />
      </MainToolPopupHost>,
    );
    expect(screen.getByText('가짜 도구 본체')).toBeTruthy();
  });

  it('★연속으로 눌러도 창 열기는 한 번만 일어난다(ref 가드)', async () => {
    let captures = 0;
    render(
      <MainToolPopupHost page="tool-timer">
        <FakeTool onCapture={() => void (captures += 1)} />
      </MainToolPopupHost>,
    );

    const button = screen.getByLabelText('팝업으로 옮기기');
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(bridge.openCalls.count).toBe(1);
    expect(captures).toBe(1);

    await act(async () => {
      bridge.settle({ ok: true, focusedExisting: false });
    });
  });

  it('열기에 실패하면 원래 실행을 되살린다', async () => {
    let resumed = 0;
    render(
      <MainToolPopupHost page="tool-timer">
        <FakeTool onResume={() => void (resumed += 1)} />
      </MainToolPopupHost>,
    );

    fireEvent.click(screen.getByLabelText('팝업으로 옮기기'));
    await act(async () => {
      bridge.settle({ ok: false, reason: 'ready-timeout' });
    });

    expect(resumed).toBe(1);
    // 본문 화면은 그대로 남는다.
    expect(screen.getByText('가짜 도구 본체')).toBeTruthy();
  });

  it('★본문이 그 도구 화면에 그대로 있어도, 팝업에서 돌아온 상태를 받는다', () => {
    // 과거 결함: 돌아온 스냅샷을 첫 렌더에만 읽어서, 페이지가 바뀌지 않으면 조용히 버려졌다.
    const seen: unknown[] = [];
    function CapturingTool(): JSX.Element {
      const initial = useToolPopupInitial<{ hello: string }>('fake');
      seen.push(initial?.data ?? null);
      useToolPopupSlot('fake', { capture: () => ({ hello: '안녕' }), resume: () => {} });
      return <span>가짜 도구 본체</span>;
    }

    render(
      <MainToolPopupHost page="tool-timer">
        <CapturingTool />
      </MainToolPopupHost>,
    );
    expect(seen).toEqual([null]);

    // 팝업으로 나갔다가
    act(() => {
      bridge.emitChanged(['tool-timer']);
    });
    expect(screen.queryByText('가짜 도구 본체')).toBeNull();

    // 팝업이 상태를 들고 돌아온다. 본문 페이지는 그대로 tool-timer 다.
    act(() => {
      useToolPopupStore.getState().putReturned('tool-timer', {
        version: 1,
        capturedAt: 1_700_000_000_000,
        slots: { fake: { hello: '돌아왔다' } },
      });
      bridge.emitChanged([]);
    });

    expect(screen.getByText('가짜 도구 본체')).toBeTruthy();
    expect(seen.at(-1)).toEqual({ hello: '돌아왔다' });
    // 봉투는 한 번만 쓰이고 보관함에서 사라진다(나중에 유령 복원이 일어나지 않게).
    expect(useToolPopupStore.getState().returned).toBeNull();
  });

  it('이미 별도 창에서 도는 도구가 열려 있는 동안에는 다시 옮기기를 시작하지 않는다', () => {
    render(
      <MainToolPopupHost page="tool-timer">
        <FakeTool />
      </MainToolPopupHost>,
    );
    act(() => {
      useToolPopupStore.setState({ openToolIds: ['tool-timer'] });
    });
    // 안내 화면이라 단추 자체가 없다 — 경합으로 불려도 창 열기가 일어나지 않는다.
    expect(screen.queryByLabelText('팝업으로 옮기기')).toBeNull();
    expect(bridge.openCalls.count).toBe(0);
  });

  it('이미 별도 창에서 도는 도구는 본문에서 중복으로 그리지 않는다', () => {
    render(
      <MainToolPopupHost page="tool-timer">
        <FakeTool />
      </MainToolPopupHost>,
    );
    expect(screen.getByText('가짜 도구 본체')).toBeTruthy();

    act(() => {
      bridge.emitChanged(['tool-timer']);
    });

    expect(screen.queryByText('가짜 도구 본체')).toBeNull();
    expect(screen.getByText(/별도 창에서 사용 중/)).toBeTruthy();
    expect(screen.getByText('창 보기')).toBeTruthy();
  });
});
