/**
 * AI 브릿지 등록 IPC — 쌤핀 데이터를 외부 AI(Claude/Codex/Antigravity)에 "원클릭"으로 연결한다.
 *
 * 핵심(A안): 사용자 PC 에 Node.js 가 없어도 동작하도록, 쌤핀 실행파일을 ELECTRON_RUN_AS_NODE 로
 * 노드 런타임 삼아 동봉된 브릿지 서버(resources/ai-bridge/index.mjs)를 stdio MCP 로 띄운다.
 *
 * 3 클라이언트 동등 지원(메커니즘만 상이):
 *  - claude/antigravity: 설정 JSON 의 mcpServers 안전 병합(기존 서버 보존 + 백업)
 *  - codex: `codex mcp add`(미설치 시 명령 안내)
 *
 * 순수 등록 로직은 aiBridgeCore.ts(단위 테스트) 에 있고, 여기서는 electron 경로만 주입한다.
 */
import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildEntry,
  clientConfigPath,
  fileClientStatus,
  registerCodex,
  registerFileClient,
  safeErrorMessage,
  type AiBridgeClient,
  type AiBridgeRegisterOptions,
  type AiBridgeStatus,
} from './aiBridgeCore';

const ALL_CLIENTS: readonly AiBridgeClient[] = ['claude', 'codex', 'antigravity'];

/** 동봉된 브릿지 MCP 서버(index.mjs) 절대경로. 패키징=resources/, 개발=레포 electron/ai-bridge/. */
function bridgeServerPath(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'ai-bridge')
    : path.join(app.getAppPath(), 'electron', 'ai-bridge');
  return path.join(dir, 'index.mjs');
}

/** 쌤핀 데이터 디렉토리 — getDataDir()(main.ts)와 동일하게 userData/data. */
function ssampinDataDir(): string {
  return path.join(app.getPath('userData'), 'data');
}

function entryCtx() {
  return { exePath: app.getPath('exe'), serverPath: bridgeServerPath(), dataDir: ssampinDataDir() };
}

export interface AiBridgeRegisterResult {
  readonly ok: boolean;
  readonly client: AiBridgeClient;
  readonly registered: boolean;
  readonly cliMissing?: boolean;
  /** codex CLI 미설치 시에만 — 사용자가 직접 실행할 명령(설정·백업 경로는 렌더러로 반환하지 않음). */
  readonly command?: string;
  readonly error?: string;
}

function doRegister(client: AiBridgeClient, opts: AiBridgeRegisterOptions): AiBridgeRegisterResult {
  const entry = buildEntry(entryCtx(), opts);
  if (client === 'codex') {
    const r = registerCodex(entry);
    // command 는 codex 미설치(직접 실행 안내)일 때만 노출 — 그 외엔 로컬 경로를 렌더러로 보내지 않는다.
    return r.cliMissing
      ? { ok: true, client, registered: r.registered, cliMissing: true, command: r.command }
      : { ok: true, client, registered: r.registered, cliMissing: false };
  }
  // 설정/백업 경로는 OS 사용자명 등 로컬 정보를 담을 수 있어 렌더러로 반환하지 않는다(성공 여부만).
  registerFileClient(clientConfigPath(client), entry);
  return { ok: true, client, registered: true };
}

function getStatus(client: AiBridgeClient): AiBridgeStatus {
  if (client === 'codex') return { client, registered: null };
  try {
    return { client, registered: fileClientStatus(client, clientConfigPath(client)) };
  } catch {
    return { client, registered: false };
  }
}

export function registerAiBridgeHandlers(): void {
  ipcMain.handle(
    'aiBridge:register',
    (_e, client: AiBridgeClient, opts?: AiBridgeRegisterOptions): AiBridgeRegisterResult => {
      if (!ALL_CLIENTS.includes(client))
        return { ok: false, client, registered: false, error: '알 수 없는 클라이언트' };
      try {
        return doRegister(client, opts ?? {});
      } catch (err) {
        // 상세(경로 포함 가능)는 메인 콘솔에만. 렌더러로는 경로 없는 일반 메시지만 반환.
        console.error('[aiBridge] register 실패:', err);
        return { ok: false, client, registered: false, error: safeErrorMessage(err) };
      }
    },
  );

  ipcMain.handle('aiBridge:status', (_e, client: AiBridgeClient): AiBridgeStatus => {
    if (!ALL_CLIENTS.includes(client)) return { client, registered: false };
    return getStatus(client);
  });

  ipcMain.handle('aiBridge:statusAll', (): AiBridgeStatus[] => ALL_CLIENTS.map(getStatus));

  // 동봉 서버 존재 여부만 노출(로컬 절대경로는 렌더러로 반환하지 않음).
  ipcMain.handle('aiBridge:paths', (): { serverExists: boolean } => ({
    serverExists: fs.existsSync(bridgeServerPath()),
  }));
}
