/**
 * AI 브릿지 등록 — 순수 로직(electron 비의존, 단위 테스트 가능).
 * 브릿지 repo(packages/mcp/src/register.ts, Codex 적대적 검토 통과)의 안전장치를 이식.
 * electron 특화 경로(exe/서버/데이터 경로)는 호출자(aiBridge.ts)가 주입한다.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type AiBridgeClient = 'claude' | 'codex' | 'antigravity';

export interface AiBridgeRegisterOptions {
  readonly allowContent?: boolean;
  readonly allowWrite?: boolean;
}

export interface ServerEntry {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

const SERVER_NAME = 'ssampin';

/** ELECTRON_RUN_AS_NODE 방식 서버 엔트리. 게이트 env 는 옵션이 켜진 경우에만 포함(기본 OFF). */
export function buildEntry(
  ctx: { readonly exePath: string; readonly serverPath: string; readonly dataDir: string },
  opts: AiBridgeRegisterOptions,
): ServerEntry {
  const env: Record<string, string> = {
    ELECTRON_RUN_AS_NODE: '1',
    SSAMPIN_DATA_DIR: ctx.dataDir,
  };
  // IPC 페이로드는 런타임에 타입 보장이 없다 — 정확히 boolean true 일 때만 게이트를 켠다
  // (악의적/오타 렌더러가 "false"·{} 같은 truthy 값으로 게이트를 우회하는 것을 차단).
  if (opts.allowContent === true) env['SSAMPIN_BRIDGE_ALLOW_CONTENT'] = '1';
  if (opts.allowWrite === true) env['SSAMPIN_BRIDGE_ALLOW_WRITE'] = '1';
  return { command: ctx.exePath, args: [ctx.serverPath], env };
}

/** 파일 병합형 클라이언트의 설정 파일 경로(플랫폼 인식). */
export function clientConfigPath(
  client: 'claude' | 'antigravity',
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  if (client === 'antigravity') {
    return path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
  }
  if (platform === 'darwin') {
    return path.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  if (platform === 'win32') {
    const appData = env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
}

let writeCounter = 0;
function uniqueSuffix(): string {
  writeCounter += 1;
  return `${process.pid}-${writeCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface FileRegisterResult {
  readonly configPath: string;
  readonly created: boolean;
  readonly backupPath?: string;
}

/** 설정 JSON 의 mcpServers[ssampin] 안전 병합 — 기존 서버 보존 + 백업 + 손상/타입 방어. */
export function registerFileClient(configPath: string, entry: ServerEntry): FileRegisterResult {
  let effectivePath = path.resolve(configPath);
  try {
    if (fs.lstatSync(effectivePath).isSymbolicLink()) {
      effectivePath = fs.realpathSync.native(effectivePath);
    }
  } catch {
    /* 신규 생성 경로 */
  }

  let config: Record<string, unknown> = {};
  let created = true;
  let backupPath: string | undefined;

  if (fs.existsSync(effectivePath)) {
    const raw = fs.readFileSync(effectivePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw); // 손상 시 throw → 원본 미변경
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('설정 파일 최상위가 객체가 아님 — 안전 병합 불가(원본 미변경)');
    }
    config = parsed as Record<string, unknown>;
    created = false;
    backupPath = `${effectivePath}.bak-${uniqueSuffix()}`;
    fs.writeFileSync(backupPath, raw, 'utf-8');
  }

  const existing = config['mcpServers'];
  let servers: Record<string, unknown>;
  if (existing === undefined) {
    servers = {};
  } else if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
    servers = existing as Record<string, unknown>;
  } else {
    throw new Error('mcpServers 가 객체가 아님 — 안전 병합 불가(원본/백업 보존)');
  }
  servers[SERVER_NAME] = entry;
  config['mcpServers'] = servers;

  fs.mkdirSync(path.dirname(effectivePath), { recursive: true });
  const tmp = `${effectivePath}.${uniqueSuffix()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, effectivePath);

  return backupPath === undefined
    ? { configPath: effectivePath, created }
    : { configPath: effectivePath, created, backupPath };
}

const SHELL_SAFE = '._:/=\\@%+-';
export function shellQuote(s: string): string {
  const safe =
    s.length > 0 &&
    [...s].every((ch) => {
      const c = ch.charCodeAt(0);
      return (
        c > 0x7f ||
        (c >= 0x30 && c <= 0x39) ||
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        SHELL_SAFE.includes(ch)
      );
    });
  return safe ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}

export function codexAddArgs(entry: ServerEntry): string[] {
  const args = ['mcp', 'add', SERVER_NAME];
  for (const [k, v] of Object.entries(entry.env)) args.push('--env', `${k}=${v}`);
  args.push('--', entry.command, ...entry.args);
  return args;
}

export interface CodexResult {
  readonly registered: boolean;
  readonly cliMissing: boolean;
  readonly command: string;
}

export interface CodexRunResult {
  readonly status: number | null;
  readonly error?: Error & { code?: string };
}

/** codex CLI 로 등록(`codex mcp add`). 미설치(ENOENT)면 throw 없이 안내. runner 주입(테스트). */
export function registerCodex(
  entry: ServerEntry,
  runner: (argv: string[]) => CodexRunResult = (argv) => {
    const r = spawnSync('codex', argv, { encoding: 'utf-8' });
    const out: { status: number | null; error?: Error & { code?: string } } = { status: r.status };
    if (r.error) out.error = r.error as Error & { code?: string };
    return out;
  },
): CodexResult {
  const argv = codexAddArgs(entry);
  const command = ['codex', ...argv.map(shellQuote)].join(' ');
  const r = runner(argv);
  if (r.error && r.error.code === 'ENOENT') return { registered: false, cliMissing: true, command };
  if (r.error) throw new Error(`codex 실행 오류(${r.error.code ?? 'unknown'})`);
  if (r.status !== 0) throw new Error(`codex mcp add 실패(exit ${r.status ?? 'null'})`);
  return { registered: true, cliMissing: false, command };
}

/**
 * 렌더러로 반환할 안전한 에러 메시지 — 로컬 절대경로(OS 사용자명 등) 유출 차단.
 * - Node syscall 에러(코드 보유: ENOENT/EACCES/EPERM …)는 경로가 message 에 박히므로 일반 메시지로 치환.
 * - 그 외(도메인 에러·JSON 파싱)는 경로 구분자(/ 또는 \)가 없을 때만 원문 사용, 있으면 일반 메시지.
 */
export function safeErrorMessage(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : undefined;
  if (code === 'EACCES' || code === 'EPERM') return '설정 파일을 쓸 권한이 없습니다.';
  if (code === 'ENOENT') return '설정 경로를 찾을 수 없습니다.';
  if (code) return '설정 파일 처리 중 오류가 발생했습니다.'; // 기타 syscall 에러
  const msg = typeof e.message === 'string' ? e.message : '';
  if (msg && !/[\\/]/.test(msg) && msg.length <= 200) return msg; // 경로 없는 도메인 메시지만
  return '연결 중 오류가 발생했습니다.';
}

export interface AiBridgeStatus {
  readonly client: AiBridgeClient;
  /** true=등록됨, false=미등록, null=확인 불가(codex) */
  readonly registered: boolean | null;
}

/** 파일 클라이언트의 등록 여부 조회(codex 는 확인 불가 → null). */
export function fileClientStatus(client: 'claude' | 'antigravity', configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const servers = parsed['mcpServers'];
    return (
      !!servers &&
      typeof servers === 'object' &&
      !Array.isArray(servers) &&
      SERVER_NAME in (servers as Record<string, unknown>)
    );
  } catch {
    return false;
  }
}
