import { describe, it, expect, vi } from 'vitest';
import type { PopupToolId } from '../src/domain/entities/ToolPopup';
import type { ToolPopupWindowLike } from './toolPopupWindows';
import { createToolPopupManager } from './toolPopupWindows';

interface FakeWindow extends ToolPopupWindowLike {
  readonly toolId: PopupToolId;
  readonly loaded: string[];
  readonly showCalls: { count: number };
  readonly focusCalls: { count: number };
  readonly alwaysOnTopCalls: boolean[];
  fireClosed(): void;
  fireLoadFailed(): void;
}

function createHarness(readyTimeoutMs = 50) {
  const created: FakeWindow[] = [];
  let nextId = 1;

  const factory = {
    create(toolId: PopupToolId): ToolPopupWindowLike {
      const id = nextId++;
      let destroyed = false;
      let onClosed: (() => void) | null = null;
      let onLoadFailed: ((reason: string) => void) | null = null;
      const win: FakeWindow = {
        toolId,
        webContentsId: id,
        loaded: [],
        showCalls: { count: 0 },
        focusCalls: { count: 0 },
        alwaysOnTopCalls: [],
        loadPopup: (query) => void win.loaded.push(query),
        show: () => void (win.showCalls.count += 1),
        focus: () => void (win.focusCalls.count += 1),
        restoreIfMinimized: () => {},
        setAlwaysOnTop: (flag) => void win.alwaysOnTopCalls.push(flag),
        destroy: () => {
          destroyed = true;
        },
        isDestroyed: () => destroyed,
        onClosed: (handler) => {
          onClosed = handler;
        },
        onLoadFailed: (handler) => {
          onLoadFailed = handler;
        },
        fireClosed: () => onClosed?.(),
        fireLoadFailed: () => onLoadFailed?.('ERR_FAILED'),
      };
      created.push(win);
      return win;
    },
  };

  const onChanged = vi.fn();
  const manager = createToolPopupManager({ factory, onChanged, readyTimeoutMs });
  return { manager, created, onChanged };
}

/** 창이 준비를 알렸다고 가정하고 열기를 끝낸다. */
async function openAndReady(
  harness: ReturnType<typeof createHarness>,
  toolId: PopupToolId,
  snapshot: unknown = null,
) {
  const promise = harness.manager.open(toolId, snapshot, Date.now());
  await Promise.resolve();
  const win = harness.created.at(-1);
  if (win === undefined) throw new Error('창이 만들어지지 않았다');
  harness.manager.markReady(win.webContentsId);
  return { result: await promise, win };
}

describe('toolPopupWindows — 허용목록', () => {
  it('허용목록 밖 도구는 창을 만들지 않고 거절한다', async () => {
    const h = createHarness();
    for (const bad of ['tool-seat-picker', 'https://example.com', '', null, 7]) {
      const result = await h.manager.open(bad, null, Date.now());
      expect(result).toEqual({ ok: false, reason: 'unsupported-tool' });
    }
    expect(h.created).toHaveLength(0);
  });
});

describe('toolPopupWindows — 도구 하나당 창 하나', () => {
  it('같은 도구를 다시 열면 새 창을 만들지 않고 기존 창을 앞으로 가져온다', async () => {
    const h = createHarness();
    const first = await openAndReady(h, 'tool-timer');
    expect(first.result).toEqual({ ok: true, focusedExisting: false });

    const again = await h.manager.open('tool-timer', null, Date.now());
    expect(again).toEqual({ ok: true, focusedExisting: true });
    expect(h.created).toHaveLength(1);
    expect(first.win.focusCalls.count).toBeGreaterThanOrEqual(2);
  });

  it('서로 다른 도구는 각자 창을 가진다', async () => {
    const h = createHarness();
    await openAndReady(h, 'tool-timer');
    await openAndReady(h, 'tool-random');
    expect(h.created).toHaveLength(2);
    expect([...h.manager.listOpen()].sort()).toEqual(['tool-random', 'tool-timer']);
  });
});

