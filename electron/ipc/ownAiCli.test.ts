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
  resolveCliPath,
  type OwnAiCliDeps,
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
    run: () => ({ status: 0, stdout: '', stderr: '' }),
    ...over,
  };
}

function ok(stdout: string): RunOutcome {
  return { status: 0, stdout, stderr: '' };
}

describe('실행 파일 이름 후보', () => {
  it('★Windows 는 .cmd 를 먼저 본다 — spawn(shell:false) 은 확장자를 안 붙인다', () => {
    expect(executableNames('claude', 'win32')[0]).toBe('claude.cmd');
    expect(executableNames('codex', 'win32')).toContain('codex.exe');
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

describe('CLI 경로 찾기', () => {
  it('PATH 에 없고 %APPDATA%\\npm 에만 있어도 찾는다', () => {
    const target = path.win32.join(NPM_BIN, 'claude.cmd');
    const found = resolveCliPath('claude', deps({ isFile: (p) => p === target }));
    expect(found).toBe(target);
  });

  it('환경변수로 지정한 경로가 최우선이다', () => {
    const forced = 'D:\\tools\\claude.exe';
    const found = resolveCliPath(
      'claude',
      deps({
        env: { PATH: '', APPDATA: WIN_APPDATA, CLAUDE_CODE_PATH: forced },
        isFile: (p) => p === forced || p === path.win32.join(NPM_BIN, 'claude.cmd'),
      }),
    );
    expect(found).toBe(forced);
  });

  it('지정한 경로가 실제로 없으면 무시하고 계속 찾는다', () => {
    const real = path.win32.join(NPM_BIN, 'claude.cmd');
    const found = resolveCliPath(
      'claude',
      deps({
        env: { PATH: '', APPDATA: WIN_APPDATA, CLAUDE_CODE_PATH: 'D:\\없음.exe' },
        isFile: (p) => p === real,
      }),
    );
    expect(found).toBe(real);
  });

  it('아무 데도 없으면 null', () => {
    expect(resolveCliPath('codex', deps())).toBeNull();
  });
});

describe('버전 읽기', () => {
  it('두 CLI 의 실제 출력 형태를 읽는다', () => {
    expect(readVersion('c', deps({ run: () => ok('2.1.258 (Claude Code)') }))).toBe('2.1.258');
    expect(readVersion('c', deps({ run: () => ok('codex-cli 0.144.4') }))).toBe('0.144.4');
  });

  it('실행이 실패하면 null', () => {
    expect(
      readVersion('c', deps({ run: () => ({ status: 1, stdout: '', stderr: 'boom' }) })),
    ).toBeNull();
    expect(
      readVersion(
        'c',
        deps({ run: () => ({ status: null, stdout: '', stderr: '', errorCode: 'ENOENT' }) }),
      ),
    ).toBeNull();
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

  it('종료 코드 0 이면 로그인된 것으로 본다', () => {
    expect(isSignedIn('claude', 'c', deps({ run: () => ok('') }))).toBe(true);
    expect(
      isSignedIn('claude', 'c', deps({ run: () => ({ status: 1, stdout: '', stderr: '' }) })),
    ).toBe(false);
  });
});

describe('연결 상태 3종 — 판정 순서가 곧 안내 순서다', () => {
  const found = path.win32.join(NPM_BIN, 'claude.cmd');

  function withRuns(runs: Record<string, RunOutcome>): OwnAiCliDeps {
    return deps({
      isFile: (p) => p === found,
      run: (_file, argv) => runs[argv.join(' ')] ?? { status: 1, stdout: '', stderr: '' },
    });
  }

  it('없으면 not-installed', () => {
    expect(inspectConnection('claude', '', deps()).state).toBe('not-installed');
  });

  it('버전을 못 읽어도 not-installed 로 본다(깨진 설치)', () => {
    const d = deps({
      isFile: (p) => p === found,
      run: () => ({ status: 1, stdout: '', stderr: '' }),
    });
    expect(inspectConnection('claude', '', d).state).toBe('not-installed');
  });

  it('버전이 낮으면 version-unsupported 와 지원 범위를 함께 준다', () => {
    const c = inspectConnection('claude', '', withRuns({ '--version': ok('2.0.1 (Claude Code)') }));
    expect(c.state).toBe('version-unsupported');
    if (c.state === 'version-unsupported') expect(c.supportedRange).toContain('이상');
  });

  it('버전은 되는데 로그인이 없으면 not-signed-in', () => {
    const c = inspectConnection(
      'claude',
      '',
      withRuns({ '--version': ok('2.1.258 (Claude Code)') }),
    );
    expect(c.state).toBe('not-signed-in');
  });

  it('둘 다 되면 connected 이고 고른 모델을 담는다', () => {
    const c = inspectConnection(
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
