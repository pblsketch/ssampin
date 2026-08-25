/**
 * 쪽지함 경로 결정 규칙 테스트.
 *
 * 개발 중에는 가짜 쪽지함을 읽혀야 실기기 확인이 가능하고,
 * **배포본에서는 그 통로가 완전히 닫혀 있어야** 한다. 후자가 깨지면
 * "환경변수만 바꾸면 아무 SQLite나 읽어주는 앱"이 된다.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 쿨메신저는 윈도우 전용이지만 CI 는 리눅스에서 돈다.
 *
 * 기대 경로를 `'…\CoolMessenger\Memo'` 처럼 박아 두면 `node:path` 의 `join` 이
 * 리눅스에서 `/` 를 쓰기 때문에 **로직이 멀쩡한데도 CI 만 빨간불**이 된다(실제로 7커밋째
 * 그랬다). 구분자는 `node:path` 의 책임이므로 우리가 검증할 것이 아니고, 우리가 지킬 것은
 * "LOCALAPPDATA 아래 CoolMessenger/Memo 를 본다" 는 **규칙 자체**다. 그래서 기대값도
 * 같은 `join` 으로 만들어 양쪽 OS 에서 규칙을 검증한다.
 */
const LOCAL_APP_DATA = 'C:\\Users\\tester\\AppData\\Local';
const DEFAULT_MEMO_DIR = join(LOCAL_APP_DATA, 'CoolMessenger', 'Memo');
import { tmpdir } from 'node:os';

const appMock = { isPackaged: false, on: vi.fn(), getPath: () => tmpdir() };

/** 채널별 IPC 핸들러를 붙잡아 둔다 — 게이트 동작을 핸들러 단위로 검증한다 */
const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn);
    },
  },
}));

/** settings.json 을 임시 폴더에서 읽게 한다 — main 게이트가 보는 자료 루트 */
const dataRootMock = { root: '' };
vi.mock('../dataRoot', () => ({
  getContentRoot: () => dataRootMock.root,
}));

const { resolveMemoDir, registerCoolMessengerHandlers, readCoolImportEnabled } =
  await import('./coolMessenger');
const { closeCoolReaderSession } = await import('../coolMessengerReader');

const ENV = 'SSAMPIN_COOL_MEMO_DIR';
const originalOverride = process.env[ENV];
const originalLocal = process.env.LOCALAPPDATA;

beforeEach(() => {
  appMock.isPackaged = false;
  delete process.env[ENV];
  process.env.LOCALAPPDATA = LOCAL_APP_DATA;
});

