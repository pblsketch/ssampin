import { describe, expect, test, vi } from 'vitest';
import {
  createSidePinWindowHost,
  SIDE_PIN_CLEAR_PANEL_CHANNEL,
  type SidePinWindowLike,
  type SidePinWindowRole,
} from './sidePinWindow';
import type {
  SidePinBounds,
  SidePinHostCommandContext,
  SidePinLayout,
} from '../src/usecases/sidePin/SidePinWindowHost';

const LAYOUT: SidePinLayout = {
  rail: { x: 1904, y: 436, width: 16, height: 168 },
  panel: { x: 1520, y: 0, width: 400, height: 1040 },
};

let operation = 0;
function ctx(revision = 1): SidePinHostCommandContext {
  operation += 1;
  return { operationId: `op-${operation}`, requestedRevision: revision };
}

class FakeWindow implements SidePinWindowLike {
  readonly boundsHistory: SidePinBounds[] = [];
  readonly actions: string[] = [];
  readonly sent: string[] = [];
  visible = false;
  destroyed = false;

  constructor(readonly createdBounds: SidePinBounds) {}

  setPosition(bounds: SidePinBounds): void {
    this.boundsHistory.push(bounds);
    this.actions.push('setPosition');
  }
  async showInactive(): Promise<void> {
    this.visible = true;
    this.actions.push('showInactive');
  }
  async focus(): Promise<void> {
    this.visible = true;
    this.actions.push('focus');
  }
  hide(): void {
    this.visible = false;
    this.actions.push('hide');
  }
  destroy(): void {
    this.destroyed = true;
    this.visible = false;
    this.actions.push('destroy');
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  send(channel: string): void {
    this.sent.push(channel);
  }
}

function createHarness(layout: SidePinLayout | null = LAYOUT) {
  const windows = new Map<SidePinWindowRole, FakeWindow>();
  const create = vi.fn((role: SidePinWindowRole, bounds: SidePinBounds) => {
    const window = new FakeWindow(bounds);
    windows.set(role, window);
    return window;
  });
  const host = createSidePinWindowHost({ factory: { create }, getLayout: () => layout });
  return { host, windows, create };
}

describe('옆핀 고정 창 2개 구조', () => {
  test('손잡이를 표시할 때 첫 호버용 패널도 숨긴 채 미리 준비한다', async () => {
    const h = createHarness();

    const result = await h.host.ensureRail(ctx(), LAYOUT.rail);

    expect(result.status).toBe('applied');
    expect(h.create).toHaveBeenCalledWith('rail', LAYOUT.rail);
    expect(h.windows.get('rail')?.visible).toBe(true);
    expect(h.create).toHaveBeenCalledWith('panel', LAYOUT.panel);
    expect(h.windows.get('panel')?.visible).toBe(false);
  });

  test('패널 준비는 별도 패널 창을 만들되 표시하지 않는다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);

    await h.host.preparePanel(ctx(), LAYOUT.panel);
    expect(h.create).toHaveBeenLastCalledWith('panel', LAYOUT.panel);
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.windows.get('panel')?.visible).toBe(false);
    expect(h.windows.get('panel')?.createdBounds).toEqual(LAYOUT.panel);
    expect(h.windows.get('panel')?.boundsHistory).toEqual([LAYOUT.panel]);
  });

