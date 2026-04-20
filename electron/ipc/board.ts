/**
 * 협업 보드 IPC 핸들러
 *
 * 기존 5개 라이브 도구(liveVote/liveSurvey/liveWordCloud/liveDiscussion/liveMultiSurvey)와
 * 동일한 `registerXxxHandlers(mainWindow)` 패턴 + `collab-board:kebab-case` 네이밍.
 *
 * Design §4.1 14개 IPC 채널:
 *   collab-board:list / :create / :rename / :delete
 *   collab-board:start-session / :end-session / :get-active-session / :save-snapshot
 *   collab-board:tunnel-available / :tunnel-install
 *   (M→R) :participant-change / :auto-save / :session-error / :session-started
 *
 * Design §3.2-bis before-quit 동기 저장 경로는 `endActiveBoardSessionSync` export로 제공.
 */
import { app, BrowserWindow, ipcMain } from 'electron';

import {
  ManageBoard,
  StartBoardSession,
  EndBoardSession,
  SaveBoardSnapshot,
  type ActiveBoardSessionRuntime,
  type BoardSessionStartResult,
} from '../../src/usecases/board';
import {
  AUTO_SAVE_INTERVAL_MS,
  BoardFilePersistence,
  BoardTunnelCoordinator,
  FileBoardRepository,
  YDocBoardServer,
  generateBoardHTML,
} from '../../src/infrastructure/board';
import type { BoardId } from '../../src/domain/valueObjects/BoardId';
import type { Board } from '../../src/domain/entities/Board';
import type { IBoardRepository } from '../../src/domain/repositories/IBoardRepository';
import type { IBoardServerPort } from '../../src/domain/ports/IBoardServerPort';
import type { IBoardTunnelPort } from '../../src/domain/ports/IBoardTunnelPort';
import { TunnelBusyError } from '../../src/domain/ports/IBoardTunnelPort';

import { isTunnelAvailable, installTunnel, openTunnel, closeTunnel } from './tunnel';

/** tunnel.ts → TunnelDriver 어댑터 (BoardTunnelCoordinator에 주입) */
const tunnelDriver = {
  openTunnel: (localPort: number): Promise<string> => openTunnel(localPort),
  closeTunnel: (): void => closeTunnel(),
  /**
   * cloudflared Tunnel 객체의 exit 이벤트 구독은 tunnel.ts 수정이 필요하나
   * 환경 제약으로 현재 미구현. no-op 반환.
   * Phase 2에서 tunnel.ts에 `onActiveTunnelExit(cb)` 추가 후 여기서 연결.
   * (Design §12 Q6 신설 예정)
   */
  subscribeExit: (_cb: (code: number | null) => void): (() => void) => {
    return () => { /* no-op */ };
  },
};

/** 활성 세션 1개 (터널 상호 배타 보장으로 동시 1개 보드만 실행) */
let activeRuntime: ActiveBoardSessionRuntime | null = null;

/** 모듈 전역 싱글턴 (registerBoardHandlers가 app ready 후 1회 초기화) */
let persistence: BoardFilePersistence | null = null;
let repo: IBoardRepository | null = null;
let serverPort: IBoardServerPort | null = null;
let tunnelPort: IBoardTunnelPort | null = null;

