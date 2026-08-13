/**
 * 옆핀 창 — A안(손잡이와 패널을 한 창에 두는 구조) 구현.
 *
 * 기획서는 두 구조를 후보로 둔다. A안은 창 하나를 손잡이 크기와 패널 크기 사이에서
 * 늘였다 줄이고, D안은 손잡이 창만 상주시키고 패널 창을 필요할 때 만든다.
 * 어느 쪽이 나은지는 실제 메모리·CPU를 재 봐야 알 수 있으므로, 판단 규칙(controller)은
 * 어느 구조인지 모르게 두고 이 파일만 바꿔 끼운다.
 *
 * **Electron을 직접 import하지 않는다.** 창을 만드는 일을 `SidePinWindowFactory`로 주입받아,
 * 테스트에서는 가짜 창으로 같은 계약을 통과시킬 수 있게 했다. Electron 런타임 없이는
 * BrowserWindow를 띄울 수 없어서 그러지 않으면 이 파일 전체가 시험 불가능해진다.
 *
 * 타입만 `src/`에서 가져온다. 타입 import는 번들에 아무 흔적도 남기지 않으므로
 * 실행 파일이 무거워지지 않는다. (`@domain/*` 별칭은 esbuild에 설정이 없어 쓸 수 없고,
 * 상대 경로만 동작한다 — `electron/ipc/board.ts` 선례.)
 */
import type {
  SidePinBounds,
  SidePinHostCommandContext,
  SidePinHostCommandResult,
  SidePinHostEvent,
  SidePinLayout,
  SidePinWindowHost,
} from '../src/usecases/sidePin/SidePinWindowHost';

/**
 * 이 호스트가 창에 요구하는 최소한의 능력.
 *
 * `BrowserWindow` 전체가 아니라 실제로 쓰는 것만 적었다. 가짜 창을 만들기 쉽고,
 * 나중에 누가 창에 무슨 짓을 하는지 한눈에 보인다.
 */
export interface SidePinWindowLike {
  setBounds(bounds: SidePinBounds): void;
  /** 포커스를 빼앗지 않고 보이기 — 호버로 열 때 쓴다 */
  showInactive(): void;
  focus(): void;
  hide(): void;
  destroy(): void;
  isDestroyed(): boolean;
  /** 렌더러에 알림 보내기 */
  send(channel: string, payload?: unknown): void;
}

export interface SidePinWindowFactory {
  create(bounds: SidePinBounds): SidePinWindowLike;
}

/** 렌더러에 패널 내용을 비우라고 알릴 때 쓰는 채널 */
export const SIDE_PIN_CLEAR_PANEL_CHANNEL = 'sidePin:clear-panel';

type Listener = (event: SidePinHostEvent) => void;

function applied(ctx: SidePinHostCommandContext): SidePinHostCommandResult {
  return {
    status: 'applied',
    operationId: ctx.operationId,
    requestedRevision: ctx.requestedRevision,
  };
}

function failed(
  ctx: SidePinHostCommandContext,
  code: string,
  recoverable = true,
): SidePinHostCommandResult {
  return {
    status: 'failed',
    operationId: ctx.operationId,
    requestedRevision: ctx.requestedRevision,
    code,
    recoverable,
  };
}

export interface SidePinWindowHostDeps {
  readonly factory: SidePinWindowFactory;
  /** 지금 화면 배치. 모니터를 못 찾으면 null */
  readonly getLayout: () => SidePinLayout | null;
}

/**
 * 호스트 + 알림 주입구.
 *
 * 창이 보고하는 일(포인터 이동·그리기 완료·포커스)은 §9-5에서 preload IPC로 들어온다.
 * 그때 `emitHostEvent`를 부르면 controller로 전달된다.
 */
export interface SidePinWindowHostHandle extends SidePinWindowHost {
  emitHostEvent(event: SidePinHostEvent): void;
}

/**
 * A안 호스트를 만든다.
 *
 * 창은 하나뿐이므로 "패널을 만든다/없앤다"는 창 생성·파기가 아니라
 * 크기를 바꾸고 내용을 비우는 것으로 표현된다. D안에서는 같은 명령이
 * 진짜 창 생성·파기가 된다 — 그래서 controller는 어느 쪽인지 몰라도 된다.
 */