describe('toolPopupWindows — 준비 확인과 실패 정리', () => {
  it('준비 신호가 오기 전에는 열기가 끝나지 않는다', async () => {
    const h = createHarness(5_000);
    let settled = false;
    const promise = h.manager.open('tool-dice', null, Date.now()).then((r) => {
      settled = true;
      return r;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    h.manager.markReady(h.created[0]!.webContentsId);
    expect((await promise).ok).toBe(true);
  });

  it('준비 신호가 제한 시간 안에 안 오면 창을 정리하고 실패로 돌려준다', async () => {
    const h = createHarness(10);
    const result = await h.manager.open('tool-coin', { a: 1 }, Date.now());
    expect(result).toEqual({ ok: false, reason: 'ready-timeout' });
    expect(h.created[0]!.isDestroyed()).toBe(true);
    expect(h.manager.listOpen()).toHaveLength(0);
  });

  it('로드 실패도 창을 정리하고 실패로 돌려준다', async () => {
    const h = createHarness(5_000);
    const promise = h.manager.open('tool-qrcode', null, Date.now());
    await Promise.resolve();
    h.created[0]!.fireLoadFailed();
    expect(await promise).toEqual({ ok: false, reason: 'load-failed' });
    expect(h.created[0]!.isDestroyed()).toBe(true);
  });

  it('준비 전에 사용자가 창을 닫아도 열기가 매달려 있지 않는다', async () => {
    const h = createHarness(5_000);
    const promise = h.manager.open('tool-roulette', null, Date.now());
    await Promise.resolve();
    h.created[0]!.fireClosed();
    expect((await promise).ok).toBe(false);
    expect(h.manager.listOpen()).toHaveLength(0);
  });
});

describe('toolPopupWindows — 스냅샷 인계', () => {
  it('스냅샷은 그 도구의 창이 한 번만 가져간다', async () => {
    const h = createHarness(5_000);
    const promise = h.manager.open('tool-timer', { remaining: 42 }, 1_700_000_000_000);
    await Promise.resolve();
    const win = h.created[0]!;
    const handoffId = new URLSearchParams(win.loaded[0]!).get('handoff');
    expect(handoffId).not.toBeNull();

    const claimed = h.manager.claimHandoff(handoffId, win.webContentsId);
    expect(claimed).toEqual({ snapshot: { remaining: 42 }, capturedAt: 1_700_000_000_000 });
    expect(h.manager.claimHandoff(handoffId, win.webContentsId)).toBeNull();

    h.manager.markReady(win.webContentsId);
    await promise;
  });

  it('다른 창이 표를 알아도 스냅샷을 가져갈 수 없다', async () => {
    const h = createHarness(5_000);
    const promise = h.manager.open('tool-random', { excluded: ['가'] }, Date.now());
    await Promise.resolve();
    const win = h.created[0]!;
    const handoffId = new URLSearchParams(win.loaded[0]!).get('handoff');
    expect(h.manager.claimHandoff(handoffId, 9_999)).toBeNull();
    h.manager.markReady(win.webContentsId);
    await promise;
  });

  it('스냅샷 없이 열면 주소에 handoff 가 없다', async () => {
    const h = createHarness(5_000);
    const promise = h.manager.open('tool-scoreboard', null, Date.now());
    await Promise.resolve();
    const win = h.created[0]!;
    expect(win.loaded[0]).not.toContain('handoff');
    expect(win.loaded[0]).toContain('tool=tool-scoreboard');
    h.manager.markReady(win.webContentsId);
    await promise;
  });
});

describe('toolPopupWindows — 발신 창 검증과 정리', () => {
  it('등록되지 않은 창의 준비 신호는 무시한다', () => {
    const h = createHarness();
    expect(h.manager.markReady(1_234)).toBe(false);
  });

  it('본문 복귀는 발신 창에서 도구를 역조회한다', async () => {
    const h = createHarness();
    const { win } = await openAndReady(h, 'tool-work-symbols');
    expect(h.manager.resolveToolIdByWebContents(win.webContentsId)).toBe('tool-work-symbols');
    expect(h.manager.resolveToolIdByWebContents(4_242)).toBeNull();
  });

  it('항상 위 토글은 허용목록 안 도구에만 걸리고 그 창에 그대로 전달된다', async () => {
    const h = createHarness();
    const { win } = await openAndReady(h, 'tool-traffic-light');
    expect(h.manager.setAlwaysOnTop('tool-traffic-light', true)).toBe(true);
    expect(h.manager.setAlwaysOnTop('tool-traffic-light', false)).toBe(true);
    expect(win.alwaysOnTopCalls).toEqual([true, false]);
    expect(h.manager.setAlwaysOnTop('tool-seat-picker', true)).toBe(false);
  });

  it('앱 종료 시 모든 팝업을 정리한다', async () => {
    const h = createHarness();
    await openAndReady(h, 'tool-timer');
    await openAndReady(h, 'tool-dice');
    h.manager.closeAll();
    expect(h.manager.listOpen()).toHaveLength(0);
    expect(h.created.every((w) => w.isDestroyed())).toBe(true);
  });

  it('열린 도구 목록이 바뀔 때 알림이 나간다', async () => {
    const h = createHarness();
    await openAndReady(h, 'tool-timer');
    expect(h.onChanged).toHaveBeenCalledWith(['tool-timer']);
    h.manager.close('tool-timer');
    expect(h.onChanged).toHaveBeenLastCalledWith([]);
  });
});
