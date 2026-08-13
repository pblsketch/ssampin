/**
 * 옆핀 창 호스트 공통 계약 테스트 — 기획서 §9-3의 첫 요구사항.
 *
 * A안(한 창)과 D안(손잡이 창 + 패널 창)은 내부 구현이 전혀 다르지만, controller가
 * 어느 쪽인지 모르고 쓸 수 있어야 한다. 그러려면 **같은 명령에 같은 관찰 가능한 결과**를
 * 내야 한다. 이 파일은 그 "같음"을 글이 아니라 실행으로 못 박는다.
 *
 * D안을 만들 때 `runSidePinHostContract`를 그대로 불러 쓰면, 두 구조가 어긋나는 순간
 * 빨간불이 난다. 성능 게이트에서 host를 갈아 끼울 수 있다는 기획서의 전제가
 * 실제로 성립하는지를 지키는 장치다.
 */
import { describe, expect, test, vi } from 'vitest';
import {
  createSidePinWindowHost,
  SIDE_PIN_CLEAR_PANEL_CHANNEL,
  type SidePinWindowHostHandle,
  type SidePinWindowLike,
} from './sidePinWindow';
import type {
  SidePinHostCommandContext,
  SidePinHostCommandResult,
  SidePinLayout,
} from '../src/usecases/sidePin/SidePinWindowHost';

const LAYOUT: SidePinLayout = {
  rail: { x: 1904, y: 0, width: 16, height: 1040 },
  panel: { x: 1520, y: 0, width: 400, height: 1040 },
};

let opCounter = 0;
function ctx(revision = 1): SidePinHostCommandContext {
  opCounter += 1;
  return { operationId: `op-${opCounter}`, requestedRevision: revision };
}

/** 가짜 창 — 실제로 무엇을 시켰는지 기록한다 */
export class FakeWindow implements SidePinWindowLike {
  readonly actions: string[] = [];
  bounds: SidePinLayout['rail'] | null = null;
  destroyed = false;
  readonly sent: string[] = [];

  setBounds(bounds: SidePinLayout['rail']): void {
    this.bounds = bounds;
    this.actions.push('setBounds');
  }
  showInactive(): void {
    this.actions.push('showInactive');
  }
  focus(): void {
    this.actions.push('focus');
  }
  hide(): void {
    this.actions.push('hide');
  }
  destroy(): void {
    this.destroyed = true;
    this.actions.push('destroy');
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  send(channel: string): void {
    this.sent.push(channel);
  }
}

export interface ContractHarness {
  readonly host: SidePinWindowHostHandle;
  /** 손잡이가 화면에 존재하는가 */
  railExists(): boolean;
  /** 패널이 펼쳐져 보이는가 */
  panelVisible(): boolean;
  /** 모든 창이 사라졌는가 */
  allGone(): boolean;
  /** 패널 내용이 비워졌는가 */
  panelCleared(): boolean;
}

/**
 * 두 구조가 모두 통과해야 하는 계약.
 *
 * 여기서 확인하는 것은 "어떻게 했는가"가 아니라 "결과가 같은가"다.
 * A안은 창 크기를 바꾸고 D안은 창을 만들고 없애지만, 아래 질문의 답은 같아야 한다.
 */
export function runSidePinHostContract(label: string, createHarness: () => ContractHarness): void {
  describe(`${label} — 창 호스트 공통 계약`, () => {
    async function ok(promise: Promise<SidePinHostCommandResult>): Promise<void> {
      const result = await promise;
      expect(result.status).toBe('applied');
    }

    test('손잡이를 만들면 화면에 남는다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));

      expect(h.railExists()).toBe(true);
      expect(h.panelVisible()).toBe(false);
    });

    test('명령 결과에는 요청한 꼬리표가 그대로 실려 돌아온다', async () => {
      const h = createHarness();
      const c = ctx(7);

      const result = await h.host.ensureRail(c, LAYOUT.rail);

      expect(result.operationId).toBe(c.operationId);
      expect(result.requestedRevision).toBe(7);
    });

    test('준비 → 보여주기 순서로 패널이 펼쳐진다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));
      await ok(h.host.preparePanel(ctx(), LAYOUT.panel));

      await ok(h.host.showPanel(ctx(), { focus: false }));

      expect(h.panelVisible()).toBe(true);
      expect(h.railExists()).toBe(true);
    });

    test('접으면 손잡이만 남는다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));
      await ok(h.host.preparePanel(ctx(), LAYOUT.panel));
      await ok(h.host.showPanel(ctx(), { focus: false }));

      await ok(h.host.collapsePanel(ctx()));

      expect(h.panelVisible()).toBe(false);
      expect(h.railExists()).toBe(true);
    });

