import { BrowserWindow, ipcMain } from 'electron';
import type { PopupToolId, ToolPopupWindowSpec } from '../../src/domain/entities/ToolPopup';
import { installNavigationGuard } from '../security-guards';
import type { ToolPopupManager, ToolPopupWindowLike } from '../toolPopupWindows';
import { createToolPopupManager } from '../toolPopupWindows';

/**
 * 쌤도구 팝업 IPC 배선.
 *
 * 창 생명주기 판단은 전부 `toolPopupWindows.ts`(Electron 을 거의 모르는 관리자)가 한다.
 * 이 파일은 진짜 `BrowserWindow` 를 만들어 주고 IPC 를 연결하는 얇은 껍데기다.
 *
 * 보안: (가) 도구 id 는 domain 허용목록으로 거르고 (나) 요청은 앱이 아는 창에서 온 것만 받는다.
 * 본문 복귀 요청의 도구 id 는 **인자를 믿지 않고** 발신 창에서 역조회한다.
 *
 * 설계: docs/02-design/features/tool-popup.design.md §4, §5
 */

export interface ToolPopupIpcDeps {
  readonly preloadPath: string;
  readonly indexHtmlPath: string;
  devServerUrl(): string | undefined;
  getMainWindow(): BrowserWindow | null;
  /** 앱이 아는 창(메인·위젯·아이콘·옆핀·팝업)인지. 모르는 발신자는 거절한다. */
  isTrustedSender(webContentsId: number): boolean;
  /** 열린 팝업 목록이 바뀌었음을 모든 창에 알린다. */
  broadcastChanged(openToolIds: readonly PopupToolId[]): void;
}

function adapt(win: BrowserWindow, deps: ToolPopupIpcDeps): ToolPopupWindowLike {
  return {
    webContentsId: win.webContents.id,
    loadPopup(query: string): void {
      const devServerUrl = deps.devServerUrl();
      if (devServerUrl !== undefined && devServerUrl !== '') {
        void win.loadURL(`${devServerUrl}?${query}`);
      } else {
        void win.loadFile(deps.indexHtmlPath, { search: query });
      }
    },
    show: () => {
      if (!win.isDestroyed()) win.show();
    },
    focus: () => {
      if (!win.isDestroyed()) win.focus();
    },
    restoreIfMinimized: () => {
      if (!win.isDestroyed() && win.isMinimized()) win.restore();
    },
    setAlwaysOnTop: (flag: boolean) => {
      if (!win.isDestroyed()) win.setAlwaysOnTop(flag);
    },
    destroy: () => {
      if (!win.isDestroyed()) win.destroy();
    },
    isDestroyed: () => win.isDestroyed(),
    onClosed: (handler: () => void) => {
      win.once('closed', handler);
    },
    onLoadFailed: (handler: (reason: string) => void) => {
      win.webContents.on('did-fail-load', (_event, errorCode, description, _url, isMainFrame) => {
        // -3(ABORTED)은 라우팅 중 흔히 나오는 정상 취소라 실패로 보지 않는다.
        if (isMainFrame && errorCode !== -3) handler(description);
      });
    },
  };
}

export interface ToolPopupIpcHandle {
  readonly manager: ToolPopupManager;
  /** 살아 있는 팝업 창들 — 앱 전체 브로드캐스트 대상에 넣기 위해. */
  getBrowserWindows(): BrowserWindow[];
}

export function registerToolPopupIpc(deps: ToolPopupIpcDeps): ToolPopupIpcHandle {
  const liveWindows = new Set<BrowserWindow>();

  const manager = createToolPopupManager({
    onChanged: (openToolIds) => deps.broadcastChanged(openToolIds),
    factory: {
      create(toolId: PopupToolId, spec: ToolPopupWindowSpec): ToolPopupWindowLike {
        const win = new BrowserWindow({
          width: spec.width,
          height: spec.height,
          minWidth: spec.minWidth,
          minHeight: spec.minHeight,
          show: false,
          title: '쌤도구',
          autoHideMenuBar: true,
          webPreferences: {
            preload: deps.preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            // 창이 가려져도 타이머가 느려지지 않게 한다.
            backgroundThrottling: false,
          },
        });
        installNavigationGuard(win);
        liveWindows.add(win);
        win.once('closed', () => liveWindows.delete(win));
        return adapt(win, deps);
      },
    },
  });

  const trusted = (event: Electron.IpcMainInvokeEvent): boolean =>
    deps.isTrustedSender(event.sender.id);

  ipcMain.handle(
    'toolPopup:open',
    async (event, toolId: unknown, snapshot: unknown, capturedAt: unknown) => {
      if (!trusted(event)) return { ok: false, reason: 'unavailable' };
      const at =
        typeof capturedAt === 'number' && Number.isFinite(capturedAt) ? capturedAt : Date.now();
      return manager.open(toolId, snapshot ?? null, at);
    },
  );

  ipcMain.handle('toolPopup:claimHandoff', (event, handoffId: unknown) => {
    if (!trusted(event)) return null;
    return manager.claimHandoff(handoffId, event.sender.id);
  });

  ipcMain.handle('toolPopup:ready', (event) => {
    if (!trusted(event)) return false;
    return manager.markReady(event.sender.id);
  });

  ipcMain.handle('toolPopup:focus', (event, toolId: unknown) => {
    if (!trusted(event)) return false;
    return manager.focus(toolId);
  });

  ipcMain.handle('toolPopup:close', (event, toolId: unknown) => {
    if (!trusted(event)) return false;
    // 팝업이 스스로 닫을 때는 인자 없이 부른다 — 자기 도구를 발신 창에서 역조회한다.
    const own = manager.resolveToolIdByWebContents(event.sender.id);
    return manager.close(toolId ?? own);
  });

  ipcMain.handle('toolPopup:setAlwaysOnTop', (event, toolId: unknown, flag: unknown) => {
    if (!trusted(event)) return false;
    const own = manager.resolveToolIdByWebContents(event.sender.id);
    return manager.setAlwaysOnTop(toolId ?? own, flag === true);
  });

  ipcMain.handle('toolPopup:list', (event) => {
    if (!trusted(event)) return [];
    return manager.listOpen();
  });

  ipcMain.handle('toolPopup:returnToMain', (event, snapshot: unknown, capturedAt: unknown) => {
    if (!trusted(event)) return false;
    // ★도구 id 는 인자가 아니라 발신 창에서 역조회한다. 팝업이 남의 도구를 되돌릴 수 없다.
    const toolId = manager.resolveToolIdByWebContents(event.sender.id);
    if (toolId === null) return false;
    const main = deps.getMainWindow();
    if (main !== null && !main.isDestroyed()) {
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();
      main.webContents.send('toolPopup:returned', {
        toolId,
        snapshot: snapshot ?? null,
        capturedAt:
          typeof capturedAt === 'number' && Number.isFinite(capturedAt) ? capturedAt : Date.now(),
      });
    }
    manager.close(toolId);
    return true;
  });

  return {
    manager,
    getBrowserWindows: () => [...liveWindows].filter((win) => !win.isDestroyed()),
  };
}
