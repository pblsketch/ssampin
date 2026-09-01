/**
 * 옆핀 상태의 유일한 주인.
 *
 * 창(Electron)도, 화면(React)도 스스로 "이제 접자"를 판단하지 않는다. 둘 다 일어난 일을
 * 이곳으로 보고하고, 결과 상태를 받아 그대로 그린다. 판단이 두 곳에 있으면 서로 다른
 * 결론을 내리는 순간을 사람이 재현할 수 없다.
 *
 * 실제 규칙은 순수 함수 `resolveSidePinTransition`이 갖고, controller는 그 결정을
 * 바깥세상(타이머·창)에 실행해 주고 결과를 다시 사건으로 넣어 주는 일만 한다.
 */
import {
  INITIAL_SIDE_PIN_RUNTIME_STATE,
  type SidePinRuntimeState,
} from '@domain/entities/SidePinRuntimeState';
import type { SidePinCommand, SidePinEvent } from '@domain/events/SidePinEvent';
import { resolveSidePinTransition } from '@domain/services/resolveSidePinTransition';
import type { SidePinScheduler } from './SidePinScheduler';
import type {
  SidePinHostCommandContext,
  SidePinHostCommandResult,
  SidePinLayout,
  SidePinWindowHost,
} from './SidePinWindowHost';

export interface SidePinControllerDeps {
  readonly scheduler: SidePinScheduler;
  readonly host: SidePinWindowHost;
  /** 창 조작마다 붙일 식별자를 만든다 (도메인이 난수를 만들지 않도록 바깥에서 주입) */
  readonly createOperationId: () => string;
  /** 지금 화면 배치 — 손잡이·패널의 위치와 크기 */
  readonly getLayout: () => SidePinLayout;
  /** 상태가 바뀔 때마다 알린다 (화면 갱신용) */
  readonly onStateChanged?: (state: SidePinRuntimeState) => void;
}

export class SidePinController {
  private state: SidePinRuntimeState = INITIAL_SIDE_PIN_RUNTIME_STATE;
  private readonly unsubscribeHost: () => void;
  /** 처리 대기 중인 사건 — 처리 도중 새 사건이 들어오면 여기 쌓인다 */
  private readonly queue: SidePinEvent[] = [];
  private draining = false;
  private disposed = false;

  constructor(private readonly deps: SidePinControllerDeps) {
    this.unsubscribeHost = deps.host.subscribe((event) => {
      // 창이 보고하는 물리 입력과 그리기 완료 알림은 그대로 사건으로 넣는다.
      this.dispatch(event);
    });
  }

  getState(): SidePinRuntimeState {
    return this.state;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.unsubscribeHost();
    this.deps.scheduler.cancel();
  }

  /**
   * 사건을 처리한다.
   *
   * 처리 도중에 또 사건이 들어올 수 있다 — 창에 명령을 내리는 순간 그 창이 곧바로
   * "그렸다"나 "마우스가 나갔다"를 알려오는 경우다. 그때 안쪽 처리가 먼저 끝나 버리면,
   * 바깥 처리가 이어서 낡은 예약으로 최신 예약을 덮어써 타이머가 사라진다.
   * 그래서 한 번에 하나씩만 처리하고 나머지는 줄을 세운다.
   */
  dispatch(event: SidePinEvent): void {
    if (this.disposed) return;

    this.queue.push(event);
    if (this.draining) return;

    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next === undefined) break;
        this.handle(next);
        if (this.disposed) return;
      }
    } finally {
      this.draining = false;
    }
  }

  private handle(event: SidePinEvent): void {
    const { next, commands } = resolveSidePinTransition(this.state, event, {
      nowMs: this.deps.scheduler.now(),
      operationId: this.deps.createOperationId(),
    });

    if (next === this.state && commands.length === 0) return;

    this.state = next;
    this.deps.onStateChanged?.(next);

    for (const command of commands) {
      this.execute(command);
    }
  }

  private execute(command: SidePinCommand): void {
    if (command.type === 'cancel-schedule') {
      this.deps.scheduler.cancel();
      return;
    }

    if (command.type === 'schedule') {
      const { transition } = command;
      this.deps.scheduler.schedule(transition.dueAtMs, () => {
        this.dispatch({ type: 'timer-fired', transition });
      });
      return;
    }

    const ctx: SidePinHostCommandContext = {
      operationId: command.operationId,
      requestedRevision: command.requestedRevision,
    };

    void this.callHost(command, ctx).then(
      (result) => this.onHostSettled(result),
      (error: unknown) => {
        // 창 조작이 예외로 끝나도 상태를 그대로 두면 "펼치는 중"에서 영영 멈춘다.
        this.onHostSettled({
          status: 'failed',
          operationId: ctx.operationId,
          requestedRevision: ctx.requestedRevision,
          code: error instanceof Error ? error.message : 'unknown',
          recoverable: true,
        });
      },
    );
  }

  private callHost(
    command: Extract<SidePinCommand, { type: 'host' }>,
    ctx: SidePinHostCommandContext,
  ): Promise<SidePinHostCommandResult> {
    const { host } = this.deps;
    const layout = this.deps.getLayout();

    switch (command.kind) {
      case 'ensure-rail':
        return host.ensureRail(ctx, layout.rail);
      case 'prepare-panel':
        return host.preparePanel(ctx, layout.panel);
      case 'show-panel':
        return host.showPanel(ctx, { focus: command.focus ?? false });
      case 'collapse-panel':
        return host.collapsePanel(ctx);
      case 'dispose-panel':
        return host.disposePanel(ctx);
      case 'hide-all':
        return host.hideAll(ctx);
      case 'conceal-all':
        return host.concealAll(ctx);
      case 'reposition-all':
        return host.repositionAll(ctx, layout);
      case 'focus-panel':
        return host.focusPanel(ctx);
      case 'destroy-all':
        return host.destroyAll(ctx);
      default: {
        // 명령 종류를 늘리고 여기를 빠뜨리면 컴파일이 실패한다.
        const exhaustive: never = command.kind;
        throw new Error(`알 수 없는 창 조작: ${String(exhaustive)}`);
      }
    }
  }

  private onHostSettled(result: SidePinHostCommandResult): void {
    // dispose 뒤에 도착한 완료는 무시한다. 그러지 않으면 정리한 뒤에 새 타이머가 걸린다.
    if (this.disposed) return;
    this.dispatch({
      type: 'host-operation-result',
      operationId: result.operationId,
      requestedRevision: result.requestedRevision,
      status: result.status,
      ...(result.status === 'failed' ? { code: result.code } : {}),
    });
  }
}
