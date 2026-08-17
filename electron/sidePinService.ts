/**
 * 옆핀 조립부 — 흩어진 조각을 하나로 묶는다.
 *
 * 조각들은 각자 아무것도 모른다. 전이 규칙은 창을 모르고, 창 호스트는 규칙을 모르고,
 * 위치 계산은 둘 다 모른다. 그것들을 실제로 연결하는 배선만 여기 있다.
 *
 * Electron에 직접 닿는 것(모니터 목록·창 만들기·파일 저장)은 전부 주입받는다.
 * 그래야 Electron 없이도 "저장된 모니터가 사라지면 저장값을 고치는가" 같은
 * 배선 자체의 동작을 시험할 수 있다.
 */
import { SidePinController } from '../src/usecases/sidePin/SidePinController';
import type { SidePinEvent } from '../src/domain/events/SidePinEvent';
import type { SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinScheduler } from '../src/usecases/sidePin/SidePinScheduler';
import type { SidePinLayout } from '../src/usecases/sidePin/SidePinWindowHost';
import {
  createSidePinWindowHost,
  type SidePinWindowFactory,
  type SidePinWindowHostHandle,
} from './sidePinWindow';
import {
  clampSidePinRailTop,
  resolveSidePinLayout,
  resolveSidePinRailPositionFromTop,
  type SidePinDisplayInfo,
} from './sidePinGeometry';
import type { SidePinDeviceState, SidePinDeviceStateSaveResult } from './sidePinDeviceState';

export interface SidePinDisplaySnapshot {
  readonly displays: readonly SidePinDisplayInfo[];
  readonly primaryDisplayId: string;
}

export interface SidePinServiceDeps {
  readonly factory: SidePinWindowFactory;
  readonly scheduler: SidePinScheduler;
  /** 지금 연결된 모니터 목록 (Electron `screen`에서 온다) */
  readonly readDisplays: () => SidePinDisplaySnapshot;
  readonly loadDeviceState: () => SidePinDeviceState;
  readonly saveDeviceState: (state: SidePinDeviceState) => SidePinDeviceStateSaveResult;
  readonly onStateChanged?: (state: SidePinRuntimeState) => void;
  /** 저장된 모니터가 사라져 다른 화면으로 옮겼을 때 알린다 */
  readonly onDisplayFallback?: (correctedTo: string) => void;
}

export interface SidePinService {
  /** 옆핀 켜기 — 손잡이가 뜬다 */
  enable(): void;
  /** 옆핀 끄기 — 모든 창을 없앤다 */
  disable(): void;
  /** 창·시스템이 보고하는 일을 controller로 넘긴다 */
  dispatch(event: SidePinEvent): void;
  /** 모니터 구성이 바뀌었다 */
  handleDisplayChange(): void;
  /** 끄는 동안의 손잡이 윗변. 8단계로 반올림하지 않고 커서를 그대로 따라간다. */
  setRailDragTop(screenY: number): void;
  /** 손을 뗐다. 지금 자리에서 가장 가까운 8단계 위치로 맞추고 저장한다. */
  commitRailDrag(): void;
  getState(): SidePinRuntimeState;
  getLayout(): SidePinLayout | null;
  dispose(): void;
}

