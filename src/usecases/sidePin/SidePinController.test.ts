/**
 * Controller 테스트 — 가짜 시계와 가짜 창으로 시간 규칙을 실제 시간 없이 검증한다.
 *
 * 여기서 확인하는 것은 "규칙이 맞는가"가 아니라(그건 전이 함수 테스트가 한다)
 * "controller가 그 규칙을 타이머·창에 제대로 실행하고, 늦게 온 응답을 걸러내는가"다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SidePinController } from './SidePinController';
import type { SidePinScheduler } from './SidePinScheduler';
import type {
  SidePinHostCommandContext,
  SidePinHostCommandResult,
  SidePinHostEvent,
  SidePinLayout,
  SidePinWindowHost,
} from './SidePinWindowHost';
import { SIDE_PIN_CLOSE_ANIMATION_MS } from '@domain/services/resolveSidePinTransition';

// ─── 가짜 시계 ───────────────────────────────────────────────────

class FakeScheduler implements SidePinScheduler {
  private currentMs = 0;
  private pending: { dueAtMs: number; callback: () => void } | null = null;

  now(): number {
    return this.currentMs;
  }

  schedule(dueAtMs: number, callback: () => void): void {
    this.pending = { dueAtMs, callback };
  }

  cancel(): void {
    this.pending = null;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** 시계를 앞으로 돌리고, 시간이 된 예약을 실행한다 */
  advanceTo(ms: number): void {
    this.currentMs = ms;
    const due = this.pending;
    if (due !== null && ms >= due.dueAtMs) {
      this.pending = null;
      due.callback();
    }
  }
}

// ─── 가짜 창 ─────────────────────────────────────────────────────

interface HostCall {
  readonly method: string;
  readonly ctx: SidePinHostCommandContext;
  readonly focus?: boolean;
}

class FakeHost implements SidePinWindowHost {
  readonly calls: HostCall[] = [];
  private listener: ((event: SidePinHostEvent) => void) | null = null;
  /** 이 메서드는 실패로 응답한다 */
  failing: string | null = null;
  /** 응답을 보류해 뒀다가 나중에 흘려보낼 메서드 */
  private deferred: Array<() => void> = [];
  deferMethod: string | null = null;

  private respond(
    method: string,
    ctx: SidePinHostCommandContext,
  ): Promise<SidePinHostCommandResult> {
    this.calls.push({ method, ctx });
    const result: SidePinHostCommandResult =
      this.failing === method
        ? {
            status: 'failed',
            operationId: ctx.operationId,
            requestedRevision: ctx.requestedRevision,
            code: 'ERR_TEST',
            recoverable: true,
          }
        : {
            status: 'applied',
            operationId: ctx.operationId,
            requestedRevision: ctx.requestedRevision,
          };

    if (this.deferMethod === method) {
      return new Promise((resolve) => {
        this.deferred.push(() => resolve(result));
      });
    }
    return Promise.resolve(result);
  }

  /** 보류해 둔 응답을 지금 흘려보낸다 */
  flushDeferred(): void {
    const pending = this.deferred;
    this.deferred = [];
    for (const release of pending) release();
  }

  ensureRail(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('ensureRail', ctx);
  }
  preparePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('preparePanel', ctx);
  }
  /** showPanel 처리 도중 창이 곧바로 알림을 보내는 상황을 흉내 낸다 */
  emitDuringShow: (() => void) | null = null;

  showPanel(
    ctx: SidePinHostCommandContext,
    options: { focus: boolean },
  ): Promise<SidePinHostCommandResult> {
    const promise = this.respond('showPanel', ctx);
    const last = this.calls[this.calls.length - 1];
    if (last !== undefined) {
      this.calls[this.calls.length - 1] = { ...last, focus: options.focus };
    }
    const hook = this.emitDuringShow;
    if (hook !== null) {
      this.emitDuringShow = null;
      hook();
    }
    return promise;
  }
  collapsePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('collapsePanel', ctx);
  }
  disposePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('disposePanel', ctx);
  }
  hideAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('hideAll', ctx);
  }
  repositionAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('repositionAll', ctx);
  }
  focusPanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('focusPanel', ctx);
  }
  destroyAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    return this.respond('destroyAll', ctx);
  }

  subscribe(listener: (event: SidePinHostEvent) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  /** 창이 controller에 알림을 보낸다 */
  emit(event: SidePinHostEvent): void {
    this.listener?.(event);
  }

  callsOf(method: string): HostCall[] {
    return this.calls.filter((c) => c.method === method);
  }
}

const LAYOUT: SidePinLayout = {
  rail: { x: 1_904, y: 0, width: 16, height: 1_040 },
  panel: { x: 1_520, y: 0, width: 400, height: 1_040 },
};

