import { randomUUID } from 'node:crypto';
import { BrowserWindow, ipcMain } from 'electron';
import type { PopupToolId, ToolPopupWindowSpec } from '../../src/domain/entities/ToolPopup';
import { installNavigationGuard } from '../security-guards';
import type { ToolPopupManager, ToolPopupWindowLike } from '../toolPopupWindows';
import { createToolPopupManager } from '../toolPopupWindows';

/** 본문 창이 "받았다"고 답할 때까지 다시 보내는 간격(ms). 새로 만든 창은 화면이 늦게 뜬다. */
const RETURN_RESEND_INTERVAL_MS = 1_000;
/** "받았다"를 기다리는 한도(ms). 넘으면 팝업을 닫지 않는다. */
const RETURN_ACK_TIMEOUT_MS = 20_000;
/** 선생님이 안내 창에서 고르기를 기다리는 한도(ms). */
const RETURN_DECISION_TIMEOUT_MS = 10 * 60 * 1000;

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
  /**
   * 본문 창을 보이게 하고(없으면 다시 만들고) 돌려준다. 메모리 절약 모드로 본문 창이
   * 파괴된 채 팝업에서 [본문으로 가져오기]를 누른 경우에 쓴다(ADR-139). 없으면 null.
   */
  ensureMainWindow?(): Promise<BrowserWindow | null>;
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

  // 본문으로 가져오기는 **왕복**이다(ADR-139). 본문에서 타이머가 진행 중이면 선생님께 묻고,
  // [취소]면 팝업을 닫지 않는다. 그래서 본문의 답을 받은 뒤에야 팝업을 닫는다.
  //   1) 본문 창에 보낸다. 새로 만든 창은 화면이 늦게 뜨므로 "받았다" 답이 올 때까지 다시 보낸다.
  //   2) "받았다"가 오면 선생님이 고를 때까지 기다린다.
  //   3) 받아들이면 팝업을 닫고 true. 아니면(취소·시간 초과·본문 창 없음) false — 팝업이 되살린다.
  const pendingReturns = new Map<
    string,
    { acknowledged: boolean; resolveAck: () => void; resolveDecision: (accepted: boolean) => void }
  >();

  ipcMain.handle('toolPopup:returnAck', (event, requestId: unknown) => {
    if (!trusted(event) || typeof requestId !== 'string') return false;
    const pending = pendingReturns.get(requestId);
    if (pending === undefined) return false;
    pending.acknowledged = true;
    pending.resolveAck();
    return true;
  });

  ipcMain.handle('toolPopup:returnDecision', (event, requestId: unknown, accepted: unknown) => {
    if (!trusted(event) || typeof requestId !== 'string') return false;
    const pending = pendingReturns.get(requestId);
    if (pending === undefined) return false;
    pendingReturns.delete(requestId);
    pending.resolveDecision(accepted === true);
    return true;
  });

  ipcMain.handle(
    'toolPopup:returnToMain',
    async (event, snapshot: unknown, capturedAt: unknown): Promise<boolean> => {
      if (!trusted(event)) return false;
      // ★도구 id 는 인자가 아니라 발신 창에서 역조회한다. 팝업이 남의 도구를 되돌릴 수 없다.
      const toolId = manager.resolveToolIdByWebContents(event.sender.id);
      if (toolId === null) return false;
      let main = deps.getMainWindow();
      if ((main === null || main.isDestroyed()) && deps.ensureMainWindow) {
        main = await deps.ensureMainWindow();
      }
      // 넘길 본문 창이 없으면 팝업을 닫지 않는다 — 닫으면 상태가 사라진다.
      if (main === null || main.isDestroyed()) return false;
      if (main.isMinimized()) main.restore();
      main.show();
      main.focus();

      const requestId = randomUUID();
      let resolveAck: () => void = () => undefined;
      let resolveDecision: (accepted: boolean) => void = () => undefined;
      const acked = new Promise<void>((resolve) => {
        resolveAck = resolve;
      });
      const decided = new Promise<boolean>((resolve) => {
        resolveDecision = resolve;
      });
      pendingReturns.set(requestId, { acknowledged: false, resolveAck, resolveDecision });

      const payload = {
        toolId,
        snapshot: snapshot ?? null,
        capturedAt:
          typeof capturedAt === 'number' && Number.isFinite(capturedAt) ? capturedAt : Date.now(),
        requestId,
      };
      const target = main;
      const send = (): void => {
        if (!target.isDestroyed()) target.webContents.send('toolPopup:returned', payload);
      };
      send();
      const resend = setInterval(send, RETURN_RESEND_INTERVAL_MS);
      const ackTimedOut = await Promise.race([
        acked.then(() => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(true), RETURN_ACK_TIMEOUT_MS)),
      ]);
      clearInterval(resend);
      if (ackTimedOut) {
        pendingReturns.delete(requestId);
        return false;
      }
      const closedWhileWaiting = new Promise<boolean>((resolve) => {
        target.once('closed', () => resolve(false));
      });
      const accepted = await Promise.race([
        decided,
        closedWhileWaiting,
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), RETURN_DECISION_TIMEOUT_MS),
        ),
      ]);
      pendingReturns.delete(requestId);
      if (!accepted) return false;
      manager.close(toolId);
      return true;
    },
  );

  return {
    manager,
    getBrowserWindows: () => [...liveWindows].filter((win) => !win.isDestroyed()),
  };
}
