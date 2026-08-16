import { BrowserWindow } from 'electron';
import path from 'path';
import type { SidePinBounds } from '../src/usecases/sidePin/SidePinWindowHost';
import type { SidePinWindowFactory, SidePinWindowLike, SidePinWindowRole } from './sidePinWindow';

export const SIDE_PIN_RENDERER_MODE = 'sidePin';
export const SIDE_PIN_SURFACE_QUERY = 'surface';

export interface SidePinBrowserWindowOptions {
  readonly preloadPath: string;
  readonly devServerUrl?: string | undefined;
  readonly indexHtmlPath: string;
}

interface RendererReadyGate {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createRendererReadyGate(win: BrowserWindow): RendererReadyGate {
  let markReady = (): void => {};
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let loadFallback: ReturnType<typeof setTimeout> | null = null;
    const timeout = setTimeout(() => finish(new Error('SIDE_PIN_READY_TIMEOUT')), 10_000);
    timeout.unref();
    const cleanup = (): void => {
      clearTimeout(timeout);
      if (loadFallback !== null) clearTimeout(loadFallback);
      win.removeListener('closed', onClosed);
      win.webContents.removeListener('did-finish-load', onLoadFinished);
      win.webContents.removeListener('did-fail-load', onLoadFailed);
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error === undefined) resolve();
      else reject(error);
    };
    const onClosed = (): void => finish(new Error('SIDE_PIN_CLOSED_BEFORE_READY'));
    const waitForReactCommit = async (): Promise<void> => {
      if (settled || win.isDestroyed()) return;
      try {
        const committed = await win.webContents.executeJavaScript(
          "document.getElementById('splash') === null",
          true,
        );
        if (committed === true) {
          finish();
          return;
        }
      } catch {
        // 로드 중 실행 실패는 다음 확인에서 다시 본다. 전체 제한 시간은 위 timeout이 맡는다.
      }
      loadFallback = setTimeout(() => void waitForReactCommit(), 50);
    };
    const onLoadFinished = (): void => {
      // IPC가 유실돼도 복구하되, 공용 스플래시가 React로 교체된 뒤에만 창을 보여준다.
      loadFallback = setTimeout(() => void waitForReactCommit(), 50);
    };
    const onLoadFailed = (
      _event: Electron.Event,
      errorCode: number,
      _description: string,
      _url: string,
      isMainFrame: boolean,
    ): void => {
      if (isMainFrame && errorCode !== -3) finish(new Error('SIDE_PIN_LOAD_FAILED'));
    };
    markReady = (): void => finish();
    win.once('closed', onClosed);
    win.webContents.once('did-finish-load', onLoadFinished);
    win.webContents.once('did-fail-load', onLoadFailed);
  });
  return { promise, resolve: () => markReady() };
}

function adapt(
  win: BrowserWindow,
  ready: Promise<void>,
  initialBounds: SidePinBounds,
): SidePinWindowLike {
  let requestedBounds = initialBounds;
  let clickThrough = false;
  const applyFixedBounds = (): void => {
    // Windows가 표시 과정에서 바꾼 현재 크기는 다시 입력으로 쓰지 않고 원래 사각형을 복원한다.
    win.setBounds(requestedBounds, false);
  };
  return {
    setPosition(bounds: SidePinBounds): void {
      requestedBounds = bounds;
      applyFixedBounds();
    },
    setClickThrough(enabled: boolean): void {
      if (clickThrough === enabled || win.isDestroyed()) return;
      clickThrough = enabled;
      win.setIgnoreMouseEvents(enabled, { forward: enabled });
    },
    async showInactive(): Promise<void> {
      await ready;
      if (win.isDestroyed()) throw new Error('SIDE_PIN_DESTROYED_BEFORE_SHOW');
      applyFixedBounds();
      win.showInactive();
      applyFixedBounds();
    },
    async focus(): Promise<void> {
      await ready;
      if (win.isDestroyed()) throw new Error('SIDE_PIN_DESTROYED_BEFORE_SHOW');
      applyFixedBounds();
      win.show();
      applyFixedBounds();
      win.focus();
    },
    hide(): void {
      if (!win.isDestroyed()) win.hide();
    },
    destroy(): void {
      if (!win.isDestroyed()) win.destroy();
    },
    isDestroyed(): boolean {
      return win.isDestroyed();
    },
    send(channel: string, payload?: unknown): void {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    },
  };
}

export interface SidePinBrowserWindowFactoryHandle {
  readonly factory: SidePinWindowFactory;
  getWindows(): BrowserWindow[];
  getWindow(role: SidePinWindowRole): BrowserWindow | null;
  setClickThrough(role: SidePinWindowRole, enabled: boolean): void;
  markRendererReady(webContentsId: number): boolean;
}

/**
 * 손잡이와 패널을 별도의 투명 창으로 만든다.
 * 두 창은 생성 이후 열기/닫기 때문에 크기가 바뀌지 않는다.
 */
export function createSidePinBrowserWindowFactory(
  options: SidePinBrowserWindowOptions,
): SidePinBrowserWindowFactoryHandle {
  const live = new Set<{
    readonly role: SidePinWindowRole;
    readonly window: BrowserWindow;
    readonly adapter: SidePinWindowLike;
    readonly readyGate: RendererReadyGate;
  }>();

  const factory: SidePinWindowFactory = {
    create(role: SidePinWindowRole, bounds: SidePinBounds): SidePinWindowLike {
      const win = new BrowserWindow({
        ...bounds,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        ...(process.platform === 'win32'
          ? {
              thickFrame: false,
              roundedCorners: false,
            }
          : {}),
        show: false,
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      });

      const readyGate = createRendererReadyGate(win);
      void readyGate.promise.catch(() => {
        if (!win.isDestroyed()) win.destroy();
      });
      win.setAlwaysOnTop(true, 'normal');

      const query = `mode=${SIDE_PIN_RENDERER_MODE}&${SIDE_PIN_SURFACE_QUERY}=${role}`;
      if (options.devServerUrl !== undefined && options.devServerUrl !== '') {
        const base = options.devServerUrl.endsWith('/')
          ? options.devServerUrl
          : `${options.devServerUrl}/`;
        const sidePinUrl = new URL('sidepin.html', base);
        sidePinUrl.search = query;
        void win.loadURL(sidePinUrl.toString());
      } else {
        void win.loadFile(options.indexHtmlPath, { search: query });
      }

      const adapter = adapt(win, readyGate.promise, bounds);
      const entry = { role, window: win, adapter, readyGate } as const;
      live.add(entry);
      win.on('closed', () => {
        live.delete(entry);
      });

      return adapter;
    },
  };

  return {
    factory,
    getWindows: () =>
      [...live].map((entry) => entry.window).filter((window) => !window.isDestroyed()),
    getWindow: (role) => {
      const candidates = [...live].filter(
        (entry) => entry.role === role && !entry.window.isDestroyed(),
      );
      return candidates.at(-1)?.window ?? null;
    },
    setClickThrough: (role, enabled) => {
      const candidates = [...live].filter(
        (entry) => entry.role === role && !entry.window.isDestroyed(),
      );
      candidates.at(-1)?.adapter.setClickThrough?.(enabled);
    },
    markRendererReady: (webContentsId) => {
      const entry = [...live].find(
        (candidate) => candidate.window.webContents.id === webContentsId,
      );
      if (entry === undefined) return false;
      entry.readyGate.resolve();
      return true;
    },
  };
}

export function resolveSidePinIndexHtml(appRoot: string): string {
  return path.join(appRoot, 'dist', 'sidepin.html');
}
