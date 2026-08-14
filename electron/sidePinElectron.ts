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
import type { SidePinDisplayInfo } from './sidePinGeometry';
import type { SidePinRuntimeState } from '../src/domain/entities/SidePinRuntimeState';
import type { SidePinWindowRole } from './sidePinWindow';
import { resolveSidePinPointerRegion, shouldRecoverSidePinRail } from './sidePinPointerRegion';

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
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    },
  };
}

export interface SidePinElectronHandle {
  readonly service: SidePinService;
  /** 살아 있는 옆핀 창 (브로드캐스트 대상 목록에 넣기 위해). 없으면 null */
  getWindows(): Electron.BrowserWindow[];
  getWindow(role: SidePinWindowRole): Electron.BrowserWindow | null;
  markRendererReady(webContentsId: number): boolean;
  /** 화면의 enter/leave 알림을 믿지 않고 실제 커서와 보이는 창으로 위치를 다시 맞춘다. */
  syncPointerRegion(): void;
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

  const syncPointerRegion = (): void => {
    const point = screen.getCursorScreenPoint();
    const state = service.getState();
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
    const next = resolveSidePinPointerRegion(point, service.getLayout(), state);

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
    dispose(): void {
      clearInterval(pointerTimer);
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