    test('파기하면 패널 내용이 비워지고 손잡이는 남는다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));
      await ok(h.host.preparePanel(ctx(), LAYOUT.panel));

      await ok(h.host.disposePanel(ctx()));

      expect(h.panelCleared()).toBe(true);
      expect(h.railExists()).toBe(true);
    });

    test('전부 숨기면 손잡이도 보이지 않는다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));

      await ok(h.host.hideAll(ctx()));

      expect(h.railExists()).toBe(false);
    });

    test('숨기기 전에 패널 내용을 비운다 — 잠금 화면 위로 스치지 않도록', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));
      await ok(h.host.preparePanel(ctx(), LAYOUT.panel));
      await ok(h.host.showPanel(ctx(), { focus: false }));

      await ok(h.host.hideAll(ctx()));

      expect(h.panelCleared()).toBe(true);
    });

    test('전부 없애면 아무 창도 남지 않는다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));

      await ok(h.host.destroyAll(ctx()));

      expect(h.allGone()).toBe(true);
    });

    test('손잡이 없이 보여달라고 하면 실패로 답한다 — 조용히 성공하지 않는다', async () => {
      const h = createHarness();

      const result = await h.host.showPanel(ctx(), { focus: false });

      expect(result.status).toBe('failed');
    });

    test('없앤 뒤 다시 만들 수 있다', async () => {
      const h = createHarness();
      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));
      await ok(h.host.destroyAll(ctx()));

      await ok(h.host.ensureRail(ctx(), LAYOUT.rail));

      expect(h.railExists()).toBe(true);
    });

    test('구독을 해제하면 알림이 더 오지 않는다', () => {
      const h = createHarness();
      const seen: string[] = [];
      const off = h.host.subscribe((e) => seen.push(e.type));

      h.host.emitHostEvent({ type: 'outside-click' });
      off();
      h.host.emitHostEvent({ type: 'outside-click' });

      expect(seen).toEqual(['outside-click']);
    });
  });
}

// ─── A안(한 창 구조)으로 계약을 실행한다 ─────────────────────────

function createOptionAHarness(): ContractHarness {
  let current: FakeWindow | null = null;
  let hidden = false;

  const host = createSidePinWindowHost({
    factory: {
      create: () => {
        current = new FakeWindow();
        hidden = false;
        return current;
      },
    },
    getLayout: () => LAYOUT,
  });

  // hide()를 관찰하려고 FakeWindow를 감싼다
  const originalCreate = host.hideAll.bind(host);
  const wrapped: SidePinWindowHostHandle = {
    ...host,
    hideAll: async (c) => {
      const r = await originalCreate(c);
      if (r.status === 'applied') hidden = true;
      return r;
    },
  };

  return {
    host: wrapped,
    railExists: () => current !== null && !current.destroyed && !hidden,
    panelVisible: () => current !== null && !hidden && current.bounds?.width === LAYOUT.panel.width,
    allGone: () => current === null || current.destroyed,
    panelCleared: () => current?.sent.includes(SIDE_PIN_CLEAR_PANEL_CHANNEL) ?? false,
  };
}

