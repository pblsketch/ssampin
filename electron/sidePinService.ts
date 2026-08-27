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
import { isEditorBusy, type SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinScheduler } from '../src/usecases/sidePin/SidePinScheduler';
import type { SidePinLayout } from '../src/usecases/sidePin/SidePinWindowHost';
import {
  createSidePinWindowHost,
  type SidePinWindowFactory,
  type SidePinWindowHostHandle,
} from './sidePinWindow';
import {
  buildSidePinDisplayHint,
  clampSidePinRailTop,
  resolveSidePinLayout,
  resolveSidePinRailPositionFromTop,
  type SidePinDisplayInfo,
} from './sidePinGeometry';
import {
  SIDE_PIN_RAIL_POSITION_DEFAULT,
  type SidePinDeviceState,
  type SidePinDeviceStateSaveResult,
} from './sidePinDeviceState';

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

/**
 * 모니터 지정 결과.
 *
 * 성공/실패 둘로만 나누면 "저장은 됐는데 화면은 아직 안 옮긴" 경우를 말할 수 없다.
 * 메모를 쓰는 중에는 일부러 미루므로, 그 사실을 부르는 쪽이 알아야 사용자에게
 * "메모를 저장하면 옮겨집니다"라고 알려 줄 수 있다.
 */
export type SidePinSetDisplayResult =
  /** 저장하고 화면도 옮겼다 */
  | 'applied'
  /** 저장했지만 메모 편집 중이라 화면 이동은 편집이 끝난 뒤로 미뤘다 */
  | 'deferred'
  /** 그런 모니터가 지금 없다 — 아무것도 바꾸지 않았다 */
  | 'unknown-display'
  /** 파일에 못 썼다. 이번 실행에는 적용되지만 다시 켜면 사라진다 */
  | 'save-failed';

export interface SidePinService {
  /** 옆핀 켜기 — 손잡이가 뜬다 */
  enable(): void;
  /** 옆핀 끄기 — 모든 창을 없앤다 */
  disable(): void;
  /** 창·시스템이 보고하는 일을 controller로 넘긴다 */
  dispatch(event: SidePinEvent): void;
  /** 모니터 구성이 바뀌었다 */
  handleDisplayChange(): void;
  /** 끄는 동안의 손잡이 윗변. 반올림하지 않고 커서를 그대로 따라간다. */
  setRailDragTop(screenY: number): void;
  /** 손을 뗐다. 놓은 자리를 비율(0~1)로 바꿔 저장한다. 칸으로 튀지 않는다. */
  commitRailDrag(): void;
  /** 손잡이를 세로 기본 자리로 되돌린다 (트레이 "옆핀 손잡이 위치 초기화") */
  resetRailPosition(): void;
  /**
   * 옆핀을 띄울 모니터를 정한다. `null`이면 "자동"(주 모니터)으로 되돌린다.
   *
   * 어느 모니터를 골랐든 **그 모니터의 오른쪽 끝**에 붙는다.
   */
  setPreferredDisplay(displayId: string | null): SidePinSetDisplayResult;
  /** 사용자가 고른 모니터. 고르지 않았으면 null */
  getPreferredDisplayId(): string | null;
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
   * 대체 사실을 이미 알린 모니터. 같은 대체를 반복해서 알리지 않기 위한 빗장.
   *
   * `getLayout`은 커서 감시 때문에 50ms마다 불린다. 빗장이 없으면 모니터를 뽑아 둔
   * 동안 초당 스무 번씩 같은 알림이 나간다.
   */
  let notifiedFallbackFor: string | null = null;
  /**
   * 모니터를 옮기기로 했는데 메모를 쓰는 중이라 미뤄 둔 상태인가.
   *
   * 옮기면 창 크기가 달라져 패널 창을 다시 만들게 되고, 그때 **쓰던 글이 사라진다.**
   * 저장은 바로 하고 화면만 편집이 끝난 뒤에 옮긴다.
   */
  let pendingDisplayApply = false;

