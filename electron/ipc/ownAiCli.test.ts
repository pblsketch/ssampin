import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  authStatusArgs,
  candidateDirectories,
  executableNames,
  inspectConnection,
  isSignedIn,
  loginArgs,
  logoutArgs,
  readVersion,
  resolveCliLaunch,
  type OwnAiCliDeps,
  type OwnAiLaunch,
  type RunOutcome,
} from './ownAiCli';

const WIN_APPDATA = 'C:\\Users\\t\\AppData\\Roaming';
const NPM_BIN = path.win32.join(WIN_APPDATA, 'npm');

function deps(over: Partial<OwnAiCliDeps> = {}): OwnAiCliDeps {
  return {
    platform: 'win32',
    env: { PATH: 'C:\\Program Files\\nodejs', APPDATA: WIN_APPDATA },
    home: 'C:\\Users\\t',
    isFile: () => false,
    nodePath: 'C:\\Program Files\\ssampin\\ssampin.exe',
    run: () => ({ status: 0, stdout: '', stderr: '' }),
    ...over,
  };
}

/** 평범한 실행 파일 형태의 launch — 버전·로그인 확인 테스트에서 쓴다. */
const EXE: OwnAiLaunch = { file: 'C:\\bin\\claude.exe', args: [], asNode: false };

function ok(stdout: string): RunOutcome {
  return { status: 0, stdout, stderr: '' };
}

describe('실행 파일 이름 후보', () => {
  it('★.cmd 를 후보에 넣지 않는다 — Node 20.12.2+ 는 shell 없이 spawn 하면 EINVAL 이다', () => {
    // CVE-2024-27980 대응. shell:true 로 우회하면 선생님 질문의 & | ^ % 가 명령이 된다.
    expect(executableNames('claude', 'win32')).not.toContain('claude.cmd');
    expect(executableNames('claude', 'win32')).toEqual(['claude.exe']);
  });

  it('그 외 플랫폼은 확장자가 없다', () => {
    expect(executableNames('claude', 'darwin')).toEqual(['claude']);
  });
});