export function registerBoardHandlers(mainWindow: BrowserWindow): void {
  // idempotent 초기화 (main.ts에서 한 번만 호출되지만 방어적)
  if (!repo) {
    persistence = new BoardFilePersistence(app.getPath('userData'));
    repo = new FileBoardRepository(persistence);
    serverPort = new YDocBoardServer((ctx) => generateBoardHTML(ctx));
    tunnelPort = new BoardTunnelCoordinator(tunnelDriver);
  }

  const manage = new ManageBoard(repo);
  const start = new StartBoardSession(repo, serverPort, tunnelPort, AUTO_SAVE_INTERVAL_MS);
  const end = new EndBoardSession(repo, serverPort, tunnelPort);
  const saveSnapshot = new SaveBoardSnapshot(repo);

  const sendEvent = <T>(channel: string, payload: T): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  // === R→M: 목록 CRUD ===

  ipcMain.handle('collab-board:list', async (): Promise<Board[]> => {
    return manage.listAll();
  });

  ipcMain.handle('collab-board:create', async (_e, args: { name?: string }): Promise<Board> => {
    return manage.create(args.name);
  });

  ipcMain.handle(
    'collab-board:rename',
    async (_e, args: { id: BoardId; name: string }): Promise<Board> => {
      return manage.rename(args.id, args.name);
    },
  );

  ipcMain.handle('collab-board:delete', async (_e, args: { id: BoardId }): Promise<{ ok: true }> => {
    // 활성 세션 보드는 먼저 종료해야 삭제 가능
    if (activeRuntime && activeRuntime.result.boardId === args.id) {
      throw new Error('BOARD_SESSION_ALREADY_RUNNING');
    }
    await manage.delete(args.id);
    return { ok: true };
  });

  // === R→M: 세션 기동·종료·조회·저장 ===

  ipcMain.handle(
    'collab-board:start-session',
    async (_e, args: { id: BoardId }): Promise<BoardSessionStartResult> => {
      if (activeRuntime) {
        throw new Error('BOARD_SESSION_ALREADY_RUNNING');
      }
      try {
        const { result, runtime } = await start.execute(args.id, {
          onParticipantsChange: (boardId, names) =>
            sendEvent('collab-board:participant-change', { boardId, names }),
          onAutoSave: (boardId, savedAt) =>
            sendEvent('collab-board:auto-save', { boardId, savedAt }),
          onSessionError: (boardId, reason) =>
            sendEvent('collab-board:session-error', { boardId, reason }),
        });
        activeRuntime = runtime;
        sendEvent('collab-board:session-started', result);
        return result;
      } catch (err) {
        if (err instanceof TunnelBusyError) {
          throw new Error(`BOARD_TUNNEL_BUSY:${err.existing}`);
        }
        throw err;
      }
    },
  );

  ipcMain.handle(
    'collab-board:end-session',
    async (
      _e,
      args: { id: BoardId; forceSave: boolean },
    ): Promise<{ ok: true }> => {
      if (!activeRuntime || activeRuntime.result.boardId !== args.id) {
        return { ok: true }; // idempotent
      }
      await end.execute(args.id, activeRuntime, { forceSave: args.forceSave });
      activeRuntime = null;
      return { ok: true };
    },
  );

  ipcMain.handle(
    'collab-board:get-active-session',
    async (): Promise<BoardSessionStartResult | null> => {
      return activeRuntime?.result ?? null;
    },
  );

  ipcMain.handle(
    'collab-board:save-snapshot',
    async (_e, args: { id: BoardId }): Promise<{ savedAt: number }> => {
      if (!activeRuntime || activeRuntime.result.boardId !== args.id) {
        throw new Error('BOARD_NOT_FOUND');
      }
      return saveSnapshot.execute(args.id, activeRuntime.handle);
    },
  );

  // === R→M: 터널 가용성 / 설치 (기존 5개 도구와 동일 패턴) ===

  ipcMain.handle('collab-board:tunnel-available', async (): Promise<{ available: boolean }> => {
    return { available: isTunnelAvailable() };
  });

  ipcMain.handle('collab-board:tunnel-install', async (): Promise<{ ok: true }> => {
    await installTunnel();
    return { ok: true };
  });
}

/**
 * before-quit 동기 저장 경로 — Design §3.2-bis.
 *
 * `app.on('before-quit')`는 async await을 기다리지 않으므로 이 경로는 반드시 sync.
 * 활성 세션이 있으면 최종 encodeState를 BoardFilePersistence.saveSnapshotSync로 저장 후
 * timer 정리. 서버·터널 종료는 비동기 시작 + deadline 이후 app.exit.
 *
 * 호출 측(electron/main.ts): `app.on('before-quit', (event) => { endActiveBoardSessionSync(event); ... })`
 */
export function endActiveBoardSessionSync(): void {
  if (!activeRuntime) return;

  // 1. 타이머 해제 (동기)
  if (activeRuntime.autoSaveTimer) {
    clearInterval(activeRuntime.autoSaveTimer);
    activeRuntime.autoSaveTimer = null;
  }
  activeRuntime.unsubscribeTunnelExit?.();
  activeRuntime.unsubscribeTunnelExit = null;

  // 2. 동기 저장 — BoardFilePersistence.saveSnapshotSync 직접 호출 (R-4 iter #1)
  //    fs.writeFileSync 경로이므로 이벤트 루프 통과 없이 완결. Design §3.2-bis 만족.
  try {
    const update = activeRuntime.handle.encodeState();
    if (persistence) {
      persistence.saveSnapshotSync(activeRuntime.result.boardId, update);
    }
  } catch {
    // swallow — before-quit 블록
  }

  // 3. 서버·터널 정리 (비동기 시작, 2초 deadline)
  const bid = activeRuntime.result.boardId;
  if (serverPort && tunnelPort) {
    void Promise.race([
      Promise.all([serverPort.stop(bid), Promise.resolve(tunnelPort.release('board'))]),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  }

  activeRuntime = null;
}

/** 테스트·디버그용 */
export function getActiveBoardSession(): BoardSessionStartResult | null {
  return activeRuntime?.result ?? null;
}