  /**
   * 지금 화면 배치를 계산한다.
   *
   * ⚠️ **저장된 모니터가 사라져도 저장값은 건드리지 않는다**(ADR-075). 이번 실행에만
   * 주 모니터로 그린다. 예전에는 여기서 저장값을 대체 모니터로 고쳤는데, 모니터를
   * 고를 수단이 생긴 뒤로는 그것이 곧 **케이블을 뽑을 때마다 선택이 지워지는** 결함이 된다.
   *
   * 다만 단서로 **같은 모니터를 새 번호로 다시 찾은** 경우는 다르다. 가리키는 대상이
   * 그대로라 번호만 갱신하면 되고, 갱신하지 않으면 다음에도 매번 다시 찾아야 한다.
   */
  function getLayout(): SidePinLayout | null {
    const snapshot = deps.readDisplays();
    const layout = resolveSidePinLayout({
      displays: snapshot.displays,
      primaryDisplayId: snapshot.primaryDisplayId,
      preferredDisplayId: device.displayId,
      preferredDisplayHint: device.displayHint,
      panelWidth: device.panelWidth,
      railPosition: device.railPosition,
    });
    if (layout === null) return null;

    // 같은 모니터인데 번호만 바뀐 경우 — 번호를 따라가 준다.
    if (layout.rematchedDisplayId !== null && device.displayId !== layout.rematchedDisplayId) {
      device = { ...device, displayId: layout.rematchedDisplayId };
      deps.saveDeviceState(device);
    }

    if (layout.usedFallbackDisplay) {
      if (notifiedFallbackFor !== layout.displayId) {
        notifiedFallbackFor = layout.displayId;
        deps.onDisplayFallback?.(layout.displayId);
      }
    } else {
      notifiedFallbackFor = null;
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
      preferredDisplayHint: device.displayHint,
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

      // 메모를 쓰느라 미뤄 둔 모니터 이동이 있으면, 편집이 끝나는 순간 적용한다.
      // 여기서 처리하는 이유는 편집 상태가 바뀌는 통로가 이 dispatch 하나뿐이기 때문이다.
      if (pendingDisplayApply && !isEditorBusy(controller.getState().editorActivity)) {
        pendingDisplayApply = false;
        controller.dispatch({ type: 'layout-changed' });
      }
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

    resetRailPosition(): void {
      // 끌던 도중에 눌렀을 수도 있다. 임시 자리를 남겨 두면 되돌려 놓아도
      // 손잡이가 끌던 자리에 그대로 머문다.
      railDragTop = null;

      if (device.railPosition !== SIDE_PIN_RAIL_POSITION_DEFAULT) {
        device = { ...device, railPosition: SIDE_PIN_RAIL_POSITION_DEFAULT };
        deps.saveDeviceState(device);
      }

      // **값이 이미 기본값이어도 반드시 다시 배치한다.** "같으면 아무것도 안 한다"로
      // 두면, 모니터를 바꾸거나 해상도가 달라져 손잡이가 엉뚱한 자리에 있는데
      // 저장값만 기본값인 경우 초기화가 아무 일도 하지 않는 막다른 길이 된다.
      // v2.3.7에서 같은 판단(from === next면 조기 반환)이 "다시 시도" 버튼까지
      // 죽였다(ADR-042·043). 되돌리는 기능은 언제 눌러도 되돌려야 한다.
      controller.dispatch({ type: 'layout-changed' });
    },

    setPreferredDisplay(displayId: string | null): SidePinSetDisplayResult {
      const trimmed = typeof displayId === 'string' ? displayId.trim() : '';
      const target = trimmed === '' ? null : trimmed;

      let next: SidePinDeviceState;
      if (target === null) {
        // "자동"으로 되돌리기 — 단서도 함께 지운다. 남겨 두면 다음에 고를 때
        // 지워진 선택의 단서가 살아 있어 엉뚱한 모니터를 다시 찾아낼 수 있다.
        next = { ...device, displayId: null, displayHint: null };
      } else {
        const snapshot = deps.readDisplays();
        const display = snapshot.displays.find((candidate) => candidate.id === target);
        // 없는 모니터를 저장하면 켤 때마다 대체가 일어나고 사용자는 이유를 알 수 없다.
        if (display === undefined) return 'unknown-display';
        next = { ...device, displayId: target, displayHint: buildSidePinDisplayHint(display) };
      }

      device = next;
      // 바꾸자마자 대체 빗장을 푼다. 안 그러면 새로 고른 모니터가 나중에 사라져도
      // 이전 대체와 같은 번호라는 이유로 알림이 한 번 통째로 빠진다.
      notifiedFallbackFor = null;
      const saveResult = deps.saveDeviceState(device);

      // 메모를 쓰는 중이면 창을 다시 만들 수 없다 — 쓰던 글이 사라진다.
      // 저장은 이미 끝났으므로, 편집이 끝나면 dispatch가 대신 옮겨 준다.
      if (isEditorBusy(controller.getState().editorActivity)) {
        pendingDisplayApply = true;
        return saveResult === 'failed' ? 'save-failed' : 'deferred';
      }

      pendingDisplayApply = false;
      controller.dispatch({ type: 'layout-changed' });
      return saveResult === 'failed' ? 'save-failed' : 'applied';
    },

    getPreferredDisplayId(): string | null {
      return device.displayId;
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