export function createSidePinWindowHost(deps: SidePinWindowHostDeps): SidePinWindowHostHandle {
  let win: SidePinWindowLike | null = null;
  let listener: Listener | null = null;
  /** 패널 크기로 늘어나 있는가 */
  let expanded = false;

  function alive(): SidePinWindowLike | null {
    if (win === null) return null;
    if (win.isDestroyed()) {
      win = null;
      return null;
    }
    return win;
  }

  function emit(event: SidePinHostEvent): void {
    listener?.(event);
  }

  function ensureRail(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult> {
    try {
      const existing = alive();
      if (existing === null) {
        win = deps.factory.create(bounds);
      }
      // 새로 만들었든 이미 있었든 항상 위치를 다시 잡는다.
      // "팩토리가 알아서 넣어 주겠지"에 기대면, 창을 만드는 쪽이 바뀔 때
      // 손잡이가 엉뚱한 자리에 뜨고 원인은 여기가 아니라 저기서 찾게 된다.
      win?.setBounds(bounds);
      expanded = false;
      win?.showInactive();
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error), false));
    }
  }

  function preparePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    // A안은 창이 이미 있으므로 따로 만들 것이 없다. 손잡이조차 없으면 실패다 —
    // 여기서 조용히 성공을 돌려주면 controller가 "준비됐다"고 믿고 보여달라고 한다.
    const existing = alive();
    if (existing === null) return Promise.resolve(failed(ctx, 'RAIL_MISSING'));
    return Promise.resolve(applied(ctx));
  }

  function showPanel(
    ctx: SidePinHostCommandContext,
    options: { readonly focus: boolean },
  ): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(failed(ctx, 'RAIL_MISSING'));

    const layout = deps.getLayout();
    if (layout === null) return Promise.resolve(failed(ctx, 'NO_DISPLAY'));

    try {
      existing.setBounds(layout.panel);
      expanded = true;
      if (options.focus) existing.focus();
      else existing.showInactive();
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function collapsePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const existing = alive();
    // 이미 창이 없으면 접을 것도 없다. 실패로 보면 controller가 오류를 기록하는데,
    // 사용자에게 알릴 것이 없는 상황이다.
    if (existing === null) return Promise.resolve(applied(ctx));

    const layout = deps.getLayout();
    if (layout === null) return Promise.resolve(failed(ctx, 'NO_DISPLAY'));

    try {
      existing.setBounds(layout.rail);
      expanded = false;
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function disposePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(applied(ctx));

    try {
      // A안에서 파기는 창을 없애는 것이 아니라 패널 내용을 비우는 것이다.
      // 창을 없애면 손잡이까지 사라진다.
      existing.send(SIDE_PIN_CLEAR_PANEL_CHANNEL);
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function hideAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(applied(ctx));

    try {
      // 숨기기 전에 내용을 비운다. 잠금 화면 위로 메모가 스치는 것을 막는다.
      existing.send(SIDE_PIN_CLEAR_PANEL_CHANNEL);
      existing.hide();
      expanded = false;
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function repositionAll(
    ctx: SidePinHostCommandContext,
    layout: SidePinLayout,
  ): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(applied(ctx));

    try {
      existing.setBounds(expanded ? layout.panel : layout.rail);
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function focusPanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(failed(ctx, 'RAIL_MISSING'));

    try {
      existing.focus();
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  function destroyAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const existing = alive();
    if (existing === null) return Promise.resolve(applied(ctx));

    try {
      existing.destroy();
      win = null;
      expanded = false;
      return Promise.resolve(applied(ctx));
    } catch (error) {
      return Promise.resolve(failed(ctx, describeError(error)));
    }
  }

  return {
    ensureRail,
    preparePanel,
    showPanel,
    collapsePanel,
    disposePanel,
    hideAll,
    repositionAll,
    focusPanel,
    destroyAll,
    subscribe(next: Listener): () => void {
      listener = next;
      return () => {
        if (listener === next) listener = null;
      };
    },
    emitHostEvent: emit,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'UNKNOWN';
}
