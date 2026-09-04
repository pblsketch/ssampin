/**
 * "내 AI로 실행" — IPC 배선(main).
 *
 * 화면 ↔ 러너 사이의 통로만 놓는다. 판단은 전부 순수 모듈(`ownAiCli`·`ownAiRunner`·domain)에 있다.
 *
 * ★쌤핀은 토큰을 만지지 않는다 — 로그인은 CLI 자체 명령(`claude auth login` / `codex login`)을
 *   자식 프로세스로 띄우기만 하고, 결과는 종료 코드로만 읽는다. 화면에 입력란을 만들지 않는다.
 *
 * ★쓰기 허용은 **설정 토글(capability 파일)** 이 정한다. 실행 env 에
 *   `SSAMPIN_BRIDGE_ALLOW_WRITE` 를 넣지 않는다.
 */
import { app, ipcMain, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getContentRoot } from '../dataRoot';
import { buildEntry } from './aiBridgeCore';
import {
  defaultCliDeps,
  inspectConnection,
  loginArgs,
  logoutArgs,
  resolveCliPath,
  readVersion,
  type OwnAiCliDeps,
} from './ownAiCli';
import {
  createOwnAiRunner,
  defaultKillTreeSync,
  type OwnAiRunner,
  type OwnAiRunRequest,
} from './ownAiRunner';
import {
  OWN_AI_INSTALL_COMMANDS,
  OWN_AI_PROVIDERS,
  type OwnAiConnection,
  type OwnAiProviderId,
  type OwnAiRunEvent,
} from '../../src/domain/entities/OwnAiProvider';
import { OWN_AI_MCP_SERVER_NAME } from '../../src/domain/rules/ownAiCliRules';
import type { LiveSyncReadiness } from './aiBridgeLiveSyncHost';

/** 로그인 창을 무한정 열어 두지 않는다 — 브라우저 왕복에 넉넉한 5분. */
const LOGIN_TIMEOUT_MS = 5 * 60_000;

function bridgeServerPath(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'ai-bridge')
    : path.join(app.getAppPath(), 'electron', 'ai-bridge');
  return path.join(dir, 'index.mjs');
}

function ssampinDataDir(): string {
  return path.join(getContentRoot(), 'data');
}

/**
 * CLI 를 띄울 **빈 작업 폴더**.
 *
 * ★비어 있어야 한다 — `claude -p` 는 작업 폴더의 `.mcp.json`·`CLAUDE.md` 를 읽는다.
 * (`--restricted` 가 사용자·프로젝트 설정을 막아 주지만, 폴더까지 비워 두는 게 확실하다.)
 */
function runCwd(): string {
  const dir = path.join(app.getPath('userData'), 'own-ai', 'cwd');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** claude 에 넘길 MCP 설정 파일. 매 실행마다 새로 쓴다(경로가 바뀔 수 있다). */
function writeMcpConfig(): string {
  const entry = buildEntry(
    { exePath: app.getPath('exe'), serverPath: bridgeServerPath(), dataDir: ssampinDataDir() },
    // ★게이트 옵션을 넘기지 않는다 — 쓰기 허용은 설정 토글이 정한다.
    {},
  );
  const dir = path.join(app.getPath('userData'), 'own-ai');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'mcp-config.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ mcpServers: { [OWN_AI_MCP_SERVER_NAME]: entry } }, null, 2),
    'utf-8',
  );
  return file;
}

function bridgeEntryForCodex(): { command: string; args: string[]; env: Record<string, string> } {
  const e = buildEntry(
    { exePath: app.getPath('exe'), serverPath: bridgeServerPath(), dataDir: ssampinDataDir() },
    {},
  );
  return { command: e.command, args: [...e.args], env: { ...e.env } };
}

export interface OwnAiHandlerDeps {
  readonly getMainWindow: () => BrowserWindow | null;
  /** live-sync 호스트의 준비 확인. 쓰기가 필요한데 서버가 못 뜨면 실행하지 않는다. */
  readonly ensureLiveSyncServer: () => Promise<LiveSyncReadiness>;
}

let runner: OwnAiRunner | null = null;

/** 앱 종료·재시작 경로에서 **동기로** 부른다. 러너가 없으면 아무 일도 하지 않는다. */
export function cancelAllOwnAiRunsSync(): void {
  runner?.cancelAllSync();
}

/** 쓰기 게이트가 보는 활성값. 러너가 없으면 0(비활성). */
export function ownAiActiveUntil(): number {
  return runner?.ownAiActiveUntil() ?? 0;
}

