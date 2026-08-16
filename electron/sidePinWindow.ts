import type {
  SidePinBounds,
  SidePinHostCommandContext,
  SidePinHostCommandResult,
  SidePinHostEvent,
  SidePinLayout,
  SidePinWindowHost,
} from '../src/usecases/sidePin/SidePinWindowHost';

export type SidePinWindowRole = 'rail' | 'panel';

/** Electron에 직접 의존하지 않는 옆핀 창의 최소 기능. */
export interface SidePinWindowLike {
  /** 크기는 유지하고 화면상 위치만 옮긴다. */
  setPosition(bounds: SidePinBounds): void;
  /** 손잡이의 빈 영역에서 아래 창이 클릭을 받도록 한다. */
  setClickThrough?(enabled: boolean): void;
  /** 창의 첫 화면 준비가 끝난 뒤 표시한다. */
  showInactive(): Promise<void>;
  /** 창의 첫 화면 준비가 끝난 뒤 표시하고 포커스를 준다. */
  focus(): Promise<void>;
  hide(): void;
  destroy(): void;
  isDestroyed(): boolean;
  send(channel: string, payload?: unknown): void;
}

export interface SidePinWindowFactory {
  create(role: SidePinWindowRole, bounds: SidePinBounds): SidePinWindowLike;
}

export const SIDE_PIN_CLEAR_PANEL_CHANNEL = 'sidePin:clear-panel';
export const SIDE_PIN_PANEL_SHOWN_CHANNEL = 'sidePin:panel-shown';
const SIDE_PIN_NATIVE_PAINT_FALLBACK_MS = 500;

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
  readonly getLayout: () => SidePinLayout | null;
}

export interface SidePinWindowHostHandle extends SidePinWindowHost {
  emitHostEvent(event: SidePinHostEvent): void;
}

/**
 * 손잡이와 패널을 서로 다른 고정 크기 창으로 관리한다.
 *
 * Electron은 투명 창의 리사이즈를 공식적으로 지원하지 않는다. 따라서 열기/닫기 중에는
 * 창 크기를 바꾸지 않고, 준비된 두 창의 표시 여부만 전환한다.
 */