runSidePinHostContract('A안(한 창)', createOptionAHarness);

// ─── A안 고유 동작 ───────────────────────────────────────────────

describe('A안 고유 — 창 하나를 늘였다 줄인다', () => {
  test('펼치면 패널 크기, 접으면 손잡이 크기가 된다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });

    await host.ensureRail(ctx(), LAYOUT.rail);
    expect(win!.bounds).toEqual(LAYOUT.rail);

    await host.showPanel(ctx(), { focus: false });
    expect(win!.bounds).toEqual(LAYOUT.panel);

    await host.collapsePanel(ctx());
    expect(win!.bounds).toEqual(LAYOUT.rail);
  });

  test('파기해도 창을 없애지 않는다 — 없애면 손잡이까지 사라진다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });
    await host.ensureRail(ctx(), LAYOUT.rail);

    await host.disposePanel(ctx());

    expect(win!.destroyed).toBe(false);
    expect(win!.sent).toContain(SIDE_PIN_CLEAR_PANEL_CHANNEL);
  });

  test('호버로 열 때는 포커스를 가져가지 않는다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });
    await host.ensureRail(ctx(), LAYOUT.rail);
    win!.actions.length = 0;

    await host.showPanel(ctx(), { focus: false });

    expect(win!.actions).not.toContain('focus');
    expect(win!.actions).toContain('showInactive');
  });

  test('클릭으로 열 때는 포커스를 가져온다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });
    await host.ensureRail(ctx(), LAYOUT.rail);

    await host.showPanel(ctx(), { focus: true });

    expect(win!.actions).toContain('focus');
  });

  test('모니터를 못 찾으면 펼치지 않고 실패로 답한다', async () => {
    const host = createSidePinWindowHost({
      factory: { create: () => new FakeWindow() },
      getLayout: () => null,
    });
    await host.ensureRail(ctx(), LAYOUT.rail);

    const result = await host.showPanel(ctx(), { focus: false });

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.code : '').toBe('NO_DISPLAY');
  });

  test('창 만들기가 실패하면 복구 불가로 알린다', async () => {
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          throw new Error('CREATE_FAILED');
        },
      },
      getLayout: () => LAYOUT,
    });

    const result = await host.ensureRail(ctx(), LAYOUT.rail);

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' ? result.recoverable : true).toBe(false);
  });

  test('창이 밖에서 파괴돼도 다음 명령이 예외로 터지지 않는다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });
    await host.ensureRail(ctx(), LAYOUT.rail);
    win!.destroyed = true;

    await expect(host.collapsePanel(ctx())).resolves.toMatchObject({ status: 'applied' });
    await expect(host.showPanel(ctx(), { focus: false })).resolves.toMatchObject({
      status: 'failed',
    });
  });

  test('위치 재조정은 지금 펼쳐진 상태에 맞는 크기를 쓴다', async () => {
    let win: FakeWindow | null = null;
    const host = createSidePinWindowHost({
      factory: {
        create: () => {
          win = new FakeWindow();
          return win;
        },
      },
      getLayout: () => LAYOUT,
    });
    const moved: SidePinLayout = {
      rail: { x: 100, y: 0, width: 16, height: 800 },
      panel: { x: -284, y: 0, width: 400, height: 800 },
    };

    await host.ensureRail(ctx(), LAYOUT.rail);
    await host.repositionAll(ctx(), moved);
    expect(win!.bounds).toEqual(moved.rail);

    await host.showPanel(ctx(), { focus: false });
    await host.repositionAll(ctx(), moved);
    expect(win!.bounds).toEqual(moved.panel);
  });

  test('창을 만드는 일은 주입받는다 — Electron 없이 시험 가능', () => {
    const create = vi.fn(() => new FakeWindow());
    const host = createSidePinWindowHost({ factory: { create }, getLayout: () => LAYOUT });

    void host.ensureRail(ctx(), LAYOUT.rail);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
