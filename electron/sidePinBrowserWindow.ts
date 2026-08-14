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
import { anchorRightEdge } from './sidePinGeometry';

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

/**
 * 요청한 크기대로 놓이지 않으면 **오른쪽 끝을 기준으로 다시 맞춘다.**
 *
 * Windows는 창의 최소 폭을 **물리 52픽셀**로 강제한다(실측: 배율 175%에서 30 DIP,
 * 100%에서 52 DIP — 물리로는 둘 다 52). 무엇을 요청하든 그 아래로 내려가지 않으므로,
 * 16 DIP짜리 손잡이 창은 이 OS에서 만들 수 없다.
 *
 * 문제는 손잡이를 화면 오른쪽 끝에 붙인다는 점이다. 창이 요청보다 넓어지면 왼쪽이 아니라
 * **오른쪽으로 넘쳐** 옆 모니터 화면을 침범한다(실기기에서 실제로 발생: 주 175% +
 * 보조 100%, 경계 x=1646에서 25 물리픽셀이 보조 모니터 왼쪽에 나타남).
 *
 * 그래서 커진 만큼 왼쪽으로 밀어 오른쪽 끝을 원래 자리에 고정한다. OS가 최소 크기를
 * 어떻게 정하든, 다른 화면을 침범하지 않는다는 것만은 지켜진다.
 */
function applyBoundsKeepingRightEdge(win: BrowserWindow, requested: SidePinBounds): void {
  const actual = win.getBounds();
  if (actual.width === requested.width && actual.height === requested.height) return;

  win.setBounds(anchorRightEdge(requested, actual));
}

/** BrowserWindow를 호스트가 요구하는 최소 능력으로 감싼다 */
function adapt(win: BrowserWindow): SidePinWindowLike {
  return {
    setBounds(bounds: SidePinBounds): void {
      win.setBounds(bounds);
      applyBoundsKeepingRightEdge(win, bounds);
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

/**
 * 팩토리 + 방금 만든 창 꺼내기.
 *
 * 호스트는 창을 `SidePinWindowLike`로만 다루지만, `main.ts`는 진짜 `BrowserWindow`가
 * 필요하다 — 데이터 변경 브로드캐스트 대상 목록에 넣어야 하기 때문이다.
 */
export interface SidePinBrowserWindowFactoryHandle {
  readonly factory: SidePinWindowFactory;
  /** 살아 있는 옆핀 창. 없으면 null */
  getWindow(): BrowserWindow | null;
}

export function createSidePinBrowserWindowFactory(
  options: SidePinBrowserWindowOptions,
): SidePinBrowserWindowFactoryHandle {
  let live: BrowserWindow | null = null;

  const factory: SidePinWindowFactory = {
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

      live = win;
      win.on('closed', () => {
        if (live === win) live = null;
      });

      return adapt(win);
    },
  };

  return {
    factory,
    getWindow: () => (live !== null && !live.isDestroyed() ? live : null),
  };
}

/** 빌드된 renderer의 index.html 경로 (main.ts의 기존 계산과 같은 규칙) */
export function resolveSidePinIndexHtml(appRoot: string): string {
  return path.join(appRoot, 'dist', 'index.html');
}
