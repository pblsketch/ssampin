/**
 * "내 AI로 실행" — CLI 찾기·버전·로그인 상태(순수 로직, electron 비의존).
 *
 * 실행 경로 주입(spawnSync)을 받아 단위 테스트가 가능하게 둔다.
 * electron 특화(경로·창)는 호출자(`ownAiRunner.ts`·`ownAi.ts`)가 맡는다.
 * — `aiBridgeCore.ts` 가 쓰는 것과 같은 구조.
 *
 * ★S0 실측(2026-09-04)에서 나온 함정 두 가지:
 *
 * 1. **PATH 만 믿으면 못 찾는다.** 이 PC 에서 `claude.cmd` 가 `%APPDATA%\npm` 에 분명히
 *    있는데도 `where claude` 가 실패했다 — **레지스트리 사용자 PATH 에는 있지만 프로세스
 *    PATH 에는 없었다.** 그래서 PATH 와 함께 알려진 설치 폴더를 같이 훑는다.
 *
 * 2. **★`.cmd` 는 shell 없이 실행할 수 없다.** Node 20.12.2+ 는 CVE-2024-27980 대응으로
 *    `.cmd`/`.bat` 를 `shell:true` 없이 spawn 하면 **EINVAL** 을 던진다(이 PC 실측:
 *    Node 24.15 / Electron 43 = Node 24.18). npm 전역 설치는 정확히 `.cmd` 라, 그대로 두면
 *    오너 PC 에서 "아직 설치되지 않았어요"만 뜬다.
 *
 *    **`shell:true` 로 우회하면 안 된다** — 선생님이 친 질문이 argv 에 들어가므로
 *    `& | ^ %` 같은 cmd.exe 메타문자로 깨지거나 명령이 주입된다.
 *
 *    그래서 심(shim) 대신 **그 뒤의 실체**를 찾는다:
 *    - claude: `<npm>/node_modules/@anthropic-ai/claude-code/bin/claude.exe` — 진짜 실행 파일
 *    - codex:  `<npm>/node_modules/@openai/codex/bin/codex.js` — node 스크립트라
 *      `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 로 돌린다(브릿지와 같은 방식).
 */
import { spawnSync as nodeSpawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  parseCliVersion,
  isVersionSupported,
  supportedRangeLabel,
} from '../../src/domain/rules/ownAiCliRules';
import type { OwnAiConnection, OwnAiProviderId } from '../../src/domain/entities/OwnAiProvider';

/**
 * 경로 규칙은 **대상 플랫폼**을 따른다 — 실행 중인 호스트가 아니라.
 * 이렇게 두지 않으면 Windows 에서 mac 경로를 만들 때 구분자가 뒤섞여, 테스트에서만
 * 드러나는 게 아니라 크로스 플랫폼 판정 자체가 틀린다.
 */