describe('찾아볼 폴더', () => {
  it('★프로세스 PATH 에 없어도 %APPDATA%\\npm 을 본다 — 실측에서 거기 설치돼 있었다', () => {
    const dirs = candidateDirectories(deps());
    expect(dirs).toContain(NPM_BIN);
    // PATH 가 먼저 온다
    expect(dirs[0]).toBe('C:\\Program Files\\nodejs');
  });

  it('APPDATA 가 없어도 홈 기준 경로로 되짚는다', () => {
    const dirs = candidateDirectories(deps({ env: { PATH: '' } }));
    expect(dirs.some((d) => d.endsWith(path.win32.join('AppData', 'Roaming', 'npm')))).toBe(true);
  });

  it('중복을 걷어낸다', () => {
    const dirs = candidateDirectories(
      deps({ env: { PATH: `${NPM_BIN};${NPM_BIN}`, APPDATA: WIN_APPDATA } }),
    );
    expect(dirs.filter((d) => d === NPM_BIN)).toHaveLength(1);
  });

  it('mac 은 homebrew·.local/bin 을 본다', () => {
    const dirs = candidateDirectories(
      deps({ platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/t' }),
    );
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs).toContain('/Users/t/.local/bin');
  });
});

describe('어떻게 띄울지 찾기', () => {
  const CLAUDE_EXE = path.win32.join(
    NPM_BIN,
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'bin',
    'claude.exe',
  );
  const CODEX_JS = path.win32.join(NPM_BIN, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

  it('★심(.cmd)만 있는 npm 설치에서도 그 뒤의 실행 파일을 찾는다', () => {
    const l = resolveCliLaunch('claude', deps({ isFile: (p) => p === CLAUDE_EXE }));
    expect(l).toEqual({ file: CLAUDE_EXE, args: [], asNode: false });
  });

  it('★codex 는 네이티브 실행 파일을 먼저 쓴다 — .js 로 띄우면 손자 창이 깜빡인다', () => {
    // 2026-09-06 실측: codex.js 로 띄우면 그 안에서 네이티브를 손자로 띄우는데,
    // 그 손자의 창은 windowsHide 로 못 숨긴다. 직접 띄우면 창도 없고 프로세스도 하나 준다.
    const native = path.win32.join(
      NPM_BIN,
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
      'codex.exe',
    );
    const js = path.win32.join(NPM_BIN, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    // 둘 다 있으면 네이티브가 이긴다.
    const l = resolveCliLaunch('codex', deps({ isFile: (p) => p === native || p === js }));
    expect(l).toEqual({ file: native, args: [], asNode: false });
  });

  it('★node 스크립트면 electron 을 node 로 써서 돌린다 — codex 는 .js 가 진입점이다', () => {
    const l = resolveCliLaunch('codex', deps({ isFile: (p) => p === CODEX_JS }));
    expect(l?.asNode).toBe(true);
    expect(l?.file).toContain('ssampin.exe');
    expect(l?.args).toEqual([CODEX_JS]);
  });

  it('★어떤 경우에도 .cmd 를 실행 대상으로 삼지 않는다', () => {
    const cmd = path.win32.join(NPM_BIN, 'claude.cmd');
    // .cmd 만 존재하고 실체가 없으면 "못 찾음"이어야 한다 — EINVAL 을 던지느니 안내가 낫다.
    const l = resolveCliLaunch('claude', deps({ isFile: (p) => p === cmd }));
    expect(l).toBeNull();
  });

  it('PATH 의 실행 파일을 npm 진입점보다 먼저 본다', () => {
    const onPath = path.win32.join('C:\\Program Files\\nodejs', 'claude.exe');
    const l = resolveCliLaunch('claude', deps({ isFile: (p) => p === onPath || p === CLAUDE_EXE }));
    expect(l?.file).toBe(onPath);
  });

  it('환경변수로 지정한 경로가 최우선이다', () => {
    const forced = 'D:\\tools\\claude.exe';
    const l = resolveCliLaunch(
      'claude',
      deps({
        env: { PATH: '', APPDATA: WIN_APPDATA, CLAUDE_CODE_PATH: forced },
        isFile: (p) => p === forced || p === CLAUDE_EXE,
      }),
    );
    expect(l?.file).toBe(forced);
  });

  it('아무 데도 없으면 null', () => {
    expect(resolveCliLaunch('codex', deps())).toBeNull();
  });
});

describe('버전 읽기', () => {
  it('두 CLI 의 실제 출력 형태를 읽는다', async () => {
    expect(await readVersion(EXE, deps({ run: () => ok('2.1.258 (Claude Code)') }))).toBe(
      '2.1.258',
    );
    expect(await readVersion(EXE, deps({ run: () => ok('codex-cli 0.144.4') }))).toBe('0.144.4');
  });

  it('실행이 실패하면 null', async () => {
    expect(
      await readVersion(EXE, deps({ run: () => ({ status: 1, stdout: '', stderr: 'boom' }) })),
    ).toBeNull();
    expect(
      await readVersion(
        EXE,
        deps({ run: () => ({ status: null, stdout: '', stderr: '', errorCode: 'ENOENT' }) }),
      ),
    ).toBeNull();
  });
});

describe('★확인은 비동기다 — 앱 화면을 멈추지 않는다', () => {
  it('run 이 약속(Promise)을 줘도 같은 결과다 — 앱은 이 모양으로 부른다', async () => {
    const d = deps({ run: async () => ok('2.1.258 (Claude Code)') });
    expect(await readVersion(EXE, d)).toBe('2.1.258');
  });

  it('둘을 나란히 물으면 기다리는 시간이 더해지지 않는다', async () => {
    const slow = (ms: number) => () =>
      new Promise<RunOutcome>((r) => setTimeout(() => r(ok('2.1.258 (Claude Code)')), ms));
    const d = deps({ isFile: (p) => p.endsWith('claude.exe'), run: slow(120) });
    const t0 = Date.now();
    await Promise.all([inspectConnection('claude', '', d), inspectConnection('claude', '', d)]);
    // 각 확인은 run 을 두 번 부른다(버전·로그인) = 240ms. 둘을 나란히 돌리면 ~240, 차례면 ~480.
    expect(Date.now() - t0).toBeLessThan(420);
  });
});

describe('로그인 명령은 CLI 마다 다르다', () => {
  it('claude 는 auth 하위 명령, codex 는 login', () => {
    expect(authStatusArgs('claude')).toEqual(['auth', 'status']);
    expect(authStatusArgs('codex')).toEqual(['login', 'status']);
    expect(loginArgs('claude')).toEqual(['auth', 'login']);
    expect(loginArgs('codex')).toEqual(['login']);
    expect(logoutArgs('claude')).toEqual(['auth', 'logout']);
    expect(logoutArgs('codex')).toEqual(['logout']);
  });

  it('종료 코드 0 이면 로그인된 것으로 본다', async () => {
    expect(await isSignedIn('claude', EXE, deps({ run: () => ok('') }))).toBe(true);
    expect(
      await isSignedIn('claude', EXE, deps({ run: () => ({ status: 1, stdout: '', stderr: '' }) })),
    ).toBe(false);
  });
});

describe('연결 상태 3종 — 판정 순서가 곧 안내 순서다', () => {
  const found = path.win32.join(NPM_BIN, 'claude.exe');

  function withRuns(runs: Record<string, RunOutcome>): OwnAiCliDeps {
    return deps({
      isFile: (p) => p === found,
      run: (_file, argv) => runs[argv.join(' ')] ?? { status: 1, stdout: '', stderr: '' },
    });
  }

  it('없으면 not-installed', async () => {
    expect((await inspectConnection('claude', '', deps())).state).toBe('not-installed');
  });

  it('버전을 못 읽어도 not-installed 로 본다(깨진 설치)', async () => {
    const d = deps({
      isFile: (p) => p === found,
      run: () => ({ status: 1, stdout: '', stderr: '' }),
    });
    expect((await inspectConnection('claude', '', d)).state).toBe('not-installed');
  });

  it('버전이 낮으면 version-unsupported 와 지원 범위를 함께 준다', async () => {
    const c = await inspectConnection(
      'claude',
      '',
      withRuns({ '--version': ok('2.0.1 (Claude Code)') }),
    );
    expect(c.state).toBe('version-unsupported');
    if (c.state === 'version-unsupported') expect(c.supportedRange).toContain('이상');
  });

  it('버전은 되는데 로그인이 없으면 not-signed-in', async () => {
    const c = await inspectConnection(
      'claude',
      '',
      withRuns({ '--version': ok('2.1.258 (Claude Code)') }),
    );
    expect(c.state).toBe('not-signed-in');
  });

  it('둘 다 되면 connected 이고 고른 모델을 담는다', async () => {
    const c = await inspectConnection(
      'claude',
      'sonnet',
      withRuns({ '--version': ok('2.1.258 (Claude Code)'), 'auth status': ok('Logged in') }),
    );
    expect(c.state).toBe('connected');
    if (c.state === 'connected') {
      expect(c.version).toBe('2.1.258');
      expect(c.model).toBe('sonnet');
    }
  });
});
