/**
 * 옆핀을 실제 Electron 자원에 연결한다.
 *
 * 조립부(`sidePinService.ts`)는 모니터 목록·창 만들기·파일 저장을 전부 주입받는다.
 * 그 주입값을 진짜 Electron 것으로 채우는 곳이 여기다. `main.ts`는 이 함수 하나만
 * 부르면 되고, 배선 세부는 알 필요가 없다.
 */
import { app, screen } from 'electron';
import path from 'path';
import { createSidePinService, type SidePinService } from './sidePinService';
import { createSidePinScheduler } from './sidePinScheduler';
import { createSidePinBrowserWindowFactory, resolveSidePinIndexHtml } from './sidePinBrowserWindow';
import { loadSidePinDeviceState, saveSidePinDeviceState } from './sidePinDeviceState';
import { buildSidePinDisplayHint, type SidePinDisplayInfo } from './sidePinGeometry';
import { describeSidePinDisplays, type SidePinDisplayChoice } from './sidePinDisplayLabels';
import type { SidePinSetDisplayResult } from './sidePinService';
import type { SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinWindowRole } from './sidePinWindow';
import {
  resolveSidePinHoverArm,
  resolveSidePinPointerRegion,
  shouldIgnoreSidePinRailMouse,
  shouldRecoverSidePinRail,
} from './sidePinPointerRegion';

export interface SidePinElectronOptions {
  readonly preloadPath: string;
  readonly devServerUrl?: string | undefined;
  /** 앱 루트 (빌드된 renderer를 찾는 기준) */
  readonly appRoot: string;
  readonly onStateChanged?: (state: SidePinRuntimeState) => void;
}

/** Electron `Display`를 위치 계산이 쓰는 모양으로 바꾼다 */
function toDisplayInfo(display: Electron.Display): SidePinDisplayInfo {
  return {
    // Electron은 숫자로 주지만 저장·비교는 문자열로 통일한다.
    id: String(display.id),
    scaleFactor: display.scaleFactor,
    // 번호가 바뀌어도 같은 모니터를 알아보려면 이름과 전체 영역이 필요하다.
    // Windows에서 label은 비어 있을 수 있어 없는 것으로 취급될 수 있다.
    label: display.label,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    },
  };
}

/**
 * 지금 연결된 모니터를 고르기 좋은 목록으로 준다.
 *
 * **옆핀을 아직 한 번도 안 켠 상태에서도 불릴 수 있다.** 그래서 서비스가 아니라
 * `screen`에서 곧바로 읽는다 — 여기서 `createSidePinElectron()`을 부르면 쓰지도 않을
 * 커서 감시 타이머가 돌기 시작한다(트레이 "손잡이 위치 초기화"와 같은 판단).
 */
export function readSidePinDisplayChoices(): readonly SidePinDisplayChoice[] {
  return describeSidePinDisplays(
    screen.getAllDisplays().map(toDisplayInfo),
    String(screen.getPrimaryDisplay().id),
  );
}

/**
 * 옆핀을 아직 안 켠 상태에서 "어느 모니터에 띄울지"만 파일에 적어 둔다.
 *
 * 창이 없으므로 옮길 것도 없다. 다음에 켤 때 그 모니터에서 시작한다.
 */
export function setSidePinPreferredDisplayInFile(
  displayId: string | null,
): SidePinSetDisplayResult {
  const userDataDir = app.getPath('userData');
  const state = loadSidePinDeviceState(userDataDir);
  const trimmed = typeof displayId === 'string' ? displayId.trim() : '';
  const target = trimmed === '' ? null : trimmed;

  let next = state;
  if (target === null) {
    next = { ...state, displayId: null, displayHint: null };
  } else {
    const display = screen
      .getAllDisplays()
      .map(toDisplayInfo)
      .find((candidate) => candidate.id === target);
    if (display === undefined) return 'unknown-display';
    next = { ...state, displayId: target, displayHint: buildSidePinDisplayHint(display) };
  }

  return saveSidePinDeviceState(userDataDir, next) === 'failed' ? 'save-failed' : 'applied';
}

export interface SidePinElectronHandle {
  readonly service: SidePinService;
  /** 살아 있는 옆핀 창 (브로드캐스트 대상 목록에 넣기 위해). 없으면 null */
  getWindows(): Electron.BrowserWindow[];
  getWindow(role: SidePinWindowRole): Electron.BrowserWindow | null;
  markRendererReady(webContentsId: number): boolean;
  /** 화면의 enter/leave 알림을 믿지 않고 실제 커서와 보이는 창으로 위치를 다시 맞춘다. */
  syncPointerRegion(): void;
  setRailDragging(dragging: boolean): void;
  /** 모니터 변경 구독을 해제하고 타이머·창을 정리한다 */
  dispose(): void;
}