  test('열기와 닫기는 창 크기를 서로 바꾸지 않고 표시 여부만 전환한다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    const rail = h.windows.get('rail')!;
    const panel = h.windows.get('panel')!;

    await h.host.showPanel(ctx(), { focus: false });

    expect(panel.visible).toBe(true);
    expect(rail.visible).toBe(false);
    expect(rail.boundsHistory).not.toContainEqual(LAYOUT.panel);
    expect(panel.boundsHistory).not.toContainEqual(LAYOUT.rail);

    await h.host.collapsePanel(ctx());

    expect(rail.visible).toBe(true);
    expect(panel.visible).toBe(false);
    expect(rail.boundsHistory).not.toContainEqual(LAYOUT.panel);
    expect(panel.boundsHistory).not.toContainEqual(LAYOUT.rail);
  });

  test('★ concealAll은 손잡이와 패널을 둘 다 감추되 패널 창은 살려 둔다', async () => {
    // 2026-09-01 실기기에서 잡힌 결함의 재발 방지.
    // 발표(전체화면) 감지에 처음에는 collapsePanel을 썼는데, 그 명령은 이름과 달리
    // rail.showInactive()를 불러 **손잡이를 보이게 한다.** 그래서 PPT 슬라이드쇼 위에
    // 손잡이가 그대로 남았다. 도메인 테스트로는 절대 잡히지 않는다 —
    // 창을 실제로 다루는 건 이 층이기 때문이다.
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    await h.host.showPanel(ctx(), { focus: false });
    const rail = h.windows.get('rail')!;
    const panel = h.windows.get('panel')!;

    await h.host.concealAll(ctx());

    // 목적: 화면에서 완전히 사라진다
    expect(rail.visible).toBe(false);
    expect(panel.visible).toBe(false);
    // 대가를 싸게: 패널 창은 파괴하지 않는다(쓰던 글이 살아 있어야 한다)
    expect(panel.destroyed).toBe(false);
    expect(h.windows.get('panel')).toBeDefined();
  });

  test('concealAll 뒤에 손잡이 보장을 요청하면 손잡이가 돌아온다', async () => {
    // 발표가 끝나면 protect-released가 ensure-rail을 보낸다. 그 경로가 실제로
    // 손잡이를 되돌리는지 확인한다 — 안 되면 선생님은 옆핀을 영영 잃는다.
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    await h.host.concealAll(ctx());
    expect(h.windows.get('rail')!.visible).toBe(false);

    await h.host.ensureRail(ctx(), LAYOUT.rail);

    expect(h.windows.get('rail')!.visible).toBe(true);
  });

  test('손잡이 보장을 다시 요청하면 열린 패널을 숨기고 손잡이를 복구한다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.showPanel(ctx(), { focus: false });
    const rail = h.windows.get('rail')!;
    const panel = h.windows.get('panel')!;

    await h.host.ensureRail(ctx(), LAYOUT.rail);

    expect(rail.visible).toBe(true);
    expect(panel.visible).toBe(false);
  });

  test('클릭 열기는 패널에 포커스를 주고 손잡이를 숨긴다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);

    await h.host.showPanel(ctx(), { focus: true });

    expect(h.windows.get('panel')?.actions).toContain('focus');
    expect(h.windows.get('rail')?.visible).toBe(false);
  });

  test('패널 폐기는 패널 내용과 창만 제거하고 손잡이는 유지한다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    const rail = h.windows.get('rail')!;
    const panel = h.windows.get('panel')!;

    await h.host.disposePanel(ctx());

    expect(panel.sent).toContain(SIDE_PIN_CLEAR_PANEL_CHANNEL);
    expect(panel.destroyed).toBe(true);
    expect(rail.destroyed).toBe(false);
  });

  test('전체 숨김은 두 창을 숨기고 패널 내용을 비운다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    await h.host.showPanel(ctx(), { focus: false });

    await h.host.hideAll(ctx());

    expect(h.windows.get('rail')?.visible).toBe(false);
    expect(h.windows.get('panel')?.visible).toBe(false);
    expect(h.windows.get('panel')?.sent).toContain(SIDE_PIN_CLEAR_PANEL_CHANNEL);
  });

  test('모니터 변경은 각 창을 자기 역할의 크기로만 재배치한다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);
    const originalPanel = h.windows.get('panel')!;
    const moved: SidePinLayout = {
      rail: { x: 1584, y: 366, width: 16, height: 168 },
      panel: { x: 1200, y: 0, width: 400, height: 900 },
    };

    await h.host.repositionAll(ctx(), moved);

    expect(h.windows.get('rail')?.boundsHistory.at(-1)).toEqual(moved.rail);
    expect(originalPanel.destroyed).toBe(true);
    expect(h.windows.get('panel')?.createdBounds).toEqual(moved.panel);
    expect(h.windows.get('panel')?.boundsHistory).toEqual([]);
  });

  test('전체 종료는 손잡이와 패널 창을 모두 제거한다', async () => {
    const h = createHarness();
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);

    await h.host.destroyAll(ctx());

    expect(h.windows.get('rail')?.destroyed).toBe(true);
    expect(h.windows.get('panel')?.destroyed).toBe(true);
  });

  test('손잡이 또는 패널이 없으면 열기 요청을 실패로 돌려준다', async () => {
    const withoutRail = createHarness();
    expect((await withoutRail.host.showPanel(ctx(), { focus: false })).status).toBe('failed');

    const withoutPanel = createHarness();
    await withoutPanel.host.ensureRail(ctx(), LAYOUT.rail);
    withoutPanel.windows.get('panel')?.destroy();
    const result = await withoutPanel.host.showPanel(ctx(), { focus: false });
    expect(result).toMatchObject({ status: 'failed', code: 'PANEL_MISSING' });
  });

  test('모니터를 찾지 못해도 표시 중인 창 크기를 임의로 바꾸지 않는다', async () => {
    const h = createHarness(null);
    await h.host.ensureRail(ctx(), LAYOUT.rail);
    await h.host.preparePanel(ctx(), LAYOUT.panel);

    const result = await h.host.showPanel(ctx(), { focus: false });

    expect(result.status).toBe('applied');
    expect(h.windows.get('rail')?.createdBounds).toEqual(LAYOUT.rail);
    expect(h.windows.get('panel')?.createdBounds).toEqual(LAYOUT.panel);
  });

  test('창 생성 실패는 복구 불가 결과로 알린다', async () => {
    const host = createSidePinWindowHost({
      factory: {
        create: (_role, _bounds) => {
          throw new Error('CREATE_FAILED');
        },
      },
      getLayout: () => LAYOUT,
    });

    const result = await host.ensureRail(ctx(), LAYOUT.rail);

    expect(result).toMatchObject({ status: 'failed', code: 'CREATE_FAILED', recoverable: false });
  });

  test('호스트 이벤트 구독을 해제하면 이후 이벤트를 전달하지 않는다', () => {
    const h = createHarness();
    const seen: string[] = [];
    const unsubscribe = h.host.subscribe((event) => seen.push(event.type));

    h.host.emitHostEvent({ type: 'outside-click' });
    unsubscribe();
    h.host.emitHostEvent({ type: 'outside-click' });

    expect(seen).toEqual(['outside-click']);
  });
});