export function registerOwnAiHandlers(deps: OwnAiHandlerDeps): void {
  const cliDeps: OwnAiCliDeps = defaultCliDeps();
  /** 공급자별 고른 모델. 렌더러가 정본을 들고 있고, 여기서는 실행에 쓸 값만 기억한다. */
  const models = new Map<OwnAiProviderId, string>();

  function emit(event: OwnAiRunEvent): void {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send('ownAi:event', event);
  }

  runner = createOwnAiRunner({
    cliPath: (p) => resolveCliPath(p, cliDeps),
    version: (p) => {
      const file = resolveCliPath(p, cliDeps);
      return file ? readVersion(file, cliDeps) : null;
    },
    cwd: runCwd(),
    emit,
    platform: process.platform,
    now: () => Date.now(),
    spawnChild: spawn,
    killTreeSync: (pid) => defaultKillTreeSync(pid),
  });

  ipcMain.handle('ownAi:status', (_e, provider: OwnAiProviderId): OwnAiConnection => {
    return inspectConnection(provider, models.get(provider) ?? '', cliDeps);
  });

  ipcMain.handle('ownAi:statusAll', (): OwnAiConnection[] =>
    OWN_AI_PROVIDERS.map((p) => inspectConnection(p, models.get(p) ?? '', cliDeps)),
  );

  ipcMain.handle('ownAi:setModel', (_e, provider: OwnAiProviderId, model: unknown): boolean => {
    models.set(provider, typeof model === 'string' ? model : '');
    return true;
  });

  /**
   * 설치 — 공식 명령을 **새 터미널에서** 실행한다.
   *
   * 쌤핀이 설치를 대신 해 주는 게 아니라, 선생님이 터미널을 찾아 열지 않아도 되게만 한다.
   * 명령 자체는 각 회사가 공개한 것 그대로다.
   */
  ipcMain.handle('ownAi:install', (_e, provider: OwnAiProviderId): boolean => {
    const cmd =
      process.platform === 'win32'
        ? OWN_AI_INSTALL_COMMANDS[provider].win32
        : OWN_AI_INSTALL_COMMANDS[provider].posix;
    try {
      if (process.platform === 'win32') {
        spawn('powershell.exe', ['-NoExit', '-NoProfile', '-Command', cmd], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else if (process.platform === 'darwin') {
        const script = `tell application "Terminal" to do script ${JSON.stringify(cmd)}`;
        spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('x-terminal-emulator', ['-e', cmd], { detached: true, stdio: 'ignore' }).unref();
      }
      return true;
    } catch {
      return false;
    }
  });

  /**
   * 로그인 — CLI 자체 명령을 자식 프로세스로 띄운다. 브라우저는 CLI 가 연다.
   * 쌤핀은 결과(종료 코드)만 본다. 토큰은 보지도, 저장하지도 않는다.
   */
  ipcMain.handle('ownAi:login', async (_e, provider: OwnAiProviderId): Promise<OwnAiConnection> => {
    const file = resolveCliPath(provider, cliDeps);
    if (file) {
      await new Promise<void>((resolve) => {
        const child = spawn(file, [...loginArgs(provider)], {
          // stdin 을 닫는다 — 두 CLI 모두 열려 있으면 기다린다(S0 실측).
          stdio: ['ignore', 'ignore', 'ignore'],
          windowsHide: false,
          cwd: os.homedir(),
        });
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, LOGIN_TIMEOUT_MS);
        child.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
        child.on('error', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    return inspectConnection(provider, models.get(provider) ?? '', cliDeps);
  });

  ipcMain.handle(
    'ownAi:logout',
    async (_e, provider: OwnAiProviderId): Promise<OwnAiConnection> => {
      const file = resolveCliPath(provider, cliDeps);
      if (file) {
        await new Promise<void>((resolve) => {
          const child = spawn(file, [...logoutArgs(provider)], {
            stdio: ['ignore', 'ignore', 'ignore'],
            windowsHide: true,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      }
      return inspectConnection(provider, models.get(provider) ?? '', cliDeps);
    },
  );

  ipcMain.handle(
    'ownAi:run',
    async (
      _e,
      payload: {
        runId: string;
        provider: OwnAiProviderId;
        kind: 'panel' | 'draft';
        prompt: string;
        appendSystemPrompt?: string;
      },
    ): Promise<{ ok: boolean; reason?: string }> => {
      // ★패널은 쓰기가 열려 있을 수 있다. 그 상태에서 loopback 서버가 못 떴다면
      //   브릿지가 "앱이 없다"고 보고 파일을 직접 쓴다 — 그래서 **실행 자체를 하지 않는다**.
      if (payload.kind === 'panel') {
        const readiness = await deps.ensureLiveSyncServer();
        if (readiness.needsServer && !readiness.ready) {
          emit({ type: 'error', runId: payload.runId, kind: 'write-server-unavailable' });
          return { ok: false, reason: 'write-server-unavailable' };
        }
      }

      const model = models.get(payload.provider) ?? '';
      const req: OwnAiRunRequest = {
        runId: payload.runId,
        provider: payload.provider,
        kind: payload.kind,
        prompt: payload.prompt,
        ...(model ? { model } : {}),
        ...(payload.appendSystemPrompt ? { appendSystemPrompt: payload.appendSystemPrompt } : {}),
        ...(payload.kind === 'panel'
          ? payload.provider === 'claude'
            ? { mcpConfigPath: writeMcpConfig() }
            : { bridge: bridgeEntryForCodex() }
          : {}),
      };
      const r = runner?.start(req) ?? { ok: false };
      return r.ok ? { ok: true } : { ok: false, ...(r.kind ? { reason: r.kind } : {}) };
    },
  );

  ipcMain.on('ownAi:cancel', (_e, runId: unknown) => {
    if (typeof runId === 'string') runner?.cancel(runId);
  });
}