export function createSidePinElectron(options: SidePinElectronOptions): SidePinElectronHandle {
  const userDataDir = app.getPath('userData');
  const scheduler = createSidePinScheduler();
  const windows = createSidePinBrowserWindowFactory({
    preloadPath: options.preloadPath,
    devServerUrl: options.devServerUrl,
    indexHtmlPath: resolveSidePinIndexHtml(options.appRoot),
  });

  const service = createSidePinService({
    factory: windows.factory,
    scheduler,
    readDisplays: () => ({
      displays: screen.getAllDisplays().map(toDisplayInfo),
      primaryDisplayId: String(screen.getPrimaryDisplay().id),
    }),
    loadDeviceState: () => loadSidePinDeviceState(userDataDir),
    saveDeviceState: (state) => saveSidePinDeviceState(userDataDir, state),
    ...(options.onStateChanged !== undefined ? { onStateChanged: options.onStateChanged } : {}),
    onDisplayFallback: (correctedTo) => {
      console.log(`[sidePin] 저장된 모니터를 찾지 못해 ${correctedTo} 으로 옮김`);
    },
  });
  let railDragging = false;
  let railDragOffsetY: number | null = null;
  let railDragSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  /** 손잡이를 놓은 뒤 커서가 손잡이를 벗어날 때까지 false. 그동안은 펼치지 않는다. */
  let railHoverArmed = true;

  const syncPointerRegion = (): void => {
    const point = screen.getCursorScreenPoint();
    const state = service.getState();
    if (railDragging && railDragOffsetY !== null) {
      service.setRailDragTop(point.y - railDragOffsetY);
    }
    const rail = windows.getWindow('rail');
    if (
      shouldRecoverSidePinRail(
        state,
        rail !== null && !rail.isDestroyed(),
        rail !== null && !rail.isDestroyed() && rail.isVisible(),
      )
    ) {
      if (options.devServerUrl !== undefined) {
        console.warn('[sidePin] hidden rail detected; restoring');
      }
      service.enable();
      return;
    }
    const resolved = railDragging
      ? 'outside'
      : resolveSidePinPointerRegion(point, service.getLayout(), state);
    const arm = resolveSidePinHoverArm(railHoverArmed, resolved);
    railHoverArmed = arm.armed;
    const next = arm.region;
    windows.setClickThrough('rail', shouldIgnoreSidePinRailMouse(state, next, railDragging));

    // React 창의 mouseleave가 늦게 도착해도 다음 판정에서 반드시 실제 위치로 복구한다.
    if (next === state.pointerRegion) return;
    service.dispatch({ type: 'pointer-region-changed', region: next });
    if (options.devServerUrl !== undefined) {
      console.log(
        `[sidePin] native-pointer ${state.pointerRegion}->${next} surface=${state.surface} x=${point.x} y=${point.y}`,
      );
    }
  };

  const pointerTimer = setInterval(syncPointerRegion, 50);
  pointerTimer.unref();

  const setRailDragging = (dragging: boolean): void => {
    if (railDragSafetyTimer !== null) {
      clearTimeout(railDragSafetyTimer);
      railDragSafetyTimer = null;
    }

    if (dragging) {
      const layout = service.getLayout();
      const point = screen.getCursorScreenPoint();
      railDragOffsetY = layout === null ? null : point.y - layout.rail.y;
      railDragging = true;
      if (service.getState().pointerRegion !== 'outside') {
        service.dispatch({ type: 'pointer-region-changed', region: 'outside' });
      }
      railDragSafetyTimer = setTimeout(() => setRailDragging(false), 5_000);
      railDragSafetyTimer.unref();
    } else {
      const wasDragging = railDragging;
      if (railDragging && railDragOffsetY !== null) {
        const point = screen.getCursorScreenPoint();
        service.setRailDragTop(point.y - railDragOffsetY);
      }
      railDragging = false;
      railDragOffsetY = null;
      if (wasDragging) {
        // 여기서 창이 가장 가까운 칸으로 맞춰지며 손이 있던 자리에서 벗어난다.
        service.commitRailDrag();
        railHoverArmed = false;
      }
    }
    syncPointerRegion();
  };

  // 모니터를 뺐다 꽂거나 배율을 바꾸면 오른쪽 끝이 달라진다.
  // 위치 계산은 저장된 좌표가 아니라 그때그때의 작업 영역을 쓰므로 다시 부르기만 하면 된다.
  const onDisplayChange = (): void => service.handleDisplayChange();
  screen.on('display-added', onDisplayChange);
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);

  return {
    service,
    getWindows: () => windows.getWindows(),
    getWindow: (role) => windows.getWindow(role),
    markRendererReady: (webContentsId) => windows.markRendererReady(webContentsId),
    syncPointerRegion,
    setRailDragging,
    dispose(): void {
      clearInterval(pointerTimer);
      if (railDragSafetyTimer !== null) clearTimeout(railDragSafetyTimer);
      screen.removeListener('display-added', onDisplayChange);
      screen.removeListener('display-removed', onDisplayChange);
      screen.removeListener('display-metrics-changed', onDisplayChange);
      service.dispose();
      scheduler.dispose();
    },
  };
}

/** 개발 모드에서 Vite dev 서버 주소 (main.ts의 기존 규칙과 동일) */
export function sidePinDevServerUrl(): string | undefined {
  return process.env['VITE_DEV_SERVER_URL'];
}

/** preload 스크립트 경로 (dist-electron 기준) */
export function resolveSidePinPreload(dirname: string): string {
  return path.join(dirname, 'preload.js');
}