function pathFor(platform: NodeJS.Platform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

export interface RunOutcome {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly errorCode?: string;
}

/** 주입 가능한 바깥 세계 — 테스트가 전부 갈아끼운다. */
export interface OwnAiCliDeps {
  readonly platform: NodeJS.Platform;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly isFile: (p: string) => boolean;
  /** node 스크립트를 돌릴 실행 파일. 앱에서는 electron 자신(`process.execPath`). */
  readonly nodePath: string;
  /** `asNode` 면 `ELECTRON_RUN_AS_NODE=1` 을 붙여 Electron 을 node 로 쓴다. */
  readonly run: (file: string, argv: readonly string[], asNode: boolean) => RunOutcome;
}

export function defaultCliDeps(): OwnAiCliDeps {
  return {
    platform: process.platform,
    env: process.env,
    home: os.homedir(),
    nodePath: process.execPath,
    isFile: (p) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
    run: (file, argv, asNode) => {
      const r = nodeSpawnSync(file, [...argv], {
        encoding: 'utf-8',
        windowsHide: true,
        // Electron 을 node 로 쓸 때만 켠다 — 앱 창이 뜨지 않게.
        ...(asNode ? { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } } : {}),
      });
      const out: RunOutcome = {
        status: r.status,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
      const code = (r.error as (Error & { code?: string }) | undefined)?.code;
      return code === undefined ? out : { ...out, errorCode: code };
    },
  };
}

/** 사용자가 직접 경로를 지정할 수 있는 탈출구(문제 생겼을 때 지원용). */
const PATH_OVERRIDE_ENV: Readonly<Record<OwnAiProviderId, string>> = {
  claude: 'CLAUDE_CODE_PATH',
  codex: 'SSAMPIN_CODEX_PATH',
};

/**
 * CLI 를 어떻게 띄울지. `.cmd` 심을 직접 실행할 수 없어서 경로 하나로는 부족하다.
 *
 * - 실행 파일이면 `{ file: '…claude.exe', args: [] }`
 * - node 스크립트면 `{ file: <electron/node>, args: ['…codex.js'], asNode: true }`
 */
export interface OwnAiLaunch {
  readonly file: string;
  readonly args: readonly string[];
  /** true 면 `ELECTRON_RUN_AS_NODE=1` 을 붙여야 한다(Electron 을 node 로 쓴다). */
  readonly asNode: boolean;
}

/** 실행 파일 이름 후보. **`.cmd` 는 넣지 않는다** — 직접 실행하면 EINVAL 이다. */
export function executableNames(
  provider: OwnAiProviderId,
  platform: NodeJS.Platform,
): readonly string[] {
  if (platform === 'win32') return [`${provider}.exe`];
  return [provider];
}

/**
 * npm 전역 설치의 실제 진입점 — 심(`.cmd`)이 가리키는 곳.
 * 앞의 것부터 찾아보고, `.js` 면 node 로 돌린다.
 */
const NPM_ENTRIES: Readonly<Record<OwnAiProviderId, readonly string[]>> = {
  claude: [
    'node_modules/@anthropic-ai/claude-code/bin/claude.exe',
    'node_modules/@anthropic-ai/claude-code/bin/claude',
    'node_modules/@anthropic-ai/claude-code/cli.js',
  ],
  codex: ['node_modules/@openai/codex/bin/codex.exe', 'node_modules/@openai/codex/bin/codex.js'],
};

/**
 * 찾아볼 폴더들. PATH 를 먼저 보고, 그다음 알려진 설치 위치를 본다.
 *
 * ★`%APPDATA%\npm`(Windows npm 전역 bin)이 목록에 **반드시** 있어야 한다 — 실측에서
 * 프로세스 PATH 에 없는 채로 거기 설치돼 있었다.
 */
export function candidateDirectories(deps: OwnAiCliDeps): readonly string[] {
  const p = pathFor(deps.platform);
  const fromPath = (deps.env['PATH'] ?? deps.env['Path'] ?? '').split(p.delimiter).filter(Boolean);

  const known: string[] = [];
  if (deps.platform === 'win32') {
    const appData = deps.env['APPDATA'];
    if (appData) known.push(p.join(appData, 'npm'));
    const localAppData = deps.env['LOCALAPPDATA'];
    if (localAppData) known.push(p.join(localAppData, 'Programs', 'claude'));
    known.push(p.join(deps.home, 'AppData', 'Roaming', 'npm'));
    known.push(p.join(deps.home, '.local', 'bin'));
  } else {
    known.push(p.join(deps.home, '.local', 'bin'));
    known.push(p.join(deps.home, '.bun', 'bin'));
    known.push(p.join(deps.home, '.volta', 'bin'));
    known.push('/opt/homebrew/bin');
    known.push('/usr/local/bin');
    known.push('/usr/bin');
  }

  const seen = new Set<string>();
  return [...fromPath, ...known].filter((d) => {
    if (!d || seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}

function launchFor(full: string, deps: OwnAiCliDeps): OwnAiLaunch {
  return full.endsWith('.js')
    ? { file: deps.nodePath, args: [full], asNode: true }
    : { file: full, args: [], asNode: false };
}

/**
 * 어떻게 띄울지 찾는다. 못 찾으면 null.
 *
 * PATH 의 실행 파일을 먼저 보고, 없으면 같은 폴더의 npm 진입점을 본다
 * (`%APPDATA%\npm\claude.cmd` 옆의 `node_modules/.../claude.exe`).
 */
export function resolveCliLaunch(
  provider: OwnAiProviderId,
  deps: OwnAiCliDeps,
): OwnAiLaunch | null {
  const override = deps.env[PATH_OVERRIDE_ENV[provider]];
  if (override && deps.isFile(override)) return launchFor(override, deps);

  const p = pathFor(deps.platform);
  const names = executableNames(provider, deps.platform);
  const dirs = candidateDirectories(deps);

  for (const dir of dirs) {
    for (const name of names) {
      const full = p.join(dir, name);
      if (deps.isFile(full)) return launchFor(full, deps);
    }
  }
  // 심(.cmd)만 있는 npm 전역 설치 — 심 뒤의 실체를 찾는다.
  for (const dir of dirs) {
    for (const rel of NPM_ENTRIES[provider]) {
      const full = p.join(dir, ...rel.split('/'));
      if (deps.isFile(full)) return launchFor(full, deps);
    }
  }
  return null;
}

/** `claude --version` / `codex --version` 을 읽는다. */
export function readVersion(launch: OwnAiLaunch, deps: OwnAiCliDeps): string | null {
  const r = deps.run(launch.file, [...launch.args, '--version'], launch.asNode);
  if (r.errorCode || (r.status ?? 1) !== 0) return null;
  return parseCliVersion(`${r.stdout}\n${r.stderr}`);
}

/** 로그인 상태 확인 명령. claude 와 codex 가 서로 다르다. */
export function authStatusArgs(provider: OwnAiProviderId): readonly string[] {
  return provider === 'claude' ? ['auth', 'status'] : ['login', 'status'];
}

export function loginArgs(provider: OwnAiProviderId): readonly string[] {
  return provider === 'claude' ? ['auth', 'login'] : ['login'];
}

export function logoutArgs(provider: OwnAiProviderId): readonly string[] {
  return provider === 'claude' ? ['auth', 'logout'] : ['logout'];
}

/** 로그인돼 있는가. 종료 코드 0 이면 됐다고 본다(두 CLI 모두 그렇게 답한다). */
export function isSignedIn(
  provider: OwnAiProviderId,
  launch: OwnAiLaunch,
  deps: OwnAiCliDeps,
): boolean {
  const r = deps.run(launch.file, [...launch.args, ...authStatusArgs(provider)], launch.asNode);
  return !r.errorCode && (r.status ?? 1) === 0;
}

/**
 * 설정 카드가 그릴 3상태를 한 번에 만든다.
 *
 * 판정 순서가 곧 안내 순서다 — 없으면 "설치", 있는데 버전이 낮으면 "업데이트",
 * 버전은 되는데 로그인이 없으면 "로그인".
 */
export function inspectConnection(
  provider: OwnAiProviderId,
  model: string,
  deps: OwnAiCliDeps = defaultCliDeps(),
): OwnAiConnection {
  const launch = resolveCliLaunch(provider, deps);
  if (!launch) return { provider, state: 'not-installed' };

  const version = readVersion(launch, deps);
  if (!version) return { provider, state: 'not-installed' };

  if (!isVersionSupported(provider, version)) {
    return {
      provider,
      state: 'version-unsupported',
      version,
      supportedRange: supportedRangeLabel(provider),
    };
  }
  if (!isSignedIn(provider, launch, deps)) return { provider, state: 'not-signed-in', version };
  return { provider, state: 'connected', version, model };
}
