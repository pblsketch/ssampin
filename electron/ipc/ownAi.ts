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
  resolveCliLaunch,
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
    launch: (p) => resolveCliLaunch(p, cliDeps),
    version: lastKnownVersion,
    cwd: runCwd(),
    emit,
    platform: process.platform,
    now: () => Date.now(),
    spawnChild: spawn,
    killTreeSync: (pid) => defaultKillTreeSync(pid),
  });

  /**
   * 방금 확인한 상태를 잠깐 들고 있는다.
   *
   * ★확인 한 번에 CLI 를 두 번 띄운다(버전·로그인). 그동안 앱 화면이 멈춘다.
   * 화면 여러 곳이 같은 순간에 물어보면 그만큼 곱해지므로, 짧은 시간 안의 재질문은
   * 방금 답을 그대로 준다. 5초는 "터미널에서 로그인하고 돌아오는 시간"보다 훨씬 짧아
   * 로그인 직후 상태가 늦게 반영될 걱정은 없다.
   */
  const CHECK_CACHE_MS = 5_000;
  const checked = new Map<OwnAiProviderId, { at: number; connection: OwnAiConnection }>();

  /** 같은 공급자를 동시에 두 번 묻지 않는다 — 첫 확인이 끝날 때까지 같은 약속을 돌려준다. */
  const inFlight = new Map<OwnAiProviderId, Promise<OwnAiConnection>>();

  async function connectionOf(provider: OwnAiProviderId, force = false): Promise<OwnAiConnection> {
    const hit = checked.get(provider);
    if (!force && hit && Date.now() - hit.at < CHECK_CACHE_MS) return hit.connection;
    const pending = inFlight.get(provider);
    if (pending) return pending;
    // Promise.resolve 로 감싼다 — 테스트 대역이 동기 값을 줘도 .then 이 있다.
    const p = Promise.resolve(inspectConnection(provider, models.get(provider) ?? '', cliDeps))
      .then((connection) => {
        checked.set(provider, { at: Date.now(), connection });
        return connection;
      })
      .finally(() => inFlight.delete(provider));
    inFlight.set(provider, p);
    return p;
  }

  /**
   * 마지막으로 확인한 버전. 실행 직전에 CLI 를 또 띄우지 않으려고 캐시에서 읽는다.
   *
   * ★없으면 `null` — `--permission-prompts` 만 안 붙을 뿐 실행은 된다. 예전에는 실행마다
   * `--version` 을 동기로 띄워 보내기 직전에 화면이 0.7~4초 멈췄다(실측).
   */
  function lastKnownVersion(provider: OwnAiProviderId): string | null {
    const c = checked.get(provider)?.connection;
    return c && 'version' in c ? c.version : null;
  }

  /** 로그인·로그아웃·모델 변경처럼 **방금 바뀐 것을 아는** 자리에서 부른다. */
  function forgetChecked(provider?: OwnAiProviderId): void {
    if (provider) checked.delete(provider);
    else checked.clear();
  }

  // 카드의 [다시 확인]은 방금 터미널에서 뭔가 했다는 뜻이라 캐시를 건너뛴다.
  ipcMain.handle('ownAi:status', (_e, provider: OwnAiProviderId): Promise<OwnAiConnection> => {
    return connectionOf(provider, true);
  });

  // 두 공급자를 **나란히** 묻는다 — 차례로 물으면 기다리는 시간이 더해진다.
  ipcMain.handle(
    'ownAi:statusAll',
    (): Promise<OwnAiConnection[]> => Promise.all(OWN_AI_PROVIDERS.map((p) => connectionOf(p))),
  );

  ipcMain.handle('ownAi:setModel', (_e, provider: OwnAiProviderId, model: unknown): boolean => {
    models.set(provider, typeof model === 'string' ? model : '');
    // 상태에 고른 모델이 들어 있다 — 캐시를 두면 뱃지가 옛 모델을 계속 보여 준다.
    forgetChecked(provider);
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
    const l = resolveCliLaunch(provider, cliDeps);
    if (l) {
      await new Promise<void>((resolve) => {
        const child = spawn(l.file, [...l.args, ...loginArgs(provider)], {
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
    forgetChecked(provider);
    return connectionOf(provider, true);
  });

  ipcMain.handle(
    'ownAi:logout',
    async (_e, provider: OwnAiProviderId): Promise<OwnAiConnection> => {
      const l = resolveCliLaunch(provider, cliDeps);
      if (l) {
        await new Promise<void>((resolve) => {
          const child = spawn(l.file, [...l.args, ...logoutArgs(provider)], {
            stdio: ['ignore', 'ignore', 'ignore'],
            windowsHide: true,
          });
          child.on('close', () => resolve());
          child.on('error', () => resolve());
        });
      }
      forgetChecked(provider);
      return connectionOf(provider, true);
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