export function createSidePinService(deps: SidePinServiceDeps): SidePinService {
  let device = deps.loadDeviceState();
  let operationSeq = 0;
  /** 끄는 동안에만 쓰는 임시 윗변. 손을 떼면 8단계로 맞추고 지운다. */
  let railDragTop: number | null = null;

  /**
   * 지금 화면 배치를 계산한다.
   *
   * 저장된 모니터가 사라졌으면 다른 화면으로 옮기고 **저장값도 고친다.**
   * 고치지 않으면 다음에 켤 때마다 같은 대체가 반복되고, 사용자는 자기가 고른
   * 모니터가 왜 안 쓰이는지 영영 모른다.
   */
  function getLayout(): SidePinLayout | null {
    const snapshot = deps.readDisplays();
    const layout = resolveSidePinLayout({
      displays: snapshot.displays,
      primaryDisplayId: snapshot.primaryDisplayId,
      preferredDisplayId: device.displayId,
      panelWidth: device.panelWidth,
      railPosition: device.railPosition,
    });
    if (layout === null) return null;

    if (layout.usedFallbackDisplay && device.displayId !== layout.displayId) {
      device = { ...device, displayId: layout.displayId };
      deps.saveDeviceState(device);
      deps.onDisplayFallback?.(layout.displayId);
    }

    if (railDragTop === null) return { rail: layout.rail, panel: layout.panel };

    // 끄는 중에는 저장된 칸이 아니라 손이 있는 자리를 그린다. 포인터 판정도 이
    // 배치를 쓰므로, 손잡이 구역이 창과 함께 따라 움직인다.
    const display = snapshot.displays.find((candidate) => candidate.id === layout.displayId);
    if (display === undefined) return { rail: layout.rail, panel: layout.panel };
    return {
      rail: {
        ...layout.rail,
        y: clampSidePinRailTop(display.workArea, railDragTop, layout.rail.height),
      },
      panel: layout.panel,
    };
  }

  /**
   * 손잡이가 놓인 모니터와 그 배치를 함께 구한다.
   *
   * 끌기 계산은 그 모니터의 작업 영역을 기준으로 해야 한다 — `getLayout`의 임시
   * 자리를 다시 입력으로 쓰면 값이 자기 자신을 먹고 표류한다.
   */
  function resolveDisplayForRail(): {
    display: SidePinDisplayInfo;
    layout: SidePinLayout;
  } | null {
    const snapshot = deps.readDisplays();
    const layout = resolveSidePinLayout({
      displays: snapshot.displays,
      primaryDisplayId: snapshot.primaryDisplayId,
      preferredDisplayId: device.displayId,
      panelWidth: device.panelWidth,
      railPosition: device.railPosition,
    });
    if (layout === null) return null;
    const display = snapshot.displays.find((candidate) => candidate.id === layout.displayId);
    if (display === undefined) return null;
    return { display, layout };
  }

  const host: SidePinWindowHostHandle = createSidePinWindowHost({
    factory: deps.factory,
    getLayout,
  });

  const controller = new SidePinController({
    scheduler: deps.scheduler,
    host,
    createOperationId: () => {
      operationSeq += 1;
      return `sidePin-${operationSeq}`;
    },
    getLayout: () => {
      const layout = getLayout();
      // 모니터를 하나도 못 찾는 상황에서도 controller는 어딘가 값을 요구한다.
      // 이때 창을 건드리지 않도록 호스트가 다시 null 검사를 하므로,
      // 여기서는 화면 밖이 아닌 안전한 기본값을 준다.
      return layout ?? FALLBACK_LAYOUT;
    },
    ...(deps.onStateChanged !== undefined ? { onStateChanged: deps.onStateChanged } : {}),
  });

  return {
    enable(): void {
      controller.dispatch({ type: 'enabled-changed', enabled: true });
    },

    disable(): void {
      controller.dispatch({ type: 'enabled-changed', enabled: false });
    },

    dispatch(event: SidePinEvent): void {
      controller.dispatch(event);
    },

    handleDisplayChange(): void {
      controller.dispatch({ type: 'layout-changed' });
    },

    setRailDragTop(screenY: number): void {
      if (!Number.isFinite(screenY)) return;
      const resolved = resolveDisplayForRail();
      if (resolved === null) return;

      const next = clampSidePinRailTop(
        resolved.display.workArea,
        screenY,
        resolved.layout.rail.height,
      );
      // 손이 멈춰 있으면 창도 가만히 둔다 — 50ms마다 같은 자리로 다시 옮기지 않는다.
      if (railDragTop === next) return;
      railDragTop = next;
      controller.dispatch({ type: 'layout-changed' });
    },

    commitRailDrag(): void {
      if (railDragTop === null) return;
      const releasedTop = railDragTop;
      railDragTop = null;

      const resolved = resolveDisplayForRail();
      if (resolved !== null) {
        const railPosition = resolveSidePinRailPositionFromTop(
          resolved.display.workArea,
          releasedTop,
          resolved.layout.rail.height,
        );
        if (railPosition !== device.railPosition) {
          device = { ...device, railPosition };
          deps.saveDeviceState(device);
        }
      }
      // 저장한 비율은 놓은 자리를 그대로 되돌려주므로 창은 튀지 않는다. 그래도 한 번
      // 배치를 맞춰, 임시 자리를 지운 뒤의 상태와 화면을 일치시킨다.
      controller.dispatch({ type: 'layout-changed' });
    },

    getState(): SidePinRuntimeState {
      return controller.getState();
    },

    getLayout,

    dispose(): void {
      controller.dispose();
    },
  };
}

/**
 * 모니터를 하나도 못 찾을 때 쓰는 자리표시 배치.
 *
 * 실제로 창을 이 자리에 그리지는 않는다 — 호스트가 배치 없음을 다시 확인해
 * 명령을 실패로 돌려주기 때문이다. 화면 밖 좌표를 쓰지 않는 이유는, 혹시라도
 * 그려질 경우 사용자가 찾을 수 없는 곳에 창이 남기 때문이다.
 */
const FALLBACK_LAYOUT: SidePinLayout = {
  rail: { x: 0, y: 0, width: 16, height: 100 },
  panel: { x: 0, y: 0, width: 360, height: 100 },
};
