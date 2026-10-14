/**
 * 보안 저장소 규칙: 평문을 디스크에 쓰지 않는다.
 *
 * 암호화(safeStorage)는 가짜로 바꿔 켜고 끌 수 있게 하고, 파일은 실제 임시 폴더에 쓴다.
 * 구글 로그인 토큰이 여기에 있으므로, 어긋나면 캘린더·할 일 연동이 한꺼번에 끊긴다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: unknown, ...args: string[]) => unknown;

const state = vi.hoisted(() => ({
  available: true,
  root: '',
  handlers: new Map<string, (event: unknown, ...args: string[]) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, ...args: string[]) => unknown) => {
      state.handlers.set(channel, fn);
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => state.available,
    encryptString: (s: string) => Buffer.from(`ENC:${s}`, 'utf-8'),
    decryptString: (b: Buffer) => {
      const text = b.toString('utf-8');
      if (!text.startsWith('ENC:')) throw new Error('decrypt failed');
      return text.slice(4);
    },
  },
}));
vi.mock('../dataRoot', () => ({ getContentRoot: () => state.root }));

const KEY = 'calendar-tokens';
const TOKENS = JSON.stringify({ accessToken: 'a', refreshToken: 'r' });

function call(channel: string, ...args: string[]): unknown {
  const fn = state.handlers.get(channel) as Handler | undefined;
  if (!fn) throw new Error(`핸들러 없음: ${channel}`);
  return fn({}, ...args);
}

function file(key = KEY): string {
  return path.join(state.root, 'data', `.${key}`);
}

beforeEach(async () => {
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'secure-storage-'));
  state.handlers.clear();
  state.available = true;
  vi.resetModules(); // 메모리 값·경고 표시를 테스트마다 초기화
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const mod = await import('./secureStorage');
  mod.registerSecureStorageHandlers();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(state.root, { recursive: true, force: true });
});

describe('암호화를 쓸 수 있을 때', () => {
  it('쓰기: 암호화해서 파일에 쓴다(평문이 아니다)', () => {
    call('secure:write', KEY, TOKENS);
    const onDisk = fs.readFileSync(file(), 'utf-8');
    expect(onDisk).not.toBe(TOKENS);
    expect(onDisk.startsWith('ENC:')).toBe(true);
    expect(call('secure:read', KEY)).toBe(TOKENS);
  });

  it('읽기: 옛 평문 JSON 파일이면 암호화해서 다시 쓰고 값을 돌려준다', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), TOKENS, 'utf-8');

    expect(call('secure:read', KEY)).toBe(TOKENS);
    expect(fs.readFileSync(file(), 'utf-8').startsWith('ENC:')).toBe(true);
    // 두 번째 읽기는 정상 복호화
    expect(call('secure:read', KEY)).toBe(TOKENS);
  });

  it('읽기: JSON 도 아니고 복호화도 안 되는 파일은 그대로 두고 null', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), Buffer.from([0x00, 0xff, 0x10, 0x80]));
    const before = fs.readFileSync(file());

    expect(call('secure:read', KEY)).toBeNull();
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  });

  it('읽기: 파일이 없으면 null', () => {
    expect(call('secure:read', KEY)).toBeNull();
  });
});

describe('암호화를 쓸 수 없을 때', () => {
  beforeEach(() => {
    state.available = false;
  });

  it('쓰기: 디스크에 아무것도 쓰지 않고 메모리에만 두며, 읽으면 돌려준다', () => {
    call('secure:write', KEY, TOKENS);
    expect(fs.existsSync(file())).toBe(false);
    expect(call('secure:read', KEY)).toBe(TOKENS);
  });

  it('쓰기: 같은 키의 옛 평문 파일은 지운다', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), TOKENS, 'utf-8');

    call('secure:write', KEY, JSON.stringify({ accessToken: 'new' }));
    expect(fs.existsSync(file())).toBe(false);
    expect(call('secure:read', KEY)).toBe(JSON.stringify({ accessToken: 'new' }));
  });

  it('쓰기: 암호화된 파일은 지우지 않는다(잠깐 못 쓰는 것일 수 있다)', () => {
    state.available = true;
    call('secure:write', KEY, TOKENS);
    const encrypted = fs.readFileSync(file());
    state.available = false;

    call('secure:write', KEY, JSON.stringify({ accessToken: 'refreshed' }));

    expect(fs.existsSync(file())).toBe(true);
    expect(fs.readFileSync(file()).equals(encrypted)).toBe(true);
    // 이번 실행 중에는 메모리 값이 우선한다
    expect(call('secure:read', KEY)).toBe(JSON.stringify({ accessToken: 'refreshed' }));
    // 암호화가 돌아오면 파일의 값을 읽을 수 있다
    call('secure:delete', KEY);
    expect(fs.existsSync(file())).toBe(false);
  });

  it('쓰기: 경고에 값을 싣지 않는다', () => {
    call('secure:write', KEY, TOKENS);
    const warned = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .flat()
      .join(' ');
    expect(warned).not.toContain('accessToken');
    expect(warned).not.toContain('refreshToken');
  });

  it('읽기: 메모리에 없으면 옛 평문 JSON 파일을 읽기만 한다(다시 쓰지 않는다)', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), TOKENS, 'utf-8');

    expect(call('secure:read', KEY)).toBe(TOKENS);
    expect(fs.readFileSync(file(), 'utf-8')).toBe(TOKENS);
  });

  it('읽기: 옛 파일이 JSON 이 아니면(암호화된 값 등) null', () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), 'ENC:{"a":1}', 'utf-8');
    expect(call('secure:read', KEY)).toBeNull();
  });
});

describe('삭제와 전환', () => {
  it('삭제: 파일과 메모리 값을 모두 지운다', () => {
    state.available = false;
    call('secure:write', KEY, TOKENS);
    state.available = true;
    call('secure:write', KEY, TOKENS);
    expect(fs.existsSync(file())).toBe(true);

    call('secure:delete', KEY);
    expect(fs.existsSync(file())).toBe(false);
    state.available = false;
    expect(call('secure:read', KEY)).toBeNull();
  });

  it('메모리에만 두었다가 암호화가 가능해지면 다음 쓰기부터 암호화해서 쓴다', () => {
    state.available = false;
    call('secure:write', KEY, TOKENS);
    expect(fs.existsSync(file())).toBe(false);

    state.available = true;
    call('secure:write', KEY, TOKENS);
    expect(fs.readFileSync(file(), 'utf-8').startsWith('ENC:')).toBe(true);
    expect(call('secure:read', KEY)).toBe(TOKENS);
  });

  it('키마다 따로 다룬다(토큰과 복원표가 섞이지 않는다)', () => {
    state.available = false;
    call('secure:write', 'calendar-tokens', '{"a":1}');
    call('secure:write', 'markdown-convert:mask-sessions:v1', '{"b":2}');
    expect(call('secure:read', 'calendar-tokens')).toBe('{"a":1}');
    expect(call('secure:read', 'markdown-convert:mask-sessions:v1')).toBe('{"b":2}');
  });
});
