/**
 * 실제 창을 만들고 보여주고 없애는 일을 맡는 포트.
 *
 * 이 경계를 둔 이유는 구조 결정을 미룰 수 있게 하기 위해서다.
 * 기획서는 두 가지 구조를 후보로 둔다 —
 *   A안: 창 하나에 손잡이와 패널을 같이 둔다 (단순하지만 항상 떠 있는 비용)
 *   D안: 손잡이만 상시로 두고 패널은 필요할 때 만든다 (가볍지만 창 두 개 조율)
 * 어느 쪽이 나은지는 실제 측정 전에는 알 수 없다.
 *
 * 그래서 판단 규칙(controller)은 어느 구조인지 모르게 만들고, 이 포트만 바꿔 끼운다.
 * 두 구현은 같은 계약 테스트를 통과해야 한다.
 */
import type { SidePinPointerRegion } from '@domain/entities/SidePinRuntimeState';

export interface SidePinBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SidePinLayout {
  readonly rail: SidePinBounds;
  readonly panel: SidePinBounds;
}

/**
 * 명령마다 따라다니는 꼬리표.
 *
 * 창 조작은 비동기라 응답이 순서대로 오지 않는다. 이 두 값이 있어야
 * "지금 유효한 요청의 응답"과 "이미 취소된 요청의 뒤늦은 응답"을 구분할 수 있다.
 */
export interface SidePinHostCommandContext {
  readonly operationId: string;
  readonly requestedRevision: number;
}

export type SidePinHostCommandResult =
  | { readonly status: 'applied'; readonly operationId: string; readonly requestedRevision: number }
  | { readonly status: 'stale'; readonly operationId: string; readonly requestedRevision: number }
  | {
      readonly status: 'failed';
      readonly operationId: string;
      readonly requestedRevision: number;
      readonly code: string;
      readonly recoverable: boolean;
    };

/**
 * 창이 controller에 보내는 알림.
 *
 * 명령의 결과(`panel-painted`)와 물리 입력(포인터·포커스)을 한 통로로 모은다.
 * 화면이 자기 판단으로 상태를 바꾸지 못하게 하려는 것이다.
 */
export type SidePinHostEvent =
  | {
      readonly type: 'panel-painted';
      readonly operationId: string;
      readonly requestedRevision: number;
    }
  | { readonly type: 'pointer-region-changed'; readonly region: SidePinPointerRegion }
  | { readonly type: 'window-focus-changed'; readonly focused: boolean }
  | { readonly type: 'outside-click' };

export interface SidePinWindowHost {
  ensureRail(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult>;
  preparePanel(
    ctx: SidePinHostCommandContext,
    bounds: SidePinBounds,
  ): Promise<SidePinHostCommandResult>;
  showPanel(
    ctx: SidePinHostCommandContext,
    options: { readonly focus: boolean },
  ): Promise<SidePinHostCommandResult>;
  collapsePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  disposePanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  hideAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  repositionAll(
    ctx: SidePinHostCommandContext,
    layout: SidePinLayout,
  ): Promise<SidePinHostCommandResult>;
  focusPanel(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  destroyAll(ctx: SidePinHostCommandContext): Promise<SidePinHostCommandResult>;
  subscribe(listener: (event: SidePinHostEvent) => void): () => void;
}