/** 비동기 응답이 controller에 반영될 때까지 기다린다 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

let scheduler: FakeScheduler;
let host: FakeHost;
let controller: SidePinController;
let idCounter: number;

beforeEach(() => {
  scheduler = new FakeScheduler();
  host = new FakeHost();
  idCounter = 0;
  controller = new SidePinController({
    scheduler,
    host,
    createOperationId: () => {
      idCounter += 1;
      return `op-${idCounter}`;
    },
    getLayout: () => LAYOUT,
  });
});

async function enable(): Promise<void> {
  controller.dispatch({ type: 'enabled-changed', enabled: true });
  await flush();
}

// ─── 180ms 펼침 ──────────────────────────────────────────────────

describe('180ms 펼침 (AC-02a)', () => {
  it('179ms에는 아직 창을 보여달라고 하지 않는다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();

    scheduler.advanceTo(179);

    expect(host.callsOf('showPanel')).toHaveLength(0);
  });

  it('180ms에 꼬리표를 붙여 창을 보여달라고 요청한다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();

    scheduler.advanceTo(180);
    await flush();

    const shows = host.callsOf('showPanel');
    expect(shows).toHaveLength(1);
    expect(shows[0]?.ctx.operationId).toBeTruthy();
    expect(shows[0]?.ctx.requestedRevision).toBeGreaterThan(0);
  });

  it('요청만으로는 펼쳐졌다고 하지 않는다 — 그려졌다는 알림을 받아야 확정된다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    // "여는 중"이지 "펼쳐짐"이 아니다.
    expect(controller.getState().surface).toBe('opening');

    const show = host.callsOf('showPanel')[0];
    host.emit({
      type: 'panel-painted',
      operationId: show!.ctx.operationId,
      requestedRevision: show!.ctx.requestedRevision,
    });
    await flush();

    expect(controller.getState().surface).toBe('expanded');
  });

  it('호버로 열 때는 포커스를 가져가지 않는다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    expect(host.callsOf('showPanel')[0]?.focus).toBe(false);
  });
});

// ─── 400ms 접힘 ──────────────────────────────────────────────────

describe('400ms 접힘 (AC-03, AC-04)', () => {
  async function expand(): Promise<void> {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();
    const show = host.callsOf('showPanel')[0];
    host.emit({
      type: 'panel-painted',
      operationId: show!.ctx.operationId,
      requestedRevision: show!.ctx.requestedRevision,
    });
    await flush();
  }

  it('399ms에는 아직 펼쳐진 상태다', async () => {
    await expand();
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();

    scheduler.advanceTo(180 + 399);
    await flush();

    expect(controller.getState().surface).toBe('expanded');
    expect(host.callsOf('collapsePanel')).toHaveLength(0);
  });

  it('400ms에 접기 시작하고, 나가는 연출이 끝나야 창을 줄인다', async () => {
    await expand();
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();

    scheduler.advanceTo(180 + 400);
    await flush();

    // 아직 창을 건드리지 않는다 — 줄이면 패널이 잘려 나가는 연출을 할 자리가 없다.
    expect(host.callsOf('collapsePanel')).toHaveLength(0);
    expect(controller.getState().surface).toBe('closing');

    scheduler.advanceTo(180 + 400 + SIDE_PIN_CLOSE_ANIMATION_MS);
    await flush();

    expect(host.callsOf('collapsePanel')).toHaveLength(1);
    expect(controller.getState().surface).toBe('collapsed');
  });

  it('400ms 안에 다시 들어오면 접힘이 취소되고, 시간이 지나도 접히지 않는다', async () => {
    await expand();
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();

    host.emit({ type: 'pointer-region-changed', region: 'panel-memo' });
    await flush();
    expect(scheduler.hasPending).toBe(false);

    scheduler.advanceTo(10_000);
    await flush();

    expect(host.callsOf('collapsePanel')).toHaveLength(0);
    expect(controller.getState().surface).toBe('expanded');
  });

  it('메모를 쓰는 중이면 밖으로 나가도 접히지 않는다', async () => {
    await expand();
    controller.dispatch({ type: 'editor-activity-changed', activity: 'editing' });
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();

    scheduler.advanceTo(10_000);
    await flush();

    expect(host.callsOf('collapsePanel')).toHaveLength(0);
  });
});

// ─── 늦게 도착한 응답 ────────────────────────────────────────────

describe('늦게 도착한 응답 (AC-04b)', () => {
  it('취소된 요청의 뒤늦은 성공 응답이 패널을 되살리지 않는다', async () => {
    await enable();
    // 창 준비 응답을 일부러 붙잡아 둔다
    host.deferMethod = 'preparePanel';
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    // 사용자가 손잡이를 벗어나 예약이 취소된다
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();
    const showsBeforeLateReply = host.callsOf('showPanel').length;

    // 이제서야 창 준비 응답이 도착한다
    host.deferMethod = null;
    host.flushDeferred();
    await flush();

    // 늦은 응답이 패널을 다시 띄우거나 펼침을 확정해서는 안 된다.
    expect(controller.getState().surface).toBe('collapsed');
    expect(host.callsOf('showPanel')).toHaveLength(showsBeforeLateReply);
  });

  it('손잡이를 스치고 지나간 뒤 도착한 "그렸다" 알림으로 패널이 열리지 않는다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();
    const show = host.callsOf('showPanel')[0];

    // 그려지기 전에 포인터가 떠난다
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    await flush();

    // 이제서야 "그렸다"가 도착한다 — 실제 창이 늦게 응답하는 흔한 순서다
    host.emit({
      type: 'panel-painted',
      operationId: show!.ctx.operationId,
      requestedRevision: show!.ctx.requestedRevision,
    });
    await flush();

    expect(controller.getState().surface).toBe('collapsed');
  });

  it('그려졌다는 알림이 끝내 오지 않으면 감시 시간 뒤 손잡이로 되돌린다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();
    expect(host.callsOf('showPanel')).toHaveLength(1);

    // 창이 죽어 panel-painted가 영영 오지 않는다
    scheduler.advanceTo(180 + 3_000);
    await flush();

    expect(controller.getState().surface).toBe('collapsed');
    expect(controller.getState().hostError?.code).toBe('SHOW_TIMEOUT');
  });

  it('식별자가 맞지 않는 그리기 알림은 무시한다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    host.emit({
      type: 'panel-painted',
      operationId: 'op-없는요청',
      requestedRevision: 999,
    });
    await flush();

    // 짝이 없는 알림이므로 펼침이 확정되지 않는다.
    expect(controller.getState().surface).toBe('opening');
  });
});

// ─── 창 조작 실패 ────────────────────────────────────────────────

describe('창 조작 실패', () => {
  it('펼치기에 실패하면 펼쳐진 상태로 남지 않는다', async () => {
    await enable();
    host.failing = 'showPanel';
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    expect(controller.getState().surface).toBe('collapsed');
    expect(controller.getState().hostError?.code).toBe('ERR_TEST');
  });
});

// ─── 배선 ────────────────────────────────────────────────────────

describe('배선', () => {
  it('켜면 손잡이를 준비한다', async () => {
    await enable();

    expect(host.callsOf('ensureRail')).toHaveLength(1);
    expect(controller.getState().surface).toBe('collapsed');
  });

  it('모니터 배치가 바뀌면 창 위치를 다시 잡으라고 시킨다', async () => {
    await enable();

    controller.dispatch({ type: 'layout-changed' });
    await flush();

    expect(host.callsOf('repositionAll')).toHaveLength(1);
  });

  it('창이 명령 처리 도중에 곧바로 알림을 보내도 타이머가 사라지지 않는다', async () => {
    // 창은 showPanel을 처리하면서 그 자리에서 "그렸다"와 "마우스가 나갔다"를
    // 보고할 수 있다. 처리가 중첩되면 안쪽이 먼저 끝나, 바깥이 낡은 예약으로
    // 최신 예약을 덮어쓰고 타이머가 통째로 사라진다.
    await enable();
    // show 요청이 나가는 순간 창이 곧바로 "그렸다"와 "마우스가 나갔다"를 보고한다
    host.emitDuringShow = () => {
      const show = host.callsOf('showPanel')[0];
      if (show === undefined) return;
      host.emit({
        type: 'panel-painted',
        operationId: show.ctx.operationId,
        requestedRevision: show.ctx.requestedRevision,
      });
      host.emit({ type: 'pointer-region-changed', region: 'outside' });
    };

    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    scheduler.advanceTo(180);
    await flush();

    // 펼쳐졌고 커서는 밖이므로 접힘 예약이 살아 있어야 한다.
    // 처리가 중첩되면 낡은 감시 예약이 이 접힘 예약을 덮어써 타이머가 사라진다.
    expect(controller.getState().surface).toBe('expanded');
    expect(scheduler.hasPending).toBe(true);

    // 접힘 예약 → 나가는 연출 → 그제서야 창을 줄인다.
    // 연출 예약은 접힘이 처리된 뒤에야 잡히므로, 시계를 두 걸음으로 감아야 한다.
    scheduler.advanceTo(180 + 400 + 10);
    await flush();
    scheduler.advanceTo(180 + 400 + SIDE_PIN_CLOSE_ANIMATION_MS + 20);
    await flush();
    expect(host.callsOf('collapsePanel').length).toBeGreaterThan(0);
  });

  it('dispose 뒤에 도착한 창 응답은 상태를 바꾸지 않는다', async () => {
    await enable();
    host.deferMethod = 'preparePanel';
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    const before = controller.getState().revision;

    controller.dispose();
    host.deferMethod = null;
    host.flushDeferred();
    await flush();

    expect(controller.getState().revision).toBe(before);
  });

  it('dispose하면 창 알림 구독과 예약을 모두 정리한다', async () => {
    await enable();
    host.emit({ type: 'pointer-region-changed', region: 'rail-widget' });
    await flush();
    expect(scheduler.hasPending).toBe(true);

    controller.dispose();

    expect(scheduler.hasPending).toBe(false);
    // 구독이 끊겼으므로 이후 알림은 상태를 바꾸지 않는다
    const before = controller.getState().revision;
    host.emit({ type: 'pointer-region-changed', region: 'outside' });
    expect(controller.getState().revision).toBe(before);
  });
});
