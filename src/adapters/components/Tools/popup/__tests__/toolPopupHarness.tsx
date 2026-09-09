import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';
import type { PopupToolId } from '@domain/entities/ToolPopup';
import type { ToolPopupSessionValue, ToolPopupSnapshotEnvelope } from '../toolPopupSession';
import { ToolPopupSessionContext, ToolPopupSlotRegistry } from '../toolPopupSession';

/**
 * 팝업 이관 왕복 시험용 껍데기.
 *
 * 실제 창을 만들지 않고 **본문 → 팝업 → 본문** 과 같은 순서(정지+캡처 → 새 화면 → 복원)를
 * 그대로 재현한다. 창을 못 띄우는 검사 환경에서도 상태 보존을 기계로 확인하기 위한 것이다.
 */
export interface PopupHarness {
  readonly registry: ToolPopupSlotRegistry;
  readonly view: ReturnType<typeof render>;
  /** 지금 화면을 멈추고 담는다. */
  capture(now?: number): ToolPopupSnapshotEnvelope;
  unmount(): void;
}

export function renderInPlacement(
  element: ReactElement,
  options: {
    readonly toolId: PopupToolId;
    readonly placement: 'main' | 'popup';
    readonly initialSnapshot?: ToolPopupSnapshotEnvelope | null;
  },
): PopupHarness {
  const registry = new ToolPopupSlotRegistry();
  const session: ToolPopupSessionValue = {
    placement: options.placement,
    toolId: options.toolId,
    initialSnapshot: options.initialSnapshot ?? null,
    registerSlot: (slotId, handlers) => registry.register(slotId, handlers),
    moveToPopup: () => {},
    returnToMain: () => {},
    closePopup: () => {},
    alwaysOnTop: false,
    toggleAlwaysOnTop: () => {},
    supportsAlwaysOnTop: false,
    busy: false,
  };

  const view = render(
    <ToolPopupSessionContext.Provider value={session}>{element}</ToolPopupSessionContext.Provider>,
  );

  return {
    registry,
    view,
    capture: (now = Date.now()) => {
      let envelope!: ToolPopupSnapshotEnvelope;
      act(() => {
        envelope = registry.capture(now);
      });
      return envelope;
    },
    unmount: () => view.unmount(),
  };
}
