/**
 * 내 API 키 금고 — 평문을 디스크에 쓰지 않는다, 데이터 폴더 밖에 둔다, 화면용 상태에 키가 없다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKeyVault, type ApiKeyVault } from './apiKeyVault';

const KEY = 'AIzaSyD-test-secret-value-1234567890abcd';
let dir = '';
let available = true;
let vault: ApiKeyVault;
const warn = vi.fn();

function make(): ApiKeyVault {
  return createApiKeyVault({
    dir,
    encryptionAvailable: () => available,
    encrypt: (s) => Buffer.from(`ENC:${Buffer.from(s, 'utf-8').toString('base64')}`, 'utf-8'),
    decrypt: (b) => {
      const t = b.toString('utf-8');
      if (!t.startsWith('ENC:')) throw new Error('decrypt failed');
      return Buffer.from(t.slice(4), 'base64').toString('utf-8');
    },
    warn,
  });
}

/** 폴더 안 모든 파일 내용을 이어 붙인다 — 키 원문이 어디에도 없는지 보려고. */
function everythingOnDisk(): string {
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir)
    .map((f) => fs.readFileSync(path.join(dir, f)).toString('utf-8'))
    .join('\n');
}

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'byok-')), 'byok');
  available = true;
  warn.mockReset();
  vault = make();
});

afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe('암호화를 쓸 수 있을 때', () => {
  it('키를 암호화해 쓰고, 디스크 어디에도 원문이 없다', () => {
    expect(vault.setKey('gemini', KEY)).toEqual({ persisted: true });
    expect(everythingOnDisk()).not.toContain(KEY);
    expect(vault.getKey('gemini')).toBe(KEY);
  });

  it('앱을 다시 켜도(새 금고) 키를 읽는다', () => {
    vault.setKey('openrouter', KEY);
    expect(make().getKey('openrouter')).toBe(KEY);
  });

  it('임시 파일을 남기지 않는다', () => {
    vault.setKey('gemini', KEY);
    vault.setActive({ service: 'gemini', model: 'models/gemini-flash-latest' });
    expect(fs.readdirSync(dir).sort()).toEqual(['active.json', 'gemini.key']);
  });

  it('복호화가 안 되는 파일은 지우지 않고 키 없음으로 본다', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'gemini.key'), 'garbage');
    expect(vault.getKey('gemini')).toBeNull();
    expect(fs.existsSync(path.join(dir, 'gemini.key'))).toBe(true);
  });
});

describe('암호화를 쓸 수 없을 때', () => {
  beforeEach(() => {
    available = false;
  });

  it('디스크에 쓰지 않고 메모리에만 둔다', () => {
    expect(vault.setKey('gemini', KEY)).toEqual({ persisted: false });
    expect(fs.existsSync(path.join(dir, 'gemini.key'))).toBe(false);
    expect(vault.getKey('gemini')).toBe(KEY);
    expect(vault.status().services.find((s) => s.service === 'gemini')?.persisted).toBe(false);
  });

  it('경고에 키를 싣지 않는다', () => {
    vault.setKey('gemini', KEY);
    expect(warn.mock.calls.flat().join(' ')).not.toContain(KEY);
  });

  it('앱을 다시 켜면 메모리 키는 사라진다', () => {
    vault.setKey('gemini', KEY);
    expect(make().getKey('gemini')).toBeNull();
  });
});

describe('상태 — 화면이 받는 전부', () => {
  it('키 원문이 없고 끝 4자리만 있다', () => {
    vault.setKey('gemini', KEY);
    const s = vault.status();
    expect(JSON.stringify(s)).not.toContain(KEY);
    expect(JSON.stringify(s)).not.toContain(KEY.slice(0, 12));
    expect(s.services.find((x) => x.service === 'gemini')?.hint).toBe('••••abcd');
    expect(s.services.find((x) => x.service === 'openrouter')?.configured).toBe(false);
  });

  it('키를 지우면 그 서비스를 고른 것도 풀린다', () => {
    vault.setKey('gemini', KEY);
    vault.setActive({ service: 'gemini', model: 'models/gemini-flash-latest' });
    expect(vault.status().active?.service).toBe('gemini');
    vault.removeKey('gemini');
    expect(vault.getKey('gemini')).toBeNull();
    expect(vault.status().active).toBeNull();
    expect(fs.existsSync(path.join(dir, 'active.json'))).toBe(false);
  });

  it('고른 서비스의 키가 없으면 active 는 null', () => {
    vault.setActive({ service: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
    expect(vault.status().active).toBeNull();
  });

  it('손상된 active.json 은 무시한다', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'active.json'), '{"service":"../evil","model":"x"}');
    expect(vault.getActive()).toBeNull();
  });
});

describe('서비스 이름 검사', () => {
  it('모르는 서비스 이름으로 파일을 만들지 않는다', () => {
    expect(() => vault.setKey('../../evil' as never, KEY)).toThrow();
    expect(fs.existsSync(path.join(path.dirname(dir), 'evil.key'))).toBe(false);
  });
});
