/**
 * 실제 Electron 창을 옆핀 호스트가 쓰는 모양으로 맞춰 주는 어댑터.
 *
 * `sidePinWindow.ts`(호스트)는 Electron을 모른다. 그래야 창을 띄우지 않고 시험할 수 있다.
 * Electron을 아는 코드는 이 파일 하나로 몰아 둔다.
 *
 * 창 옵션의 근거는 기획서 §6 "공통 창 옵션"이다.
 * - 테두리 없음·투명: 손잡이가 화면 가장자리에 얇게 붙어야 한다.
 * - 작업 표시줄에 안 나옴: 옆핀은 별도 앱이 아니라 보조 화면이다.
 * - `alwaysOnTop`은 `'normal'` 단계만 쓴다. 아이콘 모드가 쓰는 `screen-saver` 단계는
 *   전체 화면 앱까지 덮어 버리는데, 옆핀은 그러면 안 된다.
 */
import { BrowserWindow } from 'electron';
import path from 'path';
import type { SidePinBounds } from '../src/usecases/sidePin/SidePinWindowHost';
import type { SidePinWindowFactory, SidePinWindowLike } from './sidePinWindow';

/** 렌더러가 옆핀 화면으로 뜨도록 알리는 쿼리 (`src/App.tsx`의 분기와 짝을 이룬다) */
export const SIDE_PIN_RENDERER_MODE = 'sidePin';

export interface SidePinBrowserWindowOptions {
  /** preload 스크립트 절대 경로 */
  readonly preloadPath: string;
  /** 개발 서버 주소. 없으면 빌드된 파일을 연다 */
  readonly devServerUrl?: string | undefined;
  /** 빌드된 renderer의 index.html 절대 경로 */
  readonly indexHtmlPath: string;
}

/** BrowserWindow를 호스트가 요구하는 최소 능력으로 감싼다 */
function adapt(win: BrowserWindow): SidePinWindowLike {
  return {
    setBounds(bounds: SidePinBounds): void {
      win.setBounds(bounds);
    },
    showInactive(): void {
      win.showInactive();
    },
    focus(): void {
      win.focus();
    },
    hide(): void {
      win.hide();
    },
    destroy(): void {
      win.destroy();
    },
    isDestroyed(): boolean {
      return win.isDestroyed();
    },
    send(channel: string, payload?: unknown): void {
      if (win.isDestroyed()) return;
      win.webContents.send(channel, payload);
    },
  };
}

export function createSidePinBrowserWindowFactory(
  options: SidePinBrowserWindowOptions,
): SidePinWindowFactory {
  return {
    create(bounds: SidePinBounds): SidePinWindowLike {
      const win = new BrowserWindow({
        ...bounds,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        // 처음에는 감춰 두고 호스트가 showInactive로 띄운다.
        // 그러지 않으면 위치를 잡기 전에 잠깐 엉뚱한 자리에 번쩍인다.
        show: false,
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });

      // 일반 창 위에는 있되 전체 화면 앱까지 덮지는 않는다.
      win.setAlwaysOnTop(true, 'normal');

      const query = `mode=${SIDE_PIN_RENDERER_MODE}`;
      if (options.devServerUrl !== undefined && options.devServerUrl !== '') {
        void win.loadURL(`${options.devServerUrl}?${query}`);
      } else {
        void win.loadFile(options.indexHtmlPath, { search: query });
      }

      return adapt(win);
    },
  };
}

/** 빌드된 renderer의 index.html 경로 (main.ts의 기존 계산과 같은 규칙) */
export function resolveSidePinIndexHtml(appRoot: string): string {
  return path.join(appRoot, 'dist', 'index.html');
}