afterEach(() => {
  if (originalOverride === undefined) delete process.env[ENV];
  else process.env[ENV] = originalOverride;
  if (originalLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocal;
});

describe('개발 실행', () => {
  it('환경변수가 없으면 쿨메신저 기본 위치를 쓴다', () => {
    expect(resolveMemoDir()).toBe(DEFAULT_MEMO_DIR);
  });

  it('환경변수를 주면 그 폴더를 쓴다 (가짜 쪽지함으로 실기기 확인)', () => {
    process.env[ENV] = 'C:\\tmp\\ssampin-cool-demo';
    expect(resolveMemoDir()).toBe('C:\\tmp\\ssampin-cool-demo');
  });

  it('공백뿐인 값은 무시한다', () => {
    process.env[ENV] = '   ';
    expect(resolveMemoDir()).toBe(DEFAULT_MEMO_DIR);
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
    expect(resolveMemoDir()).toBe(DEFAULT_MEMO_DIR);
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

describe('★ main 쪽 설정 게이트 — 스위치가 꺼져 있으면 쪽지함을 읽지 않는다', () => {
  /**
   * 임시 폴더를 이 describe 전용으로 갈아끼운다 — registerCoolMessengerHandlers 의
   * 잔여 사본 청소(cleanupStaleCoolTempDirs)가 병렬 실행 중인 다른 테스트 파일의
   * 세션 폴더를 지우면 안 되고, 여기서 만든 세션 폴더도 격리돼야 한다.
   */
  const TMP_KEYS = ['TMPDIR', 'TEMP', 'TMP'] as const;
  const savedTmp: Record<string, string | undefined> = {};
  let sandbox = '';
  let memoDir = '';
  let settingsFile = '';

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cool-ipc-sandbox-'));
    for (const k of TMP_KEYS) {
      savedTmp[k] = process.env[k];
      process.env[k] = sandbox;
    }

    // main 이 보는 자료 루트 — 게이트는 <root>/data/settings.json 을 읽는다
    dataRootMock.root = join(sandbox, 'content');
    mkdirSync(join(dataRootMock.root, 'data'), { recursive: true });
    settingsFile = join(dataRootMock.root, 'data', 'settings.json');

    // 실물 스키마의 가짜 쪽지함
    memoDir = join(sandbox, 'memo');
    mkdirSync(memoDir);
    const db = new DatabaseSync(join(memoDir, 'MyMemo.udb'));
    db.exec('PRAGMA journal_mode=WAL');
    db.exec(`CREATE TABLE tbl_recv (
      MessageKey INTEGER PRIMARY KEY, Sender TEXT, ReceiveDate TEXT,
      Title TEXT, MessageText TEXT, IsUnRead INTEGER, DeletedDate TEXT)`);
    db.prepare(
      'INSERT INTO tbl_recv (MessageKey, Sender, ReceiveDate, Title, MessageText, IsUnRead, DeletedDate) VALUES (?,?,?,?,?,?,?)',
    ).run(1, '교무부', '2026/08/20 09:00:00 (목)', '학폭위 심의', '8월 27일(목) 14:00', 1, null);
    db.close();

    registerCoolMessengerHandlers();
  });

  afterAll(() => {
    closeCoolReaderSession();
    for (const k of TMP_KEYS) {
      if (savedTmp[k] === undefined) delete process.env[k];
      else process.env[k] = savedTmp[k];
    }
    rmSync(sandbox, { recursive: true, force: true });
  });

  beforeEach(() => {
    // 파일 상단의 beforeEach 가 매번 env 를 지우므로 여기서 다시 가짜 쪽지함을 가리킨다
    process.env[ENV] = memoDir;
    rmSync(settingsFile, { force: true });
  });

  const setEnabled = (value: boolean) => {
    writeFileSync(settingsFile, JSON.stringify({ coolMessengerImportEnabled: value }), 'utf-8');
  };

  it('★ 설정 파일이 없으면(기본값=꺼짐) list 가 거부한다', () => {
    expect(() => handlers.get('cool-messenger:list')!()).toThrow(/꺼져 있습니다/);
  });

  it('★ 스위치가 꺼져 있으면 list·get 이 거부한다', () => {
    setEnabled(false);
    expect(() => handlers.get('cool-messenger:list')!()).toThrow(/꺼져 있습니다/);
    expect(() => handlers.get('cool-messenger:get')!(undefined, 1)).toThrow(/꺼져 있습니다/);
  });

  it('꺼져 있으면 members 는 조용히 빈 목록 (기능 보조 통로)', () => {
    setEnabled(false);
    expect(handlers.get('cool-messenger:members')!()).toEqual([]);
  });

  it('available 은 게이트하지 않는다 — 스위치를 켜기 전에 확인하는 통로다', () => {
    setEnabled(false);
    expect(handlers.get('cool-messenger:available')!()).toBe(true);
  });

  it('스위치가 켜져 있으면 정상 동작한다', () => {
    setEnabled(true);
    const list = handlers.get('cool-messenger:list')!() as Array<{ key: number; title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('학폭위 심의');
    const got = handlers.get('cool-messenger:get')!(undefined, 1) as { body: string } | null;
    expect(got?.body).toContain('8월 27일');
  });
});

describe('readCoolImportEnabled — 설정 파일 해석', () => {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cool-settings-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (content: string) => {
    const file = join(dir, 'settings.json');
    writeFileSync(file, content, 'utf-8');
    return file;
  };

  it('true 일 때만 켜진 것으로 본다', () => {
    expect(readCoolImportEnabled(write('{"coolMessengerImportEnabled":true}'))).toBe(true);
    expect(readCoolImportEnabled(write('{"coolMessengerImportEnabled":false}'))).toBe(false);
    expect(readCoolImportEnabled(write('{"coolMessengerImportEnabled":"true"}'))).toBe(false);
    expect(readCoolImportEnabled(write('{}'))).toBe(false);
  });

  it('파일이 없거나 망가져 있으면 꺼진 것으로 본다 (기본값=꺼짐)', () => {
    expect(readCoolImportEnabled(join(dir, 'no-such.json'))).toBe(false);
    expect(readCoolImportEnabled(write('{망가진 JSON'))).toBe(false);
    expect(readCoolImportEnabled(write('[]'))).toBe(false);
    expect(readCoolImportEnabled(write('null'))).toBe(false);
  });
});
