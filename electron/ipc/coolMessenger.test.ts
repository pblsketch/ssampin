/**
 * 쪽지함 경로 결정 규칙 테스트.
 *
 * 개발 중에는 가짜 쪽지함을 읽혀야 실기기 확인이 가능하고,
 * **배포본에서는 그 통로가 완전히 닫혀 있어야** 한다. 후자가 깨지면
 * "환경변수만 바꾸면 아무 SQLite나 읽어주는 앱"이 된다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const appMock = { isPackaged: false };

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: { handle: vi.fn() },
}));

const { resolveMemoDir } = await import('./coolMessenger');

const ENV = 'SSAMPIN_COOL_MEMO_DIR';
const originalOverride = process.env[ENV];
const originalLocal = process.env.LOCALAPPDATA;

beforeEach(() => {
  appMock.isPackaged = false;
  delete process.env[ENV];
  process.env.LOCALAPPDATA = 'C:\\Users\\tester\\AppData\\Local';
});

afterEach(() => {
  if (originalOverride === undefined) delete process.env[ENV];
  else process.env[ENV] = originalOverride;
  if (originalLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocal;
});

describe('개발 실행', () => {
  it('환경변수가 없으면 쿨메신저 기본 위치를 쓴다', () => {
    expect(resolveMemoDir()).toBe('C:\\Users\\tester\\AppData\\Local\\CoolMessenger\\Memo');
  });

  it('환경변수를 주면 그 폴더를 쓴다 (가짜 쪽지함으로 실기기 확인)', () => {
    process.env[ENV] = 'C:\\tmp\\ssampin-cool-demo';
    expect(resolveMemoDir()).toBe('C:\\tmp\\ssampin-cool-demo');
  });

  it('공백뿐인 값은 무시한다', () => {
    process.env[ENV] = '   ';
    expect(resolveMemoDir()).toBe('C:\\Users\\tester\\AppData\\Local\\CoolMessenger\\Memo');
  });

  it('앞뒤 공백은 다듬는다', () => {
    process.env[ENV] = '  C:\\tmp\\demo  ';
    expect(resolveMemoDir()).toBe('C:\\tmp\\demo');
  });
});

describe('★ 배포본에서는 통로가 닫혀 있다', () => {
  it('환경변수가 있어도 무시하고 기본 위치를 쓴다', () => {
    appMock.isPackaged = true;
    process.env[ENV] = 'C:\\어디든\\남의폴더';
    expect(resolveMemoDir()).toBe('C:\\Users\\tester\\AppData\\Local\\CoolMessenger\\Memo');
  });
});

describe('윈도우가 아닐 때', () => {
  it('LOCALAPPDATA가 없으면 null (기능을 쓸 수 없다)', () => {
    delete process.env.LOCALAPPDATA;
    expect(resolveMemoDir()).toBeNull();
  });

  it('개발 중이면 환경변수로 여전히 확인할 수 있다', () => {
    delete process.env.LOCALAPPDATA;
    process.env[ENV] = '/tmp/demo';
    expect(resolveMemoDir()).toBe('/tmp/demo');
  });
});