export function createSidePinWindowHost(deps: SidePinWindowHostDeps): SidePinWindowHostHandle {
  let railWindow: SidePinWindowLike | null = null;
  let panelWindow: SidePinWindowLike | null = null;
  let railBounds: SidePinBounds | null = null;
  let panelBounds: SidePinBounds | null = null;
  let railVisible = false;
  let panelVisible = false;
  let listener: Listener | null = null;

  function alive(role: SidePinWindowRole): SidePinWindowLike | null {
    const current = role === 'rail' ? railWindow : panelWindow;
    if (current === null) return null;
    if (!current.isDestroyed()) return current;
    if (role === 'rail') railWindow = null;
    else panelWindow = null;
    return null;
  }

  function hasSameSize(a: SidePinBounds | null, b: SidePinBounds): boolean {
    return a !== null && a.width === b.width && a.height === b.height;
  }

  async function replaceRail(bounds: SidePinBounds, show: boolean): Promise<SidePinWindowLike> {
    const previous = alive('rail');
    const candidate = deps.factory.create('rail', bounds);
    try {
      if (show) await candidate.showInactive();
    } catch (error) {
      candidate.destroy();
      throw error;
    }
    previous?.destroy();
    railWindow = candidate;
    railBounds = bounds;
    return candidate;
  }

  async function replacePanel(bounds: SidePinBounds, show: boolean): Promise<SidePinWindowLike> {
    const previous = alive('panel');
    const candidate = deps.factory.create('panel', bounds);
    try {
      if (show) await candidate.showInactive();
    } catch (error) {
      candidate.destroy();
      throw error;
    }
    previous?.destroy();
    panelWindow = candidate;
    panelBounds = bounds;
    if (show) candidate.send(SIDE_PIN_PANEL_SHOWN_CHANNEL);
    return candidate;
  }

  async function ensureRail(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult> {
    try {
      let rail = alive('rail');
      if (rail === null || !hasSameSize(railBounds, bounds)) {
        rail = await replaceRail(bounds, false);
      } else {
        rail.setPosition(bounds);
        railBounds = bounds;
      }
      await rail.showInactive();
      railVisible = true;

      alive('panel')?.hide();
      panelVisible = false;

      // 첫 호버 때 새 렌더러를 띄우면 index.html의 공용 스플래시가 보일 수 있다.
      // 옆핀 진입 직후 숨겨진 패널을 미리 만들고, 실제 표시는 React 준비 신호 뒤에만 한다.
      const layout = deps.getLayout();
      if (layout !== null) {
        const panel = alive('panel');
        if (panel === null || !hasSameSize(panelBounds, layout.panel)) {
          await replacePanel(layout.panel, false);
        } else {
          panel.setPosition(layout.panel);
          panelBounds = layout.panel;
        }
      }
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error), false);
    }
  }

  async function preparePanel(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult> {
    if (alive('rail') === null) return failed(ctx, 'RAIL_MISSING');

    try {
      const panel = alive('panel');
      if (panel === null || !hasSameSize(panelBounds, bounds)) {
        await replacePanel(bounds, panelVisible);
      } else {
        panel.setPosition(bounds);
        panelBounds = bounds;
      }
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error), false);
    }
  }

  async function showPanel(
    ctx: SidePinHostCommandContext,
    options: { readonly focus: boolean },
  ): Promise<SidePinHostCommandResult> {
    const rail = alive('rail');
    if (rail === null) return failed(ctx, 'RAIL_MISSING');
    const panel = alive('panel');
    if (panel === null) return failed(ctx, 'PANEL_MISSING');

    try {
      // 새 창이 실제로 표시된 다음 손잡이를 숨겨 전환 중 빈 틈도 만들지 않는다.
      if (options.focus) await panel.focus();
      else await panel.showInactive();
      panel.send(SIDE_PIN_PANEL_SHOWN_CHANNEL);
      rail.hide();
      panelVisible = true;
      railVisible = false;
      // 렌더러의 painted IPC가 유실돼도 실제로 표시된 패널을 감시 타이머가 닫지 않게 한다.
      const paintFallback = setTimeout(() => {
        listener?.({
          type: 'panel-painted',
          operationId: ctx.operationId,
          requestedRevision: ctx.requestedRevision,
        });
      }, SIDE_PIN_NATIVE_PAINT_FALLBACK_MS);
      paintFallback.unref();
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function collapsePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const rail = alive('rail');
    if (rail === null) return applied(ctx);

    try {
      // 손잡이가 표시된 뒤 패널을 숨겨 닫는 순간에도 화면이 비지 않게 한다.
      await rail.showInactive();
      alive('panel')?.hide();
      railVisible = true;
      panelVisible = false;
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function disposePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const panel = alive('panel');
    if (panel === null) return applied(ctx);

    try {
      panel.send(SIDE_PIN_CLEAR_PANEL_CHANNEL);
      panel.destroy();
      panelWindow = null;
      panelBounds = null;
      panelVisible = false;
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function hideAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    try {
      const panel = alive('panel');
      if (panel !== null) {
        panel.send(SIDE_PIN_CLEAR_PANEL_CHANNEL);
        panel.destroy();
        panelWindow = null;
        panelBounds = null;
      }
      alive('rail')?.hide();
      panelVisible = false;
      railVisible = false;
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function repositionAll(
    ctx: SidePinHostCommandContext,
    layout: SidePinLayout,
  ): Promise<SidePinHostCommandResult> {
    try {
      const rail = alive('rail');
      if (rail !== null) {
        if (hasSameSize(railBounds, layout.rail)) {
          rail.setPosition(layout.rail);
          railBounds = layout.rail;
        } else {
          await replaceRail(layout.rail, railVisible);
        }
      }

      const panel = alive('panel');
      if (panel !== null) {
        if (hasSameSize(panelBounds, layout.panel)) {
          panel.setPosition(layout.panel);
          panelBounds = layout.panel;
        } else {
          await replacePanel(layout.panel, panelVisible);
        }
      }
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function focusPanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    const panel = alive('panel');
    if (panel === null) return failed(ctx, 'PANEL_MISSING');

    try {
      await panel.focus();
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
    }
  }

  async function destroyAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult> {
    try {
      const panel = alive('panel');
      const rail = alive('rail');
      panel?.destroy();
      rail?.destroy();
      panelWindow = null;
      railWindow = null;
      panelBounds = null;
      railBounds = null;
      panelVisible = false;
      railVisible = false;
      return applied(ctx);
    } catch (error) {
      return failed(ctx, describeError(error));
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
    emitHostEvent(event: SidePinHostEvent): void {
      listener?.(event);
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'UNKNOWN';
}
